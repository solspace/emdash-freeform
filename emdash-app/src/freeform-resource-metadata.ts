import type { APIRoute } from "astro";

export const prerender = false;

// RFC 9728 OAuth 2.0 Protected Resource Metadata for the Freeform MCP server.
//
// Registered via injectRoute in astro.config.mjs at the convention path
// `/.well-known/oauth-protected-resource/freeform/mcp` — that's the URL
// `mcp-remote` and other MCP clients compute deterministically from the
// resource URL `/freeform/mcp`. Falls back to the site-wide doc otherwise,
// which declares EmDash's built-in MCP and breaks our resource match.

function publicOrigin(request: Request): string {
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? request.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}

export const GET: APIRoute = ({ request }) => {
  const origin = publicOrigin(request);
  const body = {
    resource: `${origin}/freeform/mcp`,
    authorization_servers: [`${origin}/_emdash`],
    scopes_supported: ["content:read"],
    bearer_methods_supported: ["header"],
    resource_documentation: `${origin}/freeform/mcp`,
  };
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
};
