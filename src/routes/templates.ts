import { PluginRouteError, type PluginContext } from "emdash";
import { uid } from "../lib/handles";
import { deleteTemplateAndDetach } from "../lib/notifications";
import type { NotificationFormat, StoredTemplate } from "../types";

export const templateRoutes = {
  "list-templates": {
    handler: async (_routeCtx: any, ctx: PluginContext) => {
      const { items } = await ctx.storage.templates.query({
        orderBy: { createdAt: "desc" },
      });
      return {
        templates: (items as Array<{ id: string; data: StoredTemplate }>).map((t) => ({
          id: t.id,
          ...t.data,
        })),
      };
    },
  },

  "get-template": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const id = new URL(routeCtx.request.url).searchParams.get("id");
      if (!id) throw PluginRouteError.badRequest("Missing ?id=");
      const tpl = (await ctx.storage.templates.get(id)) as StoredTemplate | null;
      if (!tpl) throw PluginRouteError.notFound("Template not found");
      return { id, ...tpl };
    },
  },

  "save-template": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const input = routeCtx.input as {
        id?: string;
        name: string;
        subject: string;
        body: string;
        format?: NotificationFormat;
      };
      if (!input?.name?.trim()) throw PluginRouteError.badRequest("name is required");
      if (typeof input.subject !== "string") {
        throw PluginRouteError.badRequest("subject is required");
      }
      if (typeof input.body !== "string") {
        throw PluginRouteError.badRequest("body is required");
      }

      const format: NotificationFormat = input.format === "html" ? "html" : "text";
      const now = new Date().toISOString();
      const tid = input.id ?? uid();
      const existing = input.id
        ? ((await ctx.storage.templates.get(input.id)) as StoredTemplate | null)
        : null;
      const tpl: StoredTemplate = {
        name: input.name.trim(),
        subject: input.subject,
        body: input.body,
        format,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await ctx.storage.templates.put(tid, tpl);
      return { id: tid, ...tpl };
    },
  },

  "delete-template": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const { id } = routeCtx.input as { id: string };
      if (!id) throw PluginRouteError.badRequest("Missing id");
      const detached = await deleteTemplateAndDetach(ctx, id);
      return { ok: true, assignmentsDetached: detached };
    },
  },
};
