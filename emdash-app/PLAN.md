# Freeform Plugin — Product Plan

Built on top of the POC by Mitchell Kimbrough (May 2026).
See `FREEFORM-POC.md` for architecture decisions, gotchas, and EmDash feature requests.

---

## Stack & Constraints recap

- **Plugin format**: `standard` (marketplace-compatible, sandboxed V8 isolate on CF)
- **Admin UI**: Block Kit only — no React, no drag-and-drop, no custom JS in browser
- **Storage**: EmDash generic JSON+indexes KV API — no DDL, no raw SQL
- **AI**: User-supplied Anthropic API key stored in plugin KV — no key, no AI features
- **Licensing**: POC stub (`FF-*` keys = Pro). Real licensing deferred.
- **MCP**: Standalone Cloudflare Worker (`emdash-freeform-mcp`), self-deployed per customer.
  Solspace-operated proxy planned for later — Worker code is proxy-ready via `SOLSPACE_PROXY_MODE`.

---

## Phase 1 — POC Production Cleanup ✅ DONE

### 1A. Remove hardcoded Anthropic API key ✅

- Removed `ANTHROPIC_API_KEY` from `constants.ts`
- Added `lib/ai-key.ts` — `getApiKey(ctx)` / `hasApiKey(ctx)` helpers, reads `settings:anthropicApiKey` from KV
- All four AI modules (`ai/generate.ts`, `ai/spam.ts`, `ai/brief.ts`, `ai/chat.ts`) accept `apiKey: string` as parameter
- All callers (`routes/ai.ts`, `routes/public.ts`, `routes/chat.ts`, `lib/agent-submit.ts`) read key from KV; return clear error if absent
- AI features work on both Free and Pro tiers — no tier gate on AI
- Settings page: new "AI Configuration" section with `secret_input`, status banner, remove button

### 1B. Redesigned form editor ✅

**Editor layout** (in order):
1. Form name + handle + success message (form meta — success message was not previously editable)
2. **Form preview** — Block Kit `fields` blocks, one per row, showing label + required marker + type + placeholder/options hint. Row groupings respected (side-by-side fields shown together).
3. **AI Form Builder** — primary structural editing interface; AI can add, remove, rename, reorder fields
4. **Remove a field** — select dropdown + submit (shown only when fields exist)
5. **+ Add Field** — button that expands to a full add-field form (type, label, handle, options, default, required, row target)
6. Spam settings (per-form override)
7. Notifications

Note: the AI prompt is the recommended primary path for structural changes; the manual add/remove controls exist for fine-grained adjustments without needing to describe changes in prose.

### 1C. Submission detail view ✅

- `submissionDetailBlocks()` added to `admin/submissions.ts`
- Detail view: all field label→value pairs (`fields` block), metadata (ID, form, submitted at, status, spam score/reason), AI brief if present
- Triggered by "View submission detail" select+submit below the submissions table
- Back button returns to the per-form submissions list

### 1D. Submission pagination ✅

- Hard cap of 50 replaced with cursor-based pagination
- Page size: 25 per page
- Prev/Next buttons carry cursor in action ID
- `submissionsBlocks()` signature updated to accept optional `cursor` param
- `subs_next:`, `subs_prev:`, `all_subs_next:`, `all_subs_prev:`, `sub_detail:` actions wired in `admin/router.ts`

---

## Phase 2 — `packages/freeform-astro/` — Astro Integration & Component Library

Extract all Freeform site-side infrastructure from the demo app into a proper publishable package.
The demo app becomes a clean example of how to consume the package.

### Goal

A user installing Freeform on their EmDash site should only need to:
```ts
// astro.config.mjs
import freeformAstro from "@solspace/freeform-astro"

integrations: [
  emdash({ plugins: [freeformPlugin()] }),
  freeformAstro(),  // injects all routes automatically
]
```
```astro
---
// any page
import { FreeformForm } from "@solspace/freeform-astro"
---
<FreeformForm formId="contact" />
```

### Package identity

| | Value |
|---|---|
| Workspace name | `@local/freeform-astro` |
| Future publish name | `@solspace/freeform-astro` |
| Location | `packages/freeform-astro/` |
| Peer deps | `astro`, `emdash` |

