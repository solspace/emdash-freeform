import type { PluginContext } from "emdash";

export type AiProvider = "anthropic" | "openai";

export interface AiCredentials {
  provider: AiProvider;
  apiKey: string;
}

const PROVIDER_KV = "settings:aiProvider";
const ANTHROPIC_KV = "settings:anthropicApiKey";
const OPENAI_KV = "settings:openaiApiKey";

export function providerLabel(provider: AiProvider): string {
  return provider === "openai" ? "OpenAI" : "Anthropic";
}

export async function getAiProvider(ctx: PluginContext): Promise<AiProvider> {
  const stored = await ctx.kv.get<string>(PROVIDER_KV);
  return stored === "openai" ? "openai" : "anthropic";
}

export async function setAiProvider(ctx: PluginContext, provider: AiProvider): Promise<void> {
  await ctx.kv.set(PROVIDER_KV, provider);
}

export async function getAnthropicApiKey(ctx: PluginContext): Promise<string | null> {
  const key = await ctx.kv.get<string>(ANTHROPIC_KV);
  return key?.trim() || null;
}

export async function getOpenAiApiKey(ctx: PluginContext): Promise<string | null> {
  const key = await ctx.kv.get<string>(OPENAI_KV);
  return key?.trim() || null;
}

export async function setAnthropicApiKey(ctx: PluginContext, key: string): Promise<void> {
  await ctx.kv.set(ANTHROPIC_KV, key.trim());
}

export async function setOpenAiApiKey(ctx: PluginContext, key: string): Promise<void> {
  await ctx.kv.set(OPENAI_KV, key.trim());
}

export async function clearAnthropicApiKey(ctx: PluginContext): Promise<void> {
  await ctx.kv.delete(ANTHROPIC_KV);
}

export async function clearOpenAiApiKey(ctx: PluginContext): Promise<void> {
  await ctx.kv.delete(OPENAI_KV);
}

/** Active provider's API key, or null if that provider has no key. */
export async function getAiCredentials(ctx: PluginContext): Promise<AiCredentials | null> {
  const provider = await getAiProvider(ctx);
  const apiKey =
    provider === "openai" ? await getOpenAiApiKey(ctx) : await getAnthropicApiKey(ctx);
  if (!apiKey) return null;
  return { provider, apiKey };
}

export async function hasApiKey(ctx: PluginContext): Promise<boolean> {
  return (await getAiCredentials(ctx)) !== null;
}

export async function hasAnthropicKey(ctx: PluginContext): Promise<boolean> {
  return (await getAnthropicApiKey(ctx)) !== null;
}

export async function hasOpenAiKey(ctx: PluginContext): Promise<boolean> {
  return (await getOpenAiApiKey(ctx)) !== null;
}
