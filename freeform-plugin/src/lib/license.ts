import type { PluginContext } from "emdash";

export async function getTier(ctx: PluginContext): Promise<"free" | "pro"> {
  return (await ctx.kv.get<string>("license:tier")) === "pro" ? "pro" : "free";
}

// PoC validation: any key starting with "FF-" and ≥ 8 chars is "Pro".
export function isValidKey(key: string): boolean {
  const k = key.trim().toUpperCase();
  return k.startsWith("FF-") && k.length >= 8;
}

export async function activateLicense(ctx: PluginContext, key: string): Promise<boolean> {
  if (!isValidKey(key)) return false;
  await ctx.kv.set("license:key", key.trim());
  await ctx.kv.set("license:tier", "pro");
  return true;
}

export async function clearLicense(ctx: PluginContext): Promise<void> {
  await ctx.kv.set("license:key", "");
  await ctx.kv.set("license:tier", "free");
}

export async function getMaskedKey(ctx: PluginContext): Promise<string> {
  const stored = (await ctx.kv.get<string>("license:key")) ?? "";
  if (!stored) return "";
  return stored.slice(0, 3) + "•".repeat(Math.max(0, stored.length - 3));
}
