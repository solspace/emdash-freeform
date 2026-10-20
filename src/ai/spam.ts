import type { PluginContext } from "emdash";
import type { AiCredentials } from "../lib/ai-config";
import { callToolUse } from "./llm";

export interface SpamScoreResult {
  score: number;
  reason: string;
}

// Returns null on error; the submit handler treats null as "no score" rather
// than blocking the submission.
export async function scoreSubmissionWithAI(
  formName: string,
  data: Record<string, string | string[]>,
  ctx: PluginContext,
  creds: AiCredentials,
): Promise<SpamScoreResult | null> {
  const payload = Object.entries(data)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
    .join("\n");

  try {
    const { toolInput } = await callToolUse(ctx, creds, {
      tier: "fast",
      tool: {
        name: "score_spam",
        description:
          "Score a form submission for spam likelihood on a 0-10 scale where 0 is clearly legitimate and 10 is clearly spam (gibberish, link-stuffing, scam offers, irrelevant marketing, abusive language, etc.).",
        input_schema: {
          type: "object",
          required: ["score", "reason"],
          properties: {
            score: { type: "integer", minimum: 0, maximum: 10 },
            reason: { type: "string", description: "Brief explanation (< 1 sentence)" },
          },
        },
      },
      userMessage:
        `Form "${formName}" received this submission. Score the spam likelihood and explain briefly.\n\n` +
        payload,
    });

    const score = toolInput.score;
    const reason = toolInput.reason;
    if (typeof score !== "number") return null;
    return {
      score: Math.max(0, Math.min(10, Math.round(score))),
      reason: typeof reason === "string" ? reason.trim() : "",
    };
  } catch (err) {
    ctx.log.error("Spam scoring failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
