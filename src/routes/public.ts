import { PluginRouteError, type PluginContext } from "emdash";
import { CSRF_FIELD, HONEYPOT_FIELD } from "../constants";
import { generateBrief } from "../ai/brief";
import { scoreSubmissionWithAI } from "../ai/spam";
import { getAiCredentials } from "../lib/ai-config";
import { createCsrfToken, verifyCsrfToken } from "../lib/csrf";
import { sendNotificationsForSubmission } from "../lib/notifications";
import { ensureDemoSeed } from "../lib/seed";
import { effectiveSpamSettings, getSpamSettings } from "../lib/spam-settings";
import {
  TURNSTILE_TOKEN_FIELD,
  verifyTurnstileToken,
} from "../lib/turnstile";
import { deliverWebhooks } from "../lib/webhooks";
import { uid } from "../lib/handles";
import type {
  StoredForm,
  StoredSubmission,
  SubmissionConsentRecord,
} from "../types";

function clientIp(request: Request): string | undefined {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf?.trim()) return cf.trim();
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return undefined;
}

/** Never expose captcha secretKey on the public get-form response. */
function publicFormPayload(formData: StoredForm, resolvedId: string, csrfToken: string) {
  const { captcha, ...rest } = formData;
  const publicCaptcha =
    captcha?.provider === "turnstile" && captcha.siteKey
      ? { provider: "turnstile" as const, siteKey: captcha.siteKey }
      : undefined;
  return {
    id: resolvedId,
    ...rest,
    ...(publicCaptcha ? { captcha: publicCaptcha } : {}),
    csrfToken,
  };
}

