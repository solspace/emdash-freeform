import type { PluginContext } from "emdash";

const MCP_WORKER_URL_KEY = "settings:mcpWorkerUrl";

export async function getMcpWorkerUrl(ctx: PluginContext): Promise<string | null> {
  const url = await ctx.kv.get<string>(MCP_WORKER_URL_KEY);
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  return trimmed.length > 0 ? trimmed.replace(/\/$/, "") : null;
}

export async function setMcpWorkerUrl(
  ctx: PluginContext,
  url: string | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (url === null || url.trim() === "") {
    await ctx.kv.delete(MCP_WORKER_URL_KEY);
    return { ok: true };
  }
  const trimmed = url.trim().replace(/\/$/, "");
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") {
      return { ok: false, message: "MCP Worker URL must use HTTPS." };
    }
  } catch {
    return { ok: false, message: "MCP Worker URL is not a valid URL." };
  }
  await ctx.kv.set(MCP_WORKER_URL_KEY, trimmed);
  return { ok: true };
}

export function mcpEndpointForClient(
  siteOrigin: string,
  workerUrl: string | null,
): string {
  if (workerUrl) return `${workerUrl}/mcp`;
  return `${siteOrigin}/freeform/mcp`;
}
