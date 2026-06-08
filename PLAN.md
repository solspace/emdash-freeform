# Freeform Plugin — Product Plan

Built on top of the POC by Mitchell Kimbrough (May 2026).
See `FREEFORM-POC.md` for architecture decisions, gotchas, and EmDash feature requests.

---

## Stack & Constraints recap

- **Plugin format**: `standard` (marketplace-compatible, sandboxed V8 isolate on CF)
- **Admin UI**: Block Kit only — no React, no drag-and-drop, no custom JS in browser
- **Storage**: EmDash generic JSON+indexes KV API — document storage, no DDL needed
- **AI**: User-supplied Anthropic API key stored in plugin KV — no key, no AI features
- **MCP**: Standalone Cloudflare Worker (`emdash-freeform-mcp`), self-deployed per customer.
  Solspace-operated proxy planned for later — Worker code is proxy-ready via `SOLSPACE_PROXY_MODE`.

---

## Phase 1 — POC Production Cleanup

- [x] **1A** — Remove hardcoded Anthropic API key, add user-configurable key to Settings
- [x] **1B** — Redesign form editor: preview + AI prompt primary, manual field controls secondary
  - [x] Form meta section: name, handle, success message (success message was not previously editable)
  - [x] Form preview: Block Kit `fields` blocks per row, label + required + type + placeholder/options
  - [x] AI Form Builder: primary structural editing interface
  - [x] Remove a field: select dropdown + submit (shown only when fields exist)
  - [x] Add Field: button expands to full add-field form (type, label, handle, options, default, required, row target)
- [x] **1C** — Submission detail view: select+submit below table, full field values + AI brief + metadata
- [x] **1D** — Submission pagination: cursor-based, 25/page, Prev/Next buttons

---

## Phase 2 — `packages/freeform-astro/` — Astro Integration & Component Library

Extract all Freeform site-side infrastructure from the demo app into a proper publishable package.
The demo app becomes a clean example of how to consume the package.

- [x] Scaffold `packages/freeform-astro/` with `package.json`, `tsconfig.json`
- [x] `src/lib/client.ts` — `getFetcher()`, `publicOrigin()`, `fetchForm()`
- [x] `src/components/FreeformForm.astro` — moved, styles stripped, `data-freeform-*` attributes added
- [x] `src/components/FreeformChat.astro` — moved, styles stripped, `data-freeform-chat-*` attributes added
- [x] `src/components/FreeformDiscovery.astro` — moved
- [x] `src/routes/submit.ts` — moved from `src/pages/api/freeform/submit.ts`
- [x] `src/routes/chat.ts` — moved from `src/pages/api/freeform/chat.ts`
- [x] `src/routes/export-token.ts` — moved from `src/pages/freeform/export/[token].ts`
- [x] `src/routes/resource-metadata.ts` — moved from `src/freeform-resource-metadata.ts`
- [x] `src/routes/actions-index.ts` — moved from `src/freeform-actions-index.ts`
- [x] `src/routes/action-manifest.ts` — moved from `src/freeform-action-manifest.ts`
- [x] `src/index.ts` — `freeformAstro()` integration + component re-exports
- [x] Update demo `astro.config.mjs` — inline integration replaced with `freeformAstro()`
- [x] Update demo pages — imports updated to `@local/freeform-astro`
- [x] Delete moved files from demo `src/`

### Styling: fully unstyled

Components ship with no styles. Semantic HTML with `data-freeform-*` attributes:

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

### Package identity

| | Value |
|---|---|
| Workspace name | `@local/freeform-astro` |
| Future publish name | `@solspace/freeform-astro` |
| Location | `packages/freeform-astro/` |
| Peer deps | `astro`, `emdash` |

### Three entry points (important)

`"."` → `src/index.ts` — integration factory **only**. No `.astro` imports, no `cloudflare:workers`
imports. This entry is loaded by `astro.config.mjs` at config-parse time, before Astro's Vite
plugin or Cloudflare adapter shims are active. Any import that pulls in `cloudflare:workers` here
will crash Astro config loading.

