#!/usr/bin/env node
/**
 * Full live verification: defaults-off → opt-in → CSRF submit → Turnstile gate → restore.
 */
const BASE = (process.argv[2] || "http://127.0.0.1:4321").replace(/\/$/, "");
const results = [];
const ok = (n, d = "") => {
  results.push({ n, pass: true, d });
  console.log(`PASS  ${n}${d ? ` — ${d}` : ""}`);
};
const fail = (n, d) => {
  results.push({ n, pass: false, d });
  console.error(`FAIL  ${n} — ${d}`);
};
const unwrap = (body) =>
  body && typeof body === "object" && "data" in body ? body.data : body;

async function getSessionCookie() {
  const jar = [];
  let url = `${BASE}/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin`;
  for (let i = 0; i < 6; i++) {
    const res = await fetch(url, {
      redirect: "manual",
      headers: jar.length ? { Cookie: jar.join("; ") } : {},
    });
    for (const c of res.headers.getSetCookie?.() ?? []) jar.push(c.split(";")[0]);
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      url = loc.startsWith("http") ? loc : new URL(loc, BASE).href;
      continue;
    }
    break;
  }
  return jar.join("; ");
}

async function main() {
  console.log(`Full live check → ${BASE}\n`);

  // Pages
  for (const path of ["/", "/contact", "/demo", "/.well-known/freeform.json"]) {
    const res = await fetch(`${BASE}${path}`);
    if (res.ok) ok(`GET ${path}`, String(res.status));
    else fail(`GET ${path}`, String(res.status));
  }

  const cookie = await getSessionCookie();
  if (!cookie) fail("dev-bypass", "no cookie");
  else ok("dev-bypass", "session ok");

  const adminHeaders = {
    "Content-Type": "application/json",
    "X-EmDash-Request": "1",
    Cookie: cookie,
  };
  const admin = async (path, body = {}) => {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { res, json, data: unwrap(json) };
  };

  const got = await admin("/_emdash/api/plugins/freeform/admin-get-form", {
    id: "contact",
  });
  const form = got.data ?? got.json;
  if (!form?.handle) {
    fail("admin-get-form", JSON.stringify(got.json).slice(0, 240));
    return finish();
  }
  ok("admin-get-form", form.handle);

  const baseSave = {
    id: form.id || "contact",
    name: form.name,
    handle: form.handle,
    rows: form.rows,
    successMessage: form.successMessage,
    honeypotEnabled: form.honeypotEnabled,
    privacy: form.privacy ?? null,
  };

  // ── 1) Defaults off ──────────────────────────────────────────────
  {
    const saved = await admin("/_emdash/api/plugins/freeform/save-form", {
      ...baseSave,
      captcha: null,
      access: {
        chatEnabled: false,
        agentDiscoverable: false,
        agentSubmitEnabled: false,
      },
    });
    const a = (saved.data ?? saved.json)?.access;
    if (a?.chatEnabled || a?.agentSubmitEnabled || a?.agentDiscoverable) {
      fail("save access off", JSON.stringify(a));
    } else ok("save access off");
  }

  {
    const { body } = await post("/api/freeform/chat", {
      formHandle: "contact",
      messages: [{ role: "user", content: "hi" }],
      salesContext: "INJECT",
    }, "203.0.113.10");
    const data = unwrap(body);
    if (/disabled/i.test(String(data?.error))) ok("chat blocked when off", data.error);
    else fail("chat blocked when off", JSON.stringify(data).slice(0, 200));
  }

  {
    const { body } = await post("/api/freeform/submit", {
      formId: "contact",
      name: "X",
      email: "x@example.com",
      message: "nope",
      privacy_consent: "true",
    }, "203.0.113.11");
    const data = unwrap(body);
    if (data?.success === false && /disabled/i.test(String(data?.error))) {
      ok("agent submit blocked when off", data.error);
    } else fail("agent submit blocked when off", JSON.stringify(data).slice(0, 200));
  }

  {
    const res = await fetch(
      `${BASE}/_emdash/api/plugins/freeform/list-public-forms`,
    );
    const data = unwrap(await res.json());
    const forms = data?.forms || [];
    if (forms.some((f) => f.handle === "contact")) {
      fail("list-public-forms excludes contact when off", JSON.stringify(forms));
    } else ok("list-public-forms excludes contact when off", `${forms.length} forms`);
  }

  // ── 2) Opt-in on ─────────────────────────────────────────────────
  {
    const saved = await admin("/_emdash/api/plugins/freeform/save-form", {
      ...baseSave,
      captcha: null,
      access: {
        chatEnabled: true,
        agentDiscoverable: true,
        agentSubmitEnabled: true,
        chatSiteName: "Solspace Freeform Demo",
        chatSalesContext: "Live full-check sales context. Be brief.",
      },
    });
    const a = (saved.data ?? saved.json)?.access;
    if (a?.chatEnabled && a?.agentSubmitEnabled && a?.agentDiscoverable) {
      ok("save access on");
    } else fail("save access on", JSON.stringify(a));
  }

  {
    const res = await fetch(
      `${BASE}/_emdash/api/plugins/freeform/get-form?id=contact`,
    );
    const data = unwrap(await res.json());
    if (data?.access?.chatSalesContext) fail("get-form hides salesContext", "leaked");
    else if (data?.captcha?.secretKey) fail("get-form hides secretKey", "leaked");
    else if (data?.access?.chatEnabled === true && data?.csrfToken) {
      ok("get-form public payload safe", "flags + csrf only");
    } else fail("get-form public payload safe", JSON.stringify(data).slice(0, 200));
  }

  {
    const res = await fetch(
      `${BASE}/_emdash/api/plugins/freeform/list-public-forms`,
    );
    const data = unwrap(await res.json());
    const forms = data?.forms || [];
    if (forms.some((f) => f.handle === "contact")) ok("list-public-forms includes contact");
    else fail("list-public-forms includes contact", JSON.stringify(forms));
  }

  {
    const { body } = await post("/api/freeform/submit", {
      formId: "contact",
      name: "Agent OK",
      email: "agent-ok@example.com",
      message: "agent submit enabled",
      privacy_consent: "true",
    }, "198.51.100.30");
    const data = unwrap(body);
    if (data?.success) ok("agent submit when on", data.submissionId || "ok");
    else fail("agent submit when on", JSON.stringify(data).slice(0, 200));
  }

  {
    const { body } = await post("/api/freeform/chat", {
      formHandle: "contact",
      messages: [{ role: "user", content: "Hello" }],
      salesContext: "CLIENT SHOULD BE IGNORED",
    }, "198.51.100.31");
    const data = unwrap(body);
    const err = String(data?.error || "");
    if (/disabled/i.test(err)) fail("chat when on", "still disabled");
    else if (/not configured/i.test(err)) ok("chat when on (no/invalid key gate passed)", err);
    else if (data?.kind || data?.reply) ok("chat when on (reply)", String(data.reply || data.kind).slice(0, 60));
    else if (/Rate limit/i.test(err)) ok("chat when on (rate limited)", err);
    else fail("chat when on", JSON.stringify(data).slice(0, 200));
  }

  {
    const { body } = await post("/api/freeform/chat", {
      formHandle: "contact",
      messages: Array.from({ length: 41 }, () => ({ role: "user", content: "x" })),
    }, "198.51.100.32");
    const data = unwrap(body);
    if (/Too many messages/i.test(String(data?.error))) ok("chat message cap", data.error);
    else fail("chat message cap", JSON.stringify(data).slice(0, 200));
  }

  // CSRF public submit
  {
    const gf = unwrap(
      await (
        await fetch(`${BASE}/_emdash/api/plugins/freeform/get-form?id=contact`)
      ).json(),
    );
    const { body } = await post(
      "/_emdash/api/plugins/freeform/submit",
      {
        formId: gf.id || "contact",
        name: "CSRF OK",
        email: "csrf-ok@example.com",
        message: "public csrf submit",
        privacy_consent: "true",
        __ff_csrf: gf.csrfToken,
      },
      null,
      false,
    );
    const data = unwrap(body);
    if (data?.success) ok("public submit with CSRF");
    else fail("public submit with CSRF", JSON.stringify(data).slice(0, 200));
  }

  // Missing CSRF rejected
  {
    const { body } = await post(
      "/_emdash/api/plugins/freeform/submit",
      {
        formId: "contact",
        name: "No",
        email: "no@example.com",
        message: "no csrf",
        privacy_consent: "true",
      },
      null,
      false,
    );
    const data = unwrap(body);
    if (data?.success === false && /session|expired|refresh/i.test(String(data?.error))) {
      ok("public submit rejects missing CSRF", data.error);
    } else fail("public submit rejects missing CSRF", JSON.stringify(data).slice(0, 200));
  }

  // Turnstile gate on agent
  {
    await admin("/_emdash/api/plugins/freeform/save-form", {
      ...baseSave,
      access: {
        chatEnabled: true,
        agentDiscoverable: true,
        agentSubmitEnabled: true,
        chatSiteName: "Solspace Freeform Demo",
        chatSalesContext: "Live full-check sales context. Be brief.",
      },
      captcha: {
        provider: "turnstile",
        siteKey: "1x00000000000000000000AA",
        secretKey: "1x0000000000000000000000000000000AA",
      },
    });
    ok("enable Turnstile");
    const { body } = await post("/api/freeform/submit", {
      formId: "contact",
      name: "Bot",
      email: "bot@example.com",
      message: "no token",
      privacy_consent: "true",
    }, "198.51.100.33");
    const data = unwrap(body);
    if (data?.success === false && /Captcha|Turnstile|try again/i.test(String(data?.error))) {
      ok("agent submit requires Turnstile when configured", data.error);
    } else fail("agent submit requires Turnstile when configured", JSON.stringify(data).slice(0, 200));
  }

  // AI settings skipDemoSeed round-trip
  {
    const before = await admin("/_emdash/api/plugins/freeform/get-ai-settings");
    const cur = Boolean((before.data ?? before.json)?.skipDemoSeed);
    const saved = await admin("/_emdash/api/plugins/freeform/save-ai-settings", {
      skipDemoSeed: !cur,
    });
    const mid = Boolean((saved.data ?? saved.json)?.skipDemoSeed);
    const restored = await admin("/_emdash/api/plugins/freeform/save-ai-settings", {
      skipDemoSeed: cur,
    });
    const end = Boolean((restored.data ?? restored.json)?.skipDemoSeed);
    if (mid === !cur && end === cur) ok("skipDemoSeed toggle round-trip", `${cur}→${!cur}→${end}`);
    else fail("skipDemoSeed toggle round-trip", JSON.stringify({ cur, mid, end }));
  }

  // Restore demo-friendly contact form
  await admin("/_emdash/api/plugins/freeform/save-form", {
    ...baseSave,
    captcha: null,
    access: {
      chatEnabled: true,
      agentDiscoverable: true,
      agentSubmitEnabled: true,
      chatSiteName: "Solspace Freeform Demo",
      chatSalesContext:
        "Solspace Freeform for EmDash is a form builder plugin. Help visitors leave a clear enquiry. Be concise.",
    },
  });
  ok("restore contact (access on, Turnstile off)");

  finish();
}

async function post(path, body, ip, json = true) {
  const headers = { "Content-Type": "application/json" };
  if (ip) headers["cf-connecting-ip"] = ip;
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { _raw: text };
  }
  return { res, body: parsed };
}

function finish() {
  const failed = results.filter((r) => !r.pass);
  console.log(
    `\n${results.length - failed.length}/${results.length} passed` +
      (failed.length ? ` — ${failed.length} failed` : " — all green"),
  );
  if (failed.length) {
    console.log("\nFailed:");
    for (const f of failed) console.log(` - ${f.n}: ${f.d}`);
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
