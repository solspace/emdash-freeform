import { PluginRouteError, type PluginContext } from "emdash";
import {
  clearOpenAiApiKey,
  getOpenAiApiKey,
  hasOpenAiKey,
  setAiProvider,
  setOpenAiApiKey,
} from "../lib/ai-config";
import {
  getEmailSettings,
  saveEmailSettings,
  sendEmail,
} from "../lib/email-sender";
import {
  effectiveSpamSettings,
  getSpamSettings,
  setFormSpamOverride,
  setSpamSettings,
} from "../lib/spam-settings";
import type { EmailProviderSettings, SpamSettings, StoredForm } from "../types";

function maskKey(key: string | null): { configured: boolean; hint: string | null } {
  if (!key) return { configured: false, hint: null };
  const trimmed = key.trim();
  if (trimmed.length < 8) return { configured: true, hint: "••••" };
  return { configured: true, hint: `…${trimmed.slice(-4)}` };
}

export const settingsRoutes = {
  "get-settings": {
    handler: async (_routeCtx: any, ctx: PluginContext) => {
      const spam = await getSpamSettings(ctx);
      const key = await getOpenAiApiKey(ctx);
      return {
        spam,
        ai: {
          provider: "openai" as const,
          ...maskKey(key),
        },
      };
    },
  },

  "get-ai-settings": {
    handler: async (_routeCtx: any, ctx: PluginContext) => {
      const spam = await getSpamSettings(ctx);
      const key = await getOpenAiApiKey(ctx);
      return {
        provider: "openai" as const,
        ...maskKey(key),
        spam,
      };
    },
  },

  "save-ai-settings": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const input = routeCtx.input as {
        apiKey?: string;
        clearKey?: boolean;
        spamEnabled?: boolean;
        spamThreshold?: number;
      };

      await setAiProvider(ctx, "openai");

      if (input.clearKey) {
        await clearOpenAiApiKey(ctx);
      } else if (typeof input.apiKey === "string" && input.apiKey.trim()) {
        await setOpenAiApiKey(ctx, input.apiKey.trim());
      }

      if (
        typeof input.spamEnabled === "boolean" ||
        typeof input.spamThreshold === "number"
      ) {
        await setSpamSettings(ctx, {
          ...(typeof input.spamEnabled === "boolean"
            ? { enabled: input.spamEnabled }
            : {}),
          ...(typeof input.spamThreshold === "number"
            ? { threshold: input.spamThreshold }
            : {}),
        });
      }

      const key = await getOpenAiApiKey(ctx);
      const spam = await getSpamSettings(ctx);
      return {
        provider: "openai" as const,
        ...maskKey(key),
        spam,
        configured: await hasOpenAiKey(ctx),
      };
    },
  },

  "get-spam-settings": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const globalDefaults = await getSpamSettings(ctx);
      const formId = new URL(routeCtx.request.url).searchParams.get("formId");
      if (!formId) {
        return { ...globalDefaults, scope: "global" as const };
      }
      const form = (await ctx.storage.forms.get(formId)) as StoredForm | null;
      if (!form) throw PluginRouteError.notFound("Form not found");
      const effective = effectiveSpamSettings(form, globalDefaults);
      return {
        ...effective,
        scope: "form" as const,
        formId,
        hasOverride: !!form.spam,
        override: form.spam ?? null,
        globalDefaults,
      };
    },
  },

  "update-spam-settings": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const input = routeCtx.input as Partial<SpamSettings> & {
        formId?: string;
        clearOverride?: boolean;
      };
      if (input.formId) {
        if (input.clearOverride) {
          const form = await setFormSpamOverride(ctx, input.formId, null);
          if (!form) throw PluginRouteError.notFound("Form not found");
          return {
            scope: "form" as const,
            formId: input.formId,
            hasOverride: false,
            override: null,
            globalDefaults: await getSpamSettings(ctx),
          };
        }
        if (typeof input.enabled !== "boolean" || typeof input.threshold !== "number") {
          throw PluginRouteError.badRequest(
            "Per-form override requires both `enabled` (boolean) and `threshold` (number 0-10). Pass `clearOverride: true` to revert to inherit.",
          );
        }
        const form = await setFormSpamOverride(ctx, input.formId, {
          enabled: input.enabled,
          threshold: input.threshold,
        });
        if (!form) throw PluginRouteError.notFound("Form not found");
        return {
          scope: "form" as const,
          formId: input.formId,
          hasOverride: true,
          override: form.spam,
          globalDefaults: await getSpamSettings(ctx),
        };
      }
      const updated = await setSpamSettings(ctx, input);
      return { ...updated, scope: "global" as const };
    },
  },

  "get-email-settings": {
    handler: async (_routeCtx: any, ctx: PluginContext) => {
      const settings = await getEmailSettings(ctx);
      return {
        provider: settings.provider,
        resendApiKey: settings.resendApiKey ? maskKey(settings.resendApiKey).hint : "",
        hasResendApiKey: Boolean(settings.resendApiKey),
        resendFrom: settings.resendFrom,
        smtpHost: settings.smtpHost,
        smtpPort: settings.smtpPort,
        smtpUser: settings.smtpUser,
        smtpPass: settings.smtpPass ? "••••••••" : "",
        hasSmtpPass: Boolean(settings.smtpPass),
        smtpFrom: settings.smtpFrom,
        smtpSecure: settings.smtpSecure,
      };
    },
  },

  "save-email-settings": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const input = routeCtx.input as Partial<EmailProviderSettings> & {
        clearResendKey?: boolean;
        clearSmtpPass?: boolean;
      };

      const patch: Partial<EmailProviderSettings> = {};
      if (input.provider) patch.provider = input.provider;
      if (input.clearResendKey) {
        patch.resendApiKey = "";
      } else if (typeof input.resendApiKey === "string" && !input.resendApiKey.startsWith("…") && !input.resendApiKey.startsWith("••")) {
        patch.resendApiKey = input.resendApiKey;
      }
      if (typeof input.resendFrom === "string") patch.resendFrom = input.resendFrom;
      if (typeof input.smtpHost === "string") patch.smtpHost = input.smtpHost;
      if (typeof input.smtpPort === "number") patch.smtpPort = input.smtpPort;
      if (typeof input.smtpUser === "string") patch.smtpUser = input.smtpUser;
      if (input.clearSmtpPass) {
        patch.smtpPass = "";
      } else if (typeof input.smtpPass === "string" && input.smtpPass !== "••••••••") {
        patch.smtpPass = input.smtpPass;
      }
      if (typeof input.smtpFrom === "string") patch.smtpFrom = input.smtpFrom;
      if (typeof input.smtpSecure === "boolean") patch.smtpSecure = input.smtpSecure;

      const updated = await saveEmailSettings(ctx, patch);
      return {
        provider: updated.provider,
        resendApiKey: updated.resendApiKey ? maskKey(updated.resendApiKey).hint : "",
        hasResendApiKey: Boolean(updated.resendApiKey),
        resendFrom: updated.resendFrom,
        smtpHost: updated.smtpHost,
        smtpPort: updated.smtpPort,
        smtpUser: updated.smtpUser,
        smtpPass: updated.smtpPass ? "••••••••" : "",
        hasSmtpPass: Boolean(updated.smtpPass),
        smtpFrom: updated.smtpFrom,
        smtpSecure: updated.smtpSecure,
      };
    },
  },

  "test-email-settings": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const input = routeCtx.input as { toEmail: string };
      if (!input?.toEmail || !/\S+@\S+\.\S+/.test(input.toEmail)) {
        throw PluginRouteError.badRequest("Valid recipient email is required");
      }

      try {
        const result = await sendEmail(ctx, {
          to: input.toEmail.trim(),
          subject: "[Freeform] Email Delivery Test",
          text: `Congratulations! Your Freeform email delivery configuration is working properly.\n\nProvider: ${ctx.settings ? "configured" : "active"}\nTimestamp: ${new Date().toISOString()}`,
          html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 500px; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
            <h2 style="color: #006ff7; margin-top: 0;">Email Delivery Test Successful</h2>
            <p style="color: #374151; font-size: 15px; line-height: 1.5;">Congratulations! Your Freeform email delivery provider is working properly.</p>
            <div style="background-color: #f3f4f6; padding: 12px 16px; border-radius: 6px; font-size: 13px; color: #4b5563; margin-top: 16px;">
              <div><strong>Recipient:</strong> ${input.toEmail}</div>
              <div style="margin-top: 4px;"><strong>Sent at:</strong> ${new Date().toLocaleString()}</div>
            </div>
          </div>`,
        });

        return {
          ok: true,
          provider: result.provider,
          messageId: result.id,
          to: input.toEmail,
        };
      } catch (err: any) {
        throw PluginRouteError.badRequest(`Email connection test failed: ${err.message || String(err)}`);
      }
    },
  },
};
