# Freeform — Known Limitations

This document captures what does not work yet, what is deferred by design, and what requires changes in EmDash or third-party infrastructure before it can be fixed. It is a working document for the Solspace team — not end-user documentation.

---

## 1. MCP setup is unreasonably painful for customers

This is the most significant UX problem in the current v1 architecture. Here is the full chain of what a customer must do to connect Claude Desktop to their Freeform MCP server:

### Why it is painful

**Anthropic's outbound allowlist blocks `*.workers.dev` domains.**
All Cloudflare Workers are served at `<name>.workers.dev` by default. Anthropic has blocked this entire TLD from their outbound POST allowlist — presumably to prevent prompt injection via arbitrary Workers. This means Claude Desktop and Claude.ai cannot reach a Freeform MCP Worker served on `workers.dev`. The customer must configure a custom domain.

**Configuring a custom domain requires:**
1. A domain on the same Cloudflare account as the Worker (not just any domain — CF custom domains must be on CF DNS).
2. Updating `wrangler.jsonc` to set a `routes` entry with `"custom_domain": true`.
3. Redeploying the Worker.
4. Waiting for Cloudflare to provision DNS + SSL (usually instant, occasionally takes minutes).

**The full customer setup checklist today:**
1. Have a Cloudflare account with Workers enabled.
2. Install Wrangler CLI.
3. Clone or download the `packages/emdash-freeform-mcp/` directory.
4. Run `pnpm install`.
5. Edit `wrangler.jsonc` — change `name`, uncomment and fill in the `routes` entry.
6. Run `wrangler secret put EMDASH_SITE_URL`.
7. Run `wrangler deploy`.
8. Wait for custom domain to propagate.
9. Generate a PAT in the EmDash admin (OAuth does not work — see §3 below).
10. Edit `~/Library/Application Support/Claude/claude_desktop_config.json` manually with the PAT pasted in plaintext.
11. Fully restart Claude Desktop.

This is a developer-grade setup experience for what will eventually be a marketer/site-owner feature. It is not shippable as-is to a general customer base.

### What would fix it

**Short-term (doable by Solspace without EmDash changes):**
- Host a Solspace-operated `mcp.solspace.com/freeform` proxy that customers point Claude at. The proxy forwards requests to the customer's EmDash site based on a customer token. The `SOLSPACE_PROXY_MODE` env var in the Worker is already implemented for this. This reduces the customer setup to "add a line to your Claude config pointing at our proxy." Still PAT-auth only until the OAuth issue is resolved.

**Long-term (requires EmDash changes):**
- EmDash exposes an OAuth-grantable plugin scope (see §3). The customer's MCP endpoint becomes their own site's `/freeform/mcp` Astro route, they authorize in the browser via Claude.ai's Custom Connector flow, no Wrangler, no custom domain, no plaintext PAT in a config file.

---

## 2. Waiting on EmDash: plugin routes cannot return a raw `Response`

**The problem.** Every plugin route handler return value is unconditionally wrapped by EmDash in `{ data: ... }` before being sent to the client. The plugin has no escape hatch to return a raw `Response` with custom status codes, `Content-Type`, or custom headers.

**What this blocks:**
- **MCP server inside the plugin** — MCP Streamable HTTP requires `Content-Type: application/json` (not wrapped), custom status codes (202 for notifications, 405 for GET), and `WWW-Authenticate` on 401s. None of these are possible inside a plugin route today. This is why the MCP server is a separate Cloudflare Worker (`packages/emdash-freeform-mcp/`) instead of a plugin route.
- **Webhooks** — outbound webhook delivery is fine (plugin calls out), but any inbound webhook receiver (e.g. Stripe payment confirmation, Zapier push) needs to return a bare `200 OK` with no JSON wrapping.
- **OAuth callbacks** — an OAuth redirect handler needs to return `302 Location: ...` which the wrapper breaks.
- **CSV download endpoint** — `Content-Type: text/csv` with `Content-Disposition: attachment` cannot come from a plugin route. This is why the CSV download endpoint lives in `packages/freeform-astro/src/routes/export-token.ts` as an injected Astro route, not inside the plugin.

**The workaround we shipped.** Any protocol or file-delivery endpoint that needs raw `Response` control lives outside the plugin, either as an Astro route (injected via `freeformAstro()`) or as a standalone Worker. This works but means the "plugin" is really a three-package system (plugin + freeform-astro + mcp worker) rather than a single installable unit.

