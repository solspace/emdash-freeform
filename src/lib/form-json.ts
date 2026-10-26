import type { FieldType, FormField, FormRow, StoredForm } from "../types";
import { ALL_FIELD_TYPES } from "../constants";
import { toHandle, uid } from "./handles";
import { cloneRowsWithNewIds } from "./field-ops";

const FIELD_TYPE_SET = new Set<string>(ALL_FIELD_TYPES);

export interface FormExportPayload {
  version: 1;
  name: string;
  handle: string;
  successMessage: string;
  cardIcon?: string;
  rows: FormRow[];
}

export function exportFormJson(form: StoredForm): string {
  const payload: FormExportPayload = {
    version: 1,
    name: form.name,
    handle: form.handle,
    successMessage: form.successMessage,
    ...(form.cardIcon ? { cardIcon: form.cardIcon } : {}),
    rows: form.rows,
  };
  return JSON.stringify(payload, null, 2);
}

export type ImportFormResult =
  | { ok: true; form: Omit<StoredForm, "createdAt" | "updatedAt"> }
  | { ok: false; message: string };

function normalizeField(raw: unknown, indexHint: string): FormField | string {
  if (!raw || typeof raw !== "object") return `Field ${indexHint} is invalid.`;
  const f = raw as Record<string, unknown>;
  const type = String(f.type ?? "");
  if (!FIELD_TYPE_SET.has(type)) {
    return `Field ${indexHint}: unknown type "${type}".`;
  }
  const label = String(f.label ?? "").trim() || "Untitled";
  const handle = String(f.handle ?? "").trim() || toHandle(label);
  const field: FormField = {
    id: uid(),
    type: type as FieldType,
    label,
    handle,
    required: Boolean(f.required),
  };
  if (Array.isArray(f.options)) {
    field.options = f.options
      .filter((o): o is { value: string; label: string } =>
        Boolean(o && typeof o === "object" && "value" in o && "label" in o),
      )
      .map((o) => ({ value: String(o.value), label: String(o.label) }));
  }
  if (typeof f.placeholder === "string") field.placeholder = f.placeholder;
  if (typeof f.defaultValue === "string" || Array.isArray(f.defaultValue)) {
    field.defaultValue = f.defaultValue as string | string[];
  }
  if (typeof f.minLength === "number") field.minLength = f.minLength;
  if (typeof f.maxLength === "number") field.maxLength = f.maxLength;
  if (typeof f.pattern === "string") field.pattern = f.pattern;
  if (typeof f.patternError === "string") field.patternError = f.patternError;
  if (typeof f.min === "number" || typeof f.min === "string") field.min = f.min;
  if (typeof f.max === "number" || typeof f.max === "string") field.max = f.max;
  return field;
}

/** Parse exported (or hand-written) form JSON into a form body with fresh ids. */
export function importFormJson(raw: string): ImportFormResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: "Invalid JSON." };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, message: "JSON must be an object." };
  }
  const obj = parsed as Record<string, unknown>;
  const name = String(obj.name ?? "").trim();
  if (!name) return { ok: false, message: "Form name is required." };

  const handleRaw = String(obj.handle ?? "").trim();
  const successMessage =
    String(obj.successMessage ?? "").trim() || "Thank you for your submission!";
  const cardIcon =
    typeof obj.cardIcon === "string" && obj.cardIcon.trim()
      ? obj.cardIcon.trim()
      : undefined;

  if (!Array.isArray(obj.rows)) {
    return { ok: false, message: "Missing rows array." };
  }

  const rows: FormRow[] = [];
  for (let ri = 0; ri < obj.rows.length; ri++) {
    const rowRaw = obj.rows[ri];
    if (!rowRaw || typeof rowRaw !== "object") {
      return { ok: false, message: `Row ${ri + 1} is invalid.` };
    }
    const fieldsRaw = (rowRaw as { fields?: unknown }).fields;
    if (!Array.isArray(fieldsRaw) || fieldsRaw.length === 0) {
      return { ok: false, message: `Row ${ri + 1} needs at least one field.` };
    }
    const fields: FormField[] = [];
    for (let fi = 0; fi < fieldsRaw.length; fi++) {
      const result = normalizeField(fieldsRaw[fi], `${ri + 1}.${fi + 1}`);
      if (typeof result === "string") return { ok: false, message: result };
      fields.push(result);
    }
    rows.push({ id: uid(), fields });
  }

  // Ensure unique handles within the imported form.
  const seen = new Set<string>();
  for (const row of rows) {
    for (const f of row.fields) {
      let h = f.handle;
      if (seen.has(h)) {
        let n = 2;
        while (seen.has(`${f.handle}_${n}`)) n += 1;
        h = `${f.handle}_${n}`;
        f.handle = h;
      }
      seen.add(h);
    }
  }

  return {
    ok: true,
    form: {
      name,
      handle: handleRaw || toHandle(name),
      successMessage,
      rows,
      ...(cardIcon ? { cardIcon } : {}),
    },
  };
}

/** Duplicate a stored form body with new row/field ids (caller sets name/handle). */
export function duplicateFormData(
  form: StoredForm,
  opts: { name: string; handle: string },
): StoredForm {
  const now = new Date().toISOString();
  return {
    ...form,
    name: opts.name,
    handle: opts.handle,
    rows: cloneRowsWithNewIds(form.rows),
    createdAt: now,
    updatedAt: now,
  };
}
