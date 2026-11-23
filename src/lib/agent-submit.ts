import type { PluginContext } from "emdash";
import { generateBrief } from "../ai/brief";
import { scoreSubmissionWithAI } from "../ai/spam";
import { getAiCredentials } from "./ai-config";
import { formHasTurnstile, isAgentSubmitEnabled } from "./form-access";
import { sendNotificationsForSubmission } from "./notifications";
import { rateLimitCheck } from "./rate-limit";
import { effectiveSpamSettings, getSpamSettings } from "./spam-settings";
import {
  TURNSTILE_TOKEN_FIELD,
  verifyTurnstileToken,
} from "./turnstile";
import { deliverWebhooks } from "./webhooks";
import { uid } from "./handles";
import type {
  FieldType,
  FormField,
  StoredForm,
  StoredSubmission,
} from "../types";

export const AGENT_RATE_LIMIT_PER_HOUR = 10;

export interface VisitorPageView {
  url: string;
  title?: string | null;
  description?: string | null;
  visitedAt: string;
}

export interface AgentSubmissionInput {
  formId: string;
  data: Record<string, unknown>;
  journey?: VisitorPageView[];
  ip?: string | null;
  /**
   * When true, skip the per-form agentSubmitEnabled gate (chat path already
   * checked chatEnabled). Turnstile and rate limits still apply.
   */
  fromChat?: boolean;
  /** Cloudflare Turnstile response token when the form requires captcha. */
  turnstileToken?: string;
}

export interface AgentSubmissionResult {
  success: boolean;
  message?: string;
  error?: string;
  submissionId?: string;
}

const findFormByHandle = async (
  ctx: PluginContext,
  handle: string,
): Promise<{ id: string; data: StoredForm } | null> => {
  const { items } = await ctx.storage.forms.query({ orderBy: { createdAt: "asc" } });
  const all = items as Array<{ id: string; data: StoredForm }>;
  return all.find((f) => f.data.handle === handle) ?? null;
};

const coerceFieldValue = (
  field: FormField,
  raw: unknown,
): string | string[] | undefined => {
  if (raw === undefined || raw === null) return undefined;
  const multi: FieldType[] = ["checkbox_group", "multi_select"];
  if (multi.includes(field.type)) {
    if (Array.isArray(raw)) return raw.map(String);
    if (typeof raw === "string" && raw) return [raw];
    return [];
  }
  if (field.type === "checkbox") {
    if (typeof raw === "boolean") return raw ? "true" : "false";
    return String(raw);
  }
  if (Array.isArray(raw)) return raw.length > 0 ? String(raw[0]) : "";
  return String(raw);
};

export async function runAgentSubmission(
  ctx: PluginContext,
  input: AgentSubmissionInput,
): Promise<AgentSubmissionResult> {
  const { formId, data, journey, ip, fromChat, turnstileToken } = input;
  if (!formId || typeof formId !== "string") {
    return { success: false, error: "Missing formId" };
  }

  if (
    !(await rateLimitCheck(ctx, ip, {
      prefix: "agent-rl",
      limit: AGENT_RATE_LIMIT_PER_HOUR,
    }))
  ) {
    return { success: false, error: "Rate limit exceeded. Try again later." };
  }

  let resolvedId = formId;
  let formData = (await ctx.storage.forms.get(formId)) as StoredForm | null;
  if (!formData) {
    const found = await findFormByHandle(ctx, formId);
    if (found) {
      resolvedId = found.id;
      formData = found.data;
    }
  }
  if (!formData) return { success: false, error: "Form not found" };

  if (!fromChat && !isAgentSubmitEnabled(formData)) {
    return {
      success: false,
      error: "Agent submissions are disabled for this form.",
    };
  }

  if (formHasTurnstile(formData)) {
    // Chat cannot present Turnstile; refuse chat-driven submit when captcha is on.
    if (fromChat) {
      return {
        success: false,
        error:
          "This form requires Cloudflare Turnstile. Use the standard form submit instead of chat.",
      };
    }
    const token =
      turnstileToken?.trim() ||
      (typeof data[TURNSTILE_TOKEN_FIELD] === "string"
        ? String(data[TURNSTILE_TOKEN_FIELD])
        : typeof data.__ff_turnstile === "string"
          ? String(data.__ff_turnstile)
          : "");
    const verified = await verifyTurnstileToken({
      secretKey: formData.captcha!.secretKey!,
      token,
      remoteIp: ip ?? undefined,
    });
    if (!verified.ok) {
      return {
        success: false,
        error: verified.error ?? "Captcha check failed. Please try again.",
      };
    }
  }

  const cleanData: Record<string, string | string[]> = {};
  for (const row of formData.rows) {
    for (const field of row.fields) {
      const coerced = coerceFieldValue(field, data[field.handle]);
      if (coerced !== undefined) cleanData[field.handle] = coerced;
    }
  }

  const submission: StoredSubmission = {
    formId: resolvedId,
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
  if (!scoredAsSpam) {
    // Generate the AI brief synchronously and write it back. Failures here
    // don't block the submission — the brief is best-effort enrichment.
    if (creds) {
      const brief = await generateBrief(ctx, formData, submission, creds, journey);
      if (brief) {
        submission.brief = brief;
        await ctx.storage.submissions.put(submissionId, submission);
      }
    }
    await sendNotificationsForSubmission(ctx, formData, submission, submissionId);
  } else {
    ctx.log.info("Agent submission scored as spam; notifications + brief skipped", {
      submissionId,
      spamScore: submission.spamScore,
    });
  }

  // Same as public HTML submit: webhooks always fire (including spam-scored).
  await deliverWebhooks(ctx, resolvedId, formData.handle, submission, submissionId);

  return {
    success: true,
    submissionId,
    message: formData.successMessage || "Thank you for your submission!",
  };
}

export { findFormByHandle };
