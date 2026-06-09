import type { PluginContext } from "emdash";
import { ensureFormHandle } from "../../lib/form-handles";
import { createFormAiModalBlocks, isCreateFormAiModalOpen } from "../create-form-ai";
import { formGridBlocks, formsPageHeader, freeformNavBlocks } from "../layout";
import type { StoredForm, StoredSubmission } from "../../types";

export async function listPageBlocks(ctx: PluginContext): Promise<object[]> {
  const showCreateAiModal = await isCreateFormAiModalOpen(ctx);
  const createAiModal = showCreateAiModal ? createFormAiModalBlocks() : [];
  const { items: forms } = await ctx.storage.forms.query({
    orderBy: { createdAt: "desc" },
  });
  const formItems = forms as Array<{ id: string; data: StoredForm }>;

  const { items: allSubs } = await ctx.storage.submissions.query({
    limit: 10000,
  });
  const subCountMap = new Map<string, number>();
  for (const s of allSubs as Array<{ id: string; data: StoredSubmission }>) {
    subCountMap.set(s.data.formId, (subCountMap.get(s.data.formId) ?? 0) + 1);
  }

  for (const f of formItems) {
    if (!f.data.handle) f.data = await ensureFormHandle(ctx, f.id, f.data);
  }

  const header = await formsPageHeader(ctx);

  if (formItems.length === 0) {
    return [
      ...freeformNavBlocks("forms"),
      ...header,
      ...createAiModal,
      {
        type: "empty",
        title: "No forms yet",
        description: "Create your first form to get started.",
        size: "lg",
      },
    ];
  }

  return [
    ...freeformNavBlocks("forms"),
    ...header,
    ...createAiModal,
    ...formGridBlocks(formItems, subCountMap),
  ];
}
