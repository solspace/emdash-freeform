import type { PluginContext } from "emdash";
import { providerLabel, type AiProvider } from "../lib/ai-config";
import type { StoredForm, StoredWebhook, WebhookDeliveryRecord } from "../types";
import { webhookGridBlocks } from "./layout";

export interface SettingsPanelContext {
  aiProvider: AiProvider;
  apiKeyConfigured: boolean;
  anthropicKeySet: boolean;
  openaiKeySet: boolean;
  spam: { enabled: boolean; threshold: number };
  siteOrigin: string;
  workerUrl: string | null;
  mcpEndpoint: string;
  claudeDesktopConfig: string;
  webhooks: Array<{ id: string; data: StoredWebhook }>;
  forms: Array<{ id: string; data: StoredForm }>;
  secretReveal: {
    action: "created" | "rotated";
    webhookName: string;
    secret: string;
    expiresAt: string;
  } | null;
  focusedLog: WebhookDeliveryRecord[] | null;
  focusedWebhookName: string;
}

export function aiPanelBlocks(ctx: SettingsPanelContext): object[] {
  const activeLabel = providerLabel(ctx.aiProvider);
  const otherProvider = ctx.aiProvider === "openai" ? "anthropic" : "openai";
  const otherKeySet = ctx.aiProvider === "openai" ? ctx.anthropicKeySet : ctx.openaiKeySet;
  const activeKeySet = ctx.aiProvider === "openai" ? ctx.openaiKeySet : ctx.anthropicKeySet;

  const blocks: object[] = [
    ctx.apiKeyConfigured
      ? {
          type: "banner",
          title: `${activeLabel} active`,
          description:
            "Form generation, chat, spam scoring, and submission briefs use this provider.",
          variant: "default",
        }
      : {
          type: "banner",
          title: "Add an API key",
          description:
            ctx.aiProvider === "openai"
              ? "Get a key at platform.openai.com, then save below."
              : "Get a key at console.anthropic.com, then save below.",
          variant: "default",
        },
    {
      type: "form",
      block_id: "ai_config",
      fields: [
        {
          type: "select",
          action_id: "ai_provider",
          label: "Provider",
          options: [
            { label: "Anthropic (Claude)", value: "anthropic" },
            { label: "OpenAI", value: "openai" },
          ],
          initial_value: ctx.aiProvider,
        },
        {
          type: "secret_input",
          action_id: "api_key",
          label: "Anthropic API key",
          placeholder: "sk-ant-...",
          has_value: ctx.anthropicKeySet,
          condition: { field: "ai_provider", eq: "anthropic" },
        },
        {
          type: "secret_input",
          action_id: "api_key",
          label: "OpenAI API key",
          placeholder: "sk-...",
          has_value: ctx.openaiKeySet,
          condition: { field: "ai_provider", eq: "openai" },
        },
      ],
      submit: {
        label: "Save AI settings",
        action_id: "save_ai_settings",
        style: "primary",
      },
    },
    ...(otherKeySet
      ? [
          {
            type: "context",
            text: `${providerLabel(otherProvider)} key is also saved — switch provider above and save to use it.`,
          },
        ]
      : []),
    ...(activeKeySet
      ? [
          {
            type: "actions",
            elements: [
              {
                type: "button",
                label: `Remove ${activeLabel} key`,
                action_id: "remove_active_api_key",
                style: "danger",
                confirm: {
                  title: `Remove ${activeLabel} key?`,
                  text: "AI features will be off until you add a key for the selected provider.",
                  confirm: "Remove",
                  deny: "Cancel",
                },
              },
            ],
          },
        ]
      : []),
    { type: "divider" },
    { type: "header", text: "Spam filter defaults" },
  ];

  blocks.push(
    {
      type: "stats",
      items: [
        { label: "Status", value: ctx.spam.enabled ? "On" : "Off" },
        { label: "Threshold", value: `${ctx.spam.threshold} / 10` },
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
          initial_value: ctx.spam.enabled,
        },
        {
          type: "text_input",
          action_id: "spam_threshold",
          label: "Flag threshold (0–10)",
          initial_value: String(ctx.spam.threshold),
          placeholder: "7",
        },
      ],
      submit: {
        label: "Save defaults",
        action_id: "save_spam_settings",
        style: "primary",
      },
    },
  );

  return blocks;
}

