# Freeform Plugin — POC Handoff

Built in roughly 3 hours using Claude Code. This doc is for you, Gustavs — no hand-holding, just the patterns, decisions, and gotchas you need to take this to production.

---

## What was built

A fully functional Freeform form-builder plugin for Emdash:

- **Admin UI** via Block Kit: list, create, edit, delete forms; add/remove/reorder fields; view submissions
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

`sandbox-entry.ts` is the **runtime** — it runs inside the Emdash plugin sandbox. It exports a `definePlugin()` call with hooks and routes.

### Standard format vs. legacy

The descriptor sets `format: "standard"`. This is the current format. Route handlers receive **two arguments**:

```typescript
handler: async (routeCtx: any, ctx: PluginContext) => { ... }
```

- `routeCtx` — `{ input, request, requestMeta }`. `input` is the parsed JSON body for POST requests; `undefined` for GET.
- `ctx` — `{ storage, kv, http, log }`. Everything plugin-specific lives here.

This is the single most important thing to get right. Using one-arg `(ctx)` wires up the old signature where `ctx` is `routeCtx`, and you get no storage, no kv, and silent 500s. The two-arg pattern is confirmed in `emdash/src/plugins/adapt-sandbox-entry.ts`.

### Storage

Two collections declared in `index.ts`:

```typescript
storage: {
  forms: { indexes: ["createdAt"] },
  submissions: { indexes: ["formId", "createdAt", ["formId", "createdAt"]] },
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
```

### Widget interaction

The widget sends `{ type: "page_load", page: "widget:<widgetId>" }` on load — not `type: "widget_load"` as some docs suggest. Check for it:

```typescript
if (type === "page_load" && page?.startsWith("widget:")) {
  return { blocks: [/* widget blocks */] };
}
```

The admin route receives all Block Kit interactions at a single handler endpoint. Route everything by `actionId` convention (e.g., `"edit:formId"`, `"rm:formId:fieldId"`).

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

## AI generation

Uses Claude Haiku via tool use (structured output). The `build_form` tool schema enforces allowed field types at the JSON Schema level — the `enum` on the `type` property is dynamically built from the tier's allowed types. For free tier, `email` is omitted from the enum, so the model physically cannot return it.

There's also a pre-flight gate: if the free-tier user's description contains the word "email", the handler returns early with an error toast before hitting the API at all.

AI fields are **appended** to the existing form, not replacing it. This allows iterative building.

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
- **Submission detail view** in admin (currently only a preview row in a table)
- **Pagination** on submissions list (currently capped at 50)
- **Webhooks** and integrations (Slack, Mailchimp, etc.)
- **Front-end validation** beyond `required` (regex, min/max, custom)
- **Accessibility audit** on the rendered form
- **Rate limiting** on the submit endpoint
- **CSRF protection** (the current endpoint accepts any POST from any origin)

The architecture handles all of these cleanly — storage, KV, and the `ctx.http` outbound client are already the right primitives. The Block Kit admin UI can grow to cover any of the above without changing the plugin contract.

---

## Running it

```bash
npx emdash dev
```

Admin: `http://localhost:4321/_emdash/admin`  
Demo page: `http://localhost:4321/demo`

The plugin is registered in `astro.config.mjs` under `plugins: [freeformPlugin()]`. For Cloudflare deployment, swap `plugins` for `sandboxed` in the emdash config — same descriptor, true VM isolation.

Demo license key (activates Pro in this POC): any string starting with `FF-`, e.g. `FF-DEMO-1234`.
