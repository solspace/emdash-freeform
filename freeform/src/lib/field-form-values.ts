import type { FieldType, FormField, FormRow } from "../types";
import { toHandle, uid } from "./handles";
import { isMultiType, isOptionType, parseOptionsInput } from "./options";

export interface FieldFormValues {
  field_type?: string;
  field_label?: string;
  field_handle?: string;
  field_options?: string;
  field_default?: string;
  field_required?: boolean;
  field_min_length?: string;
  field_max_length?: string;
  field_pattern?: string;
  field_pattern_error?: string;
  field_min?: string;
  field_max?: string;
  field_row?: string;
}

export type ParseFieldResult =
  | { ok: true; field: FormField; rowTarget: string }
  | { ok: false; message: string };

function parseValidation(values: FieldFormValues) {
  const minLengthRaw = (values.field_min_length ?? "").trim();
  const maxLengthRaw = (values.field_max_length ?? "").trim();
  const patternRaw = (values.field_pattern ?? "").trim();
  const patternErrorRaw = (values.field_pattern_error ?? "").trim();
  const minRaw = (values.field_min ?? "").trim();
  const maxRaw = (values.field_max ?? "").trim();
  return {
    minLength:
      minLengthRaw && Number.isFinite(Number(minLengthRaw))
        ? Number(minLengthRaw)
        : undefined,
    maxLength:
      maxLengthRaw && Number.isFinite(Number(maxLengthRaw))
        ? Number(maxLengthRaw)
        : undefined,
    pattern: patternRaw || undefined,
    patternError: patternErrorRaw || undefined,
    min: minRaw || undefined,
    max: maxRaw || undefined,
  };
}

export function parseFieldFromValues(
  values: FieldFormValues,
  opts: { existingId?: string } = {},
): ParseFieldResult {
  const fieldType = ((values.field_type as string) ?? "text") as FieldType;

  const label = (values.field_label ?? "").trim() || "New Field";
  const handle = (values.field_handle ?? "").trim() || toHandle(label);
  const required = values.field_required ?? false;
  const rowTarget = values.field_row ?? "new";
  const validation = parseValidation(values);

  const options = isOptionType(fieldType)
    ? parseOptionsInput(values.field_options ?? "")
    : undefined;
  if (isOptionType(fieldType) && (!options || options.length < 2)) {
    return {
      ok: false,
      message:
        "This field type needs at least two options. Use `value: Label, value: Label`.",
    };
  }

  const defaultRaw = (values.field_default ?? "").trim();
  let defaultValue: string | string[] | undefined;
  if (defaultRaw) {
    if (isMultiType(fieldType)) {
      defaultValue = defaultRaw
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      if (defaultValue.length === 0) defaultValue = undefined;
    } else {
      defaultValue = defaultRaw;
    }
    if (options && defaultValue !== undefined) {
      const valid = new Set(options.map((o) => o.value));
      const check = Array.isArray(defaultValue) ? defaultValue : [defaultValue];
      const bad = check.find((v) => !valid.has(v));
      if (bad) {
        return {
          ok: false,
          message: `Default value "${bad}" is not in the options list.`,
        };
      }
    }
  }

  const field: FormField = {
    id: opts.existingId ?? uid(),
    type: fieldType,
    label,
    handle,
    required,
    ...(options ? { options } : {}),
    ...(defaultValue !== undefined ? { defaultValue } : {}),
    ...validation,
  };

  return { ok: true, field, rowTarget };
}

export function applyNewFieldToRows(
  rows: FormRow[],
  field: FormField,
  rowTarget: string,
): FormRow[] {
  let next = [...rows];
  if (rowTarget === "new" || next.length === 0) {
    next.push({ id: uid(), fields: [field] });
  } else {
    next = next.map((r) =>
      r.id === rowTarget ? { ...r, fields: [...r.fields, field] } : r,
    );
  }
  return next;
}

export function updateFieldInRows(
  rows: FormRow[],
  fieldId: string,
  field: FormField,
): FormRow[] {
  return rows.map((r) => ({
    ...r,
    fields: r.fields.map((f) => (f.id === fieldId ? { ...field, id: fieldId } : f)),
  }));
}
