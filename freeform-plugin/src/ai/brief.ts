import type { PluginContext } from "emdash";
import type { StoredForm, StoredSubmission, SubmissionBrief, VisitorPageView } from "../types";

// Generates a structured sales-engineer brief for a submission, optionally
// enriched with the visitor's pre-submission page journey. Returns null on
// API failure — the submission is still stored, the brief is just absent.

const SYSTEM = `You are an inbound-lead triage analyst. You are given a contact form submission and (often) the list of pages the visitor browsed on the site just before submitting.

Produce a brief that a senior sales engineer can read in ten seconds before responding. Be specific, not generic. Quote facts the visitor or the page journey actually told you. Never invent details.

Urgency:
- "high" = explicit deadline, in-flight program, named procurement, or strong intent signals
- "medium" = clear intent, no explicit deadline
- "low" = exploratory / educational

keyFacts should be bullet-able fragments (5 or fewer), each pulled directly from the submission or journey. Skip anything generic.

suggestedAction = the single most useful next step for the engineer (e.g. "schedule discovery call within 48h" / "send Cartwright Heavy datasheet" / "loop in defense partnerships lead").`;

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
  apiKey: string,
  journey?: VisitorPageView[],
): Promise<SubmissionBrief | null> {
  const userMsg = `Form: ${form.name}

Submission fields:
${formatSubmissionData(submission.data)}

Visitor journey (page-by-page, oldest first):
${formatJourney(journey)}`;

  try {
    const res = await ctx.http!.fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 700,
        system: SYSTEM,
        tools: [
          {
            name: "record_brief",
            description:
              "Record the triage brief for this inbound submission. Must be called exactly once.",
            input_schema: {
              type: "object",
              required: ["intent", "urgency", "summary", "keyFacts", "suggestedAction"],
              properties: {
                intent: {
                  type: "string",
                  description:
                    "Short label for what the visitor is asking for (e.g. 'demo request', 'sustainment contract inquiry', 'partner-test program', 'press').",
                },
                urgency: { type: "string", enum: ["low", "medium", "high"] },
                summary: {
                  type: "string",
                  description: "1–2 specific sentences a sales engineer can read at a glance.",
                },
                keyFacts: {
                  type: "array",
                  items: { type: "string" },
                  description: "Up to 5 specific bullet-able facts from the submission or journey.",
                },
                suggestedAction: {
                  type: "string",
                  description: "Single concrete next step.",
                },
              },
            },
          },
        ],
        tool_choice: { type: "tool", name: "record_brief" },
        messages: [{ role: "user", content: userMsg }],
      }),
    });

    if (!res.ok) {
      ctx.log.warn("Brief generation failed", { status: res.status });
      return null;
    }

    const json = (await res.json()) as {
      content?: Array<
        | { type: "text"; text: string }
        | { type: "tool_use"; name: string; input: Record<string, unknown> }
      >;
    };
    const tool = json.content?.find(
      (b): b is { type: "tool_use"; name: string; input: Record<string, unknown> } =>
        b.type === "tool_use" && b.name === "record_brief",
    );
    if (!tool) return null;

    const input = tool.input;
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