**Feature request to EmDash:** Allow plugin route handlers to return a `Response` instance directly. When the return value is a `Response`, skip the `{ data: ... }` wrapper and forward it as-is.

---

## 3. Waiting on EmDash: OAuth does not work for plugin routes

**The problem.** EmDash has a full OAuth 2.0 stack at `/_emdash/oauth/*`. It works. However, OAuth-issued tokens are not granted the `admin` scope even when requested — that scope is reserved for Personal Access Tokens only. Plugin routes require the `admin` scope. Result: an OAuth-authenticated MCP client gets a `403 INSUFFICIENT_SCOPE` from every plugin route.

**What this blocks:**
- Claude.ai Custom Connector flow (the user-friendly "paste one URL, authorize in browser, done" setup).
- Any non-developer customer connecting their own MCP client. PATs require admin UI access and manual config file editing.
- Multi-user MCP setups where different users should have different access levels.

**Feature request to EmDash (either of these would unblock us):**
1. Add an OAuth-grantable plugin scope (e.g. `plugins:freeform:read`, or a generic `plugins:*`) that the auth middleware accepts for plugin routes.
2. Let plugins declare their required scopes in the descriptor, making them OAuth-grantable automatically.

Until this is resolved, MCP auth is PAT-only — a single static admin identity. Every MCP action appears in logs as the admin PAT holder, not the actual user.

---

## 4. Waiting on EmDash: `plugin:install` hook does not fire for trusted plugins

**The problem.** Plugins declared in `astro.config.mjs` under `plugins: [freeformPlugin()]` (trusted mode, used in development and self-hosted deployments) never trigger the `plugin:install` lifecycle hook. EmDash's runtime reads the `_plugin_state` table on boot and silently marks the plugin active if it sees no row — without calling `pluginManager.install()` or `pluginManager.activate()`. Those methods only run for marketplace-installed sandboxed bundles.

**What this blocks:** Any initialization that should run exactly once on first install — seeding default data, generating secrets, creating initial KV entries.

**The workaround we shipped.** `lib/seed.ts` exports `ensureDemoSeed()` which is idempotent (KV flag guards re-runs). It is called both from `installHook.handler` (for the eventual marketplace path) and from `adminRoute.handler` on every `page_load` (catch-all for trusted-mode). The catch-all adds a small overhead on every admin page load, but it's a KV read + short-circuit so the cost is negligible.

**Feature request to EmDash:** Fire `plugin:install` when a trusted plugin's id is encountered for the first time with no `_plugin_state` row. This matches the documented lifecycle contract and removes the need for the catch-all workaround.

---

## 5. Waiting on EmDash: plugin-injected Astro routes

**The problem.** A sandboxed plugin cannot inject Astro routes into the host app. It can declare plugin routes (served under `/_emdash/api/plugins/<id>/`), but any page or API endpoint that needs to live at a customer-controlled URL (e.g. `/api/freeform/submit`, `/.well-known/freeform.json`) must be wired up by the site author.

**What this blocks:** Distributing Freeform as a single installable unit. Today customers must install two things: the plugin from the marketplace, and the `@solspace/freeform-astro` npm package which injects the Astro routes via `freeformAstro()` in their `astro.config.mjs`.

**The workaround we shipped.** `packages/freeform-astro/` is a companion Astro integration package. It injects all six Freeform-specific Astro routes via `injectRoute()` calls in its `astro:config:setup` hook. The site author adds `freeformAstro()` to their `astro.config.mjs` alongside `emdash()`.

**Feature request to EmDash:** Let plugin descriptors declare Astro routes that the EmDash integration auto-injects into the host, similar to how `injectRoute` works but driven by the plugin manifest. This would collapse the two-package install into one.

---

## 6. Waiting on EmDash: Block Kit has no rich content types

**The problem.** The Block Kit admin renderer supports a fixed set of block types: `section`, `stats`, `table`, `form`, `button`, `divider`, and a handful of form field types. It does not support:
- `html` or `iframe` — no embedding custom markup or external widgets
- `markdown` — section `text` is rendered as plain text, not Markdown
- `script` — no in-browser interactivity beyond the form submit/action pattern
- Table cells with interactive elements (buttons, dropdowns) — tables are display-only

