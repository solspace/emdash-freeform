import type { PluginContext } from "emdash";
import {
  getAiProvider,
  hasAnthropicKey,
  hasApiKey,
  hasOpenAiKey,
  providerLabel,
} from "../lib/ai-config";
import { getMaskedKey, getTier } from "../lib/license";
import {
  getMcpWorkerUrl,
  mcpEndpointForClient,
} from "../lib/mcp-settings";
import { getSpamSettings } from "../lib/spam-settings";
import { getDeliveryLog } from "../lib/webhooks";
import { freeformNavBlocks, freePlanProBanner, settingsPageToolbar } from "./layout";
import {
  aiPanelBlocks,
  licensePanelBlocks,
  mcpPanelBlocks,
  webhooksPanelBlocks,
  type SettingsPanelContext,
} from "./settings-panels";
import type { StoredForm, StoredWebhook, WebhookDeliveryRecord } from "../types";

const WEBHOOK_SECRET_REVEAL_KEY = "webhooks:secretReveal";
const WEBHOOK_SECRET_REVEAL_MS = 2 * 60 * 1000;

export const SETTINGS_TAB_LICENSE = 0;
export const SETTINGS_TAB_AI = 1;
export const SETTINGS_TAB_MCP = 2;
export const SETTINGS_TAB_WEBHOOKS = 3;

interface WebhookSecretReveal {
  webhookId: string;
  webhookName: string;
  secret: string;
  action: "created" | "rotated";
  expiresAt: string;
}

export async function setWebhookSecretReveal(
  ctx: PluginContext,
  reveal: Omit<WebhookSecretReveal, "expiresAt">,
): Promise<void> {
  await ctx.kv.set(WEBHOOK_SECRET_REVEAL_KEY, {
    ...reveal,
    expiresAt: new Date(Date.now() + WEBHOOK_SECRET_REVEAL_MS).toISOString(),
  });
}

export async function clearWebhookSecretReveal(ctx: PluginContext): Promise<void> {
  await ctx.kv.delete(WEBHOOK_SECRET_REVEAL_KEY);
}

export async function settingsBlocks(
  ctx: PluginContext,
  siteOrigin: string,
  focusWebhookLog?: string,
  defaultTab = SETTINGS_TAB_LICENSE,
): Promise<object[]> {
  const tier = await getTier(ctx);
  const maskedKey = await getMaskedKey(ctx);
  const hasLicenseKey = maskedKey.length > 0;
  const aiProvider = await getAiProvider(ctx);
  const apiKeyConfigured = await hasApiKey(ctx);
  const anthropicKeySet = await hasAnthropicKey(ctx);
  const openaiKeySet = await hasOpenAiKey(ctx);
  const spam = await getSpamSettings(ctx);
  const secretRevealRaw = await activeWebhookSecretReveal(ctx);

  const { items: webhookItems } = await ctx.storage.webhooks.query({
    orderBy: { createdAt: "asc" },
    limit: 200,
  });
  const webhooks = webhookItems as Array<{ id: string; data: StoredWebhook }>;

  const { items: formItems } = await ctx.storage.forms.query({ orderBy: { createdAt: "asc" } });
  const forms = formItems as Array<{ id: string; data: StoredForm }>;

  let focusedLog: WebhookDeliveryRecord[] | null = null;
  let focusedWebhookName = "";
  if (focusWebhookLog) {
    const wh = webhooks.find((w) => w.id === focusWebhookLog);
    if (wh) {
      focusedLog = await getDeliveryLog(ctx, focusWebhookLog);
      focusedWebhookName = wh.data.name;
    }
  }

  const workerUrl = await getMcpWorkerUrl(ctx);
  const mcpEndpoint = mcpEndpointForClient(siteOrigin, workerUrl);
  const claudeDesktopConfig = JSON.stringify(
    {
      mcpServers: {
        freeform: {
          command: "npx",
          args: [
            "-y",
            "mcp-remote",
            mcpEndpoint,
            "--header",
            "Authorization:Bearer ec_pat_YOUR_TOKEN",
          ],
        },
      },
    },
    null,
    2,
  );

  const panelCtx: SettingsPanelContext = {
    tier,
    hasLicenseKey,
    aiProvider,
    apiKeyConfigured,
    anthropicKeySet,
    openaiKeySet,
    spam,
    siteOrigin,
    workerUrl,
    mcpEndpoint,
    claudeDesktopConfig,
    webhooks,
    forms,
    secretReveal: secretRevealRaw
      ? {
          action: secretRevealRaw.action,
          webhookName: secretRevealRaw.webhookName,
          secret: secretRevealRaw.secret,
          expiresAt: secretRevealRaw.expiresAt,
        }
      : null,
    focusedLog,
    focusedWebhookName,
  };

  const activeTab = focusWebhookLog ? SETTINGS_TAB_WEBHOOKS : defaultTab;

  const proBanner = await freePlanProBanner(ctx, "settings");
  const toolbar = settingsPageToolbar();

  return [
    ...(await freeformNavBlocks(ctx, "settings")),
    ...proBanner,
    ...toolbar,
    {
      type: "stats",
      items: [
        { label: "Plan", value: tier === "pro" ? "Pro" : "Free" },
        {
          label: "AI",
          value: apiKeyConfigured ? providerLabel(aiProvider) : "Not set",
        },
        { label: "MCP", value: workerUrl ? "Worker" : "Legacy" },
        { label: "Webhooks", value: String(webhooks.length) },
      ],
    },
    {
      type: "tab",
      default_tab: activeTab,
      panels: [
        { label: "License", blocks: licensePanelBlocks(panelCtx) },
        { label: "AI", blocks: aiPanelBlocks(panelCtx) },
        { label: "MCP", blocks: mcpPanelBlocks(panelCtx) },
        { label: "Webhooks", blocks: webhooksPanelBlocks(panelCtx) },
      ],
    },
  ];
}

async function activeWebhookSecretReveal(
  ctx: PluginContext,
): Promise<WebhookSecretReveal | null> {
  const reveal = await ctx.kv.get<WebhookSecretReveal>(WEBHOOK_SECRET_REVEAL_KEY);
  if (!reveal) return null;
  if (new Date(reveal.expiresAt).getTime() <= Date.now()) {
    await clearWebhookSecretReveal(ctx);
    return null;
  }
  return reveal;
}
