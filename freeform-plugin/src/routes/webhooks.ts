import { PluginRouteError, type PluginContext } from "emdash";
import { generateWebhookSecret, getDeliveryLog } from "../lib/webhooks";
import { uid } from "../lib/handles";
import type { StoredWebhook } from "../types";

export const webhookRoutes = {
  "list-webhooks": {
    handler: async (_routeCtx: any, ctx: PluginContext) => {
      const { items } = await ctx.storage.webhooks.query({
        orderBy: { createdAt: "asc" },
        limit: 200,
      });
      return {
        webhooks: (items as Array<{ id: string; data: StoredWebhook }>).map(
          ({ id, data }) => ({
            id,
            name: data.name,
            url: data.url,
            enabled: data.enabled,
            formId: data.formId ?? null,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            // Secret is never returned in list responses.
          }),
        ),
      };
    },
  },

  "get-webhook": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const id = new URL(routeCtx.request.url).searchParams.get("id");
      if (!id) throw PluginRouteError.badRequest("Missing ?id=");
      const data = (await ctx.storage.webhooks.get(id)) as StoredWebhook | null;
      if (!data) throw PluginRouteError.notFound("Webhook not found");
      // Secret is never returned here either.
      return { id, name: data.name, url: data.url, enabled: data.enabled, formId: data.formId ?? null };
    },
  },

  "create-webhook": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const input = routeCtx.input as {
        name: string;
        url: string;
        formId?: string;
      };
      if (!input?.name?.trim()) throw PluginRouteError.badRequest("name is required");
      if (!input?.url?.trim()) throw PluginRouteError.badRequest("url is required");
      try {
        new URL(input.url);
      } catch {
        throw PluginRouteError.badRequest("url must be a valid URL");
      }
      if (!input.url.startsWith("https://")) {
        throw PluginRouteError.badRequest("url must use HTTPS");
      }

      const secret = generateWebhookSecret();
      const now = new Date().toISOString();
      const id = uid();
      const webhook: StoredWebhook = {
        name: input.name.trim(),
        url: input.url.trim(),
        secret,
        enabled: true,
        formId: input.formId || undefined,
        createdAt: now,
        updatedAt: now,
      };
      await ctx.storage.webhooks.put(id, webhook);

      // Schedule the retry processor if not already running.
      await ensureRetryCronScheduled(ctx);

      // Secret is returned ONLY on creation so the customer can copy it.
      return { id, secret, name: webhook.name, url: webhook.url, formId: webhook.formId ?? null };
    },
  },

  "update-webhook": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const input = routeCtx.input as {
        id: string;
        name?: string;
        url?: string;
        enabled?: boolean;
        formId?: string | null;
      };
      if (!input?.id) throw PluginRouteError.badRequest("id is required");

      const existing = (await ctx.storage.webhooks.get(input.id)) as StoredWebhook | null;
      if (!existing) throw PluginRouteError.notFound("Webhook not found");

      if (input.url !== undefined) {
        try {
          new URL(input.url);
        } catch {
          throw PluginRouteError.badRequest("url must be a valid URL");
        }
        if (!input.url.startsWith("https://")) {
          throw PluginRouteError.badRequest("url must use HTTPS");
        }
      }

      const updated: StoredWebhook = {
        ...existing,
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.url !== undefined ? { url: input.url.trim() } : {}),
        ...(typeof input.enabled === "boolean" ? { enabled: input.enabled } : {}),
        ...(input.formId !== undefined
          ? { formId: input.formId ?? undefined }
          : {}),
        updatedAt: new Date().toISOString(),
      };
      await ctx.storage.webhooks.put(input.id, updated);
      return { id: input.id, name: updated.name, url: updated.url, enabled: updated.enabled };
    },
  },

  "rotate-webhook-secret": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const { id } = routeCtx.input as { id: string };
      if (!id) throw PluginRouteError.badRequest("id is required");
      const existing = (await ctx.storage.webhooks.get(id)) as StoredWebhook | null;
      if (!existing) throw PluginRouteError.notFound("Webhook not found");
      const secret = generateWebhookSecret();
      await ctx.storage.webhooks.put(id, { ...existing, secret, updatedAt: new Date().toISOString() });
      // Returns new secret — only time it's exposed after creation.
      return { id, secret };
    },
  },

  "delete-webhook": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const { id } = routeCtx.input as { id: string };
      if (!id) throw PluginRouteError.badRequest("id is required");
      await ctx.storage.webhooks.delete(id);
      return { ok: true };
    },
  },

  "get-webhook-log": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const id = new URL(routeCtx.request.url).searchParams.get("id");
      if (!id) throw PluginRouteError.badRequest("Missing ?id=");
      const entries = await getDeliveryLog(ctx, id);
      return { webhookId: id, entries };
    },
  },
};

// Idempotent: schedule the retry cron task if it isn't already running.
// Called on webhook creation so that trusted-mode installs (which never
// trigger plugin:install) still get the cron wired up on first use.
export async function ensureRetryCronScheduled(ctx: PluginContext): Promise<void> {
  if (!ctx.cron) return; // cron not wired up in this environment
  try {
    const tasks = await ctx.cron.list();
    const exists = tasks.some((t) => t.name === "webhook:retry");
    if (!exists) {
      await ctx.cron.schedule("webhook:retry", { schedule: "* * * * *" });
    }
  } catch (e) {
    // Log and continue — deliveries will still succeed; only retries are affected.
    ctx.log.warn("Freeform: could not schedule webhook:retry cron task", {
      error: String(e),
    });
  }
}
