import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getSiteSettings } from "emdash";
import { resolveStarterSiteIdentity } from "./utils/site-identity";

export const prerender = false;

// /llms.txt — the AI-readable site map convention (llmstxt.org). Tells any
// agent probing well-known files what's here and how to drive it.

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
  const { siteTitle, siteTagline } = resolveStarterSiteIdentity(
    await getSiteSettings(),
  );

  const fetcher = (env as any).SELF ?? globalThis;
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
    // Empty form list is acceptable; the rest of the doc is still useful.
  }

  const formLines = forms.length
    ? forms
        .map(
          (f) =>
            `- [${f.name}](${origin}/.well-known/freeform/${encodeURIComponent(f.handle)}.json) — manifest with ${f.fieldCount} field${f.fieldCount === 1 ? "" : "s"}`,
        )
        .join("\n")
    : "_(no forms published yet — check back via the catalog URL above)_";

  const body = `# ${siteTitle}

> ${siteTagline ?? "An EmDash-powered site with AI-agent-callable forms."}

This site is built on EmDash and exposes two ways for AI agents to drive form submissions.

## Path A — Prefilled link (recommended, no install)

Compose a deep link that lands the user on the form with values already filled in. The user reviews and clicks Submit. Works from any chat client that can render a clickable URL.

1. GET the catalog at ${origin}/.well-known/freeform.json to find the form by id or title.
2. GET that form's manifest at ${origin}/.well-known/freeform/{handle}.json and read its \`prefill\` block.
3. Compose a URL by appending field values as query string params to \`prefill.page_url\` (e.g. \`${origin}/forms/contact?first_name=Mitchell&email=foo%40bar.com\`).
4. Give that URL to the user as a clickable link. Do NOT GET or POST it yourself — the user clicks, reviews the form, and presses Submit.

Encoding rules are documented in each manifest's \`prefill.notes\`. Unknown params and invalid option values are dropped silently by the renderer.

## Path B — Direct POST (requires JSON capability)

If your client can issue arbitrary HTTP requests, submit the form directly without user interaction.

1. GET the catalog above to find the form by id or title.
2. GET that form's manifest URL to read its \`request_schema\`.
3. POST JSON matching the schema to the manifest's \`endpoint.url\`. Use \`Content-Type: application/json\`. No CSRF token or honeypot fields are required on the agent endpoint.

The response shape is \`{ success: boolean, message?: string, error?: string }\`.

## Forms available

${formLines}

## Other resources

- [Homepage](${origin}/)
- [Admin](${origin}/_emdash/admin) (human users only)
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=60",
    },
  });
};
