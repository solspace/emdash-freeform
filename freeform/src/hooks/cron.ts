import type { PluginContext } from "emdash";
import { processRetryQueue } from "../lib/webhooks";

// CronEvent is not re-exported by the public emdash package; use a local shape.
export interface CronEvent {
  name: string;
  data?: Record<string, unknown>;
  scheduledAt: string;
}

// Dispatched by EmDash for each scheduled task this plugin owns.
// Currently only one task: "webhook:retry" — runs every minute to process
// the KV retry queue for failed webhook deliveries.
export const cronHook = {
  handler: async (event: CronEvent, ctx: PluginContext): Promise<void> => {
    if (event.name === "webhook:retry") {
      await processRetryQueue(ctx);
    }
  },
};
