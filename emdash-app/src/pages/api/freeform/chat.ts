import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

const PLUGIN_ENDPOINT = "/_emdash/api/plugins/freeform/chat";

export const POST: APIRoute = async ({ request }) => {
  const origin = new URL(request.url).origin;
  const fetcher = (env as any).SELF ?? globalThis;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");

  try {
    const upstream = await fetcher.fetch(`${origin}${PLUGIN_ENDPOINT}`, {
      method: "POST",
      headers,
      body: await request.text(),
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Chat service unavailable" }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
};
