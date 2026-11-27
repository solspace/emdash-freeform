# Security

**Reporting a vulnerability**

Email **support@solspace.com**. Please do not open a public issue for
security problems.

**How Freeform protects your site**

- Submission forms carry a honeypot field and HMAC-signed CSRF tokens
  (timing-safe verification, 2-hour expiry).
- Outbound webhooks are signed with HMAC-SHA256 (`X-Freeform-Signature`)
  so receivers can verify authenticity.
- API keys you provide (e.g. OpenAI) are stored in your site's own
  plugin storage — they are never sent to Solspace.
- Outbound notification email defaults to EmDash’s `email:send` pipeline.
  Optional Freeform SMTP/Resend credentials (when configured) stay in your
  site’s plugin storage. The SMTP client verifies TLS certificates.
- Export links are short-lived, signed tokens; they expire automatically.

**AI chat & agent endpoints (opt-in)**

These routes are public when enabled. Defaults are **off** per form
(Protection → AI chat & agents):

| Surface | Gate | Extra controls |
| --- | --- | --- |
| `chat` | `access.chatEnabled` | Per-IP rate limit **before** the LLM call; message count/length caps; `salesContext` / site name come only from form settings (client values ignored) |
| `list-public-forms` / manifests | `access.agentDiscoverable` | No demo seed from unauthenticated requests |
| `submit-agent` | `access.agentSubmitEnabled` | Per-IP rate limit (missing IP shares a tight `no-ip` bucket); Turnstile required when the form has Turnstile configured |

Standard HTML submit still uses honeypot + CSRF (+ Turnstile when configured).
Agent submit does not use CSRF/honeypot; enable it only when you need machine
clients, and keep Turnstile on if you need captcha on that path.

**Demo Contact form**

Seeding runs from install / first Freeform admin visit only — never from
public routes. The starter Contact form leaves AI chat / agent discovery /
agent submit **off**. Settings → AI & spam can skip creating the starter form.
