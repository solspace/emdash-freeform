/**
 * Minimal zero-dependency SMTP client for Node.js runtimes.
 * Supports Plain, STARTTLS (port 587/25) and SSL/TLS (port 465).
 */

export interface SmtpConfig {
  host: string;
  port: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  from: string;
}

export interface SmtpMessage {
  to: string;
  from?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html?: string;
}

function sanitizeHeader(val: string): string {
  return val.replace(/[\r\n]+/g, " ").trim();
}

export async function sendSmtpEmail(
  config: SmtpConfig,
  msg: SmtpMessage,
): Promise<{ messageId: string }> {
  let net: any;
  let tls: any;
  try {
    net = await import("node:net");
    tls = await import("node:tls");
  } catch {
    throw new Error("Direct SMTP requires a Node.js runtime with node:net support.");
  }

  const port = config.port || (config.secure ? 465 : 587);
  const isDirectTls = config.secure || port === 465;

  return new Promise((resolve, reject) => {
    let socket: any = null;
    let buffer = "";
    let stage:
      | "greeting"
      | "ehlo1"
      | "starttls"
      | "ehlo2"
      | "auth_login"
      | "auth_user"
      | "auth_pass"
      | "mail_from"
      | "rcpt_to"
      | "data_cmd"
      | "data_body"
      | "quit" = "greeting";

    const allRecipients = [
      msg.to,
      ...(msg.cc || []),
      ...(msg.bcc || []),
    ].filter(Boolean);

    let recipientIdx = 0;
    const fromAddr = sanitizeHeader(msg.from || config.from);

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`SMTP connection timed out to ${config.host}:${port}`));
    }, 15000);

    function cleanup() {
      clearTimeout(timer);
      if (socket) {
        try {
          socket.removeAllListeners();
          socket.end();
          socket.destroy();
        } catch {}
      }
    }

    function send(line: string) {
      if (socket && !socket.destroyed) {
        socket.write(line + "\r\n");
      }
    }

    function onData(chunk: any) {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\r\n");
      // Keep unfinished last line in buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        const code = parseInt(line.slice(0, 3), 10);
        const isMulti = line[3] === "-";
        if (isMulti) continue; // wait for final line with space

        handleResponse(code, line);
      }
    }

    function onError(err: any) {
      cleanup();
      reject(new Error(`SMTP socket error: ${err.message}`));
    }

    function handleResponse(code: number, fullLine: string) {
      try {
        if (code >= 400 && stage !== "quit") {
          cleanup();
          reject(new Error(`SMTP server responded with error ${code}: ${fullLine}`));
          return;
        }

        switch (stage) {
          case "greeting":
            if (code === 220) {
              stage = "ehlo1";
              send(`EHLO emdash-freeform`);
            }
            break;

          case "ehlo1":
            if (code === 250) {
              if (!isDirectTls && (port === 587 || port === 25)) {
                stage = "starttls";
                send("STARTTLS");
              } else if (config.user && config.pass) {
                stage = "auth_login";
                send("AUTH LOGIN");
              } else {
                stage = "mail_from";
                send(`MAIL FROM:<${fromAddr}>`);
              }
            }
            break;

          case "starttls":
            if (code === 220) {
              // Upgrade to TLS
              socket.removeAllListeners("data");
              socket.removeAllListeners("error");
              const tlsSocket = tls.connect({
                socket,
                host: config.host,
                rejectUnauthorized: false,
              });
              socket = tlsSocket;
              socket.on("data", onData);
              socket.on("error", onError);
              stage = "ehlo2";
              send(`EHLO emdash-freeform`);
            }
            break;

          case "ehlo2":
            if (code === 250) {
              if (config.user && config.pass) {
                stage = "auth_login";
                send("AUTH LOGIN");
              } else {
                stage = "mail_from";
                send(`MAIL FROM:<${fromAddr}>`);
              }
            }
            break;

          case "auth_login":
            if (code === 334) {
              stage = "auth_user";
              send(Buffer.from(config.user || "").toString("base64"));
            }
            break;

          case "auth_user":
            if (code === 334) {
              stage = "auth_pass";
              send(Buffer.from(config.pass || "").toString("base64"));
            }
            break;

          case "auth_pass":
            if (code === 235 || code === 250) {
              stage = "mail_from";
              send(`MAIL FROM:<${fromAddr}>`);
            }
            break;

          case "mail_from":
            if (code === 250) {
              stage = "rcpt_to";
              recipientIdx = 0;
              send(`RCPT TO:<${sanitizeHeader(allRecipients[recipientIdx])}>`);
            }
            break;

          case "rcpt_to":
            if (code === 250) {
              recipientIdx++;
              if (recipientIdx < allRecipients.length) {
                send(`RCPT TO:<${sanitizeHeader(allRecipients[recipientIdx])}>`);
              } else {
                stage = "data_cmd";
                send("DATA");
              }
            }
            break;

          case "data_cmd":
            if (code === 354) {
              stage = "data_body";
              const mime = buildMimeMessage(msg, fromAddr);
              // In SMTP, dot stuffing: replace starting dot with two dots
              const stuffed = mime.replace(/\r?\n\./g, "\r\n..");
              socket.write(stuffed + "\r\n.\r\n");
            }
            break;

          case "data_body":
            if (code === 250) {
              stage = "quit";
              send("QUIT");
              cleanup();
              resolve({ messageId: `smtp-${Date.now()}@${config.host}` });
            }
            break;

          case "quit":
            cleanup();
            break;
        }
      } catch (err: any) {
        cleanup();
        reject(err);
      }
    }

    if (isDirectTls) {
      socket = tls.connect({
        host: config.host,
        port,
        rejectUnauthorized: false,
      });
    } else {
      socket = net.connect({
        host: config.host,
        port,
      });
    }

    socket.on("data", onData);
    socket.on("error", onError);
  });
}

function buildMimeMessage(msg: SmtpMessage, fromAddr: string): string {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const date = new Date().toUTCString();
  const headers = [
    `From: ${fromAddr}`,
    `To: ${sanitizeHeader(msg.to)}`,
    msg.cc?.length ? `Cc: ${msg.cc.map(sanitizeHeader).join(", ")}` : null,
    msg.replyTo ? `Reply-To: ${sanitizeHeader(msg.replyTo)}` : null,
    `Subject: ${sanitizeHeader(msg.subject)}`,
    `Date: ${date}`,
    `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@emdash-freeform>`,
    `MIME-Version: 1.0`,
  ].filter(Boolean) as string[];

  if (msg.html) {
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    const parts = [
      headers.join("\r\n"),
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 7bit",
      "",
      msg.text || "",
      "",
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 7bit",
      "",
      msg.html,
      "",
      `--${boundary}--`,
    ];
    return parts.join("\r\n");
  } else {
    headers.push("Content-Type: text/plain; charset=UTF-8");
    headers.push("Content-Transfer-Encoding: 7bit");
    return `${headers.join("\r\n")}\r\n\r\n${msg.text || ""}`;
  }
}

