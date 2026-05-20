import type { APIRoute } from "astro";
import { publicOrigin } from "../lib/client";

export const prerender = false;

// RFC 9728 OAuth 2.0 Protected Resource Metadata for the Freeform MCP server.
// Served at /.well-known/oauth-protected-resource/freeform/mcp — the path
// mcp-remote derives deterministically from the resource URL /freeform/mcp.
//
// `resource` should ideally point at the standalone MCP Worker URL once
// packages/emdash-freeform-mcp/ is deployed (e.g. https://freeform-mcp.example.com/mcp).
// Until then it falls back to the legacy in-process route on this site.
// TODO: read worker URL from plugin KV setting `mcpWorkerUrl` when set.

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
