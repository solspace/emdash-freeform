import type { PluginContext } from "emdash";
import { ensureDemoSeed } from "../lib/seed";

// EmDash invokes this for marketplace-installed plugins only. Trusted
// plugins (configured in astro.config.mjs `plugins: []`) never reach this
// path, so the same seeding also runs from the admin page-load handler.
export const installHook = {
  handler: async (_event: unknown, ctx: PluginContext) => {
    await ensureDemoSeed(ctx);
  },
};
