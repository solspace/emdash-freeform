import type { APIRoute } from "astro";
import { getFetcher } from "../lib/client";

export const prerender = false;

// Public alias for the plugin's submit-agent endpoint. Lives outside /_emdash/
// so EmDash's default robots.txt (which disallows /_emdash/*) doesn't block
// well-behaved AI agents from POSTing here.
const PLUGIN_ENDPOINT = "/_emdash/api/plugins/freeform/submit-agent";

export const POST: APIRoute = async ({ request }) => {
  const origin = new URL(request.url).origin;
  const fetcher = getFetcher();

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
      JSON.stringify({ success: false, error: "Submit service unavailable" }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
};
