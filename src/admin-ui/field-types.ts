import type { FieldType } from "../types";
import { FIELD_TYPE_GROUPS } from "../constants";

export const PALETTE_GROUPS = FIELD_TYPE_GROUPS.map((g) => ({
  group: g.group,
  types: g.types.map((type) => ({
    type,
    label: type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  })),
}));

export function defaultFieldLabel(type: FieldType): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

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
