import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

// Public catalog of agent-callable forms, served at /.well-known/freeform.json.
// Lets any AI agent reading any page on the site discover that submittable
// forms exist here and how to find each form's action manifest.

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

interface PublicForm {
  id: string;
  handle: string;
  name: string;
  fieldCount: number;
}

export const GET: APIRoute = async ({ request }) => {
  const origin = publicOrigin(request);
  const apiUrl = `${origin}/_emdash/api/plugins/freeform/list-public-forms`;
  const fetcher = (env as any).SELF ?? globalThis;

  let forms: PublicForm[] = [];
  try {
    const res = await fetcher.fetch(apiUrl);
    if (res.ok) {
      const json = (await res.json()) as { data?: { forms?: PublicForm[] } };
      forms = json.data?.forms ?? [];
    }
  } catch {
    // Empty catalog on failure is safer than a 500 — discovery is best-effort.
  }

  const body = {
    version: 1,
    site: origin,
    actions: forms.map((f) => ({
      id: f.handle,
      kind: "form.submit",
      title: f.name,
      manifest: `${origin}/.well-known/freeform/${encodeURIComponent(f.handle)}.json`,
      field_count: f.fieldCount,
    })),
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60",
    },
  });
};
