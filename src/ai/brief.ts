import type { PluginContext } from "emdash";
import type { AiCredentials } from "../lib/ai-config";
import type { StoredForm, StoredSubmission, SubmissionBrief, VisitorPageView } from "../types";
import { callToolUse } from "./llm";

// Generates a structured sales-engineer brief for a submission, optionally
// enriched with the visitor's pre-submission page journey. Returns null on
// API failure — the submission is still stored, the brief is just absent.

const SYSTEM = `Inbound-lead triage. Brief a sales engineer in ~10s. Be specific; never invent.

Urgency: high=deadline/procurement/strong intent; medium=clear intent; low=exploratory.
keyFacts: ≤5 facts from submission/journey. suggestedAction: one concrete next step.`;

const formatSubmissionData = (data: Record<string, string | string[]>): string => {
  return Object.entries(data)
    .map(([k, v]) => `  ${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
    .join("\n");
};

const formatJourney = (journey?: VisitorPageView[]): string => {
  if (!journey || journey.length === 0) return "  (no page journey captured)";
  return journey
    .map((p) => {
      const meta = [p.title, p.description].filter(Boolean).join(" — ");
      return `  ${p.visitedAt}  ${p.url}${meta ? `  ·  ${meta}` : ""}`;
    })
    .join("\n");
};

export async function generateBrief(
  ctx: PluginContext,
  form: StoredForm,
  submission: StoredSubmission,
  creds: AiCredentials,
  journey?: VisitorPageView[],
): Promise<SubmissionBrief | null> {
  const userMsg = `Form: ${form.name}

Submission fields:
${formatSubmissionData(submission.data)}

Visitor journey (page-by-page, oldest first):
${formatJourney(journey)}`;

  try {
    const { toolInput: input } = await callToolUse(ctx, creds, {
      tier: "smart",
      system: SYSTEM,
      tool: {
        name: "record_brief",
        description: "Record triage brief once.",
        input_schema: {
          type: "object",
          required: ["intent", "urgency", "summary", "keyFacts", "suggestedAction"],
          properties: {
            intent: { type: "string", description: "Short ask label (e.g. demo, press)." },
            urgency: { type: "string", enum: ["low", "medium", "high"] },
            summary: { type: "string", description: "1–2 specific sentences." },
            keyFacts: {
              type: "array",
              items: { type: "string" },
              description: "≤5 facts from submission/journey.",
            },
            suggestedAction: { type: "string", description: "One next step." },
          },
        },
      },
      userMessage: userMsg,
    });
    const keyFacts = Array.isArray(input.keyFacts) ? (input.keyFacts as unknown[]).map(String) : [];
    const urgency = ["low", "medium", "high"].includes(String(input.urgency))
      ? (input.urgency as "low" | "medium" | "high")
      : "medium";

    return {
      intent: String(input.intent ?? "").trim() || "general inquiry",
      urgency,
      summary: String(input.summary ?? "").trim(),
      keyFacts,
      suggestedAction: String(input.suggestedAction ?? "").trim(),
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    ctx.log.warn("Brief generation threw", { err: String(err) });
    return null;
  }
}
