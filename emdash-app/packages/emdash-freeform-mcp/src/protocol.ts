// JSON-RPC 2.0 + MCP protocol helpers.

export function rpcResult(id: string | number | null, result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    headers: { "Content-Type": "application/json" },
  });
}

export function rpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id, error: { code, message, ...(data !== undefined ? { data } : {}) } }),
    { headers: { "Content-Type": "application/json" } }
  );
}

// Returns 401 with a WWW-Authenticate header pointing at the RFC 9728
// resource metadata document hosted on the EmDash site.
export function unauthorized(resourceMetadataUrl: string): Response {
  return new Response(
    JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Bearer token required" } }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl}"`,
      },
    }
  );
}
