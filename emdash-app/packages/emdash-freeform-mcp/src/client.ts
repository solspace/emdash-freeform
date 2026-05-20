// HTTP client for the Freeform plugin routes on the EmDash site.

export interface Env {
  EMDASH_SITE_URL: string;
  SOLSPACE_PROXY_MODE?: string;
}

const PLUGIN_BASE = "/_emdash/api/plugins/freeform";

// Returns the target EmDash site URL for this request.
//
// In normal self-deployed mode this is always env.EMDASH_SITE_URL.
// In Solspace proxy mode (SOLSPACE_PROXY_MODE set), the caller can override
// the target by sending an X-Freeform-Target-Site request header — the proxy
// sets this header to route requests to the correct customer site without
// maintaining a separate Worker per customer.
export function getTargetSiteUrl(env: Env, request: Request): string {
  const base = env.EMDASH_SITE_URL.replace(/\/$/, "");
  if (env.SOLSPACE_PROXY_MODE) {
    const override = request.headers.get("X-Freeform-Target-Site");
    if (override) return override.replace(/\/$/, "");
  }
  return base;
}

// Calls a named Freeform plugin route on the EmDash site and returns the
// unwrapped `data` payload. Forwards the Bearer token from the original
// request so EmDash can validate it. Throws "UNAUTHORIZED" if the site
// returns 401 (the caller in index.ts catches this and returns a 401 to the
// MCP client).
export async function callPluginRoute(
  siteUrl: string,
  authHeader: string | null,
  routeName: string,
  init?: {
    method?: "GET" | "POST";
    query?: Record<string, string>;
    body?: unknown;
  }
): Promise<unknown> {
  const url = new URL(`${PLUGIN_BASE}/${routeName}`, siteUrl);
  if (init?.query) {
    for (const [k, v] of Object.entries(init.query)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    method: init?.method ?? "GET",
    headers: {
      ...(authHeader ? { Authorization: authHeader } : {}),
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
