export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Tiny Mustache subset: `{{variable}}` / `{{ variable }}` substitution.
 * No loops, conditionals, or dotted paths. HTML-escape is opt-in per call.
 *
 * Prefer compact tags (`{{form_name}}`) in stored templates — see
 * {@link normalizeMustacheTags}.
 */
export function renderMustache(
  template: string,
  vars: Record<string, string>,
  options: { escape: boolean },
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    const val = vars[key];
    if (val === undefined) return "";
    return options.escape ? escapeHtml(val) : val;
  });
}

/** Collapse `{{ form_name }}` → `{{form_name}}` so tags match docs and Craft style. */
export function normalizeMustacheTags(template: string): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, "{{$1}}");
}

// Crude HTML → text fallback for deriving a `text` part from an HTML body.
// Good enough for typical transactional emails.
export function stripHtml(s: string): string {
  return s
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
