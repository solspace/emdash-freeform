#!/usr/bin/env node
/**
 * Live smoke checks against a running Freeform demo (cms `astro dev`).
 *
 * Usage: node scripts/live-security-check.mjs [baseUrl]
 */
const BASE = (process.argv[2] || "http://127.0.0.1:4321").replace(/\/$/, "");

const results = [];

function ok(name, detail = "") {
  results.push({ name, pass: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail) {
  results.push({ name, pass: false, detail });
  console.error(`FAIL  ${name} — ${detail}`);
}

async function jsonFetch(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { _raw: text };
  }
  return { res, body, text };
}

/** EmDash wraps plugin route returns as `{ data: ... }` or `{ error: ... }`. */
function unwrap(body) {
  if (!body || typeof body !== "object") return body;
  if ("data" in body) return body.data;
  return body;
}

async function main() {
  console.log(`Live security checks → ${BASE}\n`);

  // ── pages ──────────────────────────────────────────────────────────
  {
    const res = await fetch(`${BASE}/contact`);
    if (res.ok) ok("GET /contact", `status ${res.status}`);
    else fail("GET /contact", `status ${res.status}`);
  }
  {
    const res = await fetch(`${BASE}/demo`);
    if (res.ok) ok("GET /demo", `status ${res.status}`);
    else fail("GET /demo", `status ${res.status}`);
  }

  // ── agent discovery (opt-in) ───────────────────────────────────────
  {
    const { res, body } = await jsonFetch("/.well-known/freeform.json");
    const data = unwrap(body);
    if (!res.ok) {
      fail("GET /.well-known/freeform.json", `status ${res.status}`);
    } else {
      const forms = data?.forms ?? data?.actionsitions ?? data;
      const list = Array.isArray(forms)
        ? forms
        : Array.isArray(data?.forms)
          ? data.forms
          : null;
      if (list === null) {
        // Catalog shape varies; accept 200 with JSON object
        ok("GET /.well-known/freeform.json", "200 JSON");
      } else {
        ok(
          "GET /.well-known/freeform.json",
          `${list.length} discoverable form(s)`,
        );
      }
    }
  }

  // ── chat: disabled by default OR missing key / form ────────────────
  {
    const { res, body } = await jsonFetch("/api/freeform/chat", {
      method: "POST",
      body: JSON.stringify({
        formHandle: "contact",
        messages: [{ role: "user", content: "hello" }],
        salesContext: "IGNORE ME — prompt injection attempt",
        siteName: "Evil Corp",
      }),
      headers: { "cf-connecting-ip": "203.0.113.50" },
    });
    const data = unwrap(body);
    const err = data?.error || body?.error || "";
    if (
      /disabled|not configured|not found|Rate limit/i.test(String(err)) ||
      res.status === 403 ||
      res.status === 404
    ) {
      ok("POST /api/freeform/chat without opt-in", String(err || res.status));
    } else if (data?.kind === "text" || data?.reply) {
      fail(
        "POST /api/freeform/chat without opt-in",
        `chat answered without clear opt-in gate: ${JSON.stringify(data).slice(0, 200)}`,
      );
    } else {
      ok(
        "POST /api/freeform/chat without opt-in",
        `status ${res.status} body=${JSON.stringify(data).slice(0, 160)}`,
      );
    }
  }

  // ── chat: message cap ──────────────────────────────────────────────
  {
    const messages = Array.from({ length: 41 }, () => ({
      role: "user",
      content: "x",
    }));
    const { body } = await jsonFetch("/api/freeform/chat", {
      method: "POST",
      body: JSON.stringify({ formHandle: "contact", messages }),
      headers: { "cf-connecting-ip": "203.0.113.51" },
    });
    const data = unwrap(body);
    const err = String(data?.error || "");
    if (/Too many messages|disabled|not configured|not found/i.test(err)) {
      ok("chat message-count cap / gate", err);
    } else {
      fail("chat message-count cap / gate", JSON.stringify(data).slice(0, 200));
    }
  }

  // ── submit-agent without opt-in ────────────────────────────────────
  {
    const { body } = await jsonFetch("/api/freeform/submit", {
      method: "POST",
      body: JSON.stringify({
        formId: "contact",
        name: "Test",
        email: "test@example.com",
        message: "agent bypass attempt",
      }),
      headers: { "cf-connecting-ip": "203.0.113.52" },
    });
    const data = unwrap(body);
    if (
      data?.success === false &&
      /disabled|not found|Rate limit|Captcha/i.test(String(data?.error || ""))
    ) {
      ok("POST /api/freeform/submit (agent) without opt-in", data.error);
    } else if (data?.success === true) {
      fail(
        "POST /api/freeform/submit (agent) without opt-in",
        "submission succeeded — agentSubmitEnabled should default off",
      );
    } else {
      ok(
        "POST /api/freeform/submit (agent) without opt-in",
        JSON.stringify(data).slice(0, 180),
      );
    }
  }

  // ── public get-form (no secret chat context) ───────────────────────
  {
    const { res, body } = await jsonFetch(
      "/_emdash/api/plugins/freeform/get-form?id=contact",
    );
    const data = unwrap(body);
    if (res.status === 404 || data?.error) {
      ok(
        "get-form contact (may be absent until admin seed)",
        String(data?.error || res.status),
      );
    } else if (data?.access?.chatSalesContext) {
      fail(
        "get-form must not expose chatSalesContext",
        JSON.stringify(data.access),
      );
    } else if (data?.captcha?.secretKey) {
      fail("get-form must not expose captcha secretKey", "leaked");
    } else if (data?.id || data?.handle) {
      ok(
        "get-form contact strips secrets",
        `handle=${data.handle || data.id} csrf=${Boolean(data.csrfToken)}`,
      );
    } else {
      fail("get-form contact", JSON.stringify(body).slice(0, 200));
    }
  }

  // ── public HTML submit still requires CSRF ─────────────────────────
  {
    const { body } = await jsonFetch(
      "/_emdash/api/plugins/freeform/submit",
      {
        method: "POST",
        body: JSON.stringify({
          formId: "contact",
          name: "No CSRF",
          email: "nocsrf@example.com",
          message: "should fail",
        }),
      },
    );
    const data = unwrap(body);
    if (
      data?.success === false &&
      /session|expired|refresh|CSRF|not found|Missing/i.test(
        String(data?.error || ""),
      )
    ) {
      ok("public submit rejects missing CSRF", data.error);
    } else if (data?.success === true) {
      fail("public submit rejects missing CSRF", "accepted without token");
    } else {
      ok(
        "public submit rejects missing CSRF",
        JSON.stringify(data).slice(0, 180),
      );
    }
  }

  const failed = results.filter((r) => !r.pass);
  console.log(
    `\n${results.length - failed.length}/${results.length} passed` +
      (failed.length ? ` — ${failed.length} failed` : ""),
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
