# MCP Setup — Claude Desktop (local development)

Connect an MCP client (Claude Desktop, Cursor, …) to a local EmDash site
running Freeform, using a Personal Access Token (PAT).

> **Production use:** deploy the standalone Worker in
> [`packages/mcp/`](../packages/mcp/README.md) — one Worker per site, reached
> over HTTPS. The setup below is the quick local-development path against a
> dev server.

## How it works

The MCP client talks to an MCP endpoint over Streamable HTTP; requests carry
your EmDash PAT as a Bearer token, which EmDash validates before the
Freeform plugin routes run. Authentication is PAT-only for now: EmDash's
OAuth server doesn't grant the scope plugin routes require (see
[Known limitations](LIMITATIONS.md)).

## 1. Run the demo site

```bash
cd ../cms
pnpm run dev:clean
# → http://localhost:4321
```

No tunnel is needed — the MCP bridge runs as a local subprocess and can
reach `localhost` directly.

## 2. Create a Personal Access Token

In the EmDash admin, generate a PAT with the `admin` scope. It looks like
`ec_pat_…`. Treat it like a password.

## 3. Configure Claude Desktop

Claude Desktop → Settings → Developer → Edit Config
(`~/Library/Application Support/Claude/claude_desktop_config.json`):

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

If you previously attempted the OAuth flow, clear its cached client
registration so it doesn't get reused:

```bash
rm -rf ~/.mcp-auth/
```

## 4. Restart and test

Fully quit Claude Desktop (Cmd+Q), reopen it, and try:

> List the Freeform forms on this site.

Follow-ups like "show yesterday's submissions on the contact form" chain
the list tools automatically.

## Notes

- Each request is independent — there is no `Mcp-Session-Id` session state.
- In production on Cloudflare Workers, use the `packages/mcp` Worker rather
  than a site-local endpoint; it forwards tokens to the plugin routes on
  your deployed site.
