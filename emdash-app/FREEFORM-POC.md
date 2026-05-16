# Freeform Plugin — POC Handoff

Built in roughly 3 hours using Claude Code. This doc is for you, Gustavs — no hand-holding, just the patterns, decisions, and gotchas you need to take this to production.

---

## Update (2026-05-15): EmDash is built for AI, not for GUIs

The biggest thing I've learned since the initial Block Kit build: **EmDash is fundamentally designed for humans to drive the CMS through AI agents, not through an admin GUI.** That re-frames a lot of the rough edges we ran into.

- The Block Kit admin surface is intentionally minimal. There's no `html`/`iframe`/`markdown`/`script` block type, no custom-component registration, no streaming chat, and table cells can't hold actions. We previously read this as "the admin UI is unfinished." It's more accurate to read it as "the admin UI is a thin operator console — the real interface is an AI client talking to the CMS over MCP."
- EmDash already ships its own MCP server at `/_emdash/api/mcp` covering core entries/media/taxonomies, plus a full OAuth2 stack at `/_emdash/api/well-known/oauth-*`. It's an AI-first CMS that happens to have an admin UI, not an admin-first CMS that has some AI on the side.
- That made the right next step for Freeform obvious: **add an MCP endpoint** so the plugin participates in the same AI-driven workflow. The Block Kit admin can stay as a thin operator surface — adding/removing forms, generating fields with Haiku, glancing at submissions — and everything richer (analytics, ad-hoc reports, follow-up questions) happens in Claude Desktop / Claude.ai / Cursor against the MCP server.

We built that MCP endpoint. It works end-to-end against Claude Desktop today using an admin PAT. The OAuth path is wired but blocked on an EmDash policy issue (see below). **Not launch-ready** — generating an admin token in the EmDash CP and pasting it into a developer-level Claude Desktop config is not a user install flow — but it proves the concept: talk to an AI, the AI talks to your CMS, and Freeform forms/submissions become first-class objects in that conversation.

See **"MCP server — working rough-in"** below for the implementation, the working localhost setup, and the OAuth blocker.

---

## What was built

A fully functional Freeform form-builder plugin for Emdash:

- **Admin UI** via Block Kit: list, create, edit, delete forms; add/remove fields; view per-form submissions in a proper table
- **AI form generation** via Claude Haiku — describe a form in plain English, fields are appended to the current form
- **Freemium gate** — email field type is locked on the free tier; any `FF-*` key activates Pro (POC stand-in for a real license server)
- **Public API routes** — `get-form` and `submit` consumed by a server-rendered Astro component
- **Frontend component** — `src/components/FreeformForm.astro` renders a form from any page with `<FreeformForm formId="contact" />`

---

## File map

```
packages/freeform-plugin/
  src/
    index.ts           # PluginDescriptor — wired into astro.config.mjs
    sandbox-entry.ts   # All runtime logic — runs in the plugin sandbox

src/components/
  FreeformForm.astro   # Drop-in frontend form component

src/pages/
  demo.astro           # Example page using the component
```

---

## Emdash plugin architecture — the important bits

### Two-file split

`index.ts` exports the **descriptor** — static metadata Emdash reads at boot time. It declares storage schemas, admin pages, widgets, capabilities, and the path to the sandboxed entrypoint. No runtime code here.

`sandbox-entry.ts` is the **runtime** — it runs inside the Emdash plugin sandbox. It exports a `definePlugin()` default export with hooks and routes.

### Standard format (required for marketplace)

The descriptor sets `format: "standard"`. This is mandatory for marketplace listing — `format: "native"` cannot be published or sandboxed. The entrypoint must `export default definePlugin({ hooks, routes })` — no factory function, no `id`/`version`/`capabilities` inside `definePlugin`. Those all live in the descriptor.

Route handlers receive **two arguments**:

```typescript
handler: async (routeCtx: any, ctx: PluginContext) => { ... }
```

- `routeCtx` — `{ input, request, requestMeta }`. `input` is the parsed JSON body for POST; `undefined` for GET.
- `ctx` — `{ storage, kv, http, log }`. Everything plugin-specific lives here.