### Package structure

```
packages/freeform-astro/
  src/
    index.ts                       # freeformAstro() integration + named component re-exports
    components/
      FreeformForm.astro            # Form rendering — fully unstyled semantic HTML
      FreeformChat.astro            # AI chat widget — fully unstyled
      FreeformDiscovery.astro       # <link rel="..."> agent discovery hint
    routes/
      submit.ts                     # /api/freeform/submit  (proxy to plugin submit-agent)
      chat.ts                       # /api/freeform/chat    (proxy to plugin chat)
      export-token.ts               # /freeform/export/[token]  (signed CSV download)
      resource-metadata.ts          # /.well-known/oauth-protected-resource/freeform/mcp
      actions-index.ts              # /.well-known/freeform.json  (agent form catalog)
      action-manifest.ts            # /.well-known/freeform/[handle]  (per-form manifest)
    lib/
      client.ts                     # getFetcher(), publicOrigin(), fetchForm()
  package.json
  tsconfig.json
```

### Styling decision: fully unstyled

`FreeformForm.astro` and `FreeformChat.astro` ship with **no styles**. They render semantic HTML
with data attributes so users can target elements in their own CSS:

```html
<form data-freeform-form data-freeform-handle="contact">
  <div data-freeform-row>
    <div data-freeform-field data-freeform-type="text" data-freeform-required>
      <label>First Name</label>
      <input type="text" name="first_name" />
    </div>
  </div>
</form>
```

Users add styles in their own `.astro` page or a global stylesheet:
```css
[data-freeform-form] { ... }
[data-freeform-field] label { ... }
[data-freeform-field] input { ... }
[data-freeform-field][data-freeform-required] label::after { content: " *"; }
```

### `lib/client.ts` — shared utilities

Consolidates patterns duplicated across all route files today:

```ts
/** Returns env.SELF (Cloudflare) or globalThis (dev/Node). */
export function getFetcher(): { fetch: typeof fetch }

/** Resolves the public-facing origin, honoring X-Forwarded-* headers. */
export function publicOrigin(request: Request): string

/** Fetch a form's schema from the Freeform plugin. */
export async function fetchForm(
  formId: string,
  siteOrigin: string,
  fetcher: { fetch: typeof fetch },
): Promise<FormData | null>
```

### `freeformAstro()` integration

Registered in `integrations: []` in `astro.config.mjs`. Calls `injectRoute` for each route file,
replacing the current hand-rolled inline integration.

No config options needed initially. Optional future options:
- `mcpWorkerUrl` — override the URL in `/.well-known/oauth-protected-resource/freeform/mcp`

### What moves out of the demo site

| Current location | Destination | Action |
|---|---|---|
| `src/components/FreeformForm.astro` | `packages/freeform-astro/src/components/` | Move + strip styles |
| `src/components/FreeformChat.astro` | `packages/freeform-astro/src/components/` | Move + strip styles |
| `src/components/FreeformDiscovery.astro` | `packages/freeform-astro/src/components/` | Move (no styles) |
| `src/pages/api/freeform/submit.ts` | `packages/freeform-astro/src/routes/submit.ts` | Move |
| `src/pages/api/freeform/chat.ts` | `packages/freeform-astro/src/routes/chat.ts` | Move |
| `src/pages/freeform/export/[token].ts` | `packages/freeform-astro/src/routes/export-token.ts` | Move |
| `src/freeform-resource-metadata.ts` | `packages/freeform-astro/src/routes/resource-metadata.ts` | Move |
| `src/freeform-actions-index.ts` | `packages/freeform-astro/src/routes/actions-index.ts` | Move |
| `src/freeform-action-manifest.ts` | `packages/freeform-astro/src/routes/action-manifest.ts` | Move |
| Inline integration in `astro.config.mjs` | `packages/freeform-astro/src/index.ts` | Replace |

### What stays in the demo site

