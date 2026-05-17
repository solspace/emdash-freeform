import { PluginRouteError, type PluginContext } from "emdash";
import { activateLicense, clearLicense, getMaskedKey, getTier } from "../lib/license";
import { getSpamSettings, setSpamSettings } from "../lib/spam-settings";
import type { SpamSettings } from "../types";

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
    handler: async (_routeCtx: any, ctx: PluginContext) => {
      const tier = await getTier(ctx);
      const settings = await getSpamSettings(ctx);
      return { ...settings, tier };
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
      const patch = routeCtx.input as Partial<SpamSettings>;
      const updated = await setSpamSettings(ctx, patch);
      return { ...updated, tier };
    },
  },
};
