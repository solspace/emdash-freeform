import { PluginRouteError, type PluginContext } from "emdash";
import {
  clearOpenAiApiKey,
  getOpenAiApiKey,
  hasOpenAiKey,
  setAiProvider,
  setOpenAiApiKey,
} from "../lib/ai-config";
import {
  effectiveSpamSettings,
  getSpamSettings,
  setFormSpamOverride,
  setSpamSettings,
} from "../lib/spam-settings";
import type { SpamSettings, StoredForm } from "../types";

function maskKey(key: string | null): { configured: boolean; hint: string | null } {
  if (!key) return { configured: false, hint: null };
  const trimmed = key.trim();
  if (trimmed.length < 8) return { configured: true, hint: "••••" };
  return { configured: true, hint: `…${trimmed.slice(-4)}` };
}

export const settingsRoutes = {
  "get-settings": {
    handler: async (_routeCtx: any, ctx: PluginContext) => {
      const spam = await getSpamSettings(ctx);
      const key = await getOpenAiApiKey(ctx);
      return {
        spam,
        ai: {
          provider: "openai" as const,
          ...maskKey(key),
        },
      };
    },
  },

  "get-ai-settings": {
    handler: async (_routeCtx: any, ctx: PluginContext) => {
      const spam = await getSpamSettings(ctx);
      const key = await getOpenAiApiKey(ctx);
      return {
        provider: "openai" as const,
        ...maskKey(key),
        spam,
      };
    },
  },

  "save-ai-settings": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const input = routeCtx.input as {
        apiKey?: string;
        clearKey?: boolean;
        spamEnabled?: boolean;
        spamThreshold?: number;
      };

      await setAiProvider(ctx, "openai");

      if (input.clearKey) {
        await clearOpenAiApiKey(ctx);
      } else if (typeof input.apiKey === "string" && input.apiKey.trim()) {
        await setOpenAiApiKey(ctx, input.apiKey.trim());
      }

      if (
        typeof input.spamEnabled === "boolean" ||
        typeof input.spamThreshold === "number"
      ) {
        await setSpamSettings(ctx, {
          ...(typeof input.spamEnabled === "boolean"
            ? { enabled: input.spamEnabled }
            : {}),
          ...(typeof input.spamThreshold === "number"
            ? { threshold: input.spamThreshold }
            : {}),
        });
      }

      const key = await getOpenAiApiKey(ctx);
      const spam = await getSpamSettings(ctx);
      return {
        provider: "openai" as const,
        ...maskKey(key),
        spam,
        configured: await hasOpenAiKey(ctx),
      };
    },
  },

  "get-spam-settings": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const globalDefaults = await getSpamSettings(ctx);
      const formId = new URL(routeCtx.request.url).searchParams.get("formId");
      if (!formId) {
        return { ...globalDefaults, scope: "global" as const };
      }
      const form = (await ctx.storage.forms.get(formId)) as StoredForm | null;
      if (!form) throw PluginRouteError.notFound("Form not found");
      const effective = effectiveSpamSettings(form, globalDefaults);
      return {
        ...effective,
        scope: "form" as const,
        formId,
        hasOverride: !!form.spam,
        override: form.spam ?? null,
        globalDefaults,
      };
    },
  },

  "update-spam-settings": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const input = routeCtx.input as Partial<SpamSettings> & {
        formId?: string;
        clearOverride?: boolean;
      };
      if (input.formId) {
        if (input.clearOverride) {
          const form = await setFormSpamOverride(ctx, input.formId, null);
          if (!form) throw PluginRouteError.notFound("Form not found");
          return {
            scope: "form" as const,
            formId: input.formId,
            hasOverride: false,
            override: null,
            globalDefaults: await getSpamSettings(ctx),
          };
        }
        if (typeof input.enabled !== "boolean" || typeof input.threshold !== "number") {
          throw PluginRouteError.badRequest(
            "Per-form override requires both `enabled` (boolean) and `threshold` (number 0-10). Pass `clearOverride: true` to revert to inherit.",
          );
        }
        const form = await setFormSpamOverride(ctx, input.formId, {
          enabled: input.enabled,
          threshold: input.threshold,
        });
        if (!form) throw PluginRouteError.notFound("Form not found");
        return {
          scope: "form" as const,
          formId: input.formId,
          hasOverride: true,
          override: form.spam,
          globalDefaults: await getSpamSettings(ctx),
        };
      }
      const updated = await setSpamSettings(ctx, input);
      return { ...updated, scope: "global" as const };
    },
  },
};
