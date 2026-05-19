import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

// Per-form action manifest, served at /.well-known/freeform/[handle].json.
// Tells an AI agent the field schema and submit endpoint for one form.

function publicOrigin(request: Request): string {
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

export const GET: APIRoute = async ({ params, request }) => {
  const handle = params.handle;
  if (!handle || typeof handle !== "string") {
    return new Response(JSON.stringify({ error: "Missing handle" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Astro's [handle].json route gives us "contact.json" — strip the suffix.
  const cleanHandle = handle.endsWith(".json")
    ? handle.slice(0, -".json".length)
    : handle;

  const origin = publicOrigin(request);
  const apiUrl = new URL(
    `/_emdash/api/plugins/freeform/get-form-manifest?handle=${encodeURIComponent(cleanHandle)}&origin=${encodeURIComponent(origin)}`,
    origin,
  );
  const fetcher = (env as any).SELF ?? globalThis;

  try {
    const res = await fetcher.fetch(apiUrl.toString());
    if (res.status === 404) {
      return new Response(JSON.stringify({ error: `Form "${cleanHandle}" not found` }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (!res.ok) {
      return new Response(JSON.stringify({ error: "Failed to load manifest" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }
    const json = (await res.json()) as { data?: unknown };
    return new Response(JSON.stringify(json.data ?? {}, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Could not connect to Freeform service" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
};
