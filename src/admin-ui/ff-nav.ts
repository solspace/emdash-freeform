export type FreeformSection = "forms" | "submissions" | "settings";

export const FREEFORM_NAV: Array<{ id: FreeformSection; label: string }> = [
  { id: "forms", label: "Forms" },
  { id: "submissions", label: "Submissions" },
  { id: "settings", label: "Settings" },
];

const PLUGIN_BASE = "/_emdash/admin/plugins/freeform";

export function sectionPath(section: FreeformSection): string {
  return `${PLUGIN_BASE}/${section}`;
}

export function goToSection(section: FreeformSection, hash?: string) {
  if (typeof window === "undefined") return;
  const path = sectionPath(section);
  const next = hash ? `${path}#${hash.replace(/^#/, "")}` : path;
  if (window.location.pathname + window.location.hash === next) return;
  // Same path, different hash — replace so Settings can switch tabs without a full reload.
  if (window.location.pathname === path && hash) {
    window.location.hash = hash.replace(/^#/, "");
    return;
  }
  window.location.assign(next);
}

/** Preset swatches for form card color. */
export const FORM_COLOR_PRESETS = [
  "#006ff7",
  "#058ffe",
  "#8b5cf6",
  "#ea580c",
  "#db2777",
  "#0891b2",
  "#ca8a04",
  "#4f46e5",
  "#16a34a",
  "#dc2626",
] as const;

/** Stable accent color for Craft-like form cards. */
export function formAccent(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return FORM_COLOR_PRESETS[h % FORM_COLOR_PRESETS.length]!;
}

/** Resolve card accent — stored color wins, else hash from handle/id. */
export function resolveFormColor(form: {
  cardColor?: string;
  handle?: string;
  id: string;
}): string {
  const c = form.cardColor?.trim();
  if (c && /^#[0-9a-fA-F]{6}$/.test(c)) return c.toLowerCase();
  return formAccent(form.handle || form.id);
}

export function goToFormSubmissions(formId: string) {
  if (typeof window === "undefined") return;
  window.location.assign(
    `${sectionPath("submissions")}?formId=${encodeURIComponent(formId)}`,
  );
}
