import type { APIRoute } from "astro";

export const prerender = false;

// Freeform MCP server — Streamable HTTP transport, OAuth-gated via EmDash.
//
// Lives outside the plugin package because plugin route returns are
// unconditionally wrapped in `{ data: ... }` and cannot set custom status,
// content-type, or WWW-Authenticate headers — all of which MCP needs.
//
// Auth model: this endpoint demands a Bearer token. Actual validation is
// delegated by forwarding the token to a non-public Freeform plugin route;
// EmDash's auth middleware validates it there and we propagate any 401.

const MCP_PROTOCOL_VERSION = "2025-06-18";
const PLUGIN_BASE = "/_emdash/api/plugins/freeform";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: any;
}

function rpcResult(id: any, result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    headers: { "Content-Type": "application/json" },
  });
}

function rpcError(id: any, code: number, message: string, data?: unknown): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id, error: { code, message, data } }),
    { headers: { "Content-Type": "application/json" } }
  );
}

// Behind cloudflared/any reverse proxy, request.url is the localhost HTTP url.
// Honor X-Forwarded-Proto / X-Forwarded-Host to build the public origin so the
// URLs we hand to MCP clients are reachable from the outside.
export function publicOrigin(request: Request): string {
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? request.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}

function unauthorized(origin: string): Response {
  return new Response(
    JSON.stringify({
      error: { code: "UNAUTHORIZED", message: "Bearer token required" },
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        // Point at our own resource metadata at the RFC 9728 convention path.
        // mcp-remote uses convention-based discovery (not this hint), but
        // emitting it correctly is good hygiene for clients that do follow it.
        "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/freeform/mcp"`,
      },
    }
  );
}

async function callPluginRoute(
  request: Request,
  routeName: string,
  init?: { method?: "GET" | "POST"; query?: Record<string, string>; body?: unknown }
): Promise<unknown> {
  const url = new URL(`${PLUGIN_BASE}/${routeName}`, new URL(request.url).origin);
  if (init?.query) {
    for (const [k, v] of Object.entries(init.query)) url.searchParams.set(k, v);
  }
  const auth = request.headers.get("Authorization");
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      ...(auth ? { Authorization: auth } : {}),
      ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Plugin route ${routeName} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data: unknown };
  return json.data;
}

const TOOLS = [
  {
    name: "list_forms",
    description:
      "List all Freeform forms on this site. Returns id, name, field count, submission count, and timestamps. Use this to find a form's id before calling list_submissions.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_submissions",
    description:
      "List form submissions, most recent first. Optionally filter by form id and/or date range (ISO 8601). Use list_forms first to find form ids.",
    inputSchema: {
      type: "object",
      properties: {
        formId: { type: "string", description: "Filter to a single form id" },
        since: { type: "string", description: "ISO 8601 timestamp; include submissions at/after this time" },
        until: { type: "string", description: "ISO 8601 timestamp; include submissions at/before this time" },
        limit: { type: "number", description: "Max results (default 50, hard cap 500)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_form",
    description: "Fetch a single form's full configuration (rows, fields, settings) by id or slug.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Form id or slug" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
] as const;

async function runTool(request: Request, name: string, args: any): Promise<unknown> {
  if (name === "list_forms") {
    return callPluginRoute(request, "list-forms");
  }
  if (name === "list_submissions") {
    const query: Record<string, string> = {};
    if (args?.formId) query.formId = String(args.formId);
    const data = (await callPluginRoute(request, "list-submissions", { query })) as {
      submissions: Array<{ createdAt: string; [k: string]: unknown }>;
    };
    let subs = data.submissions;
    if (args?.since) {
      const t = new Date(args.since).getTime();
      subs = subs.filter((s) => new Date(s.createdAt).getTime() >= t);
    }
    if (args?.until) {
      const t = new Date(args.until).getTime();
      subs = subs.filter((s) => new Date(s.createdAt).getTime() <= t);
    }
    const limit = Math.min(Math.max(Number(args?.limit) || 50, 1), 500);
    subs = subs.slice(0, limit);
    return { count: subs.length, submissions: subs };
  }
  if (name === "get_form") {
    if (!args?.id) throw new Error("Missing required argument: id");
    return callPluginRoute(request, "get-form", { query: { id: String(args.id) } });
  }
  throw new Error(`Unknown tool: ${name}`);
}

export const POST: APIRoute = async ({ request }) => {
  const origin = publicOrigin(request);

  const auth = request.headers.get("Authorization");
  if (!auth?.toLowerCase().startsWith("bearer ")) {
    return unauthorized(origin);
  }

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
        protocolVersion: params?.protocolVersion ?? MCP_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "freeform", version: "1.0.0" },
      });
    }

    if (method === "notifications/initialized") {
      return new Response(null, { status: 202 });
    }

    if (method === "tools/list") {
      return rpcResult(id, { tools: TOOLS });
    }

    if (method === "tools/call") {
      const result = await runTool(request, params?.name, params?.arguments ?? {});
      return rpcResult(id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      });
    }

    if (isNotification) return new Response(null, { status: 202 });
    return rpcError(id, -32601, `Method not found: ${method}`);
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") return unauthorized(origin);
    return rpcError(id, -32603, e?.message ?? "Internal error");
  }
};

// MCP Streamable HTTP allows GET for an SSE event stream. We don't push
// server-initiated events, so reject GET — Claude Desktop falls back to POST.
export const GET: APIRoute = () => new Response(null, { status: 405 });
