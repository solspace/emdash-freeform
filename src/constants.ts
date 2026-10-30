import type { FieldType } from "./types";

export const ALL_FIELD_TYPES: FieldType[] = [
  "text",
  "email",
  "textarea",
  "number",
  "phone",
  "checkbox",
  "checkbox_group",
  "radio",
  "select",
  "multi_select",
  "date",
  "datetime",
  "file",
  "rating",
  "hidden",
  "html",
  "consent",
];

/** Grouped labels for the add-field palette (Block Kit select has no optgroups). */
export const FIELD_TYPE_GROUPS: Array<{
  group: string;
  types: FieldType[];
}> = [
  {
    group: "Basic",
    types: ["text", "email", "textarea", "number", "phone", "date", "datetime"],
  },
  {
    group: "Choice",
    types: ["checkbox", "checkbox_group", "radio", "select", "multi_select", "rating"],
  },
  {
    group: "Privacy",
    types: ["consent"],
  },
  {
    group: "Advanced",
    types: ["file", "hidden", "html"],
  },
];

export function fieldTypeSelectOptions(): Array<{ label: string; value: string }> {
  return FIELD_TYPE_GROUPS.flatMap(({ group, types }) =>
    types.map((t) => ({
      value: t,
      label: `${group} · ${t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}`,
    })),
  );
}

// Field types that accept per-field length/pattern validation.
export const TEXT_VALIDATION_TYPES: FieldType[] = [
  "text", "email", "textarea", "phone",
];

// Field types that accept min/max value validation.
export const RANGE_VALIDATION_TYPES: FieldType[] = ["number", "date", "datetime", "rating"];

// Double-underscore prefix avoids collisions with user-defined handles,
// which are snake_case derived from labels and cannot contain "__".
export const HONEYPOT_FIELD = "__ff_hp_url";
export const CSRF_FIELD = "__ff_csrf";
export const CSRF_MAX_AGE_MS = 2 * 60 * 60 * 1000;

export const DEFAULT_SPAM_THRESHOLD = 7;

// Backstops against the AI form-builder going off the rails.
export const MAX_NEW_FIELDS_PER_GENERATION = 15;
export const MAX_TOTAL_FIELDS_PER_FORM = 50;
