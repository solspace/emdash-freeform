import type { PluginContext } from "emdash";
import { ANTHROPIC_API_KEY } from "../constants";

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
): Promise<SpamScoreResult | null> {
  const payload = Object.entries(data)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
    .join("\n");

  try {
    const res = await ctx.http!.fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 256,
        tools: [
          {
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
        ],
        tool_choice: { type: "tool", name: "score_spam" },
        messages: [
          {
            role: "user",
            content:
              `Form "${formName}" received this submission. Score the spam likelihood and explain briefly.\n\n` +
              payload,
          },
        ],
      }),
    });

    if (!res.ok) return null;

    const json = (await res.json()) as {
      content: Array<{ type: string; input?: { score?: number; reason?: string } }>;
    };
    const tool = json.content.find((c) => c.type === "tool_use");
    const score = tool?.input?.score;
    const reason = tool?.input?.reason;
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
