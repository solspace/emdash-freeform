import type { PluginContext } from "emdash";
import { ensureDemoSeed } from "../lib/seed";
import { ensureRetryCronScheduled } from "../routes/webhooks";

// EmDash invokes this for marketplace-installed plugins only. Trusted
// plugins (configured in astro.config.mjs `plugins: []`) never reach this
// path, so the same seeding also runs from the admin page-load handler.
export const installHook = {
  handler: async (_event: unknown, ctx: PluginContext) => {
    await ensureDemoSeed(ctx);
    // Schedule the webhook retry cron task. For trusted plugins this is also
    // called lazily on first webhook creation via ensureRetryCronScheduled().
    await ensureRetryCronScheduled(ctx);
  },
};
