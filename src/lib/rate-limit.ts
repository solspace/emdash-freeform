import type { PluginContext } from "emdash";

/**
 * Hour-bucketed soft limit per IP.
 *
 * Missing IP is keyed as `no-ip` (fail closed for unlimited abuse): clients
 * without a usable address share one tight bucket instead of bypassing the
 * limit. Stale buckets accumulate — acceptable at POC scale; sweep or move to
 * KV TTL later.
 */
export async function rateLimitCheck(
  ctx: PluginContext,
  ip: string | null | undefined,
  opts: { prefix: string; limit: number },
): Promise<boolean> {
  const identity = ip?.trim() || "no-ip";
  const bucket = Math.floor(Date.now() / 3_600_000);
  const key = `${opts.prefix}:${identity}:${bucket}`;
  const count = (await ctx.kv.get<number>(key)) ?? 0;
  if (count >= opts.limit) return false;
  await ctx.kv.set(key, count + 1);
  return true;
}
