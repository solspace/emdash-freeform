import type { APIRoute } from "astro";
import { getFetcher } from "../lib/client";

export const prerender = false;

// CSV download for Freeform submissions. The `token` path segment is an
// HMAC-signed filter blob issued by the plugin's `prepare-export` route via
// the MCP `export_submissions_csv` tool. The token authenticates the download
// on its own — no EmDash session required.
const PLUGIN_BASE = "/_emdash/api/plugins/freeform";

export const GET: APIRoute = async ({ params, request }) => {
  const token = params.token;
  if (!token) return new Response("Missing token", { status: 400 });

  const fetcher = getFetcher();
  const url = new URL(`${PLUGIN_BASE}/export-csv`, new URL(request.url).origin);
  url.searchParams.set("token", token);

  const upstream = await fetcher.fetch(url.toString(), { method: "GET" });

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
