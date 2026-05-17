import type { PluginContext } from "emdash";
import type { FormRow } from "../types";

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
