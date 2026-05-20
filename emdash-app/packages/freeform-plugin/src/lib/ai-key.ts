import type { PluginContext } from "emdash";

const KV_KEY = "settings:anthropicApiKey";

/** Returns the user-configured Anthropic API key, or null if not set. */
export async function getApiKey(ctx: PluginContext): Promise<string | null> {
  const key = await ctx.kv.get<string>(KV_KEY);
  return key?.trim() || null;
}

/** Returns true if an API key has been configured. */
export async function hasApiKey(ctx: PluginContext): Promise<boolean> {
  const key = await getApiKey(ctx);
  return key !== null;
}
