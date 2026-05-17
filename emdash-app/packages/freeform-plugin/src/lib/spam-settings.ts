import type { PluginContext } from "emdash";
import { DEFAULT_SPAM_THRESHOLD } from "../constants";
import type { SpamSettings } from "../types";

export async function getSpamSettings(ctx: PluginContext): Promise<SpamSettings> {
  const enabled = (await ctx.kv.get<boolean>("spam:enabled")) === true;
  const threshold = (await ctx.kv.get<number>("spam:threshold")) ?? DEFAULT_SPAM_THRESHOLD;
  return { enabled, threshold };
}

export async function setSpamSettings(
  ctx: PluginContext,
  patch: Partial<SpamSettings>,
): Promise<SpamSettings> {
  if (typeof patch.enabled === "boolean") await ctx.kv.set("spam:enabled", patch.enabled);
  if (typeof patch.threshold === "number") {
    const clamped = Math.max(0, Math.min(10, Math.round(patch.threshold)));
    await ctx.kv.set("spam:threshold", clamped);
  }
  return getSpamSettings(ctx);
}
