import type { FieldType } from "../types";
import { FIELD_TYPE_GROUPS } from "../constants";

export const FIELD_LABELS: Record<FieldType, string> = {
  text: "Text",
  email: "Email",
  textarea: "Textarea",
  number: "Number",
  phone: "Phone",
  date: "Date",
  datetime: "Date & Time",
  checkbox: "Checkbox",
  checkbox_group: "Checkboxes",
  radio: "Radios",
  select: "Dropdown",
  multi_select: "Multi-Select",
  rating: "Rating",
  file: "File Upload",
  consent: "Consent",
  hidden: "Hidden",
  html: "HTML",
};

export function defaultFieldLabel(type: FieldType): string {
  return FIELD_LABELS[type] ?? type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const PALETTE_GROUPS = FIELD_TYPE_GROUPS.map((g) => ({
  group: g.group,
  types: g.types.map((type) => ({
    type,
    label: defaultFieldLabel(type),
  })),
}));

export function needsOptions(type: FieldType): boolean {
  return (
    type === "radio" ||
    type === "select" ||
    type === "multi_select" ||
    type === "checkbox_group"
  );
}

export function defaultOptions(type: FieldType) {
  if (!needsOptions(type)) return undefined;
  return [
    { value: "option_a", label: "Option A" },
    { value: "option_b", label: "Option B" },
  ];
}
