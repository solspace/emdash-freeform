# Freeform for EmDash

Build forms, collect submissions, and send notifications — directly from [EmDash CMS](https://emdashcms.com).

Freeform is published on the EmDash plugin registry as `@solspace.com/freeform` ([plugin page](https://plugins.emdashcms.com/plugins/@solspace.com/freeform)), with a companion Astro package for rendering forms on your site.

| Package | What it does |
| --- | --- |
| **Freeform** (this repo, repo root) | EmDash plugin — form builder admin, submissions, notifications, webhooks, APIs |
| **[@solspace/freeform-astro](https://www.npmjs.com/package/@solspace/freeform-astro)** (`packages/astro`) | Astro integration — public form routes + `FreeformForm` / `FreeformChat` components |
| **MCP server** (`packages/mcp`) | Optional Cloudflare Worker exposing Freeform to AI agents |

## Requirements

- EmDash **≥ 1.0** site (Astro 6+, server output)
- Node.js **≥ 22**

## Getting started

### 1. Enable the plugin registry

```js
// astro.config.mjs
import emdash from "emdash/astro";

export default defineConfig({
  integrations: [
    emdash({
      registry: "https://registry.emdashcms.com",
      // …your existing database / storage config…
    }),
  ],
});
```

### 2. Install the plugin

In the EmDash admin: **Plugins → Registry** → search **`freeform`** → **Install**, and approve the requested capabilities (`network:request`, `email:send`).

Verify from a terminal if you like:

```bash
npx @emdash-cms/plugin-cli info solspace.com freeform
```

### 3. Install the Astro integration

```bash
pnpm add @solspace/freeform-astro
```

```js
// astro.config.mjs
import freeformAstro from "@solspace/freeform-astro";

export default defineConfig({
  integrations: [emdash({ /* … */ }), freeformAstro()],
});
```

This injects the public routes (`/api/freeform/submit`, `/.well-known/freeform.json`, …). See the [package README](packages/astro/README.md) for the full list.

### 4. Create and embed a form

1. Admin → **Freeform** → **New form** — set a name and a **handle** (e.g. `contact`)
2. Add fields manually, or use **Generate with AI** (needs an OpenAI API key under Freeform → Settings → AI & spam)
3. For email notifications in production, configure EmDash **Settings → Email** first — see [Email & notifications](docs/email.md)
4. Embed it anywhere:

```astro
---
import { FreeformForm } from "@solspace/freeform-astro/components";
---

<FreeformForm formId="contact" />
```

Components ship **unstyled** — style them via the `data-freeform-*` attributes:

```css
[data-freeform-form]  { display: grid; gap: 1rem; max-width: 32rem; }
[data-freeform-field] { display: flex; flex-direction: column; gap: 0.25rem; }
[data-freeform-input] { padding: 0.5rem 0.75rem; border: 1px solid #ccc; border-radius: 0.375rem; }
```

Submit a test entry, then check **Freeform → Submissions** in the admin.

## Features

- **Form builder** — 13 field types (text, email, textarea, number, phone, date, checkbox, checkbox groups, radio, select, multi-select, hidden, HTML), row layout, per-field validation
- **AI builder** — describe a form in plain English (optional, bring your own OpenAI key)
- **Submissions inbox** — list + detail, AI brief when configured, CSV export / hard delete
- **Email notifications** — Mustache templates; delivery via EmDash’s email provider (not IMAP/SMTP inside Freeform)
- **Webhooks** — HMAC-signed `POST` on every submission, automatic retries, delivery log
- **Spam / privacy** — honeypot, CSRF, optional Turnstile + AI spam scoring; consent field, retention, privacy notice
- **MCP server** — tools so AI agents can manage forms and read submissions

## Configuration

| Area | Where | Notes |
| --- | --- | --- |
| **Email delivery (SMTP / Resend / etc.)** | **EmDash → Settings → Email** | Required for real notification mail in production — [docs/email.md](docs/email.md) |
| Notification templates & recipients | Freeform → Settings → Notifications + form → Notifications | What to send and to whom |
| AI builder, spam scoring, briefs | Freeform → Settings → AI & spam | OpenAI API key, stored in your site |
| Webhooks | Freeform → Settings → Webhooks | Signed with HMAC-SHA256 — see [Webhooks](#webhooks) |
| CSV export / delete | Freeform → Submissions | Access / erasure helpers |

## Webhooks

On every submission, Freeform can `POST` a signed JSON payload to your HTTPS endpoints — notify Slack/Discord/Teams, trigger Zapier/Make, sync a CRM, or run custom logic.

**Setup:** Freeform → Settings → Webhooks → add a name, URL, and scope (all forms or one form). **Copy the secret shown on creation — it is displayed once.**

Payload (`event` is currently always `"submission.created"`):

```json
{
  "event": "submission.created",
  "submissionId": "01jq4k8v0000000000000000",
  "formId": "01jq4k8v0000000000000001",
  "formHandle": "contact",
  "createdAt": "2026-05-20T11:30:00.000Z",
  "data": { "first_name": "Ada", "email": "ada@example.com", "message": "Hello" },
  "journey": [{ "url": "https://example.com/", "title": "Home", "visitedAt": "2026-05-20T11:28:00.000Z" }]
}
```

- `data` — values keyed by field handle; multi-value fields are arrays; a checked single checkbox is `"true"`.
- `journey` — pages the visitor viewed before submitting (when the tracker is installed).

**Verify the signature.** Every delivery carries `X-Freeform-Signature: sha256=<hex HMAC-SHA256 of the raw body, keyed with your secret>`. Always verify against the **raw** request body before processing:

```js
import crypto from "node:crypto";

const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers["x-freeform-signature"]));
```

**Retries:** your endpoint must return `2xx`. Failures retry after 1, 5, then 15 minutes (4 attempts total), processed by a cron hook. The Settings page shows the last 20 deliveries per webhook with status and errors. Secrets can be rotated at any time; the old secret stops working immediately.

## Email notifications

Freeform does **not** ask for IMAP, POP3, or SMTP credentials. Delivery is
handled by EmDash’s email provider (Settings → Email). Full setup, dev console
provider, and troubleshooting: **[Email & notifications](docs/email.md)**.

Templates use a Mustache subset: `{{form_name}}`, `{{submission_id}}`,
`{{submitted_at}}`, `{{all_fields}}`, plus any field by handle (`{{email}}`).
Assign a template on the form’s **Notifications** tab (submitter field or
custom address). Notifications are skipped for submissions flagged as spam.

## AI features

Optional; use **your own** [OpenAI](https://platform.openai.com/api-keys) API
key under Freeform → Settings → AI & spam (stored in your site, never sent to
Solspace):

- **Generate with AI** — plain-English prompt → form (button only shows when a key is saved)
- **Submission brief** — intent, urgency, key facts, suggested next action
- **Spam scoring** — 0–10 score with reason; threshold skips notification emails
- **AI chat widget** — `FreeformChat` submits through the same pipeline

## MCP server

`packages/mcp/` is a standalone Cloudflare Worker exposing MCP tools to AI agents. See its [README](packages/mcp/README.md) for deployment, and [docs/MCP-SETUP.md](docs/MCP-SETUP.md) for the local Claude Desktop setup.

## Documentation

- [Email & notifications](docs/email.md) — EmDash provider setup (required for prod mail)
- [Privacy / GDPR tooling](docs/privacy.md) — consent, retention, export/delete
- [Registry guide](docs/REGISTRY-GUIDE.md) — verify the publish, install, update, troubleshoot
- [Roadmap](docs/ROADMAP.md) — what's built and what's next
- [Known limitations](docs/LIMITATIONS.md) — current constraints and EmDash feature requests
- [Contributing](CONTRIBUTING.md) — local development and release process

## License

MIT © [Solspace](https://solspace.com) — see [LICENSE](LICENSE).
