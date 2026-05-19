import type { PluginContext } from "emdash";
import { generateBrief } from "../ai/brief";
import { scoreSubmissionWithAI } from "../ai/spam";
import { getTier } from "./license";
import { sendNotificationsForSubmission } from "./notifications";
import { effectiveSpamSettings, getSpamSettings } from "./spam-settings";
import { uid } from "./handles";
import type {
  FieldType,
  FormField,
  StoredForm,
  StoredSubmission,
} from "../types";

const AGENT_RATE_LIMIT_PER_HOUR = 10;

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

// Hour-bucketed soft limit per IP. Falls open when ip is null (dev / chat
// path without forwarded headers). Stale buckets accumulate — acceptable
// for POC scale; sweep or move to KV TTL later.
const rateLimitCheck = async (
  ctx: PluginContext,
  ip: string | null | undefined,
): Promise<boolean> => {
  if (!ip) return true;
  const bucket = Math.floor(Date.now() / 3_600_000);
  const key = `agent-rl:${ip}:${bucket}`;
  const count = (await ctx.kv.get<number>(key)) ?? 0;
  if (count >= AGENT_RATE_LIMIT_PER_HOUR) return false;
  await ctx.kv.set(key, count + 1);
  return true;
};

export async function runAgentSubmission(
  ctx: PluginContext,
  input: AgentSubmissionInput,
): Promise<AgentSubmissionResult> {
  const { formId, data, journey, ip } = input;
  if (!formId || typeof formId !== "string") {
    return { success: false, error: "Missing formId" };
  }

  if (!(await rateLimitCheck(ctx, ip))) {
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

  const tier = await getTier(ctx);
  const spam = effectiveSpamSettings(formData, await getSpamSettings(ctx));
  if (tier === "pro" && spam.enabled) {
    const result = await scoreSubmissionWithAI(formData.name, cleanData, ctx);
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
    const brief = await generateBrief(ctx, formData, submission, journey);
    if (brief) {
      submission.brief = brief;
      await ctx.storage.submissions.put(submissionId, submission);
    }
    await sendNotificationsForSubmission(ctx, formData, submission, submissionId);
  } else {
    ctx.log.info("Agent submission scored as spam; notifications + brief skipped", {
      submissionId,
      spamScore: submission.spamScore,
    });
  }

  return {
    success: true,
    submissionId,
    message: formData.successMessage || "Thank you for your submission!",
  };
}

export { findFormByHandle };
