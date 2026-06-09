# Freeform Plugin for EmDash

Form builder plugin for [EmDash CMS](https://emdashcms.com). Build forms in the admin, collect submissions, send email notifications, score spam with AI, and push events to webhooks.

**Latest release:** `freeform@0.1.2` on the [EmDash plugin registry](https://registry.emdashcms.com) (publisher: `thejahid.bsky.social`).

---

## Getting started

Freeform is two packages:

| Package | What it does |
|---------|----------------|
| **Freeform** (this plugin) | Backend — forms, submissions, admin UI, APIs |
| **[@solspace/freeform-astro](https://www.npmjs.com/package/@solspace/freeform-astro)** | Frontend — Astro routes + `FreeformForm` / `FreeformChat` components |

You need **both** on a production Astro site. The plugin alone does not inject public form routes; the Astro package does.

### Requirements

- An [EmDash](https://emdashcms.com) site (Astro 6+, server output)
- EmDash version with **experimental registry** support
- Node.js ≥ 22

### 1. Enable the plugin registry

In `astro.config.mjs`, point EmDash at the registry:

```js
import emdash from "emdash/astro";

export default defineConfig({
  integrations: [
    emdash({
      // …your existing database / storage config…
      experimental: {
        registry: "https://registry.emdashcms.com",
      },
    }),
  ],
});
```

Restart the dev server after changing this.

### 2. Install the Freeform plugin

In the EmDash admin:

1. Open **`/_emdash/admin`**
2. Go to **Plugins → Registry**
3. Search for **`freeform`**
4. Click **Install** and approve the capability prompt (`network:request`, `email:send`)

The registry index can lag a few minutes after a new release is published. If search is empty, wait and refresh, or verify from your terminal:

```bash
pnpm dlx @emdash-cms/plugin-cli@0.5.1 search freeform
pnpm dlx @emdash-cms/plugin-cli@0.5.1 info thejahid.bsky.social freeform
```

### 3. Install the Astro integration

```bash
pnpm add @solspace/freeform-astro
```

```js
// astro.config.mjs
import freeformAstro from "@solspace/freeform-astro";

export default defineConfig({
  integrations: [
    emdash({ /* … */ }),
    freeformAstro(),
  ],
});
```

This adds public routes (`/api/freeform/submit`, `/.well-known/freeform.json`, etc.). See the [freeform-astro README](https://www.npmjs.com/package/@solspace/freeform-astro) for the full route list.

### 4. Create a form

1. In the admin, open **Freeform** (sidebar)
2. Click **New form**, give it a name and **handle** (e.g. `contact`)
3. Add fields (or use **AI generate** if you configured an Anthropic API key under **Settings**)
4. Save

The **handle** is what you use in frontend components (`formId="contact"`).

### 5. Embed a form on a page

```astro
---
import { FreeformForm } from "@solspace/freeform-astro/components";
---

<FreeformForm formId="contact" class="my-contact-form" />
```

Components are **unstyled**. Style them with CSS targeting `data-freeform-*` attributes:

```css
[data-freeform-form] { display: grid; gap: 1rem; max-width: 32rem; }
[data-freeform-field] { display: flex; flex-direction: column; gap: 0.25rem; }
[data-freeform-input] { padding: 0.5rem 0.75rem; border: 1px solid #ccc; border-radius: 0.375rem; }
[data-freeform-submit] { padding: 0.5rem 1rem; cursor: pointer; }
```

Visit the page, submit a test entry, then check **Freeform → Submissions** in the admin.

### 6. Optional configuration

| Area | Where | Notes |
|------|--------|------|
| AI form builder & spam scoring | **Freeform → Settings → AI** | Requires an [Anthropic](https://console.anthropic.com/) API key |
| Email notifications | **Freeform → Notifications** | Mustache templates; attach to forms |
| Webhooks | **Freeform → Settings → Webhooks** | HMAC-signed `POST` on each submission — see [Webhooks](#webhooks) below |
| CSV export | **Freeform → Submissions** | Signed download links; also available via MCP |
| AI chat widget | `<FreeformChat formHandle="contact" … />` | Streaming chat tied to a form — see [freeform-astro](https://www.npmjs.com/package/@solspace/freeform-astro) |

### Updating

When a new `freeform` version appears in **Plugins → Registry**, install the update from the admin (same flow as step 2). Bump `@solspace/freeform-astro` separately when a new npm release is published.

### Self-hosted / monorepo development

If you are hacking on this repo (not installing from the registry), declare the plugin as a **trusted** dependency instead:

```js
import { freeformPlugin } from "@local/freeform"; // or your package name

emdash({
  plugins: [freeformPlugin()],
  // …
});
```

See the [repository README](https://github.com/solspace/emdash-freeform) for local dev setup.

---

## Features

| Feature | Notes |
|---|---|
| Form builder | Rows + fields, AI-assisted via Claude Haiku |
| Field types | text, email (Pro), textarea, number, phone, checkbox, checkbox_group, radio, select, multi_select |
| Submissions | Stored in plugin KV, paginated admin view, AI brief per submission |
| Email notifications | Mustache-templated, per-form recipient assignments |
| AI spam scoring | Score 0–10 on each submission, threshold-based archiving |
| CSV export | Signed short-lived download URL, MCP-accessible |
| Webhooks | HMAC-signed POST on each submission, retry with backoff |
| MCP server | 25 tools for AI agents — see `packages/emdash-freeform-mcp/` |

---

## Webhooks

On every form submission Freeform can POST a signed JSON payload to one or more HTTPS endpoints. Useful for:

- Notifying Slack, Discord, or Teams channels
- Triggering Zapier / Make automations
- Syncing leads to a CRM
- Running custom server-side logic

### Setting up a webhook

1. Go to **Freeform → Settings** in the EmDash admin.
2. Scroll to the **Webhooks** section.
3. Fill in the **Add Webhook** form:
   - **Name** — a label for your own reference (e.g. `Slack Alerts`)
   - **URL** — your HTTPS endpoint
   - **Scope** — `All forms`, or pick a specific form to limit deliveries
4. Click **Add Webhook**.
5. **Copy the secret from the toast message immediately.** It is shown only once. You will need it to verify the signature on your endpoint.

The webhook is enabled by default. You can pause, resume, rotate the secret, or delete it from the same Settings page.

### Payload

Every delivery is a `POST` request with `Content-Type: application/json`. The body is a JSON object:

```json
{
  "event": "submission.created",
  "submissionId": "01jq4k8v0000000000000000",
  "formId": "01jq4k8v0000000000000001",
  "formHandle": "contact",
  "createdAt": "2026-05-20T11:30:00.000Z",
  "data": {
    "first_name": "Ada",
    "last_name": "Lovelace",
    "email": "ada@example.com",
    "message": "Hello from the contact form",
    "newsletter": "true"
  },
  "journey": [
    {
      "url": "https://example.com/",
      "title": "Home",
      "visitedAt": "2026-05-20T11:28:00.000Z"
    },
    {
      "url": "https://example.com/contact",
      "title": "Contact",
      "visitedAt": "2026-05-20T11:29:45.000Z"
    }
  ]
}
```

**Field notes:**
- `data` — field values keyed by handle. Multi-value fields (`checkbox_group`, `multi_select`) are arrays. Single `checkbox` is the string `"true"` when checked, absent when unchecked.
- `journey` — pages the visitor browsed before submitting, captured client-side. Omitted if the tracker is not installed or no pages were recorded.
- `event` — currently always `"submission.created"`. Future events will use different values.

### Verifying the signature

Every request includes an `X-Freeform-Signature` header:

```
X-Freeform-Signature: sha256=a1b2c3d4e5f6...
```

The value is `sha256=` followed by a lowercase hex HMAC-SHA256 of the raw request body, signed with your webhook secret.

**Always verify the signature before processing the payload.** This confirms the request came from Freeform and the body has not been tampered with.

#### Node.js

```js
import crypto from "node:crypto";

function verifySignature(secret, rawBody, signatureHeader) {
  const expected = "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  // Use timingSafeEqual to prevent timing attacks.
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signatureHeader)
  );
}

// Express example
app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const sig = req.headers["x-freeform-signature"];
  if (!sig || !verifySignature(process.env.FREEFORM_WEBHOOK_SECRET, req.body, sig)) {
    return res.status(401).send("Invalid signature");
  }
  const payload = JSON.parse(req.body);
  // handle payload...
  res.sendStatus(200);
});
```

> **Important:** pass the raw bytes to the HMAC, not a parsed object. Use `express.raw()` (or equivalent) — not `express.json()` — on the webhook route.

#### Python

```python
import hashlib
import hmac

def verify_signature(secret: str, body: bytes, signature_header: str) -> bool:
    expected = "sha256=" + hmac.new(
        secret.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)

# Flask example
from flask import Flask, request, abort
app = Flask(__name__)

@app.route("/webhook", methods=["POST"])
def webhook():
    sig = request.headers.get("X-Freeform-Signature", "")
    if not verify_signature(os.environ["FREEFORM_WEBHOOK_SECRET"], request.get_data(), sig):
        abort(401)
    payload = request.json
    # handle payload...
    return "", 200
```

#### PHP

```php
function verifySignature(string $secret, string $rawBody, string $signatureHeader): bool {
    $expected = "sha256=" . hash_hmac("sha256", $rawBody, $secret);
    return hash_equals($expected, $signatureHeader);
}

$rawBody = file_get_contents("php://input");
$sig = $_SERVER["HTTP_X_FREEFORM_SIGNATURE"] ?? "";

if (!verifySignature($_ENV["FREEFORM_WEBHOOK_SECRET"], $rawBody, $sig)) {
    http_response_code(401);
    exit;
}

$payload = json_decode($rawBody, true);
// handle payload...
http_response_code(200);
```

### Responding to deliveries

Your endpoint must return a `2xx` status code within a reasonable timeout. Any non-2xx response is treated as a failure and triggers the retry schedule below.

Return the response as quickly as possible. If your processing is slow, acknowledge the delivery with `200 OK` immediately and handle the payload asynchronously.

### Retry behavior

Failed deliveries (non-2xx response or connection error) are retried automatically:

| Attempt | Delay after previous failure |
|---|---|
| Retry 1 | 1 minute |
| Retry 2 | 5 minutes |
| Retry 3 | 15 minutes |
| Give up | — |

After 3 retries (4 total attempts) the delivery is permanently marked as failed and removed from the queue.

Retries are processed by a `cron` hook that runs every minute. They use the same payload and secret as the original attempt.

### Delivery log

The **Settings** page shows a **View Log** button next to each webhook. Clicking it displays the last 20 deliveries for that webhook, including status, HTTP response code, attempt count, timestamp, and any error message.

The log is also accessible via the `get-webhook-log` plugin route (for MCP or custom tooling).

### Scoping a webhook to a single form

When creating a webhook, set **Scope** to a specific form instead of `All forms`. The webhook will only receive deliveries when that form is submitted.

A webhook scoped to a form that is later deleted will become unreachable for new deliveries but its history is preserved in the log.

### Rotating the secret

If your secret is compromised:

1. Go to **Freeform → Settings**.
2. Find the webhook and click **Rotate Secret**.
3. Confirm the prompt. The old secret stops working immediately.
4. Copy the new secret from the toast and update your endpoint.

Deliveries that are currently queued for retry will use the secret that was active at the time of the original submission attempt. If you rotate while retries are pending they will fail verification on your endpoint — clear the retry queue by temporarily disabling the webhook, or accept the failed retries.

---

## Email Notifications

Attach email notification templates to forms. Templates use [Mustache](https://mustache.github.io/) syntax with these variables:

| Variable | Value |
|---|---|
| `{{ form_name }}` | Form display name |
| `{{ submission_id }}` | Submission ID |
| `{{ submitted_at }}` | ISO 8601 timestamp |
| `{{ all_fields }}` | All field values as `Label: value` lines |
| `{{ <handle> }}` | Any field value by its handle |

Recipient types:
- **Submitter** — send to the email address entered in a named field
- **Custom** — send to a fixed address

Notifications are not sent for submissions that exceed the spam threshold.

---

## AI Features

All AI features require an Anthropic API key configured in **Freeform → Settings → AI Configuration**.

| Feature | How it works |
|---|---|
| Form generation | Describe a form in plain English; Claude Haiku adds fields |
| Submission brief | After each submission, Claude generates a structured summary: intent, urgency, key facts, suggested next action |
| Spam scoring | Each submission is scored 0–10; score and reason stored on the submission |
| AI chat widget | `FreeformChat` Astro component — streaming conversation about the form |

---

## MCP Server

The `packages/emdash-freeform-mcp/` directory is a standalone Cloudflare Worker that exposes 25 MCP tools to AI agents (Claude Desktop, Cursor, etc.). Covers form management, submissions, notifications, spam settings, and webhooks.

See `packages/emdash-freeform-mcp/README.md` for deployment instructions.

For PAT-based local setup with Claude Desktop see `MCP-SETUP.md` in this directory.

