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
2. Add fields manually, or use the AI builder (needs an Anthropic API key, step below)
3. Embed it anywhere:

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
- **AI builder** — describe a form in plain English and Freeform creates it (optional, bring your own Anthropic key)
- **Submissions inbox** — paginated admin view, full detail, AI-generated brief per submission, CSV export
- **Email notifications** — Mustache templates assigned per form, sent to the submitter or a fixed address
- **Webhooks** — HMAC-signed `POST` on every submission, automatic retries, delivery log
- **Spam protection** — honeypot + signed CSRF tokens on every form, optional AI spam scoring with per-form thresholds
- **MCP server** — 25 tools so AI agents (Claude, Cursor, …) can manage forms and read submissions

## Configuration

| Area | Where | Notes |
| --- | --- | --- |
| AI builder, spam scoring, briefs | Freeform → Settings | Requires an [Anthropic](https://console.anthropic.com/) API key, stored in your site |
| Email notifications | Freeform → Templates + form settings | Mustache templates; recipient = submitter field or custom address |
| Webhooks | Freeform → Settings → Webhooks | Signed with HMAC-SHA256 — see [Webhooks](#webhooks) |
| CSV export | Freeform → Submissions | Signed, short-lived download links |

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

Templates use [Mustache](https://mustache.github.io/) syntax: `{{ form_name }}`, `{{ submission_id }}`, `{{ submitted_at }}`, `{{ all_fields }}`, plus any field by handle (`{{ email }}`). Assign a template to a form and choose the recipient — the submitter's email field, or a fixed address. Notifications are skipped for submissions flagged as spam.

## AI features

All AI features are optional and use **your own** Anthropic API key (Freeform → Settings; stored in your site's plugin storage, never sent to Solspace):

- **Form generation** — plain-English prompt → ready-made form
- **Submission brief** — intent, urgency, key facts, suggested next action per submission
- **Spam scoring** — 0–10 score with reason, stored on each submission
- **AI chat widget** — the `FreeformChat` component submits through the same pipeline

## MCP server

`packages/mcp/` is a standalone Cloudflare Worker exposing 25 MCP tools to AI agents. See its [README](packages/mcp/README.md) for deployment, and [docs/MCP-SETUP.md](docs/MCP-SETUP.md) for the local Claude Desktop setup.

## Documentation

- [Registry guide](docs/REGISTRY-GUIDE.md) — verify the publish, install, update, troubleshoot
- [Roadmap](docs/ROADMAP.md) — what's built and what's next
- [Known limitations](docs/LIMITATIONS.md) — current constraints and EmDash feature requests
- [Contributing](CONTRIBUTING.md) — local development and release process

## License

MIT © [Solspace](https://solspace.com) — see [LICENSE](LICENSE).
