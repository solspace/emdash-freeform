import type { FieldType, FormField, FormRow } from "../types";
import { defaultFieldLabel, defaultOptions } from "./field-types";

export function clientUid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  }
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

export function toHandle(label: string): string {
  return (
    label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") || "field"
  );
}

function uniqueHandle(rows: FormRow[], base: string): string {
  const taken = new Set(rows.flatMap((r) => r.fields.map((f) => f.handle)));
  const stem = toHandle(base) || "field";
  if (!taken.has(stem)) return stem;
  let n = 2;
  while (taken.has(`${stem}_${n}`)) n += 1;
  return `${stem}_${n}`;
}

export function createField(type: FieldType, rows: FormRow[]): FormField {
  if (type === "consent") {
    return {
      id: clientUid(),
      type: "consent",
      label: "I agree to the privacy policy",
      handle: uniqueHandle(rows, "consent"),
      required: true,
    };
  }
  const label = defaultFieldLabel(type);
  return {
    id: clientUid(),
    type,
    label,
    handle: uniqueHandle(rows, label),
    required: false,
    ...(defaultOptions(type) ? { options: defaultOptions(type) } : {}),
  };
}

export function findField(
  rows: FormRow[],
  fieldId: string,
): { rowIndex: number; fieldIndex: number; field: FormField } | null {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const fieldIndex = rows[rowIndex].fields.findIndex((f) => f.id === fieldId);
    if (fieldIndex >= 0) {
      return { rowIndex, fieldIndex, field: rows[rowIndex].fields[fieldIndex] };
    }
  }
  return null;
}

export function updateField(
  rows: FormRow[],
  fieldId: string,
  patch: Partial<FormField>,
): FormRow[] {
  return rows.map((row) => ({
    ...row,
    fields: row.fields.map((f) => (f.id === fieldId ? { ...f, ...patch, id: f.id } : f)),
  }));
}

export function removeField(rows: FormRow[], fieldId: string): FormRow[] {
  return rows
    .map((r) => ({ ...r, fields: r.fields.filter((f) => f.id !== fieldId) }))
    .filter((r) => r.fields.length > 0);
}

export function removeRow(rows: FormRow[], rowId: string): FormRow[] {
  return rows.filter((r) => r.id !== rowId);
}

export function duplicateField(rows: FormRow[], fieldId: string): FormRow[] {
  const loc = findField(rows, fieldId);
  if (!loc) return rows;
  const copy: FormField = {
    ...structuredClone(loc.field),
    id: clientUid(),
    handle: uniqueHandle(rows, `${loc.field.handle}_copy`),
    label: `${loc.field.label} (copy)`,
  };
  return rows.map((r, i) => {
    if (i !== loc.rowIndex) return r;
    const fields = [...r.fields];
    fields.splice(loc.fieldIndex + 1, 0, copy);
    return { ...r, fields };
  });
}

/** Insert a new field type as its own row at the end (or after rowIndex). */
export function appendFieldAsRow(
  rows: FormRow[],
  type: FieldType,
  afterRowIndex?: number,
): { rows: FormRow[]; fieldId: string } {
  const field = createField(type, rows);
  const row: FormRow = { id: clientUid(), fields: [field] };
  const next = [...rows];
  const at =
    afterRowIndex == null || afterRowIndex < 0
      ? next.length
      : Math.min(afterRowIndex + 1, next.length);
  next.splice(at, 0, row);
  return { rows: next, fieldId: field.id };
}

/** Insert a new field into an existing row at fieldIndex. */
export function insertFieldInRow(
  rows: FormRow[],
  type: FieldType,
  rowIndex: number,
  fieldIndex: number,
): { rows: FormRow[]; fieldId: string } {
  const field = createField(type, rows);
  const next = rows.map((r, i) => {
    if (i !== rowIndex) return r;
    const fields = [...r.fields];
    fields.splice(fieldIndex, 0, field);
    return { ...r, fields };
  });
  return { rows: next, fieldId: field.id };
}

/**
 * Move an existing field to a target row/index. Removes from source first.
 */
export function moveFieldTo(
  rows: FormRow[],
  fieldId: string,
  targetRowIndex: number,
  targetFieldIndex: number,
): FormRow[] {
  const loc = findField(rows, fieldId);
  if (!loc) return rows;

  let next = rows.map((r) => ({ ...r, fields: [...r.fields] }));
  const [moved] = next[loc.rowIndex].fields.splice(loc.fieldIndex, 1);

  let destRow = targetRowIndex;
  let destIndex = targetFieldIndex;

  // Adjust destination if we removed from an earlier position in the same row.
  if (loc.rowIndex === destRow && loc.fieldIndex < destIndex) {
    destIndex -= 1;
  }
  // If source row emptied and was before dest, dest row index shifts.
  if (next[loc.rowIndex].fields.length === 0 && loc.rowIndex < destRow) {
    destRow -= 1;
  }

  next = next.filter((r) => r.fields.length > 0);
  if (destRow < 0) destRow = 0;
  if (destRow >= next.length) {
    next.push({ id: clientUid(), fields: [moved] });
    return next;
  }
  next[destRow].fields.splice(Math.max(0, destIndex), 0, moved);
  return next;
}

/** Insert a new field from the palette as its own row at `atRowIndex`. */
export function insertFieldAsNewRow(
  rows: FormRow[],
  type: FieldType,
  atRowIndex: number,
): { rows: FormRow[]; fieldId: string } {
  const field = createField(type, rows);
  const newRow: FormRow = { id: clientUid(), fields: [field] };
  const next = [...rows];
  const clampedIndex = Math.max(0, Math.min(atRowIndex, next.length));
  next.splice(clampedIndex, 0, newRow);
  return { rows: next, fieldId: field.id };
}

/**
 * Move an existing field into its own new row at `atRowIndex`.
 * If the field was the only one in its row, the old row is removed.
 */
export function moveFieldToNewRow(
  rows: FormRow[],
  fieldId: string,
  atRowIndex: number,
): FormRow[] {
  const loc = findField(rows, fieldId);
  if (!loc) return rows;

  let next = rows.map((r) => ({ ...r, fields: [...r.fields] }));
  const [moved] = next[loc.rowIndex].fields.splice(loc.fieldIndex, 1);

  const sourceRowEmptied = next[loc.rowIndex].fields.length === 0;
  let targetIndex = atRowIndex;
  if (sourceRowEmptied && loc.rowIndex < targetIndex) {
    targetIndex -= 1;
  }

  next = next.filter((r) => r.fields.length > 0);

  if (sourceRowEmptied && targetIndex === loc.rowIndex) {
    const newRow: FormRow = { id: rows[loc.rowIndex].id, fields: [moved] };
    next.splice(loc.rowIndex, 0, newRow);
    return next;
  }

  const newRow: FormRow = { id: clientUid(), fields: [moved] };
  const clampedIndex = Math.max(0, Math.min(targetIndex, next.length));
  next.splice(clampedIndex, 0, newRow);
  return next;
}

/** Drop onto canvas bottom → new row at end. */
export function moveFieldToNewRowAtEnd(rows: FormRow[], fieldId: string): FormRow[] {
  return moveFieldToNewRow(rows, fieldId, rows.length);
}
