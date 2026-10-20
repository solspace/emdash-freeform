import { toHandle } from "./handles";
import {
  MULTI_FIELD_TYPES,
  OPTION_FIELD_TYPES,
  type FieldOption,
  type FieldType,
  type FormField,
  type StoredForm,
} from "../types";

export function isOptionType(type: FieldType): boolean {
  return (OPTION_FIELD_TYPES as readonly FieldType[]).includes(type);
}

export function isMultiType(type: FieldType): boolean {
  return (MULTI_FIELD_TYPES as readonly FieldType[]).includes(type);
}

// Parses the Block Kit admin "options" input: a single line of comma-separated
// `value:label` pairs. A token without `:` is treated as the label, and value
// is auto-derived via the snake_case handle rule.
//
//   "us: United States, ca: Canada, Maybe"
//   →  [{value:"us", label:"United States"},
//       {value:"ca", label:"Canada"},
//       {value:"maybe", label:"Maybe"}]
//
// Empty tokens are dropped. Duplicate values are dropped (first wins).
export function parseOptionsInput(input: string): FieldOption[] {
  const seen = new Set<string>();
  const out: FieldOption[] = [];
  for (const raw of input.split(",")) {
    const token = raw.trim();
    if (!token) continue;
    const colonAt = token.indexOf(":");
    let value: string;
    let label: string;
    if (colonAt === -1) {
      label = token;
      value = toHandle(label);
    } else {
      value = token.slice(0, colonAt).trim();
      label = token.slice(colonAt + 1).trim();
      if (!value) value = toHandle(label);
      if (!label) label = value;
    }
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push({ value, label });
  }
  return out;
}

// Inverse: render an existing options[] back into the Block Kit input format.
export function formatOptionsForInput(options: FieldOption[]): string {
  return options.map((o) => `${o.value}: ${o.label}`).join(", ");
}

// Resolves stored submission values to their human-readable labels using the
// form definition. Used for email notifications and any other display surface.
// Falls back to the raw value if no matching option is found.
export function resolveOptionLabels(
  form: StoredForm,
  handle: string,
  value: string | string[],
): string {
  const field = findField(form, handle);
  if (!field?.options?.length) {
    return Array.isArray(value) ? value.join(", ") : value;
  }
  const labelByValue = new Map(field.options.map((o) => [o.value, o.label] as const));
  const lookup = (v: string) => labelByValue.get(v) ?? v;
  return Array.isArray(value) ? value.map(lookup).join(", ") : lookup(value);
}

function findField(form: StoredForm, handle: string): FormField | undefined {
  for (const row of form.rows) {
    for (const field of row.fields) {
      if (field.handle === handle) return field;
    }
  }
  return undefined;
}