| File | Why |
|---|---|
| `src/pages/freeform/mcp.ts` | Moving to MCP Worker package (Phase 3) |
| `src/llms-txt.ts` | Site-specific (imports `getSiteSettings` + site identity util). Kept as documented reference. |
| `src/pages/contact.astro`, `demo.astro`, `forms/[handle].astro`, etc. | Site-specific demo pages |
| `src/worker.ts`, `src/live.config.ts` | CF Worker entrypoint, EmDash boilerplate |
| `src/utils/site-identity.ts` | Demo site specific |

### Demo site after the move

`src/components/` directory removed entirely.
`astro.config.mjs` inline integration replaced with `freeformAstro()` import.
All page imports updated from `../components/FreeformForm.astro` → `@local/freeform-astro`.
The demo site becomes a clean usage example.

---

## Phase 3 — `packages/emdash-freeform-mcp/` — Cloudflare Worker MCP Server

### Rationale

The current MCP server lives at `src/pages/freeform/mcp.ts` (Astro APIRoute).
It cannot be marketplace-distributed (lives in the site, not the plugin), requires the
`env.SELF` loopback hack, and cannot be properly versioned or deployed independently.

The Worker replaces it as a standalone deployable. It will eventually move to its own repository.

### Deployment model

**Each customer deploys their own Worker instance** — not a Solspace-hosted server.
Reasons: privacy (Solspace never sees customer form data), simpler auth (PAT stays in customer's
Worker secrets), independent failure isolation.

Optional Solspace-hosted proxy planned later for non-technical users. The Worker is proxy-ready
from day one via `SOLSPACE_PROXY_MODE`.

### Package: `packages/emdash-freeform-mcp/`

```
packages/emdash-freeform-mcp/
  src/
    index.ts        Worker entry — routes POST /mcp, rejects GET with 405
    protocol.ts     rpcResult(), rpcError(), unauthorized()
    client.ts       callPluginRoute(), publicOrigin(), getTargetSiteUrl()
    tools.ts        All 25 TOOLS definitions + schemas (ported from mcp.ts)
    runner.ts       runTool() dispatch (ported from mcp.ts)
  wrangler.jsonc    name: emdash-freeform-mcp
  package.json
  tsconfig.json
  README.md         Customer setup guide (deploy steps, wrangler secret commands)
```

### Config

| Secret / Var | Required | Purpose |
|---|---|---|
| `EMDASH_SITE_URL` | Yes | Target EmDash site (e.g. `https://mysite.com`) |
| `SOLSPACE_PROXY_MODE` | No | Set `"1"` to trust `X-Freeform-Target-Site` header (future proxy) |

Bearer token forwarded from MCP client → EmDash plugin routes unchanged. EmDash's auth middleware validates it on the inner call.

### Tools (25, ported verbatim from `src/pages/freeform/mcp.ts`)

Read: `list_forms`, `list_submissions`, `get_form`, `get_form_prefill_url`, `export_submissions_csv`
Form CRUD: `create_form`, `update_form`, `set_form_handle`, `delete_form`, `add_field`, `remove_field`, `update_field`
Spam: `get_spam_settings`, `set_spam_settings`, `archive_spam_submissions`
Templates: `list_templates`, `get_template`, `create_template`, `update_template`, `delete_template`
Notifications: `list_form_notifications`, `attach_notification`, `detach_notification`, `update_form_notification`

### Migration path

1. Deploy the Worker alongside the existing Astro MCP page (both work simultaneously)
2. Update `/.well-known/oauth-protected-resource/freeform/mcp` resource URL → Worker URL
3. Update setup docs to reference the Worker
4. Deprecate `src/pages/freeform/mcp.ts` with a comment; remove after confirming Worker works
5. Worker package eventually moves to its own repo — no changes needed in plugin or freeform-astro

---

## Phase 4 — Extension System (Webhooks)

Layer B (route protocol convention between EmDash plugins) is deferred — not needed yet.

### Webhooks

**Events**: `on_submit`, `on_spam_detected`, `on_form_created`, `on_form_deleted`

**Storage**: new `webhooks` collection in plugin descriptor (indexes: `events`, `formId`)

**Each webhook record**:
```ts
{
  id: string
  url: string
  secret: string        // HMAC signing secret, user-provided
  events: string[]      // which events to fire on
  formId?: string       // if set, only fires for this form; omit for global
  enabled: boolean
  createdAt: string
}
```