This is the single most important thing to get right. Using one-arg `(ctx)` gives you `routeCtx` disguised as `ctx` — no storage, no kv, silent 500s. The two-arg pattern is confirmed in `emdash/src/plugins/adapt-sandbox-entry.ts`.

### adminEntry is native-only

`adminEntry` (React admin UI) cannot be used with `format: "standard"`. EmDash 0.12.0 throws a hard startup error if you try. Standard plugins use Block Kit for their admin UI. Native plugins can ship React components but cannot be sandboxed or published to the marketplace. These two goals are mutually exclusive in the current version.

### Storage

Two collections declared in `index.ts`:

```typescript
storage: {
  forms: { indexes: ["createdAt"] },
  submissions: { indexes: ["formId", "createdAt"] },
}
```

Access in routes via `ctx.storage.forms` / `ctx.storage.submissions`. API:

```typescript
await ctx.storage.forms.put(id, data)        // upsert
await ctx.storage.forms.get(id)              // returns T | null
await ctx.storage.forms.delete(id)
await ctx.storage.forms.query({ where, orderBy, limit })  // returns { items: Array<{ id, data }> }
await ctx.storage.submissions.count()
```

Note `get()` returns `T` directly; `query()` returns `Array<{ id: string, data: T }>`.

### KV

Simple key-value store for plugin settings (license tier, license key):

```typescript
await ctx.kv.set("license:tier", "pro")
await ctx.kv.get<string>("license:tier")    // returns T | null
```

### API responses

All plugin routes are auto-wrapped by Emdash in `{ data: { ...yourReturn } }`. The frontend must unwrap:

```typescript
const json = (await res.json()).data;
```

For errors, throw `PluginRouteError` (imported from `emdash`) — not `new Response()` or a plain Error. `PluginRouteError` maps cleanly to HTTP status codes. Plain throws become opaque 500s.

```typescript
throw PluginRouteError.notFound("Form not found")
throw PluginRouteError.badRequest("Missing ?id=")
```

### GET requests and URL params

`routeCtx.input` is `undefined` for GET — the framework only parses JSON bodies on POST. Read query params directly:

```typescript
const id = new URL(routeCtx.request.url).searchParams.get("id");
```

### Network access

Outbound HTTP (e.g., Anthropic API) is done via `ctx.http.fetch()` — not the global `fetch`. The `capabilities: ["network:request"]` and `allowedHosts: ["api.anthropic.com"]` in the descriptor whitelist this.

---

## Block Kit — actual schema

The Block Kit docs have some discrepancies from the live renderer. What actually works:

```typescript
// Stats block — property is "items", NOT "stats"
{ type: "stats", items: [{ label: "Forms", value: "3" }] }

// Buttons — property is "label", NOT "text"
{ type: "button", label: "Edit", action_id: "edit:123", style: "primary" }

// Section with inline button
{ type: "section", text: "**Form name**", accessory: { type: "button", label: "Edit", action_id: "edit:123" } }

// Confirm dialog on danger buttons
{ type: "button", label: "Delete", action_id: "del:123", style: "danger",
  confirm: { title: "Delete?", text: "This is permanent.", confirm: "Delete", deny: "Cancel" } }

// Form block with fields
{ type: "form", block_id: "add_field", fields: [...], submit: { label: "Save", action_id: "save:123" } }

// Form field types: text_input, select, toggle, secret_input
{ type: "text_input", action_id: "field_label", label: "Label", placeholder: "...", initial_value: "..." }
{ type: "select", action_id: "field_type", label: "Type", options: [{ label: "Text", value: "text" }], initial_value: "text" }
{ type: "toggle", action_id: "field_required", label: "Required", initial_value: false }

// Table block — rows are plain data, no interactive elements in cells
{ type: "table", page_action_id: "tbl", columns: [{ key: "label", label: "Label" }, { key: "type", label: "Type", format: "badge" }], rows: [...] }
// Valid column formats: "text" | "badge" | "relative_time" | "number" | "code"
// Table cells are read-only — buttons/actions cannot be embedded in rows
```

### Widget interaction

The widget sends `{ type: "page_load", page: "widget:<widgetId>" }` on load — not `type: "widget_load"` as some docs suggest. Check for it:

```typescript
if (type === "page_load" && page?.startsWith("widget:")) {
  return { blocks: [/* widget blocks */] };
}
```

The admin route receives all Block Kit interactions at a single handler endpoint. Route everything by `actionId` convention (e.g., `"edit:formId"`, `"rm_field:formId"`).

### Table cells can't hold buttons

Block Kit tables are display-only. If you need a remove/edit action alongside tabular data, put a `select` form below the table (choose the item, submit to act on it). This is the pattern used for field removal in the editor.

---

## Form ID vs. storage ID

Forms are stored with random UIDs as their storage key (e.g., `68at29tmp506ygz`). The frontend component is invoked with a human slug: `<FreeformForm formId="contact" />`.

The `get-form` route does a name-based fallback lookup when a direct ID match fails — slugifying the form's `name` field and comparing:

```typescript
f.data.name.toLowerCase().replace(/\s+/g, "-") === id.toLowerCase()
```

On the frontend, the form element carries both values as separate data attributes so DOM IDs (which use the original slug) don't collide with the storage ID used for submission:

```html
<form data-form-id={formId} data-resolved-id={formData.id} ...>
```

---

## Submissions table

When viewing submissions for a specific form, the table columns are built dynamically from the form's field definitions. The handler fetches the form's `rows` → `fields` to get labels and handles, then uses those as column headers. Submission data maps by handle. This means adding a new field to a form automatically adds a column in the submissions view.

The all-submissions view (across all forms) can't do this since fields differ per form — it falls back to a preview column.

---

## AI generation

Uses Claude Haiku via tool use (structured output). The `build_form` tool schema enforces allowed field types at the JSON Schema level — the `enum` on the `type` property is dynamically built from the tier's allowed types. For free tier, `email` is omitted from the enum, so the model physically cannot return it.

There's also a pre-flight gate: if the free-tier user's description contains the word "email", the handler returns early with an error toast before hitting the API at all.

AI fields are **appended** to the existing form, not replacing it. This allows iterative building.

The Anthropic API key is hardcoded in `sandbox-entry.ts`. In production, proxy through the Solspace license server instead.

---

## Frontend component (`FreeformForm.astro`)

Server-rendered. Fetches the form schema at request time, renders all inputs, handles submission via a fetch to `/_emdash/api/plugins/freeform/submit`. The component is self-contained — styles and submit script are scoped inside the file.

**Important:** because it's server-rendered, the HTML reflects the schema at the time of the page request. If you add a field in the admin, users need to reload the page to see it. For production you might want ISR or a short cache TTL.

---

## What this POC skips

For a real production Freeform, you'd need:

