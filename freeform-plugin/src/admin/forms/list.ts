import type { PluginContext } from "emdash";
import { ensureFormHandle } from "../../lib/form-handles";
import { createFormAiModalBlocks, isCreateFormAiModalOpen } from "../create-form-ai";
import { formGridBlocks, formsListToolbar, freePlanProBanner } from "../layout";
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

  const proBanner = await freePlanProBanner(ctx);
  const toolbar = await formsListToolbar(ctx);

  if (formItems.length === 0) {
    return [
      ...proBanner,
      ...toolbar,
      ...createAiModal,
      {
        type: "empty",
        title: "No forms yet",
        description: "Create your first form to get started.",
        size: "lg",
      },
    ];
  }

  return [...proBanner, ...toolbar, ...createAiModal, ...formGridBlocks(formItems, subCountMap)];
}