**What this blocks:**
- Rich submission detail views (we want styled key/value cards, not a plain text dump)
- Inline form preview with real rendered inputs (we approximate this with text-based field blocks)
- An in-admin chat interface for the AI form builder (the right UX is a streaming chat; what we have is a one-shot prompt-and-refresh form)
- Progress indicators or loading states during AI generation

**The workaround we shipped.** We work within the constraints. The form preview uses `fields` blocks with text labels. The AI builder uses a `text_input` for the prompt and a full page reload to show results. The submission detail view is a plain text dump via `section` blocks.

**Feature request to EmDash:** Add a `markdown` or `html` block type to Block Kit, or allow plugins to register custom React block components when running in `format: "native"` without losing marketplace eligibility.

---

## 7. Waiting on EmDash: plugin extension to the built-in MCP server

**The problem.** EmDash ships its own MCP server at `/_emdash/api/mcp` covering core content (entries, media, taxonomies). Plugins cannot contribute tools to this endpoint. `createMcpServer()` is a static factory — there is no registration API for plugin tools.

**What this causes.** Customers who want to use Freeform via MCP must configure a separate MCP server entry in their client config (Claude Desktop, Cursor, etc.) in addition to the EmDash core MCP server. Two servers, two auth tokens, two tool namespaces.

**The ideal end state.** Plugins declare MCP tools in their descriptor. EmDash's built-in MCP server merges them and serves everything from `/_emdash/api/mcp`. One server, one auth, one place to look. The standalone `emdash-freeform-mcp` Worker becomes unnecessary.

**Feature request to EmDash:** Add a plugin MCP tool contribution API so plugins can extend the canonical `/_emdash/api/mcp` endpoint.

---

## 8. Licensing is a stub

**Current state.** Any string starting with `FF-` activates Pro features. This is a POC stand-in. There is no call to a real license server, no cryptographic validation, no seat limits, no expiry.

**What is gated on Pro:** The `email` field type (both in the admin AI builder and via MCP).

**What is not gated:** AI form generation, MCP access, spam scoring, notifications — all of these work on any "tier" as long as the user has configured an Anthropic API key. The AI features are gated only on the key being present, not on a license tier.

**Waiting on:** Solspace licensing service. When it exists, `lib/license.ts` needs to replace the prefix check with a real verification call against the license server.

---

## 9. Things explicitly out of scope for v1

These are known gaps that are not blocked on anything external — they are deliberate deferrals.

| Feature | Status |
|---|---|
| Conditional logic (show/hide fields based on values) | Out of scope. AI-driven form design is the primary path. |
| Multi-step / wizard forms | Out of scope for v1. |
| File upload field type | Not built. Would require R2 binding + signed upload URLs. |
| Front-end validation beyond `required` | Not built. `minLength`, `maxLength`, `pattern` are Phase 5. |
| Rate limiting on the submit endpoint | Not built. Rely on Cloudflare WAF for now. |
| CSRF protection | Honeypot only. The submit endpoint accepts any POST from any origin. |
| Field reordering in the admin | Deliberately omitted — AI-driven field management via MCP is the intended path. |
| Spam protection beyond AI scoring | No reCAPTCHA / Turnstile integration. |
| Webhooks / outbound integrations | Phase 4 — not started. |
| `date`, `hidden`, `html` field types | Phase 5 — not started. |
| Accessibility audit on rendered forms | Not done. |
| `llms.txt` in `freeform-astro` package | Too site-specific. Kept as a template in the demo site. |

---

## 10. The `resource` URL in OAuth metadata is wrong once the MCP Worker is deployed

**The problem.** The RFC 9728 metadata at `/.well-known/oauth-protected-resource/freeform/mcp` currently has `resource: "${siteOrigin}/freeform/mcp"` — pointing at the deprecated in-process Astro route. Once a customer deploys the standalone MCP Worker at their own custom domain, this URL is wrong. Strict MCP clients that validate the `resource` field against the URL they're connecting to will see a mismatch.

**The fix (not yet implemented).** A plugin KV setting `mcpWorkerUrl` should store the customer's deployed Worker URL. `resource-metadata.ts` should read this setting via the plugin API and use it as the `resource` field when set. The TODO is noted in `packages/freeform-astro/src/routes/resource-metadata.ts`.

**In practice.** For auth discovery (finding the authorization server), `mcp-remote` uses the `authorization_servers` field, not `resource`. The mismatch causes no functional problem with PAT auth or with `mcp-remote`-based clients — it would only matter for a strict OAuth client that validates token audience against the `resource` URL.