- **License validation** against a real license server (current: any `FF-*` key works)
- **Email notifications** on submission (Craft Freeform's most-used feature)
- **More field types**: checkbox, radio, file upload, date, hidden, HTML block
- **Multi-page / wizard forms**
- **Conditional logic** (show/hide fields based on values)
- **Spam protection** (honeypot, reCAPTCHA, Turnstile)
- **Export** — CSV download of submissions
- **Submission detail view** in admin (currently only a table row preview)
- **Pagination** on submissions list (currently capped at 50)
- **Webhooks** and integrations (Slack, Mailchimp, etc.)
- **Front-end validation** beyond `required` (regex, min/max, custom)
- **Accessibility audit** on the rendered form
- **Rate limiting** on the submit endpoint
- **CSRF protection** (the current endpoint accepts any POST from any origin)
- **Field reordering** in the admin (deliberately omitted in favour of AI-driven field management)

---

## MCP server — working rough-in

Freeform exposes its own MCP Streamable HTTP endpoint so AI agents (Claude Desktop, Claude.ai, Cursor) can list forms, query submissions, and inspect form configs as first-class operations.

### Endpoint

- URL: `<site-origin>/freeform/mcp`
- Transport: MCP Streamable HTTP (POST, JSON-RPC 2.0)
- Auth: `Authorization: Bearer <token>` — currently an EmDash admin PAT
- Methods: `initialize`, `tools/list`, `tools/call`

### Tools exposed

- `list_forms` — every form with field/submission counts
- `list_submissions` — filters: `formId`, `since` / `until` (ISO 8601), `limit`. Filtering is applied server-side, not in the model.
- `get_form` — full form config by id or slug

### Files

- `emdash-app/src/pages/freeform/mcp.ts` — the MCP endpoint. Sits **outside** the plugin package on purpose — plugin route returns are unconditionally wrapped in `{ data: ... }` and can't set custom status, content-type, or `WWW-Authenticate` headers, all of which MCP needs. The endpoint forwards the Bearer token to the plugin's existing `list-forms`, `list-submissions`, and `get-form` routes via same-origin server-side fetch; EmDash's auth middleware validates the token on the inner call.
- `emdash-app/src/freeform-resource-metadata.ts` — RFC 9728 protected-resource metadata, served at `/.well-known/oauth-protected-resource/freeform/mcp` via `injectRoute` in `astro.config.mjs`. Required for OAuth-capable MCP clients (`mcp-remote` uses convention-based discovery, **not** `WWW-Authenticate` hints, so the metadata path must match exactly). Currently unused with PAT setup; kept for the OAuth path once unblocked.
- `emdash-app/astro.config.mjs` — adds the `injectRoute` integration and `vite.server.allowedHosts: [".trycloudflare.com"]` for tunneled demos.
- `packages/freeform-plugin/MCP-SETUP.md` — short setup doc that lives next to the plugin.

### Localhost setup (Claude Desktop + PAT)

Tested working on 2026-05-15. This is the path that proves the concept end-to-end. It is **not** something you'd ship — it requires an admin PAT pasted into a developer-level config — but it's enough to demo the experience.

**1. Run the dev server**

```bash
cd emdash-app
npx emdash dev
# → http://localhost:4321
```

No tunnel needed. `mcp-remote` runs as a local Node subprocess of Claude Desktop and reaches `localhost` directly. RFC 8252's loopback exception covers `http://localhost` for OAuth too.

**2. Generate a Personal Access Token in the EmDash admin**

In `http://localhost:4321/_emdash/admin`, generate a PAT with the `admin` scope. The token looks like `ec_pat_xxxxxxxxxxxxxx`. Keep it handy — it grants full admin rights, so treat it as a credential.

**3. Wire up Claude Desktop**

Claude Desktop → Settings → Developer → Edit Config (or open `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "freeform": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://localhost:4321/freeform/mcp",
        "--header",
        "Authorization:Bearer ec_pat_YOUR_TOKEN_HERE"
      ]
    }
  }
}
```

`mcp-remote` is the stdio↔HTTP bridge. `--header` injects the PAT directly, skipping OAuth entirely.

If you previously tried the OAuth path, clear its cache so it doesn't reuse a stale OAuth client registration:

```bash
rm -rf ~/.mcp-auth/
```

**4. Restart Claude Desktop fully** (Cmd+Q, reopen), then try:

> List the Freeform forms on this site.

Should call `list_forms` and render results. Follow-ups like "show submissions from yesterday on the contact form" chain `list_forms` → `list_submissions` automatically.

### Why PAT and not OAuth (for now)

The OAuth path is fully wired: resource metadata, `WWW-Authenticate` hints, EmDash's `/_emdash/oauth/*` endpoints all work, and `mcp-remote` completes the authorize/token dance. **But** EmDash gates non-public plugin routes behind the `admin` scope, and its OAuth server doesn't grant `admin` to OAuth-issued tokens even when requested — looks like a deliberate policy (`admin` is reserved for PATs). The token comes back with `content:read content:write media:read … settings:manage` but no `admin`, and plugin routes reject it with `403 INSUFFICIENT_SCOPE`.

Unblockers (any one of these):

1. EmDash adds a lower-privilege scope (e.g. `plugins:read`) that the auth middleware accepts for plugin routes.
2. Plugins declare their own required scope, including OAuth-grantable ones.
3. Workaround: split the plugin's read routes into `public: true` sister-routes and have `mcp.ts` validate the bearer token itself (e.g. by calling EmDash's built-in MCP) before invoking them.

Options 1/2 are the right product answer and worth a feature request to the EmDash team. Option 3 is a workaround we could implement without EmDash changes.

### Debugging notes worth keeping

- `mcp-remote` does **convention-based** OAuth discovery: it derives the metadata URL as `{origin}/.well-known/oauth-protected-resource{resource-path}` — *not* from our `WWW-Authenticate` hint. The metadata must live at that exact path. Falling back to the site-wide doc (which declares EmDash's built-in MCP as the resource) causes a `selectResourceURL` mismatch and aborts the flow.
- Astro doesn't auto-route `.well-known/` folders (dotfile dirs are excluded). Use `injectRoute` from an inline integration.
- Behind cloudflared, `request.url` is HTTP because the tunnel forwards over HTTP to localhost. Honor `X-Forwarded-Proto` / `X-Forwarded-Host` when constructing public URLs that MCP clients will fetch.
- **Passkeys are domain-bound (WebAuthn).** A passkey created on `localhost` won't work from a `*.trycloudflare.com` tunnel host. Local-only OAuth via `http://localhost` avoids this entirely; cloudflared is only needed if you're testing from a different machine or via Claude.ai web.

### Known gaps in the current rough-in

- **PAT-only auth.** Single static admin identity in logs. OAuth blocked on the scope mismatch above.
- **Self-fetch in prod Cloudflare Workers** — `mcp.ts` calls `/_emdash/api/plugins/...` via same-origin fetch. Fine on `npx emdash dev`; on Workers prod you'd need service bindings or direct DB access.
- **Not marketplace-distributable.** Plugins can't ship sibling Astro pages today, so this lives outside the plugin package. Needs EmDash to add a plugin-route raw-`Response` escape hatch (so the endpoint can move back inside the plugin) or a manifest entry that injects Astro routes.
- **No session management** (`Mcp-Session-Id`) and **no GET/SSE** for server-initiated notifications (returns 405). Each request is independent — fine for read-only tools.

### Future: Claude.ai Custom Connector

The real user-install path is Claude.ai's Custom Connector flow — paste one URL, OAuth in the browser, done. That needs:

1. A public HTTPS URL (cloudflared or real DNS).
2. The OAuth `admin`-scope issue resolved upstream.

Until both land, PAT + Claude Desktop is the working path. The Solspace-hosted-proxy idea (a `mcp.solspace.com/freeform` that OAuths to each customer's EmDash) is still on the table for a clean single-URL install, but the moment EmDash issues OAuth-grantable plugin scopes, every customer can connect to their own site's `/freeform/mcp` directly with no Solspace middleman.

### Why not embed the chat in the admin

Block Kit has no `html` / `iframe` / `markdown` / `script` block type and no streaming chat widget. A form-submit-and-re-render Q&A *is* achievable but feels like filling out a form, not a conversation. And `format: "native"` (React `adminEntry`) would unlock a rich chat but lose marketplace listing. The MCP endpoint is the right primitive: rich clients render richly, the EmDash admin stays as a thin operator console, and we don't fight the platform.

### EmDash feature requests this work surfaced

Worth raising with the EmDash team:

1. **Plugin-route raw-`Response` escape hatch** — let routes return a `Response` to bypass the `{ data: ... }` wrap. Needed for any plugin shipping a protocol endpoint (MCP, webhooks, OAuth callbacks).
2. **OAuth-grantable plugin scope** *or* **plugin-declared route scopes** — unblocks the OAuth path for plugin MCP servers.
3. **`html` / `iframe` / `markdown` Block Kit type** *or* **plugin-injected Astro routes** — unlocks rich in-admin UI for marketplace-listable plugins.
4. **Plugin extension point for the built-in MCP server** — `createMcpServer()` is a static factory today; plugins should be able to contribute tools to the canonical `/_emdash/api/mcp` endpoint so customers don't have to install a separate MCP server per plugin.

---

## Running it

```bash
npx emdash dev
```

- Admin: `http://localhost:4321/_emdash/admin`
- Demo page: `http://localhost:4321/demo`
- MCP endpoint: `http://localhost:4321/freeform/mcp` (see MCP setup above)

The plugin is registered in `astro.config.mjs` under `plugins: [freeformPlugin()]`. For Cloudflare deployment, swap `plugins` for `sandboxed` in the emdash config — same descriptor, true VM isolation.

Demo license key (activates Pro in this POC): any string starting with `FF-`, e.g. `FF-DEMO-1234`.
