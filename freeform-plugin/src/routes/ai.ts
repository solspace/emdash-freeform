import { PluginRouteError, type PluginContext } from "emdash";
import { editFormWithAI } from "../ai/generate";
import { getAiCredentials } from "../lib/ai-config";
import type { StoredForm } from "../types";

export const aiRoutes = {
  "ai-generate": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const { description, formId, apply } = routeCtx.input as {
        description: string;
        formId?: string;
        // When true and formId is set, persist the AI's edits to storage.
        // When false (default), return the edits without saving — useful for
        // preview-then-confirm flows on the caller side.
        apply?: boolean;
      };
      if (!description?.trim()) throw PluginRouteError.badRequest("Missing description");

      const creds = await getAiCredentials(ctx);
      if (!creds) {
        throw PluginRouteError.badRequest(
          "AI API key not configured. Add it in Freeform → Settings → AI.",
        );
      }

      const form = formId
        ? ((await ctx.storage.forms.get(formId)) as StoredForm | null)
        : null;
      const baseForm: StoredForm = form ?? {
        name: "",
        handle: "",
        rows: [],
        successMessage: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const { newForm, summary } = await editFormWithAI(description, baseForm, ctx, creds);

      const anyChange = summary.added > 0 || summary.updated > 0 || summary.removed > 0;
      if (apply && formId && form && anyChange) {
        await ctx.storage.forms.put(formId, newForm);
      }

      return {
        ok: true,
        applied: !!(apply && formId && form && anyChange),
        rows: newForm.rows,
        summary,
      };
    },
  },
};