export function mcpPanelBlocks(ctx: SettingsPanelContext): object[] {
  return [
    ctx.workerUrl
      ? {
          type: "banner",
          title: "MCP worker configured",
          description: `Endpoint: ${ctx.mcpEndpoint}`,
          variant: "default",
        }
      : {
          type: "banner",
          title: "Using legacy MCP route",
          description:
            "Deploy emdash-freeform-mcp to your own HTTPS URL for production, then save it below.",
          variant: "default",
        },
    {
      type: "form",
      block_id: "mcp_worker",
      fields: [
        {
          type: "text_input",
          action_id: "mcp_worker_url",
          label: "MCP worker base URL (HTTPS)",
          placeholder: "https://freeform-mcp.example.com",
          initial_value: ctx.workerUrl ?? "",
        },
      ],
      submit: { label: "Save MCP URL", action_id: "save_mcp_worker_url" },
    },
    {
      type: "accordion",
      label: "Claude Desktop setup",
      default_open: false,
      blocks: [
        {
          type: "context",
          text: "Create an API token in EmDash admin, then paste the config below into Claude Desktop.",
        },
        {
          type: "fields",
          fields: [
            { label: "MCP endpoint", value: ctx.mcpEndpoint },
            {
              label: "API tokens",
              value: `${ctx.siteOrigin}/_emdash/admin/settings/api-tokens`,
            },
            {
              label: "Legacy route",
              value: `${ctx.siteOrigin}/freeform/mcp`,
            },
          ],
        },
        { type: "code", code: ctx.claudeDesktopConfig, language: "jsonc" },
      ],
    },
  ];
}

function webhookScopeLabel(
  wh: { formId?: string },
  forms: Array<{ id: string; data: StoredForm }>,
): string {
  if (!wh.formId) return "All forms";
  return forms.find((f) => f.id === wh.formId)?.data.name ?? "One form";
}

export function webhooksPanelBlocks(ctx: SettingsPanelContext): object[] {
  const blocks: object[] = [];

  if (ctx.secretReveal) {
    blocks.push(
      {
        type: "banner",
        title:
          ctx.secretReveal.action === "created"
            ? `Webhook "${ctx.secretReveal.webhookName}" created`
            : `Secret rotated — ${ctx.secretReveal.webhookName}`,
        description: `Copy now. Hidden after ${new Date(
          ctx.secretReveal.expiresAt,
        ).toLocaleTimeString()}.`,
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
            initial_value: ctx.secretReveal.secret,
          },
        ],
        submit: { label: "I've copied it", action_id: "hide_webhook_secret" },
      },
      { type: "divider" },
    );
  }

  if (ctx.focusedLog !== null) {
    blocks.push(
      { type: "header", text: `Delivery log — ${ctx.focusedWebhookName}` },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            label: "Close log",
            action_id: "close_webhook_log",
            style: "secondary",
          },
        ],
      },
      ctx.focusedLog.length === 0
        ? {
            type: "empty",
            title: "No deliveries yet",
            description: "Events appear here after submissions trigger this webhook.",
            size: "sm",
          }
        : {
            type: "table",
            columns: [
              { key: "status", label: "Status", format: "badge" },
              { key: "attempts", label: "Attempts", format: "number" },
              { key: "statusCode", label: "HTTP", format: "text" },
              { key: "deliveredAt", label: "Time", format: "relative_time" },
              { key: "error", label: "Error", format: "text" },
            ],
            rows: ctx.focusedLog.map((e) => ({
              status: e.status,
              attempts: String(e.attempts),
              statusCode: e.statusCode != null ? String(e.statusCode) : "—",
              deliveredAt: e.deliveredAt,
              error: e.error ?? "",
            })),
          },
      { type: "divider" },
    );
  }

  if (ctx.webhooks.length === 0) {
    blocks.push({
      type: "empty",
      title: "No webhooks",
      description: "Send submission events to Slack, Zapier, or your own endpoint.",
      size: "lg",
    });
  } else {
    blocks.push(
      ...webhookGridBlocks(ctx.webhooks, (data) => webhookScopeLabel(data, ctx.forms)),
    );
  }

  blocks.push(
    { type: "divider" },
    { type: "header", text: "Add webhook" },
    {
      type: "form",
      block_id: "add_webhook",
      fields: [
        {
          type: "text_input",
          action_id: "webhook_name",
          label: "Name",
          placeholder: "e.g. Slack alerts",
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
            ...ctx.forms.map((f) => ({ label: f.data.name, value: f.id })),
          ],
          initial_value: "__all__",
        },
      ],
      submit: { label: "Add webhook", action_id: "add_webhook", style: "primary" },
    },
  );

  return blocks;
}
