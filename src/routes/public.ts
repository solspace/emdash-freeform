import { PluginRouteError, type PluginContext } from "emdash";
import { CSRF_FIELD, HONEYPOT_FIELD } from "../constants";
import { generateBrief } from "../ai/brief";
import { scoreSubmissionWithAI } from "../ai/spam";
import { getAiCredentials } from "../lib/ai-config";
import { createCsrfToken, verifyCsrfToken } from "../lib/csrf";
import { sendNotificationsForSubmission } from "../lib/notifications";
import { ensureDemoSeed } from "../lib/seed";
import { effectiveSpamSettings, getSpamSettings } from "../lib/spam-settings";
import { deliverWebhooks } from "../lib/webhooks";
import { uid } from "../lib/handles";
import type { StoredForm, StoredSubmission } from "../types";

export const publicRoutes = {
  "get-form": {
    public: true,
    handler: async (routeCtx: any, ctx: PluginContext) => {
      // Lazy first-run seed: a customer can embed <FreeformForm formId="contact" />
      // on their site and visit it before ever opening the Freeform admin, which
      // would otherwise render "Failed to load form." The seed is idempotent and
      // costs a single KV read after the first run.
      await ensureDemoSeed(ctx);

      const id = new URL(routeCtx.request.url).searchParams.get("id");
      if (!id) throw PluginRouteError.badRequest("Missing ?id=");

      // Resolution priority:
      //   1. Literal storage id          — fastest path
      //   2. Form handle (exact)         — stable, recommended for templates
      //   3. Slugified name (legacy)     — kept for back-compat with pages
      //                                    written before handles existed
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
      return { id: resolvedId, ...formData, csrfToken };
    },
  },

  submit: {
    public: true,
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const body = routeCtx.input as Record<string, unknown>;
      const { formId, __ff_journey, ...rawData } = body;
      const journey = Array.isArray(__ff_journey)
        ? (__ff_journey as Array<{ url: string; title?: string | null; description?: string | null; visitedAt: string }>)
        : undefined;

      if (!formId || typeof formId !== "string") {
        return { success: false, error: "Missing formId" };
      }

      const formData = (await ctx.storage.forms.get(formId)) as StoredForm | null;
      if (!formData) return { success: false, error: "Form not found" };

      // Honeypot: silently accept and drop. Returning success prevents bots
      // from learning that a hidden field is the tell.
      const honeypotValue = rawData[HONEYPOT_FIELD];
      if (typeof honeypotValue === "string" && honeypotValue.trim() !== "") {
        ctx.log.info("Freeform: honeypot triggered, dropping submission", { formId });
        return {
          success: true,
          message: formData.successMessage || "Thank you for your submission!",
        };
      }

      const csrfToken = rawData[CSRF_FIELD];
      const csrfOk =
        typeof csrfToken === "string" && (await verifyCsrfToken(ctx, csrfToken, formId));
      if (!csrfOk) {
        return {
          success: false,
          error: "Your session has expired. Please refresh the page and try again.",
        };
      }

      const cleanData: Record<string, string | string[]> = Object.fromEntries(
        Object.entries(rawData)
          .filter(([k]) => !k.startsWith("__ff_"))
          .map(([k, v]) => [k, Array.isArray(v) ? v.map(String) : String(v)]),
      );

      const submission: StoredSubmission = {
        formId,
        formName: formData.name,
        data: cleanData,
        createdAt: new Date().toISOString(),
      };
      if (journey && journey.length > 0) submission.journey = journey;

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

      // Deliver webhooks. Errors are caught internally and queued for retry —
      // they never prevent a success response from reaching the submitter.
      await deliverWebhooks(ctx, formId, formData.handle, submission, submissionId);

      return {
        success: true,
        message: formData.successMessage || "Thank you for your submission!",
      };
    },
  },
};
