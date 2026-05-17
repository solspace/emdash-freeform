import { PluginRouteError, type PluginContext } from "emdash";
import type { StoredSubmission } from "../types";

export const submissionsRoutes = {
  "list-submissions": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const url = new URL(routeCtx.request.url);
      const formId = url.searchParams.get("formId");
      const includeArchived = url.searchParams.get("includeArchived") === "true";
      const where = formId ? { formId } : undefined;
      const { items } = await ctx.storage.submissions.query({
        where,
        orderBy: { createdAt: "desc" },
        limit: 200,
      });
      const subs = (items as Array<{ id: string; data: StoredSubmission }>).filter(
        (s) => includeArchived || !s.data.archived,
      );
      return {
        submissions: subs.map((s) => ({
          id: s.id,
          formId: s.data.formId,
          formName: s.data.formName,
          data: s.data.data,
          createdAt: s.data.createdAt,
          spamScore: s.data.spamScore ?? null,
          spamReason: s.data.spamReason ?? null,
          archived: s.data.archived === true,
        })),
      };
    },
  },

  "archive-submissions": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const { formId, minScore, dryRun } = routeCtx.input as {
        formId?: string;
        minScore: number;
        dryRun?: boolean;
      };
      if (typeof minScore !== "number" || minScore < 0 || minScore > 10) {
        throw PluginRouteError.badRequest("minScore must be a number between 0 and 10");
      }
      const where = formId ? { formId } : undefined;
      const { items } = await ctx.storage.submissions.query({ where, limit: 10000 });
      const matches = (items as Array<{ id: string; data: StoredSubmission }>).filter(
        (s) =>
          !s.data.archived &&
          typeof s.data.spamScore === "number" &&
          s.data.spamScore >= minScore,
      );
      if (dryRun) {
        return { dryRun: true, wouldArchive: matches.length, ids: matches.map((m) => m.id) };
      }
      for (const m of matches) {
        await ctx.storage.submissions.put(m.id, { ...m.data, archived: true });
      }
      return { archived: matches.length, ids: matches.map((m) => m.id) };
    },
  },
};
