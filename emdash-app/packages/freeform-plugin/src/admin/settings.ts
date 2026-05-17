import type { PluginContext } from "emdash";
import { getMaskedKey, getTier } from "../lib/license";
import { getSpamSettings } from "../lib/spam-settings";

export async function settingsBlocks(
  ctx: PluginContext,
  siteOrigin: string,
): Promise<object[]> {
  const tier = await getTier(ctx);
  const maskedKey = await getMaskedKey(ctx);
  const hasKey = maskedKey.length > 0;
  const spam = await getSpamSettings(ctx);

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
    { type: "header", text: "AI Spam Filter" },
    tier === "pro"
      ? {
          type: "section",
          text:
            "Score incoming submissions for spam likelihood using Claude Haiku. " +
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
  ];
}
