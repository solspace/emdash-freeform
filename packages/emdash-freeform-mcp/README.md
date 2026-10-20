# emdash-freeform-mcp

Standalone Cloudflare Worker that exposes a [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for the Freeform plugin on an EmDash site. Deploy one Worker per customer site.

## How it works

```
MCP client (Claude Desktop, etc.)
        │  POST /mcp  (Bearer token)
        ▼
emdash-freeform-mcp  (this Worker)
        │  forward token + call plugin routes
        ▼
EmDash site  /_emdash/api/plugins/freeform/*
        │  validate token, query KV
        ▼
Freeform plugin (sandboxed)
```

The Worker never stores any site data. All reads and writes go through the Freeform plugin's existing HTTP routes on the EmDash site.

Authentication is delegated: the Bearer token from the MCP client is forwarded to the plugin route. EmDash validates it and returns 401 if invalid; the Worker propagates that as an MCP unauthorized response.

## Prerequisites

- A Cloudflare account with Workers enabled
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) installed (`npm i -g wrangler`)
- An EmDash site with the Freeform plugin installed and a Personal Access Token (PAT) generated

## Setup

### 1. Install dependencies

```bash
pnpm install
# or: npm install
```

### 2. Configure wrangler.jsonc

Open `wrangler.jsonc` and:

- Change `name` to something unique for your deployment, e.g. `"acme-freeform-mcp"`.
- Uncomment and set the `routes` entry to your own custom domain:
  ```jsonc
  "routes": [
    { "pattern": "freeform-mcp.example.com", "custom_domain": true }
  ]
  ```
  > **Why no workers.dev?** Anthropic's outbound POST allowlist blocks `*.workers.dev` domains.
  > A custom domain is required for Claude Desktop and similar clients to reach the Worker.

### 3. Set secrets

```bash
# The public base URL of your EmDash site — no trailing slash.
wrangler secret put EMDASH_SITE_URL
# When prompted, enter e.g.: https://emdash.example.com
```

### 4. Deploy

```bash
pnpm run deploy
# or: wrangler deploy
```

After deploy, your MCP endpoint is at `https://freeform-mcp.example.com/mcp`.

### 5. Connect Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "freeform": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://freeform-mcp.example.com/mcp",
        "--header",
        "Authorization: Bearer YOUR_PAT_HERE"
      ]
    }
  }
}
```

Replace `YOUR_PAT_HERE` with a Personal Access Token generated in your EmDash admin UI.

## Local development

```bash
pnpm run dev
```

Wrangler starts the Worker locally on `http://localhost:8787`. You can test it with:

```bash
curl -X POST http://localhost:8787/mcp \
  -H "Authorization: Bearer YOUR_PAT" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

> During local dev, set `EMDASH_SITE_URL` in a `.dev.vars` file (gitignored):
> ```
> EMDASH_SITE_URL=https://emdash.example.com
> ```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `EMDASH_SITE_URL` | Yes | Public base URL of the EmDash site. No trailing slash. |
| `SOLSPACE_PROXY_MODE` | No | Internal Solspace use only. Enables `X-Freeform-Target-Site` header override for multi-tenant proxy. Do not set on self-deployments. |

## Available tools

The Worker exposes 25 MCP tools organized into four groups:

**Submissions**
- `list_forms` — list all forms with counts and timestamps
- `list_submissions` — filtered list with AI briefs, spam scores, page journey
- `get_form` — full form configuration
- `get_form_prefill_url` — build a deep link with values pre-filled
- `export_submissions_csv` — generate a signed download URL for a CSV export

**Form composition**
- `create_form`, `update_form`, `set_form_handle`, `delete_form`
- `add_field`, `remove_field`, `update_field`

**AI spam filter**
- `get_spam_settings`, `set_spam_settings`, `archive_spam_submissions`

**Email notifications**
- `list_templates`, `get_template`, `create_template`, `update_template`, `delete_template`
- `list_form_notifications`, `attach_notification`, `detach_notification`, `update_form_notification`
