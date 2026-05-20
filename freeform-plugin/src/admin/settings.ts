import type { PluginContext } from "emdash";
import { hasApiKey } from "../lib/ai-key";
import { getMaskedKey, getTier } from "../lib/license";
import { getSpamSettings } from "../lib/spam-settings";
import { getDeliveryLog } from "../lib/webhooks";
import type { StoredForm, StoredWebhook, WebhookDeliveryRecord } from "../types";

const WEBHOOK_SECRET_REVEAL_KEY = "webhooks:secretReveal";
const WEBHOOK_SECRET_REVEAL_MS = 2 * 60 * 1000;

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
  focusWebhookLog?: string, // webhookId to show delivery log for
): Promise<object[]> {
  const tier = await getTier(ctx);
  const maskedKey = await getMaskedKey(ctx);
  const hasKey = maskedKey.length > 0;
  const apiKeyConfigured = await hasApiKey(ctx);
  const spam = await getSpamSettings(ctx);
  const secretReveal = await activeWebhookSecretReveal(ctx);

  // Webhooks
  const { items: webhookItems } = await ctx.storage.webhooks.query({
    orderBy: { createdAt: "asc" },
    limit: 200,
  });
  const webhooks = webhookItems as Array<{ id: string; data: StoredWebhook }>;

  // Forms (for scope selector)
  const { items: formItems } = await ctx.storage.forms.query({ orderBy: { createdAt: "asc" } });
  const forms = formItems as Array<{ id: string; data: StoredForm }>;

  // Delivery log for focused webhook
  let focusedLog: WebhookDeliveryRecord[] | null = null;
  let focusedWebhookName = "";
  if (focusWebhookLog) {
    const wh = webhooks.find((w) => w.id === focusWebhookLog);
    if (wh) {
      focusedLog = await getDeliveryLog(ctx, focusWebhookLog);
      focusedWebhookName = wh.data.name;
    }
  }

  const mcpEndpoint = `${siteOrigin}/freeform/mcp`;
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

  return [
    { type: "header", text: "Freeform — Settings" },
    {
      type: "actions",
      elements: [{ type: "button", label: "← Back to Forms", action_id: "nav:forms" }],
    },
    { type: "divider" },
    { type: "header", text: "AI Configuration" },
    {
      type: "section",
      text:
        "Freeform uses the Anthropic API for form generation, spam scoring, lead briefs, and the AI chat widget. " +
        "All AI features require a valid API key. Your key is stored securely in the plugin's KV store.",
    },
    apiKeyConfigured
      ? {
          type: "banner",
          title: "API key configured",
          description: "AI features are active. Replace the key below to update it.",
          variant: "default",
        }
      : {
          type: "banner",
          title: "No API key set",
          description:
            "AI features are disabled. Enter your Anthropic API key below to enable them. " +
            "Get a key at console.anthropic.com.",
          variant: "default",
        },
    {
      type: "form",
      block_id: "ai_config",
      fields: [
        {
          type: "secret_input",
          action_id: "anthropic_key",
          label: "Anthropic API Key",
          placeholder: "sk-ant-api03-...",
        },
      ],
      submit: {
        label: apiKeyConfigured ? "Replace Key" : "Save Key",
        action_id: "save_api_key",
      },
    },
    ...(apiKeyConfigured
      ? [
          {
            type: "actions",
            elements: [
              {
                type: "button",
                label: "Remove API Key",
                action_id: "remove_api_key",
                style: "danger",
                confirm: {
                  title: "Remove API key?",
                  text: "All AI features (form generation, spam scoring, chat) will be disabled.",
                  confirm: "Remove",
                  deny: "Cancel",
                },
              },
            ],
          },
        ]
      : []),
    { type: "divider" },
    { type: "header", text: "MCP Access" },
    {
      type: "section",
      text:
        "Connect Claude Desktop (or any MCP client) to manage this site's forms, " +
        "submissions, notification templates, and spam settings in natural language.",
    },
    {
      type: "fields",
      fields: [
        { label: "Endpoint", value: mcpEndpoint },
        { label: "Auth", value: "Personal Access Token with admin scope" },
        { label: "Get a token", value: `${siteOrigin}/_emdash/admin/settings/api-tokens` },
      ],
    },
    { type: "header", text: "Setup" },
    {
      type: "section",
      text: `1. Open the API tokens page (${siteOrigin}/_emdash/admin/settings/api-tokens) and create a Personal Access Token with the admin scope.`,
    },
    {
      type: "section",
      text:
        "2. Open Claude Desktop's config file. On macOS that's at " +
        "~/Library/Application Support/Claude/claude_desktop_config.json. " +
        "On Windows: %APPDATA%/Claude/claude_desktop_config.json.",
    },
    {
      type: "section",
      text:
        "3. Add the snippet below to that file, replacing ec_pat_YOUR_TOKEN with the " +
        "token you just created.",
    },
    { type: "section", text: claudeDesktopConfig },
    {
      type: "section",
      text:
        "4. Restart Claude Desktop. The freeform tools will appear in the connector list.",
    },
    {
      type: "context",
      text:
        "OAuth is wired but currently blocked on EmDash not granting admin scope to OAuth-issued tokens. Personal Access Tokens are the supported path today.",
    },
    { type: "divider" },
    {
      type: "stats",
      items: [
        {
          label: "Current Plan",
          value: tier === "pro" ? "Pro" : "Free",
          description: tier === "pro" ? "All features unlocked" : "Limited feature set",
        },
        { label: "Email Fields", value: tier === "pro" ? "Unlocked ✓" : "Locked 🔒" },
      ],
    },
    tier === "pro"
      ? {
          type: "banner",
          title: "Pro license active",
          description: `Key on file: ${maskedKey}. All features are unlocked.`,
          variant: "default",
        }
      : {
          type: "banner",
          title: "Free Plan",
          description:
            'Enter your Freeform license key to unlock Pro features including email fields. ' +
            'For this demo, any key starting with "FF-" (e.g. FF-DEMO-1234) will activate Pro.',
          variant: "default",
        },
    { type: "divider" },
    { type: "header", text: "License Key" },
    {
      type: "form",
      block_id: "license",
      fields: [
        {
          type: "secret_input",
          action_id: "key",
          label: "License Key",
          placeholder: "FF-XXXX-XXXX-XXXX",
        },
      ],
      submit: { label: "Validate & Save", action_id: "save_license" },
    },
    ...(hasKey
      ? [
          {
            type: "actions",
            elements: [
              {
                type: "button",
                label: "Remove License Key",
                action_id: "remove_license",
                style: "danger",
                confirm: {
                  title: "Remove license key?",
                  text: "You will be reverted to the free plan and email fields will be locked.",
                  confirm: "Remove",
                  deny: "Cancel",
                },
              },
            ],
          },
        ]
      : []),
    { type: "divider" },
    { type: "header", text: "AI Spam Filter — Defaults" },
    tier === "pro"
      ? {
          type: "section",
          text:
            "Default settings used by any form that doesn't define its own. " +
            "Override per-form on the form's edit page. " +
            "Scores are stored alongside submissions; nothing is auto-rejected. " +
            "Use the MCP `archive_spam_submissions` tool (or the admin actions below) " +
            "to clean up flagged entries.",
        }
      : {
          type: "banner",
          title: "Pro feature",
          description:
            "AI spam filtering requires a Pro license. Activate Pro above to enable scoring.",
          variant: "default",
        },
    ...(tier === "pro"
      ? [
          {
            type: "stats",
            items: [
              { label: "Spam Filter", value: spam.enabled ? "On" : "Off" },
              { label: "Threshold", value: `${spam.threshold} / 10` },
            ],
          },
          {
            type: "form",
            block_id: "spam_settings",
            fields: [
              {
                type: "toggle",
                action_id: "spam_enabled",
                label: "Enable AI spam scoring",
                initial_value: spam.enabled,
              },
              {
                type: "text_input",
                action_id: "spam_threshold",
                label: "Flag threshold (0-10)",
                initial_value: String(spam.threshold),
                placeholder: "7",
              },
            ],
            submit: { label: "Save", action_id: "save_spam_settings" },
          },
        ]
      : []),

    // ── Webhooks ─────────────────────────────────────────────────
    { type: "divider" },
    { type: "header", text: "Webhooks" },
    {
      type: "section",
      text:
        "Send an HTTPS POST to any URL whenever a form is submitted. " +
        "Each delivery is signed with HMAC-SHA256 in the X-Freeform-Signature header. " +
        "Failed deliveries are retried up to 3 times (1 min, 5 min, 15 min backoff).",
    },
    ...(secretReveal
      ? [
          {
            type: "banner",
            title:
              secretReveal.action === "created"
                ? `Webhook "${secretReveal.webhookName}" created`
                : `Secret rotated for "${secretReveal.webhookName}"`,
            description: `Copy this secret now. It is shown only until ${new Date(
              secretReveal.expiresAt,
            ).toLocaleTimeString()} and will not be available again.`,
            variant: "default",
          },
          {
            type: "form",
            block_id: "webhook_secret_reveal",
            fields: [
              {
                type: "text_input",
                action_id: "webhook_secret",
                label: "Signing secret",
                initial_value: secretReveal.secret,
              },
            ],
            submit: { label: "I've copied it", action_id: "hide_webhook_secret" },
          },
        ]
      : []),

    // Existing webhooks
    ...(webhooks.length === 0
      ? [{ type: "section", text: "No webhooks configured yet." }]
      : webhooks.flatMap(({ id, data: wh }) => {
          const scopeLabel = wh.formId
            ? (forms.find((f) => f.id === wh.formId)?.data.name ?? wh.formId)
            : "All forms";
          const statusLabel = wh.enabled ? "Active" : "Paused";
          const urlShort = wh.url.length > 50 ? wh.url.slice(0, 47) + "…" : wh.url;
          return [
            {
              type: "section",
              text: `${wh.name} — ${urlShort} — ${scopeLabel} — ${statusLabel}`,
            },
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  label: wh.enabled ? "Pause" : "Enable",
                  action_id: `toggle_webhook:${id}`,
                },
                {
                  type: "button",
                  label: "View Log",
                  action_id: `log_webhook:${id}`,
                },
                {
                  type: "button",
                  label: "Rotate Secret",
                  action_id: `rotate_webhook_secret:${id}`,
                  confirm: {
                    title: "Rotate webhook secret?",
                    text: "The current secret will stop working immediately. Update your endpoint before rotating.",
                    confirm: "Rotate",
                    deny: "Cancel",
                  },
                },
                {
                  type: "button",
                  label: "Delete",
                  action_id: `del_webhook:${id}`,
                  style: "danger",
                  confirm: {
                    title: `Delete "${wh.name}"?`,
                    text: "The webhook will stop receiving deliveries immediately.",
                    confirm: "Delete",
                    deny: "Cancel",
                  },
                },
              ],
            },
          ];
        })),

    // Delivery log for focused webhook
    ...(focusedLog !== null
      ? [
          { type: "header", text: `Delivery log — ${focusedWebhookName}` },
          focusedLog.length === 0
            ? { type: "section", text: "No deliveries recorded yet." }
            : {
                type: "table",
                columns: [
                  { key: "status", label: "Status", format: "badge" },
                  { key: "attempts", label: "Attempts", format: "number" },
                  { key: "statusCode", label: "HTTP", format: "text" },
                  { key: "deliveredAt", label: "Time", format: "relative_time" },
                  { key: "error", label: "Error", format: "text" },
                ],
                rows: focusedLog.map((e) => ({
                  status: e.status,
                  attempts: String(e.attempts),
                  statusCode: e.statusCode != null ? String(e.statusCode) : "—",
                  deliveredAt: e.deliveredAt,
                  error: e.error ?? "",
                })),
              },
        ]
      : []),

    // Add webhook form
    { type: "header", text: "Add Webhook" },
    {
      type: "form",
      block_id: "add_webhook",
      fields: [
        {
          type: "text_input",
          action_id: "webhook_name",
          label: "Name",
          placeholder: "e.g. Slack Alerts",
        },
        {
          type: "text_input",
          action_id: "webhook_url",
          label: "URL",
          placeholder: "https://hooks.example.com/freeform",
        },
        {
          type: "select",
          action_id: "webhook_form",
          label: "Scope",
          options: [
            { label: "All forms", value: "__all__" },
            ...forms.map((f) => ({ label: f.data.name, value: f.id })),
          ],
          initial_value: "__all__",
        },
      ],
      submit: { label: "Add Webhook", action_id: "add_webhook" },
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
