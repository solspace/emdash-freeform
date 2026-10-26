import { PluginRouteError, type PluginContext } from "emdash";
import { ensureDefaultTemplates } from "../lib/default-templates";
import { uid } from "../lib/handles";
import { deleteTemplateAndDetach } from "../lib/notifications";
import type { NotificationFormat, StoredTemplate } from "../types";

function sortTemplates(
  items: Array<{ id: string; data: StoredTemplate }>,
): Array<{ id: string } & StoredTemplate> {
  return items
    .map((t) => ({ id: t.id, ...t.data }))
    .sort((a, b) => {
      const sys = Number(Boolean(b.system)) - Number(Boolean(a.system));
      if (sys !== 0) return sys;
      return a.name.localeCompare(b.name);
    });
}

export const templateRoutes = {
  "list-templates": {
    handler: async (_routeCtx: any, ctx: PluginContext) => {
      await ensureDefaultTemplates(ctx);
      const { items } = await ctx.storage.templates.query({
        orderBy: { createdAt: "desc" },
      });
      return {
        templates: sortTemplates(items as Array<{ id: string; data: StoredTemplate }>),
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

      const existing = input.id
        ? ((await ctx.storage.templates.get(input.id)) as StoredTemplate | null)
        : null;
      if (existing?.system) {
        throw PluginRouteError.badRequest(
          "Built-in templates can’t be edited. Duplicate one to customize.",
        );
      }

      const format: NotificationFormat = input.format === "html" ? "html" : "text";
      const now = new Date().toISOString();
      const tid = input.id ?? uid();
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
      const existing = (await ctx.storage.templates.get(id)) as StoredTemplate | null;
      if (existing?.system) {
        throw PluginRouteError.badRequest("Built-in templates can’t be deleted.");
      }
      const detached = await deleteTemplateAndDetach(ctx, id);
      return { ok: true, assignmentsDetached: detached };
    },
  },
};
