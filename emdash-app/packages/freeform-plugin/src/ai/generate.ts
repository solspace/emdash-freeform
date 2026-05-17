import type { PluginContext } from "emdash";
import {
  ALL_FIELD_TYPES,
  ANTHROPIC_API_KEY,
  FREE_FIELD_TYPES,
  MAX_NEW_FIELDS_PER_GENERATION,
  MAX_TOTAL_FIELDS_PER_FORM,
} from "../constants";
import { toHandle, uid } from "../lib/handles";
import { isOptionType } from "../lib/options";
import type { FieldOption, FieldType, FormField, FormRow, StoredForm } from "../types";

export interface GenerateResult {
  rows: FormRow[];
  added: number;
  duplicatesSkipped: number;
  cappedAt: number | null;
  totalCapped: number | null;
}

export async function generateWithAI(
  description: string,
  tier: "free" | "pro",
  existingForm: StoredForm,
  ctx: PluginContext,
): Promise<GenerateResult> {
  const allowed = tier === "pro" ? ALL_FIELD_TYPES : FREE_FIELD_TYPES;

  // The model needs to see existing fields so it doesn't propose duplicates
  // and can place new fields sensibly relative to current column layout.
  const existingFields = existingForm.rows.flatMap((r) =>
    r.fields.map((f) => ({ type: f.type, label: f.label, handle: f.handle })),
  );
  const existingSummary =
    existingFields.length === 0
      ? "The form is empty."
      : existingFields
          .map((f, i) => `  ${i + 1}. ${f.label} (handle: ${f.handle}, type: ${f.type})`)
          .join("\n");

  const res = await ctx.http!.fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      tools: [
        {
          name: "build_form",
          description:
            "Generates ONLY the NEW rows to append to a form that already exists. " +
            "Do not regenerate existing fields. Each row contains one or more fields displayed side-by-side on the same line.",
          input_schema: {
            type: "object",
            required: ["rows"],
            properties: {
              rows: {
                type: "array",
                description: "NEW rows to append. Fields within a row are shown side-by-side.",
                items: {
                  type: "object",
                  required: ["fields"],
                  properties: {
                    fields: {
                      type: "array",
                      minItems: 1,
                      maxItems: 3,
                      items: {
                        type: "object",
                        required: ["type", "label", "handle", "required"],
                        properties: {
                          type: { type: "string", enum: allowed },
                          label: { type: "string" },
                          handle: {
                            type: "string",
                            description: "snake_case identifier derived from label",
                          },
                          required: { type: "boolean" },
                          placeholder: { type: "string" },
                          options: {
                            type: "array",
                            description:
                              "Choices for radio, select, multi_select, and checkbox_group fields. Required for those types; omit for all other types.",
                            items: {
                              type: "object",
                              required: ["value", "label"],
                              properties: {
                                value: {
                                  type: "string",
                                  description: "Stable machine value (snake_case)",
                                },
                                label: {
                                  type: "string",
                                  description: "Human-readable label",
                                },
                              },
                            },
                          },
                          defaultValue: {
                            description:
                              "Optional pre-filled value. String for single-value types; array of strings for checkbox_group and multi_select. For 'checkbox' (single), use 'true' to default-checked. For radio/select, must equal one of the option values. For checkbox_group/multi_select, every entry must equal one of the option values.",
                            oneOf: [
                              { type: "string" },
                              { type: "array", items: { type: "string" } },
                            ],
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      ],
      tool_choice: { type: "tool", name: "build_form" },
      messages: [
        {
          role: "user",
          content:
            `You are adding fields to an EXISTING form. Do NOT recreate fields that are already there.\n\n` +
            `Existing fields on the form:\n${existingSummary}\n\n` +
            `User request: "${description}"\n\n` +
            `Rules:\n` +
            `- Only generate NEW fields. If the user asks for a field that already exists (same purpose), do NOT add a duplicate — return zero rows.\n` +
            `- Available field types: ${allowed.join(", ")}. Do not substitute unavailable types with different types — omit them instead.\n` +
            `- "checkbox" is a single yes/no field (e.g. "I agree to terms"). "checkbox_group" presents multiple checkboxes to pick any combination. "radio" picks exactly one. "select" is a dropdown picking one. "multi_select" is a dropdown picking any combination.\n` +
            `- For radio, select, multi_select, and checkbox_group, you MUST include an "options" array with at least 2 entries, each having a snake_case "value" and a human-readable "label". Omit "options" for all other types.\n` +
            `- When the user asks for a pre-filled / pre-selected / default value (e.g. "default to checked", "pre-select United States", "pre-fill 'Newsletter subscriber'"), include "defaultValue". For checkbox use "true" to default-checked. For radio/select use the chosen option's value. For checkbox_group/multi_select use an array of option values.\n` +
            `- Generate the minimum number of fields needed. If the user asks for "a message field" and a message field exists, return zero rows.\n` +
            `- Field handles must be unique snake_case and must not collide with any existing handle listed above.`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    content: Array<{
      type: string;
      input: {
        rows: Array<{
          fields: Array<{
            type: FieldType;
            label: string;
            handle: string;
            required: boolean;
            placeholder?: string;
            options?: FieldOption[];
            defaultValue?: string | string[];
          }>;
        }>;
      };
    }>;
  };

  const toolUse = json.content.find((c) => c.type === "tool_use");
  if (!toolUse?.input?.rows) throw new Error("Unexpected AI response format");

  // Server-side safeguards. The AI is instructed to dedupe and stay reasonable,
  // but we never trust that — these caps and the handle filter are enforced
  // regardless of what comes back.
  const existingHandles = new Set(existingFields.map((f) => f.handle));
  const seenInThisGen = new Set<string>();
  let duplicatesSkipped = 0;
  let totalKept = 0;
  let cappedAt: number | null = null;
  let totalCapped: number | null = null;

  const remainingCapacity = Math.max(0, MAX_TOTAL_FIELDS_PER_FORM - existingFields.length);

  const rows: FormRow[] = [];
  outer: for (const row of toolUse.input.rows) {
    const fields: FormField[] = [];
    for (const f of row.fields) {
      const handle = (f.handle || toHandle(f.label)).trim();
      if (existingHandles.has(handle) || seenInThisGen.has(handle)) {
        duplicatesSkipped++;
        continue;
      }
      // Drop option-typed fields without at least two options. The prompt
      // is clear; if the model still produces incomplete options, the field
      // would render as an empty dropdown — better to omit it.
      if (isOptionType(f.type) && (!f.options || f.options.length < 2)) continue;
      if (totalKept >= MAX_NEW_FIELDS_PER_GENERATION) {
        cappedAt = MAX_NEW_FIELDS_PER_GENERATION;
        break outer;
      }
      if (totalKept >= remainingCapacity) {
        totalCapped = MAX_TOTAL_FIELDS_PER_FORM;
        break outer;
      }
      seenInThisGen.add(handle);
      totalKept++;
      fields.push({
        id: uid(),
        type: f.type,
        label: f.label,
        handle,
        required: f.required ?? false,
        placeholder: f.placeholder,
        options: isOptionType(f.type) ? f.options : undefined,
        defaultValue: f.defaultValue,
      });
    }
    if (fields.length > 0) rows.push({ id: uid(), fields });
  }

  return { rows, added: totalKept, duplicatesSkipped, cappedAt, totalCapped };
}