export const publicRoutes = {
  "get-form": {
    public: true,
    handler: async (routeCtx: any, ctx: PluginContext) => {
      await ensureDemoSeed(ctx);

      const id = new URL(routeCtx.request.url).searchParams.get("id");
      if (!id) throw PluginRouteError.badRequest("Missing ?id=");

      let resolvedId = id;
      let formData = (await ctx.storage.forms.get(id)) as StoredForm | null;
      if (!formData) {
        const { items } = await ctx.storage.forms.query({ orderBy: { createdAt: "asc" } });
        const all = items as Array<{ id: string; data: StoredForm }>;
        const lower = id.toLowerCase();
        const byHandle = all.find((f) => f.data.handle === id);
        const match =
          byHandle ??
          all.find(
            (f) =>
              f.data.name.toLowerCase().replace(/\s+/g, "-") === lower ||
              f.data.name.toLowerCase() === lower,
          );
        if (match) {
          resolvedId = match.id;
          formData = match.data;
        }
      }
      if (!formData) throw PluginRouteError.notFound(`Form "${id}" not found`);

      const csrfToken = await createCsrfToken(ctx, resolvedId);
      return publicFormPayload(formData, resolvedId, csrfToken);
    },
  },

  submit: {
    public: true,
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const body = routeCtx.input as Record<string, unknown>;
      const { formId, __ff_journey, ...rawData } = body;
      const journey = Array.isArray(__ff_journey)
        ? (__ff_journey as Array<{
            url: string;
            title?: string | null;
            description?: string | null;
            visitedAt: string;
          }>)
        : undefined;

      if (!formId || typeof formId !== "string") {
        return { success: false, error: "Missing formId" };
      }

      const formData = (await ctx.storage.forms.get(formId)) as StoredForm | null;
      if (!formData) return { success: false, error: "Form not found" };

      if (formData.honeypotEnabled !== false) {
        const honeypotValue =
          rawData[HONEYPOT_FIELD] ?? rawData.__ff_honeypot ?? rawData.__ff_hp;
        if (typeof honeypotValue === "string" && honeypotValue.trim() !== "") {
          ctx.log.info("Freeform: honeypot triggered, dropping submission", { formId });
          return {
            success: true,
            message: formData.successMessage || "Thank you for your submission!",
          };
        }
      }

      const csrfToken = rawData[CSRF_FIELD] ?? rawData.csrfToken ?? rawData.__ff_csrf;
      const csrfOk =
        typeof csrfToken === "string" && (await verifyCsrfToken(ctx, csrfToken, formId));
      if (!csrfOk) {
        return {
          success: false,
          error: "Your session has expired. Please refresh the page and try again.",
        };
      }

      const request: Request | undefined = routeCtx.request;
      const ip = request ? clientIp(request) : undefined;

      if (
        formData.captcha?.provider === "turnstile" &&
        formData.captcha.secretKey
      ) {
        const tokenRaw =
          rawData[TURNSTILE_TOKEN_FIELD] ?? rawData.__ff_turnstile;
        const token = typeof tokenRaw === "string" ? tokenRaw : "";
        const verified = await verifyTurnstileToken({
          secretKey: formData.captcha.secretKey,
          token,
          remoteIp: ip,
        });
        if (!verified.ok) {
          return {
            success: false,
            error: verified.error ?? "Captcha check failed. Please try again.",
          };
        }
      }

      const consentFields = formData.rows
        .flatMap((r) => r.fields)
        .filter((f) => f.type === "consent");
      for (const field of consentFields) {
        const val = rawData[field.handle];
        const accepted =
          val === true ||
          val === "true" ||
          val === "on" ||
          val === "1" ||
          (typeof val === "string" && val.toLowerCase() === "yes");
        if (!accepted) {
          return {
            success: false,
            error: `Please accept: ${field.label}`,
          };
        }
      }

      const cleanData: Record<string, string | string[]> = Object.fromEntries(
        Object.entries(rawData)
          .filter(([k]) => !k.startsWith("__ff_") && k !== TURNSTILE_TOKEN_FIELD)
          .map(([k, v]) => [k, Array.isArray(v) ? v.map(String) : String(v)]),
      );

      const consentedAt = new Date().toISOString();
      const consent: SubmissionConsentRecord[] = consentFields.map((f) => ({
        fieldHandle: f.handle,
        label: f.label,
        consentedAt,
        privacyPolicyUrl:
          f.privacyPolicyUrl?.trim() ||
          formData.privacy?.privacyPolicyUrl?.trim() ||
          undefined,
      }));

      const submission: StoredSubmission = {
        formId,
        formName: formData.name,
        data: cleanData,
        createdAt: consentedAt,
      };
      if (journey && journey.length > 0) submission.journey = journey;
      if (consent.length > 0) submission.consent = consent;
      if (formData.privacy?.storeIp && ip) submission.ip = ip;

      const creds = await getAiCredentials(ctx);
      const spam = effectiveSpamSettings(formData, await getSpamSettings(ctx));
      if (creds && spam.enabled) {
        const result = await scoreSubmissionWithAI(formData.name, cleanData, ctx, creds);
        if (result !== null) {
          submission.spamScore = result.score;
          if (result.reason) submission.spamReason = result.reason;
        }
      }

      const submissionId = uid();
      await ctx.storage.submissions.put(submissionId, submission);

      const scoredAsSpam =
        typeof submission.spamScore === "number" && submission.spamScore >= spam.threshold;
      if (scoredAsSpam) {
        ctx.log.info("Notifications + brief skipped: submission scored as spam", {
          submissionId,
          spamScore: submission.spamScore,
          threshold: spam.threshold,
        });
      } else {
        if (creds) {
          const brief = await generateBrief(ctx, formData, submission, creds, journey);
          if (brief) {
            submission.brief = brief;
            await ctx.storage.submissions.put(submissionId, submission);
          }
        }
        await sendNotificationsForSubmission(ctx, formData, submission, submissionId);
      }

      await deliverWebhooks(ctx, formId, formData.handle, submission, submissionId);

      return {
        success: true,
        message: formData.successMessage || "Thank you for your submission!",
      };
    },
  },
};
