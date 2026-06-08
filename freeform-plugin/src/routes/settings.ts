import { PluginRouteError, type PluginContext } from "emdash";
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
      const spam = await getSpamSettings(ctx);
      return { spam };
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
