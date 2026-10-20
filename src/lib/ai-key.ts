import type { PluginContext } from "emdash";
import { getAiCredentials, hasApiKey as hasConfiguredApiKey } from "./ai-config";

/** @deprecated Use getAiCredentials for provider-aware access. */
export async function getApiKey(ctx: PluginContext): Promise<string | null> {
  const creds = await getAiCredentials(ctx);
  return creds?.apiKey ?? null;
}

export { hasConfiguredApiKey as hasApiKey };
