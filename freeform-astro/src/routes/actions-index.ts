import type { APIRoute } from "astro";
import { getFetcher, publicOrigin } from "../lib/client";

export const prerender = false;

// Public catalog of agent-callable forms at /.well-known/freeform.json.
// Lets any AI agent reading any page on the site discover submittable forms.

interface PublicForm {
  id: string;
  handle: string;
  name: string;
  fieldCount: number;
}

export const GET: APIRoute = async ({ request }) => {
  const origin = publicOrigin(request);
  const fetcher = getFetcher();

  let forms: PublicForm[] = [];
  try {
    const res = await fetcher.fetch(
      `${origin}/_emdash/api/plugins/freeform/list-public-forms`,
    );
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
