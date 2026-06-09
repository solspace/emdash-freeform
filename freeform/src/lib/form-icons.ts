/** Stored on {@link StoredForm.cardIcon}. `auto` infers from name, handle, and fields. */
export type FormCardIconId =
  | "auto"
  | "clipboard"
  | "email"
  | "phone"
  | "mobile"
  | "calendar"
  | "newsletter"
  | "support"
  | "survey"
  | "cart"
  | "briefcase"
  | "ticket"
  | "note";

export const FORM_CARD_ICON_OPTIONS: Array<{ value: FormCardIconId; label: string }> = [
  { value: "auto", label: "Auto (from name & fields)" },
  { value: "clipboard", label: "📋 General" },
  { value: "email", label: "✉️ Contact / email" },
  { value: "phone", label: "📞 Phone" },
  { value: "mobile", label: "📱 Email & phone" },
  { value: "calendar", label: "📅 Calendar / booking" },
  { value: "newsletter", label: "📰 Newsletter" },
  { value: "support", label: "🎧 Support" },
  { value: "survey", label: "📊 Survey / feedback" },
  { value: "cart", label: "🛒 Orders / checkout" },
  { value: "briefcase", label: "💼 Jobs / applications" },
  { value: "ticket", label: "🎟️ Events / RSVP" },
  { value: "note", label: "📝 Long form" },
];

const GLYPH_BY_ID: Record<Exclude<FormCardIconId, "auto">, string> = {
  clipboard: "📋",
  email: "✉️",
  phone: "📞",
  mobile: "📱",
  calendar: "📅",
  newsletter: "📰",
  support: "🎧",
  survey: "📊",
  cart: "🛒",
  briefcase: "💼",
  ticket: "🎟️",
  note: "📝",
};

const VALID_ICON_IDS = new Set(FORM_CARD_ICON_OPTIONS.map((o) => o.value));

export function isFormCardIconId(value: string): value is FormCardIconId {
  return VALID_ICON_IDS.has(value as FormCardIconId);
}

type IconInferInput = {
  name: string;
  handle: string;
  rows: { fields: { type: string }[] }[];
  /** Extra text (e.g. AI create prompt) to match keywords against. */
  hint?: string;
};

/** Pick a list icon id from name, handle, fields, and optional hint text. */
export function inferFormCardIconId(
  form: IconInferInput,
): Exclude<FormCardIconId, "auto"> {
  const hay = `${form.handle} ${form.name} ${form.hint ?? ""}`.toLowerCase();

  if (/\b(contact|inquiry|enquir|reach out|get in touch)\b/.test(hay)) return "email";
  if (/\b(newsletter|subscribe|signup|sign-up|mailing)\b/.test(hay)) return "newsletter";
  if (/\b(demo|trial|book|schedule|appointment)\b/.test(hay)) return "calendar";
  if (/\b(support|help|assist)\b/.test(hay)) return "support";
  if (/\b(apply|job|career|hiring|resume)\b/.test(hay)) return "briefcase";
  if (/\b(feedback|survey|nps|rate|rating)\b/.test(hay)) return "survey";
  if (/\b(order|checkout|payment|quote)\b/.test(hay)) return "cart";
  if (/\b(register|registration|rsvp|event)\b/.test(hay)) return "ticket";

  const types = new Set(form.rows.flatMap((r) => r.fields.map((f) => f.type)));
  if (types.has("phone") && types.has("email")) return "mobile";
  if (types.has("phone")) return "phone";
  if (types.has("email")) return "email";
  if (types.has("date")) return "calendar";
  if (types.has("textarea")) return "note";

  return "clipboard";
}

export function resolveFormCardGlyph(form: IconInferInput & { cardIcon?: string }): string {
  const id = form.cardIcon ?? "auto";
  if (id !== "auto" && isFormCardIconId(id) && id in GLYPH_BY_ID) {
    return GLYPH_BY_ID[id as Exclude<FormCardIconId, "auto">];
  }
  return GLYPH_BY_ID[inferFormCardIconId(form)];
}
