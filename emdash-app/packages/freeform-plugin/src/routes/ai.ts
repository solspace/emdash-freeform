import { PluginRouteError, type PluginContext } from "emdash";
import { generateWithAI } from "../ai/generate";
import { getTier } from "../lib/license";
import type { StoredForm } from "../types";

export const aiRoutes = {
  "ai-generate": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const { description, formId } = routeCtx.input as {
        description: string;
        formId?: string;
      };
      if (!description?.trim()) throw PluginRouteError.badRequest("Missing description");

      const tier = await getTier(ctx);
      if (tier === "free" && /\bemail\b/i.test(description)) {
        return { ok: false, error: "Email fields require Pro. Upgrade in Settings." };
      }

      const form = formId
        ? ((await ctx.storage.forms.get(formId)) as StoredForm | null)
        : null;
      // When called without a form context, generate against an empty form so
      // caps and dedup still apply against a clean slate.
      const baseForm: StoredForm = form ?? {
        name: "",
        handle: "",
        rows: [],
        successMessage: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const result = await generateWithAI(description, tier, baseForm, ctx);
      return {
        ok: true,
        rows: result.rows,
        added: result.added,
        duplicatesSkipped: result.duplicatesSkipped,
        cappedAt: result.cappedAt,
        totalCapped: result.totalCapped,
      };
    },
  },
};
