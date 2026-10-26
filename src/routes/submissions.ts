import { PluginRouteError, type PluginContext } from "emdash";
import type { StoredSubmission } from "../types";

function serializeSubmission(id: string, data: StoredSubmission) {
  return {
    id,
    formId: data.formId,
    formName: data.formName,
    data: data.data,
    createdAt: data.createdAt,
    spamScore: data.spamScore ?? null,
    spamReason: data.spamReason ?? null,
    archived: data.archived === true,
    brief: data.brief ?? null,
    journey: data.journey ?? null,
    ip: data.ip ?? null,
    consent: data.consent ?? null,
  };
}

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
        submissions: subs.map((s) => serializeSubmission(s.id, s.data)),
      };
    },
  },

  "get-submission": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const id =
        (routeCtx.input as { id?: string } | undefined)?.id ??
        new URL(routeCtx.request.url).searchParams.get("id");
      if (!id) throw PluginRouteError.badRequest("Missing id");
      const data = (await ctx.storage.submissions.get(id)) as StoredSubmission | null;
      if (!data) throw PluginRouteError.notFound("Submission not found");
      return serializeSubmission(id, data);
    },
  },

  "delete-submission": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const { id } = routeCtx.input as { id: string };
      if (!id) throw PluginRouteError.badRequest("Missing id");
      const existing = (await ctx.storage.submissions.get(id)) as StoredSubmission | null;
      if (!existing) throw PluginRouteError.notFound("Submission not found");
      await ctx.storage.submissions.delete(id);
      return { ok: true, id };
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
