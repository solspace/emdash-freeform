export type FreeformSection = "forms" | "submissions" | "settings";

export type FreeformSettingsSection =
  | "email"
  | "templates"
  | "webhooks"
  | "ai";

const PLUGIN_BASE = "/_emdash/admin/plugins/freeform";

export const SETTINGS_HUB_PATH = `${PLUGIN_BASE}/settings`;

export function settingsSectionPath(section: FreeformSettingsSection): string {
  return `${SETTINGS_HUB_PATH}/${section}`;
}

/** Match Kumo `Tabs variant="underline"` list + trigger spacing (Content List All/Trash). */
export const FF_UNDERLINE_TABLIST =
  "relative flex min-w-0 shrink items-stretch gap-4 border-b border-kumo-hairline";

export function ffUnderlineTabClass(active: boolean): string {
  return [
    // No radius — underline tabs are flush; bottom border spans the full trigger.
    "relative inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-2 py-3 text-base transition-colors cursor-pointer",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-kumo-brand focus-visible:ring-offset-0",
    active
      ? "border-kumo-brand font-medium text-kumo-default"
      : "border-transparent text-kumo-subtle hover:text-kumo-default hover:border-kumo-line",
  ].join(" ");
}

export function sectionPath(section: FreeformSection): string {
  return `${PLUGIN_BASE}/${section}`;
}

export function goToSection(section: FreeformSection, hash?: string) {
  if (typeof window === "undefined") return;
  // Legacy hash deep-links → dedicated settings sub-pages.
  if (section === "settings" && hash) {
    const raw = hash.replace(/^#/, "").toLowerCase();
    const mapped: Record<string, FreeformSettingsSection> = {
      email: "email",
      templates: "templates",
      notifications: "templates",
      webhooks: "webhooks",
      ai: "ai",
    };
    const sub = mapped[raw];
    window.location.assign(sub ? settingsSectionPath(sub) : SETTINGS_HUB_PATH);
    return;
  }
  const path = sectionPath(section);
  const next = hash ? `${path}#${hash.replace(/^#/, "")}` : path;
  if (window.location.pathname + window.location.hash === next) return;
  if (window.location.pathname === path && hash) {
    window.location.hash = hash.replace(/^#/, "");
    return;
  }
  window.location.assign(next);
}

export function goToSettingsSection(section: FreeformSettingsSection) {
  if (typeof window === "undefined") return;
  window.location.assign(settingsSectionPath(section));
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
