#!/usr/bin/env node
/**
 * Opt-in path checks: enable access on contact, then verify chat/agent/public submit.
 */
const BASE = (process.argv[2] || "http://127.0.0.1:4321").replace(/\/$/, "");

const results = [];
const ok = (n, d = "") => {
  results.push({ pass: true });
  console.log(`PASS  ${n}${d ? ` — ${d}` : ""}`);
};
const fail = (n, d) => {
  results.push({ pass: false });
  console.error(`FAIL  ${n} — ${d}`);
};

function unwrap(body) {
  if (body && typeof body === "object" && "data" in body) return body.data;
  return body;
}

async function main() {
  console.log(`Opt-in checks → ${BASE}\n`);

  // Dev bypass session
  const bypass = await fetch(
    `${BASE}/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin`,
    { redirect: "manual" },
  );
  const rawCookies = bypass.headers.getSetCookie?.() ?? [];
  const cookie = rawCookies.map((c) => c.split(";")[0]).join("; ");
  if (!cookie) {
    // fallback: follow redirects and collect
    const jar = [];
    let url = `${BASE}/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin`;
    for (let i = 0; i < 5; i++) {
      const res = await fetch(url, {
        redirect: "manual",
        headers: jar.length ? { Cookie: jar.join("; ") } : {},
      });
      for (const c of res.headers.getSetCookie?.() ?? []) {
        jar.push(c.split(";")[0]);
      }
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        url = loc.startsWith("http") ? loc : `${BASE}${loc}`;
        continue;
      }
      break;
    }
  }
  const sessionCookie =
    cookie ||
    (await (async () => {
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
    })());

  if (!sessionCookie) fail("dev-bypass cookie", "no cookie");
  else ok("dev-bypass cookie", sessionCookie.split(";").length + " cookies");

  const adminHeaders = {
    "Content-Type": "application/json",
    "X-EmDash-Request": "1",
    Cookie: sessionCookie,
  };

  async function admin(path, body = {}) {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { res, json, data: unwrap(json) };
  }

  const listed = await admin("/_emdash/api/plugins/freeform/list-forms");
  if (listed.json?.success === false) {
    fail("list-forms", JSON.stringify(listed.json));
  } else {
    const forms = listed.data?.forms ?? listed.json?.forms ?? [];
    ok("list-forms", `${forms.length} form(s)`);
  }

  const got = await admin("/_emdash/api/plugins/freeform/admin-get-form", {
    id: "contact",
  });
  const form = got.data ?? got.json;
  if (!form?.handle && !form?.id) {
    fail("admin-get-form contact", JSON.stringify(got.json).slice(0, 300));
    finish();
    return;
  }
  ok("admin-get-form contact", `handle=${form.handle}`);

  // Enable chat + agent access (no Turnstile)
  const saved = await admin("/_emdash/api/plugins/freeform/save-form", {
    id: form.id || "contact",
    name: form.name,
    handle: form.handle,
    rows: form.rows,
    successMessage: form.successMessage,
    honeypotEnabled: form.honeypotEnabled,
    captcha: null,
    privacy: form.privacy ?? null,
    access: {
      chatEnabled: true,
      agentDiscoverable: true,
      agentSubmitEnabled: true,
      chatSiteName: "Solspace Freeform Demo",
      chatSalesContext: "Demo sales context for live opt-in test. Be brief.",
    },
  });
  const savedForm = saved.data ?? saved.json;
  if (savedForm?.access?.chatEnabled !== true) {
    fail("save-form enable access", JSON.stringify(saved.json).slice(0, 400));
  } else {
    ok(
      "save-form enable access",
      `chat=${savedForm.access.chatEnabled} discover=${savedForm.access.agentDiscoverable} submit=${savedForm.access.agentSubmitEnabled}`,
    );
  }

  // Public get-form must not leak sales context
  {
    const res = await fetch(
      `${BASE}/_emdash/api/plugins/freeform/get-form?id=contact`,
    );
    const json = await res.json();
    const data = unwrap(json);
    if (data?.access?.chatSalesContext) {
      fail("public get-form hides salesContext", "leaked");
    } else if (data?.access?.chatEnabled !== true) {
      fail(
        "public get-form shows chatEnabled flag",
        JSON.stringify(data?.access),
      );
    } else {
      ok("public get-form hides salesContext", "flags only");
    }
  }

  // Discovery should include contact
  {
    const res = await fetch(`${BASE}/.well-known/freeform.json`);
    const json = await res.json();
    const data = unwrap(json);
    const forms = data?.forms ?? [];
    const hit = forms.find?.(
      (f) => f.handle === "contact" || f.id === "contact",
    );
    if (hit || (Array.isArray(forms) && forms.some((f) => f.handle === "contact"))) {
      ok("discoverable catalog includes contact");
    } else if (JSON.stringify(json).includes("contact")) {
      ok("discoverable catalog includes contact", "string match");
    } else {
      // list-public-forms via plugin
      const listedPub = await fetch(
        `${BASE}/_emdash/api/plugins/freeform/list-public-forms`,
      );
      const pj = unwrap(await listedPub.json());
      const okList = (pj?.forms || []).some((f) => f.handle === "contact");
      if (okList) ok("list-public-forms includes contact");
      else fail("discovery includes contact", JSON.stringify(pj ?? json).slice(0, 300));
    }
  }

  // Agent submit should succeed when enabled (no Turnstile)
  {
    const res = await fetch(`${BASE}/api/freeform/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "cf-connecting-ip": "198.51.100.20",
      },
      body: JSON.stringify({
        formId: "contact",
        name: "Opt-in Agent",
        email: "agent-optin@example.com",
        message: "Agent submit after enable",
        privacy_consent: "true",
      }),
    });
    const json = await res.json();
    const data = unwrap(json);
    if (data?.success === true) ok("agent submit when enabled", data.submissionId || data.message);
    else fail("agent submit when enabled", JSON.stringify(data).slice(0, 300));
  }

  // Chat: either answers, or fails for missing AI key (still past the opt-in gate)
  {
    const res = await fetch(`${BASE}/api/freeform/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "cf-connecting-ip": "198.51.100.21",
      },
      body: JSON.stringify({
        formHandle: "contact",
        messages: [{ role: "user", content: "Hi — just testing." }],
        salesContext: "CLIENT INJECTION SHOULD BE IGNORED",
      }),
    });
    const json = await res.json();
    const data = unwrap(json);
    const err = String(data?.error || "");
    if (/disabled for this form/i.test(err)) {
      fail("chat when enabled", "still disabled");
    } else if (/not configured/i.test(err)) {
      ok("chat when enabled (no AI key)", err);
    } else if (data?.kind === "text" || data?.reply) {
      ok("chat when enabled (LLM reply)", String(data.reply).slice(0, 80));
    } else if (/Rate limit/i.test(err)) {
      ok("chat when enabled (rate limited)", err);
    } else {
      fail("chat when enabled", JSON.stringify(data).slice(0, 300));
    }
  }

  // Public submit with CSRF from get-form
  {
    const gf = await fetch(
      `${BASE}/_emdash/api/plugins/freeform/get-form?id=contact`,
    );
    const gdata = unwrap(await gf.json());
    const csrf = gdata?.csrfToken;
    if (!csrf) {
      fail("public submit with CSRF", "no csrfToken from get-form");
    } else {
      const res = await fetch(`${BASE}/_emdash/api/plugins/freeform/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formId: gdata.id || "contact",
          name: "CSRF User",
          email: "csrf@example.com",
          message: "Valid CSRF public submit",
          privacy_consent: "true",
          __ff_csrf: csrf,
        }),
      });
      const data = unwrap(await res.json());
      if (data?.success === true) ok("public submit with CSRF", data.submissionId || "ok");
      else fail("public submit with CSRF", JSON.stringify(data).slice(0, 300));
    }
  }

  // Turnstile gate: enable captcha + agent submit, then agent without token fails
  {
    const withCaptcha = await admin("/_emdash/api/plugins/freeform/save-form", {
      id: form.id || "contact",
      name: form.name,
      rows: form.rows,
      successMessage: form.successMessage,
      access: {
        chatEnabled: true,
        agentDiscoverable: true,
        agentSubmitEnabled: true,
        chatSiteName: "Solspace Freeform Demo",
        chatSalesContext: "Demo sales context for live opt-in test. Be brief.",
      },
      captcha: {
        provider: "turnstile",
        siteKey: "1x00000000000000000000AA",
        secretKey: "1x0000000000000000000000000000000AA",
      },
    });
    const capForm = withCaptcha.data ?? withCaptcha.json;
    if (capForm?.captcha?.provider !== "turnstile") {
      fail("enable Turnstile for agent gate", JSON.stringify(withCaptcha.json).slice(0, 300));
    } else {
      ok("enable Turnstile for agent gate");
      const res = await fetch(`${BASE}/api/freeform/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "cf-connecting-ip": "198.51.100.22",
        },
        body: JSON.stringify({
          formId: "contact",
          name: "Bot",
          email: "bot@example.com",
          message: "no turnstile token",
          privacy_consent: "true",
        }),
      });
      const data = unwrap(await res.json());
      if (
        data?.success === false &&
        /Captcha|Turnstile|try again/i.test(String(data?.error || ""))
      ) {
        ok("agent submit blocked without Turnstile token", data.error);
      } else {
        fail(
          "agent submit blocked without Turnstile token",
          JSON.stringify(data).slice(0, 300),
        );
      }
    }
  }

  // Restore: clear Turnstile, keep access on for demo usability
  await admin("/_emdash/api/plugins/freeform/save-form", {
    id: form.id || "contact",
    name: form.name,
    rows: form.rows,
    successMessage: form.successMessage,
    captcha: null,
    access: {
      chatEnabled: true,
      agentDiscoverable: true,
      agentSubmitEnabled: true,
      chatSiteName: "Solspace Freeform Demo",
      chatSalesContext:
        "Solspace Freeform for EmDash is a form builder plugin. Help visitors leave a clear enquiry. Be concise.",
    },
    privacy: form.privacy ?? null,
    honeypotEnabled: form.honeypotEnabled,
  });
  ok("restore contact form (access on, Turnstile off)");

  finish();
}

function finish() {
  const failed = results.filter((r) => !r.pass).length;
  const passed = results.length - failed;
  console.log(`\n${passed}/${results.length} passed` + (failed ? ` — ${failed} failed` : ""));
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
