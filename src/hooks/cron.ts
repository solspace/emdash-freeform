import type { PluginContext } from "emdash";
import { RETENTION_CRON, purgeExpiredSubmissions } from "../lib/retention";
import { processRetryQueue } from "../lib/webhooks";

// CronEvent is not re-exported by the public emdash package; use a local shape.
export interface CronEvent {
  name: string;
  data?: Record<string, unknown>;
  scheduledAt: string;
}

// Dispatched by EmDash for each scheduled task this plugin owns.
export const cronHook = {
  handler: async (event: CronEvent, ctx: PluginContext): Promise<void> => {
    if (event.name === "webhook:retry") {
      await processRetryQueue(ctx);
    }
    if (event.name === RETENTION_CRON) {
      await purgeExpiredSubmissions(ctx);
    }
  },
};
