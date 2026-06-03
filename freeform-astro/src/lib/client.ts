// Shared utilities used by route handlers and Astro components.
// Centralises the env.SELF / globalThis fetcher pattern and the
// X-Forwarded-* origin resolution that every Freeform route needs.

// import { env } from "cloudflare:workers";

/**
 * Returns the Cloudflare SELF service binding when running on a Worker,
 * or globalThis when running in local dev (Miniflare / Node).
 *
 * The SELF binding bypasses Cloudflare's same-hostname loopback restriction,
 * which would otherwise cause same-origin fetches to 404.
 */
export function getFetcher(): { fetch: typeof fetch } {
  return globalThis;
}

/**
 * Resolves the public-facing origin of a request, honoring
 * X-Forwarded-Proto / X-Forwarded-Host headers set by reverse proxies
 * and Cloudflare tunnels (cloudflared, ngrok).
 */
export function publicOrigin(request: Request): string {
  const url = new URL(request.url);
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
    url.protocol.replace(":", "");
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    request.headers.get("host") ??
    url.host;
  return `${proto}://${host}`;
}

export interface FreeformFormData {
  id: string;
  name: string;
  handle: string;
  rows: Array<{
    id: string;
    fields: Array<{
      id: string;
      type: string;
      label: string;
      handle: string;
      required: boolean;
      placeholder?: string;
      options?: Array<{ value: string; label: string }>;
      defaultValue?: string | string[];
    }>;
  }>;
  successMessage: string;
  csrfToken: string;
}

/**
 * Fetches a Freeform form's schema from the plugin API.
 * Returns null on any error — callers should render a graceful error state.
 */
export async function fetchForm(
  formId: string,
  siteOrigin: string,
  fetcher: { fetch: typeof fetch },
): Promise<FreeformFormData | null> {
  try {
    const url = `${siteOrigin}/_emdash/api/plugins/freeform/get-form?id=${encodeURIComponent(formId)}`;
    const res = await fetcher.fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: FreeformFormData };
    return json.data ?? null;
  } catch {
    return null;
  }
}
