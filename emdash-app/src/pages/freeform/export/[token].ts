import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

// Public CSV download for Freeform submissions. The `token` path segment is an
// HMAC-signed filter blob issued by the plugin's `prepare-export` route via
// the MCP `export_submissions_csv` tool. The token authenticates the download
// on its own — no EmDash session needed — so the AI can hand the link to a
// user in chat and they can click it directly.

const PLUGIN_BASE = "/_emdash/api/plugins/freeform";

type Fetcher = { fetch: typeof fetch };

export const GET: APIRoute = async ({ params, request }) => {
  const token = params.token;
  if (!token) return new Response("Missing token", { status: 400 });

  const fetcher: Fetcher = (env as any).SELF ?? globalThis;
  const url = new URL(`${PLUGIN_BASE}/export-csv`, new URL(request.url).origin);
  url.searchParams.set("token", token);

  const upstream = await fetcher.fetch(url, { method: "GET" });
  if (upstream.status === 401) {
    return new Response("Link expired or invalid.", { status: 401 });
  }
  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    return new Response(text || "Export failed.", { status: upstream.status });
  }

  const wrapped = (await upstream.json()) as {
    data: { csv: string; filename: string; rowCount: number };
  };
  const { csv, filename } = wrapped.data;

  const safeName =
    filename
      .replace(/[\r\n"\\]/g, "")
      .replace(/[^\x20-\x7E]/g, "")
      .slice(0, 120) || "freeform-export.csv";

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
    },
  });
};