`"./components"` → `src/components.ts` — component barrel (`FreeformForm`, `FreeformChat`,
`FreeformDiscovery`). Safe to import in `.astro` pages and layouts (request-time context).

`"./client"` → `src/client.ts` — utility functions (`fetchForm`, `publicOrigin`, `getFetcher`).
Safe to import in `.astro` pages and API routes (request-time context).

```ts
// astro.config.mjs
import freeformAstro from "@solspace/freeform-astro"                    // integration

// any .astro page or layout
import { FreeformForm } from "@solspace/freeform-astro/components"      // components
import { fetchForm } from "@solspace/freeform-astro/client"             // utilities
```

### What stays in the demo site

| File | Why |
|---|---|
| `src/pages/freeform/mcp.ts` | Moving to MCP Worker package (Phase 3) |
| `src/llms-txt.ts` | Site-specific (imports `getSiteSettings` + site identity util) |
| All content pages | Demo-specific |
| `src/worker.ts`, `src/live.config.ts` | CF Worker entrypoint, EmDash boilerplate |
| `src/utils/site-identity.ts` | Demo-specific |

---

## Phase 3 — `packages/emdash-freeform-mcp/` — Cloudflare Worker MCP Server

- [x] Scaffold `packages/emdash-freeform-mcp/` with `package.json`, `wrangler.jsonc`, `tsconfig.json`
- [x] `src/protocol.ts` — `rpcResult()`, `rpcError()`, `unauthorized()`
- [x] `src/client.ts` — `callPluginRoute()`, `getTargetSiteUrl()`
- [x] `src/tools.ts` — all 25 TOOLS definitions + schemas (ported from `mcp.ts`)
- [x] `src/runner.ts` — `runTool()` dispatch (ported from `mcp.ts`)
- [x] `src/index.ts` — Worker entry point, routes POST /mcp, rejects GET with 405
- [x] `README.md` — customer setup guide (deploy steps, `wrangler secret` commands)
- [x] Deprecate `src/pages/freeform/mcp.ts` with deprecation banner comment
- [ ] Update `/.well-known/oauth-protected-resource/freeform/mcp` resource URL → Worker URL
  (TODO in resource-metadata.ts: read `mcpWorkerUrl` from plugin KV when set)

### Deployment model

Each customer deploys their own Worker. `EMDASH_SITE_URL` Worker secret points at their EmDash site.
`SOLSPACE_PROXY_MODE=1` enables `X-Freeform-Target-Site` header override (future Solspace proxy).

---

## Phase 4 — Extension System (Webhooks)

Layer B (route protocol convention between plugins) is deferred.

- [x] Add `webhooks` storage collection to plugin descriptor
- [x] Webhook management UI in Settings page (list, add, remove, delivery log)
- [x] Copyable, short-lived webhook secret reveal after create/rotate (modal fallback: inline Settings panel)
- [x] Webhook delivery on submit (HMAC-signed `X-Freeform-Signature`)
- [x] KV delivery log: `webhooks:log:<webhookId>` (ring buffer, last 20 per webhook)
- [x] `cron` hook: retry failed deliveries up to 3× (1 min, 5 min, 15 min backoff)
- [x] Add `network:request:unrestricted` capability to plugin descriptor

---

## Phase 5 — Form Builder Enhancements

- [x] New field types: `date`, `hidden`, `html` — add to `ALL_FIELD_TYPES`, render in `FreeformForm.astro`
- [x] Per-field validation: `minLength`/`maxLength`/`pattern`/`patternError` for text; `min`/`max` for number/date
- [x] Render validation rules as HTML5 attributes in `FreeformForm.astro`

---

## Phase 6 — Isolation, Monorepo Restructuring & Marketplace Publishing

The three product packages are hoisted from `emdash-app/packages/` to the repo
root so they are self-contained and independent of the EmDash demo site.
`emdash-app/` stays as-is as the Mars Rover demo — the only consumer.

### 6A — Repo restructuring

