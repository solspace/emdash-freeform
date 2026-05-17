import type { PluginContext } from "emdash";
import { toHandle } from "./handles";
import type { StoredForm } from "../types";

const HANDLE_RE = /^[a-z][a-z0-9_]*$/;

export function isValidFormHandle(handle: string): boolean {
  return HANDLE_RE.test(handle);
}

// Build the lowercase snake_case base from a free-form name, then suffix with
// _2, _3, ... if the base collides with an existing handle.
export async function deriveUniqueFormHandle(
  ctx: PluginContext,
  name: string,
  excludeFormId?: string,
): Promise<string> {
  const base = toHandle(name);
  return ensureUniqueFormHandle(ctx, base, excludeFormId);
}

export async function ensureUniqueFormHandle(
  ctx: PluginContext,
  candidate: string,
  excludeFormId?: string,
): Promise<string> {
  const taken = await collectHandles(ctx, excludeFormId);
  if (!taken.has(candidate)) return candidate;
  let n = 2;
  while (taken.has(`${candidate}_${n}`)) n++;
  return `${candidate}_${n}`;
}

export async function isHandleTaken(
  ctx: PluginContext,
  candidate: string,
  excludeFormId?: string,
): Promise<boolean> {
  const taken = await collectHandles(ctx, excludeFormId);
  return taken.has(candidate);
}

async function collectHandles(
  ctx: PluginContext,
  excludeFormId?: string,
): Promise<Set<string>> {
  const { items } = await ctx.storage.forms.query({ limit: 10000 });
  const set = new Set<string>();
  for (const f of items as Array<{ id: string; data: StoredForm }>) {
    if (f.id === excludeFormId) continue;
    if (f.data.handle) set.add(f.data.handle);
  }
  return set;
}

// Backfill: forms created before the `handle` field existed have no handle in
// storage. Derive one from the name and persist on first admin read so the UI
// and downstream tools have a stable reference to show.
export async function ensureFormHandle(
  ctx: PluginContext,
  formId: string,
  form: StoredForm,
): Promise<StoredForm> {
  if (form.handle) return form;
  const handle = await deriveUniqueFormHandle(ctx, form.name, formId);
  const updated: StoredForm = { ...form, handle };
  await ctx.storage.forms.put(formId, updated);
  return updated;
}
