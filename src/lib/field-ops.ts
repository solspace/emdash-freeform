import type { PluginContext } from "emdash";
import type { FormField, FormRow } from "../types";
import { toHandle, uid } from "./handles";

export function removeField(rows: FormRow[], fieldId: string): FormRow[] {
  return rows
    .map((r) => ({ ...r, fields: r.fields.filter((f) => f.id !== fieldId) }))
    .filter((r) => r.fields.length > 0);
}

export async function deleteFormAndSubmissions(
  ctx: PluginContext,
  formId: string,
): Promise<void> {
  await ctx.storage.forms.delete(formId);
  const { items } = await ctx.storage.submissions.query({
    where: { formId },
    limit: 1000,
  });
  for (const s of items as Array<{ id: string }>) {
    await ctx.storage.submissions.delete(s.id);
  }
}

function allHandles(rows: FormRow[]): Set<string> {
  return new Set(rows.flatMap((r) => r.fields.map((f) => f.handle)));
}

/** Unique handle among existing fields, preferring `base` then `base_2`, … */
export function uniqueFieldHandle(rows: FormRow[], base: string): string {
  const taken = allHandles(rows);
  const stem = toHandle(base) || "field";
  if (!taken.has(stem)) return stem;
  let n = 2;
  while (taken.has(`${stem}_${n}`)) n += 1;
  return `${stem}_${n}`;
}

function findFieldLocation(
  rows: FormRow[],
  fieldId: string,
): { rowIndex: number; fieldIndex: number } | null {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const fieldIndex = rows[rowIndex].fields.findIndex((f) => f.id === fieldId);
    if (fieldIndex >= 0) return { rowIndex, fieldIndex };
  }
  return null;
}

/** Flattened field order index (0-based), or -1 if missing. */
export function flatFieldIndex(rows: FormRow[], fieldId: string): number {
  let i = 0;
  for (const row of rows) {
    for (const f of row.fields) {
      if (f.id === fieldId) return i;
      i += 1;
    }
  }
  return -1;
}

export function totalFieldCount(rows: FormRow[]): number {
  return rows.reduce((n, r) => n + r.fields.length, 0);
}

/**
 * Move a field one step in display order. Within a row, swaps neighbors;
 * at a row edge, moves into the adjacent row.
 */
export function moveField(
  rows: FormRow[],
  fieldId: string,
  direction: "up" | "down",
): FormRow[] | null {
  const loc = findFieldLocation(rows, fieldId);
  if (!loc) return null;

  const { rowIndex, fieldIndex } = loc;
  const next = rows.map((r) => ({ ...r, fields: [...r.fields] }));

  if (direction === "up") {
    if (fieldIndex > 0) {
      const fields = next[rowIndex].fields;
      [fields[fieldIndex - 1], fields[fieldIndex]] = [
        fields[fieldIndex],
        fields[fieldIndex - 1],
      ];
      return next;
    }
    if (rowIndex === 0) return null;
    const [moved] = next[rowIndex].fields.splice(fieldIndex, 1);
    next[rowIndex - 1].fields.push(moved);
    return next.filter((r) => r.fields.length > 0);
  }

  if (fieldIndex < next[rowIndex].fields.length - 1) {
    const fields = next[rowIndex].fields;
    [fields[fieldIndex], fields[fieldIndex + 1]] = [
      fields[fieldIndex + 1],
      fields[fieldIndex],
    ];
    return next;
  }
  if (rowIndex === next.length - 1) return null;
  const [moved] = next[rowIndex].fields.splice(fieldIndex, 1);
  next[rowIndex + 1].fields.unshift(moved);
  return next.filter((r) => r.fields.length > 0);
}

export function duplicateField(rows: FormRow[], fieldId: string): FormRow[] | null {
  const loc = findFieldLocation(rows, fieldId);
  if (!loc) return null;

  const source = rows[loc.rowIndex].fields[loc.fieldIndex];
  const copy: FormField = {
    ...structuredClone(source),
    id: uid(),
    handle: uniqueFieldHandle(rows, `${source.handle}_copy`),
    label: `${source.label} (copy)`,
  };

  return rows.map((r, i) => {
    if (i !== loc.rowIndex) return r;
    const fields = [...r.fields];
    fields.splice(loc.fieldIndex + 1, 0, copy);
    return { ...r, fields };
  });
}

export function duplicateRow(rows: FormRow[], rowId: string): FormRow[] | null {
  const idx = rows.findIndex((r) => r.id === rowId);
  if (idx < 0) return null;

  const taken = allHandles(rows);
  const alloc = (base: string): string => {
    const stem = toHandle(base) || "field";
    if (!taken.has(stem)) {
      taken.add(stem);
      return stem;
    }
    let n = 2;
    while (taken.has(`${stem}_${n}`)) n += 1;
    const handle = `${stem}_${n}`;
    taken.add(handle);
    return handle;
  };

  const newRow: FormRow = {
    id: uid(),
    fields: rows[idx].fields.map((f) => ({
      ...structuredClone(f),
      id: uid(),
      handle: alloc(`${f.handle}_copy`),
      label: `${f.label} (copy)`,
    })),
  };

  const next = [...rows];
  next.splice(idx + 1, 0, newRow);
  return next;
}

export function deleteRow(rows: FormRow[], rowId: string): FormRow[] | null {
  if (!rows.some((r) => r.id === rowId)) return null;
  return rows.filter((r) => r.id !== rowId);
}

/** Deep-clone form rows with fresh ids (for duplicate form / templates). */
export function cloneRowsWithNewIds(rows: FormRow[]): FormRow[] {
  return rows.map((r) => ({
    id: uid(),
    fields: r.fields.map((f) => ({
      ...structuredClone(f),
      id: uid(),
    })),
  }));
}
