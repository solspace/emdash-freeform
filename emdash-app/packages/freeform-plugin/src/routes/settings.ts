import { PluginRouteError, type PluginContext } from "emdash";
import { activateLicense, clearLicense, getMaskedKey, getTier } from "../lib/license";
import {
  effectiveSpamSettings,
  getSpamSettings,
  setFormSpamOverride,
  setSpamSettings,
} from "../lib/spam-settings";
import type { SpamSettings, StoredForm } from "../types";

export const settingsRoutes = {
  "get-settings": {
    handler: async (_routeCtx: any, ctx: PluginContext) => {
      const tier = await getTier(ctx);
      const maskedKey = await getMaskedKey(ctx);
      return { tier, maskedKey, hasKey: maskedKey.length > 0 };
    },
  },

  "validate-license": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const { key } = routeCtx.input as { key: string };
      if (!key?.trim()) throw PluginRouteError.badRequest("Missing key");
      const activated = await activateLicense(ctx, key);
      return activated
        ? { ok: true, tier: "pro" as const }
        : {
            ok: false,
            error: 'Invalid key. Any key starting with "FF-" activates Pro for this demo.',
          };
    },
  },

  "remove-license": {
    handler: async (_routeCtx: any, ctx: PluginContext) => {
      await clearLicense(ctx);
      return { ok: true };
    },
  },

  "get-spam-settings": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const tier = await getTier(ctx);
      const globalDefaults = await getSpamSettings(ctx);
      const formId = new URL(routeCtx.request.url).searchParams.get("formId");
      if (!formId) {
        return { ...globalDefaults, tier, scope: "global" as const };
      }
      const form = (await ctx.storage.forms.get(formId)) as StoredForm | null;
      if (!form) throw PluginRouteError.notFound("Form not found");
      const effective = effectiveSpamSettings(form, globalDefaults);
      return {
        ...effective,
        tier,
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
      const tier = await getTier(ctx);
      if (tier !== "pro") {
        throw PluginRouteError.badRequest(
          "AI spam filtering requires a Pro license. Activate Pro in Settings first.",
        );
      }
      const input = routeCtx.input as Partial<SpamSettings> & {
        formId?: string;
        clearOverride?: boolean;
      };
      if (input.formId) {
        if (input.clearOverride) {
          const form = await setFormSpamOverride(ctx, input.formId, null);
          if (!form) throw PluginRouteError.notFound("Form not found");
          return {
            tier,
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
          tier,
          scope: "form" as const,
          formId: input.formId,
          hasOverride: true,
          override: form.spam,
          globalDefaults: await getSpamSettings(ctx),
        };
      }
      const updated = await setSpamSettings(ctx, input);
      return { ...updated, tier, scope: "global" as const };
    },
  },
};
