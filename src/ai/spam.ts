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
        description: "Spam score 0–10 (0=legit, 10=spam).",
        input_schema: {
          type: "object",
          required: ["score", "reason"],
          properties: {
            score: { type: "integer", minimum: 0, maximum: 10 },
            reason: { type: "string", description: "One sentence." },
          },
        },
      },
      userMessage: `Form "${formName}" submission — score spam:\n\n` + payload,
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