- [x] Create root `pnpm-workspace.yaml` listing `freeform-plugin`, `freeform-astro`, `emdash-freeform-mcp`, `emdash-app`
- [x] Create root `package.json` (`"private": true`)
- [x] Move `emdash-app/packages/freeform-plugin/` → `freeform-plugin/`
- [x] Move `emdash-app/packages/freeform-astro/` → `freeform-astro/`
- [x] Move `emdash-app/packages/emdash-freeform-mcp/` → `emdash-freeform-mcp/`
- [x] Delete `emdash-app/packages/` (now empty)
- [x] Delete `emdash-app/pnpm-workspace.yaml` (no longer the workspace root)
- [x] Move `emdash-app/PLAN.md`, `FREEFORM-POC.md`, `LIMITATIONS.md` → repo root
- [x] Update `emdash-app/package.json` workspace references
- [x] Run `pnpm install` from repo root to re-link everything

### 6B — `freeform-plugin`: build setup

`emdash plugin bundle` validates that `package.json` exports point to compiled
`.mjs` files, not TypeScript source. A `tsdown` build step is required.

- [x] Add `tsdown` devDep to `freeform-plugin`
- [x] Add `build` and `build:watch` scripts
- [x] Update exports: `"." → "./dist/index.js"`, `"./sandbox" → "./dist/sandbox-entry.js"` (tsdown emits `.js`)
- [x] Add `dist/` to root `.gitignore`
- [x] Verify `emdash plugin bundle` runs cleanly from `freeform-plugin/`

### 6C — `freeform-astro`: rename & npm prep

- [x] Rename `@local/freeform-astro` → `@solspace/freeform-astro` in `package.json`
- [x] Add `description`, `license`, `repository`, `publishConfig` to `package.json`
- [x] Update all references in `emdash-app/` (imports, deps)
- [x] Verify demo site still starts

### 6D — Marketplace assets

- [x] `freeform-plugin/CHANGELOG.md` starting at `1.0.0`
- [ ] `freeform-plugin/icon.png` (256×256) — placeholder or real design
- [ ] `freeform-plugin/screenshots/` — 3–5 admin screenshots (capture from running dev server)

### 6E — GitHub Actions CI

- [x] `.github/workflows/plugin-publish.yml` — on tag `freeform-plugin/v*`, bundle + publish to marketplace
- [x] `.github/workflows/astro-publish.yml` — on tag `freeform-astro/v*`, publish to npm

### 6F — Root README

- [x] Root `README.md` — monorepo map + per-package quick-start

**Not bundled**: `emdash-freeform-mcp/` and `freeform-astro/` are separate deployables.
Plugin bundle only contains `freeform-plugin/backend.js` + `manifest.json` + assets.

---

## Known EmDash limitations & feature requests

1. **Raw `Response` escape hatch in plugin routes** — needed for MCP, webhooks, OAuth callbacks
2. **OAuth-grantable plugin scope** — unblocks OAuth auth for the MCP Worker (currently PAT-only)
3. **`plugin:install` for trusted plugins** — currently only fires via marketplace install path
4. **Block Kit `html`/`markdown` block type** — would allow richer admin previews
5. **Inter-plugin communication API** — needed for Layer B extension protocol (deferred)
6. **Plugin-injected Astro routes** — would eliminate the need for the `freeform-astro` companion package

---

## Open questions / deferred decisions

- **Sandboxed mode CPU limits**: AI routes may hit 50ms CPU / 10 subrequest limits. Needs testing when switching `plugins[]` → `sandboxed[]`.
- **Layer B extension protocol**: Deferred. Revisit after webhook adoption.
- **Real licensing (Lemon Squeezy)**: Deferred until Solspace licensing service is ready.
- **Solspace MCP proxy**: Deferred. Worker is proxy-ready; proxy service TBD.
- **Conditional logic**: Explicitly out of scope for v1.
- **Multi-step / wizard forms**: Explicitly out of scope. AI-driven form building is the primary path.
- **llms.txt in freeform-astro**: Too site-specific for now. Kept as a template in the demo site.
