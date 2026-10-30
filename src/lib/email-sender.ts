import type { PluginContext } from "emdash";
import type { EmailProviderSettings, EmailProviderType } from "../types";
import { sendSmtpEmail } from "./smtp";

export interface OutgoingEmailMessage {
  to: string;
  from?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html?: string;
}

const KV_PROVIDER = "settings:email:provider";
const KV_RESEND_KEY = "settings:email:resendApiKey";
const KV_RESEND_FROM = "settings:email:resendFrom";
const KV_SMTP_HOST = "settings:email:smtpHost";
const KV_SMTP_PORT = "settings:email:smtpPort";
const KV_SMTP_USER = "settings:email:smtpUser";
const KV_SMTP_PASS = "settings:email:smtpPass";
const KV_SMTP_FROM = "settings:email:smtpFrom";
const KV_SMTP_SECURE = "settings:email:smtpSecure";

export async function getEmailSettings(ctx: PluginContext): Promise<EmailProviderSettings> {
  const provider = (await ctx.kv.get<EmailProviderType>(KV_PROVIDER)) || "smtp";
  const resendApiKey = (await ctx.kv.get<string>(KV_RESEND_KEY)) || "";
  const resendFrom = (await ctx.kv.get<string>(KV_RESEND_FROM)) || "";
  const smtpHost = (await ctx.kv.get<string>(KV_SMTP_HOST)) || "";
  const smtpPort = (await ctx.kv.get<number>(KV_SMTP_PORT)) || 587;
  const smtpUser = (await ctx.kv.get<string>(KV_SMTP_USER)) || "";
  const smtpPass = (await ctx.kv.get<string>(KV_SMTP_PASS)) || "";
  const smtpFrom = (await ctx.kv.get<string>(KV_SMTP_FROM)) || "";
  const smtpSecure = (await ctx.kv.get<boolean>(KV_SMTP_SECURE)) || false;

  return {
    provider,
    resendApiKey,
    resendFrom,
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPass,
    smtpFrom,
    smtpSecure,
  };
}

export async function saveEmailSettings(
  ctx: PluginContext,
  patch: Partial<EmailProviderSettings>,
): Promise<EmailProviderSettings> {
  if (patch.provider) await ctx.kv.set(KV_PROVIDER, patch.provider);
  if (patch.resendApiKey !== undefined) await ctx.kv.set(KV_RESEND_KEY, patch.resendApiKey.trim());
  if (patch.resendFrom !== undefined) await ctx.kv.set(KV_RESEND_FROM, patch.resendFrom.trim());
  if (patch.smtpHost !== undefined) await ctx.kv.set(KV_SMTP_HOST, patch.smtpHost.trim());
  if (patch.smtpPort !== undefined) await ctx.kv.set(KV_SMTP_PORT, Number(patch.smtpPort) || 587);
  if (patch.smtpUser !== undefined) await ctx.kv.set(KV_SMTP_USER, patch.smtpUser.trim());
  if (patch.smtpPass !== undefined) await ctx.kv.set(KV_SMTP_PASS, patch.smtpPass);
  if (patch.smtpFrom !== undefined) await ctx.kv.set(KV_SMTP_FROM, patch.smtpFrom.trim());
  if (patch.smtpSecure !== undefined) await ctx.kv.set(KV_SMTP_SECURE, Boolean(patch.smtpSecure));

  return getEmailSettings(ctx);
}

export async function sendEmail(
  ctx: PluginContext,
  msg: OutgoingEmailMessage,
): Promise<{ id: string; provider: string }> {
  const settings = await getEmailSettings(ctx);
  const provider = settings.provider || "emdash";

  if (provider === "log") {
    ctx.log.info("📧 [Dev Mailbox] Notification email simulated:", {
      to: msg.to,
      subject: msg.subject,
      replyTo: msg.replyTo,
      from: msg.from,
    });
    return { id: `log-${Date.now()}`, provider: "log" };
  }

  if (provider === "resend") {
    if (!settings.resendApiKey) {
      throw new Error("Resend API key is not configured in Freeform Settings.");
    }
    const from = msg.from || settings.resendFrom || "Freeform <onboarding@resend.dev>";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [msg.to],
        cc: msg.cc?.length ? msg.cc : undefined,
        bcc: msg.bcc?.length ? msg.bcc : undefined,
        reply_to: msg.replyTo || undefined,
        subject: msg.subject,
        text: msg.text,
        html: msg.html || undefined,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      let errMsg = errText;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.message) errMsg = parsed.message;
      } catch {}
      throw new Error(`Resend API delivery failed (${res.status}): ${errMsg}`);
    }

    const data = (await res.json()) as { id?: string };
    return { id: data?.id || `resend-${Date.now()}`, provider: "resend" };
  }

  if (provider === "smtp") {
    if (!settings.smtpHost) {
      throw new Error("SMTP host is not configured in Freeform Settings.");
    }
    const from = msg.from || settings.smtpFrom || "notifications@local";
    const res = await sendSmtpEmail(
      {
        host: settings.smtpHost,
        port: settings.smtpPort || 587,
        secure: settings.smtpSecure,
        user: settings.smtpUser,
        pass: settings.smtpPass,
        from,
      },
      {
        ...msg,
        from,
      },
    );
    return { id: res.messageId, provider: "smtp" };
  }

  // Fallback to EmDash default `ctx.email`
  if (ctx.email) {
    await ctx.email.send({
      to: msg.to,
      cc: msg.cc,
      replyTo: msg.replyTo,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
    return { id: `emdash-${Date.now()}`, provider: "emdash" };
  }

  throw new Error(
    "No active email provider configured. Please configure Resend, SMTP, or EmDash email in Freeform Settings.",
  );
}