**Delivery**:
- Fired after successful submit (non-blocking — response is returned before delivery completes)
- Payload signed: `X-Freeform-Signature: sha256=<hmac>` over raw JSON body
- Delivery logged to KV: `webhooks:log:<webhookId>:<deliveryId>` — status, response code, timestamp
- Retry via `cron` hook: up to 3× with exponential backoff (1 min, 5 min, 15 min)

**Capability added to plugin descriptor**: `network:request:unrestricted`
(user-configured URLs have dynamic hostnames; unrestricted is required in sandboxed mode)

**Admin UI** (Settings page):
- List of registered webhooks with status + last delivery result
- Add webhook form: URL, signing secret, event checkboxes, optional form scope
- Remove webhook button (with confirm)
- Delivery log accordion per webhook (last 10 attempts)

---

## Phase 5 — Form Builder Enhancements

### New field types

| Type | Description | Frontend render |
|---|---|---|
| `date` | Date picker | `<input type="date">` |
| `hidden` | No UI, stores a fixed value per submission | Not rendered |
| `html` | Static content block, no data captured | Raw HTML in a `<div>` |

Add to `ALL_FIELD_TYPES` in `constants.ts`. Handle in `FreeformForm.astro` (via `freeform-astro` package). Update AI generation prompts and MCP tool schemas.

### Per-field validation rules

Optional metadata stored on each field:

| Field type | Validation props |
|---|---|
| `text`, `textarea` | `minLength`, `maxLength`, `pattern` (regex), `patternError` (custom message) |
| `number` | `min`, `max` |

Rendered as HTML5 validation attributes in `FreeformForm.astro`. No server-side enforcement beyond `required` (client-side only for v1).

---

## Phase 6 — Marketplace Publishing

- Bundle: `emdash plugin bundle` in CI (GitHub Actions, triggered on version tag push)
- Write `packages/freeform-plugin/README.md` for marketplace listing
- Create `packages/freeform-plugin/icon.png` (256×256 PNG)
- Capture 3–5 admin screenshots
- `emdash plugin publish --build` on release
- `CHANGELOG.md` starting at `1.0.0`
- Verify bundle passes EmDash security audit (no Node builtins, no obfuscation, no exfiltration patterns)

**Not bundled**: `packages/emdash-freeform-mcp/` and `packages/freeform-astro/` are separate deployables — excluded from the plugin marketplace bundle.

---

## Known EmDash limitations & feature requests

(Filed or to be filed with the EmDash team)

1. **Raw `Response` escape hatch in plugin routes** — needed for MCP, webhooks, OAuth callbacks
2. **OAuth-grantable plugin scope** — unblocks OAuth auth for the MCP Worker (currently PAT-only)
3. **`plugin:install` for trusted plugins** — currently only fires via marketplace install path
4. **Block Kit `html`/`markdown` block type** — would allow richer admin previews
5. **Inter-plugin communication API** — needed for Layer B extension protocol (deferred)
6. **Plugin-injected Astro routes** — would let the plugin ship its own submit proxy, export route, and discovery endpoints without a companion `freeform-astro` package

---

## Open questions / deferred decisions

- **Sandboxed mode CPU limits**: AI routes (Anthropic calls) in sandboxed mode may hit the
  50ms CPU / 10 subrequest limits. Needs testing when switching from `plugins[]` to `sandboxed[]`.
- **Layer B (route protocol extension system)**: Deferred. Revisit after webhook adoption.
- **Real licensing (Lemon Squeezy)**: Deferred until Solspace licensing service is ready.
- **Solspace MCP proxy**: Deferred. Worker is proxy-ready; proxy service TBD.
- **Conditional logic**: Explicitly out of scope. Too large a feature for v1.
- **Multi-step / wizard forms**: Explicitly out of scope. AI-driven form building is the primary path.
- **llms.txt in freeform-astro**: Currently site-specific (imports `getSiteSettings` + site identity).
  Kept as a documented template in the demo site. Could be made configurable in freeform-astro later.
