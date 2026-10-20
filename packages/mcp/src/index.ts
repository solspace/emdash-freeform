// Freeform MCP Server — Standalone Cloudflare Worker
//
// Implements the MCP Streamable HTTP transport (JSON-RPC 2.0 over POST).
// Each customer deploys their own Worker instance. The Worker proxies all
// MCP tool calls to the Freeform plugin routes on their EmDash site.
//
// Required Worker secrets:
//   EMDASH_SITE_URL   — public base URL of the EmDash site, no trailing slash
//
// Optional:
//   SOLSPACE_PROXY_MODE — when set, allows X-Freeform-Target-Site header to
//                         override EMDASH_SITE_URL (Solspace multi-tenant proxy)

import type { Env } from "./client.ts";
import { getTargetSiteUrl } from "./client.ts";
import { rpcResult, rpcError, unauthorized } from "./protocol.ts";
import { TOOLS } from "./tools.ts";
import { runTool } from "./runner.ts";

const MCP_PROTOCOL_VERSION = "2025-06-18";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Only serve MCP on POST /mcp. Reject everything else with a minimal
    // explanation so misconfigured clients get a useful error rather than a
    // silent 404.
    if (request.method === "GET" && url.pathname === "/mcp") {
      // MCP Streamable HTTP allows GET for SSE push. We don't push
      // server-initiated events, so return 405 — clients fall back to POST.
      return new Response(null, { status: 405, headers: { Allow: "POST" } });
    }

    if (request.method !== "POST" || url.pathname !== "/mcp") {
      return new Response(
        JSON.stringify({ error: "Not found. Send MCP JSON-RPC requests to POST /mcp." }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const siteUrl = getTargetSiteUrl(env, request);
    // The RFC 9728 resource metadata is served by the EmDash site itself
    // (via the freeform-astro package). MCP clients use it for OAuth discovery.
    const resourceMetadataUrl = `${siteUrl}/.well-known/oauth-protected-resource/freeform/mcp`;

    const auth = request.headers.get("Authorization");
    if (!auth?.toLowerCase().startsWith("bearer ")) {
      return unauthorized(resourceMetadataUrl);
    }
    const authHeader = auth;

    let body: JsonRpcRequest;
    try {
      body = (await request.json()) as JsonRpcRequest;
    } catch {
      return rpcError(null, -32700, "Parse error");
    }

    const { id = null, method, params } = body;
    const isNotification = id === null || id === undefined;

    try {
      if (method === "initialize") {
        return rpcResult(id, {
          protocolVersion: (params?.protocolVersion as string) ?? MCP_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "freeform", version: "0.1.0" },
        });
      }

      if (method === "notifications/initialized") {
        return new Response(null, { status: 202 });
      }

      if (method === "tools/list") {
        return rpcResult(id, { tools: TOOLS });
      }

      if (method === "tools/call") {
        const toolName = params?.name as string;
        const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;
        const result = await runTool(siteUrl, authHeader, toolName, toolArgs);
        return rpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        });
      }

      if (isNotification) return new Response(null, { status: 202 });
      return rpcError(id, -32601, `Method not found: ${method}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Internal error";
      if (msg === "UNAUTHORIZED") return unauthorized(resourceMetadataUrl);
      return rpcError(id, -32603, msg);
    }
  },
} satisfies ExportedHandler<Env>;
