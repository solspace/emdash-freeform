# Freeform MCP server — local setup with Claude Desktop

Rough-in POC. Exposes Freeform's forms and submissions to an AI agent
(Claude Desktop, Claude Code, Cursor, etc.) over MCP.

## URL

- Endpoint: `<site-origin>/freeform/mcp`
- Transport: MCP Streamable HTTP (POST, JSON-RPC 2.0)
- Auth: Bearer token in `Authorization` header

## Tools exposed

- `list_forms` — all forms with field/submission counts
- `list_submissions` — filter by `formId`, `since`, `until` (ISO 8601), `limit`
- `get_form` — full form config by id or slug

## Files

- `emdash-app/src/pages/freeform/mcp.ts` — the MCP endpoint
- `emdash-app/src/freeform-resource-metadata.ts` — RFC 9728 protected-resource
  metadata, served at `/.well-known/oauth-protected-resource/freeform/mcp` via
  `injectRoute` in `astro.config.mjs`. Used by OAuth-capable MCP clients for
  discovery. (Not used in the PAT setup below — kept for the future OAuth path.)

The endpoint lives outside the plugin package because plugin route returns are
unconditionally wrapped in `{ data: ... }` and can't set custom status,
content-type, or `WWW-Authenticate` headers — all of which MCP needs. It
forwards Bearer tokens to the plugin's existing routes (`list-forms`,
`list-submissions`, `get-form`); EmDash's auth middleware validates the token
on the inner call.

## Working setup: PAT in Claude Desktop

Tested working on 2026-05-15.

### 1. Run the dev server

```bash
cd emdash-app
npx emdash dev
# → http://localhost:4321
```

No tunnel needed — `mcp-remote` is a local Node subprocess of Claude Desktop,
so it can reach `localhost` directly. The OAuth-loopback exception (RFC 8252)
covers `http://localhost`.

### 2. Generate a Personal Access Token in EmDash admin

In the EmDash admin UI, generate a PAT with the `admin` scope. It'll look like
`ec_pat_xxxxxxxxxxxxxx`. Keep it handy.

### 3. Wire up Claude Desktop

Claude Desktop → Settings → Developer → Edit Config (or
`~/Library/Application Support/Claude/claude_desktop_config.json`):

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

`mcp-remote` is the stdio↔HTTP bridge. `--header` injects the PAT directly,
skipping OAuth entirely.

If you'd previously tried the OAuth path, wipe its cache so it doesn't try
to reuse a stale OAuth client registration:

```bash
rm -rf ~/.mcp-auth/
```

### 4. Restart Claude Desktop fully (Cmd+Q, reopen) and try

> List the Freeform forms on this site.

Should call `list_forms` and render results. Followups like "show submissions
from yesterday on the contact form" should chain `list_forms` → `list_submissions`.

## Why PAT, not OAuth, for now

The OAuth path is wired up (resource metadata, WWW-Authenticate, EmDash's
`/_emdash/oauth/*` endpoints all work) and `mcp-remote` completes the
authorize/token dance. **But** EmDash gates non-public plugin routes behind
the `admin` scope, and EmDash's OAuth server doesn't grant `admin` to
OAuth-issued tokens even when requested — likely a deliberate policy (admin
is reserved for PATs). The token comes back with `content:read content:write
media:read … settings:manage` but no `admin`, and plugin routes reject it
with `403 INSUFFICIENT_SCOPE`.

To unblock OAuth, one of these has to happen:
1. EmDash grants `admin` to OAuth-issued tokens (probably wrong — too privileged).
2. EmDash adds a lower-privilege scope (e.g. `plugins:read`) that the auth
   middleware accepts for plugin routes.
3. Plugins declare their own scope requirement, including OAuth-grantable ones.
4. We split the plugin's read routes into public sister-routes and have `mcp.ts`
   validate the bearer token itself before calling them.

Options 2 or 3 are the right product answer — worth a feature request to the
EmDash team. Option 4 is a workaround we could implement without EmDash changes
if we want OAuth without waiting.

## Known gaps in the current rough-in

- **Auth model:** PAT (admin scope) only. OAuth is wired but blocked on the
  scope mismatch above. Single static token = single identity in logs.
- **Self-fetch in prod Cloudflare Workers.** `mcp.ts` calls `/_emdash/api/plugins/...`
  via `fetch(<same origin>)`. Works in `npx emdash dev`; on Workers prod you'd
  need service bindings or direct DB access.
- **No marketplace distribution.** Plugins can't ship sibling Astro pages, so
  this requires EmDash to add either (a) a plugin-route raw-response escape
  hatch, or (b) a plugin manifest entry that injects Astro routes.
- **No session management.** Each request is independent; no `Mcp-Session-Id`.
- **No GET/SSE for server-initiated notifications.** Returns 405.

## For Claude.ai web (Custom Connectors) — future, needs Pro

The real user-install path is Claude.ai's Custom Connector flow: paste one
URL, OAuth in the browser, done. That requires:
1. A public HTTPS URL (cloudflared or real DNS).
2. The OAuth `admin`-scope issue resolved.

Once both land, Claude.ai users can install the Freeform MCP server in a
single dialog. Until then, PAT + Claude Desktop is the working path.
