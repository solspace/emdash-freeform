import type { PluginContext } from "emdash";
import {
  ALL_FIELD_TYPES,
  ANTHROPIC_API_KEY,
  FREE_FIELD_TYPES,
  MAX_NEW_FIELDS_PER_GENERATION,
  MAX_TOTAL_FIELDS_PER_FORM,
} from "../constants";
import { toHandle, uid } from "../lib/handles";
import { isMultiType, isOptionType } from "../lib/options";
import type {
  FieldOption,
  FieldType,
  FormField,
  FormRow,
  StoredForm,
} from "../types";

export interface ApplyResult {
  added: number;
  updated: number;
  removed: number;
  duplicatesSkipped: number;
  notFound: string[];
  cappedAt: number | null;
  totalCapped: number | null;
}

export interface EditResult {
  newForm: StoredForm;
  summary: ApplyResult;
}

type AIOp =
  | { op: "add_row"; fields: AIField[] }
  | {
      op: "update_field";
      handle: string;
      label?: string;
      required?: boolean;
      placeholder?: string;
      options?: FieldOption[];
      defaultValue?: string | string[] | null;
    }
  | { op: "remove_field"; handle: string };

interface AIField {
  type: FieldType;
  label: string;
  handle?: string;
  required?: boolean;
  placeholder?: string;
  options?: FieldOption[];
  defaultValue?: string | string[];
}

export async function editFormWithAI(
  description: string,
  tier: "free" | "pro",
  existingForm: StoredForm,
  ctx: PluginContext,
): Promise<EditResult> {
  const allowed = tier === "pro" ? ALL_FIELD_TYPES : FREE_FIELD_TYPES;

  const existingFields = existingForm.rows.flatMap((r) =>
    r.fields.map((f) => ({
      type: f.type,
      label: f.label,
      handle: f.handle,
      required: f.required,
      hasOptions: Array.isArray(f.options) && f.options.length > 0,
    })),
  );

  const existingSummary =
    existingFields.length === 0
      ? "The form is empty."
      : existingFields
          .map(
            (f, i) =>
              `  ${i + 1}. label="${f.label}" handle="${f.handle}" type=${f.type} required=${f.required}`,
          )
          .join("\n");

  const FIELD_INPUT_SCHEMA = {
    type: "object",
    required: ["type", "label"],
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
          "Choices for radio, select, multi_select, checkbox_group. Required for those types; omit otherwise.",
        items: {
          type: "object",
          required: ["value", "label"],
          properties: {
            value: { type: "string" },
            label: { type: "string" },
          },
        },
      },
      defaultValue: {
        description:
          "Optional pre-filled value. String for single-value types; array for checkbox_group/multi_select.",
        oneOf: [
          { type: "string" },
          { type: "array", items: { type: "string" } },
        ],
      },
    },
  } as const;

  const res = await ctx.http!.fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      tools: [
        {
          name: "apply_form_edits",
          description:
            "Apply a batch of edits to the existing form. Each operation is one of: " +
            "`add_row` (append a new row of one or more fields), " +
            "`update_field` (change properties of an existing field referenced by handle), " +
            "or `remove_field` (delete an existing field by handle). " +
            "Use the minimum number of operations needed to satisfy the user's request.",
          input_schema: {
            type: "object",
            required: ["operations"],
            properties: {
              operations: {
                type: "array",
                items: {
                  type: "object",
                  required: ["op"],
                  properties: {
                    op: {
                      type: "string",
                      enum: ["add_row", "update_field", "remove_field"],
                    },
                    // add_row
                    fields: {
                      type: "array",
                      minItems: 1,
                      maxItems: 4,
                      description:
                        "For `add_row` only. Fields displayed side-by-side on the new row.",
                      items: FIELD_INPUT_SCHEMA,
                    },
                    // update_field / remove_field
                    handle: {
                      type: "string",
                      description:
                        "For `update_field` and `remove_field`: the handle of an EXISTING field listed in the form summary.",
                    },
                    // update_field only — partial update of an existing field
                    label: { type: "string" },
                    required: { type: "boolean" },
                    placeholder: { type: "string" },
                    options: {
                      type: "array",
                      description:
                        "For `update_field` on option-bearing types only: replacement options array.",
                      items: {
                        type: "object",
                        required: ["value", "label"],
                        properties: {
                          value: { type: "string" },
                          label: { type: "string" },
                        },
                      },
                    },
                    defaultValue: {
                      description:
                        "For `update_field`: new default value, or null to clear an existing default.",
                      oneOf: [
                        { type: "string" },
                        { type: "array", items: { type: "string" } },
                        { type: "null" },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      ],
      tool_choice: { type: "tool", name: "apply_form_edits" },
      messages: [
        {
          role: "user",
          content:
            `You are editing an existing form. Pick the minimum set of operations that satisfies the user's request.\n\n` +
            `Existing fields:\n${existingSummary}\n\n` +
            `User request: "${description}"\n\n` +
            `Rules:\n` +
            `- Operations: \`add_row\` to append new fields, \`update_field\` to change properties of an existing field (by handle), \`remove_field\` to delete one (by handle).\n` +
            `- "Make only the X field required" means: set required=true on X AND set required=false on every other currently-required field. Emit one update_field op per affected field.\n` +
            `- Only refer to handles that appear in the "Existing fields" list above. Do not invent new handles for update_field/remove_field.\n` +
            `- For add_row: do not duplicate existing fields. If the user asks to add a field that already exists by purpose, skip it.\n` +
            `- Available field types: ${allowed.join(", ")}. Do not substitute with other types.\n` +
            `- "checkbox" is a single yes/no field. "checkbox_group" lets the user pick any combination. "radio" picks exactly one. "select" is a dropdown. "multi_select" is a multi-pick dropdown. radio/select/multi_select/checkbox_group all REQUIRE an "options" array (≥ 2 entries) with snake_case "value" and human "label".\n` +
            `- For update_field with options-bearing types, only include "options" if the user explicitly wants the choice list replaced.\n` +
            `- For defaultValue: string for single-value types; array for checkbox_group and multi_select; pass null in update_field to clear a default.\n` +
            `- Do not return operations that result in no observable change. If the request is already satisfied, return an empty operations array.\n` +
            `- New handles (in add_row fields) must be unique snake_case and must not collide with any existing handle.`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    content: Array<{ type: string; input?: { operations?: AIOp[] } }>;
  };
  const toolUse = json.content.find((c) => c.type === "tool_use");
  if (!toolUse?.input || !Array.isArray(toolUse.input.operations)) {
    throw new Error("Unexpected AI response format");
  }

  return applyOps(existingForm, toolUse.input.operations);
}

function applyOps(form: StoredForm, ops: AIOp[]): EditResult {
  let rows = form.rows.map((r) => ({ id: r.id, fields: [...r.fields] }));
  const existingHandles = new Set(rows.flatMap((r) => r.fields.map((f) => f.handle)));

  const summary: ApplyResult = {
    added: 0,
    updated: 0,
    removed: 0,
    duplicatesSkipped: 0,
    notFound: [],
    cappedAt: null,
    totalCapped: null,
  };

  let totalFieldsNow = existingHandles.size;
  const seenInThisGen = new Set<string>();

  for (const op of ops) {
    if (op.op === "remove_field") {
      const handle = op.handle?.trim();
      if (!handle) continue;
      if (!existingHandles.has(handle)) {
        summary.notFound.push(handle);
        continue;
      }
      let removed = false;
      rows = rows
        .map((r) => {
          const before = r.fields.length;
          const next = r.fields.filter((f) => f.handle !== handle);
          if (next.length !== before) removed = true;
          return { ...r, fields: next };
        })
        .filter((r) => r.fields.length > 0);
      if (removed) {
        existingHandles.delete(handle);
        totalFieldsNow--;
        summary.removed++;
      }
      continue;
    }

    if (op.op === "update_field") {
      const handle = op.handle?.trim();
      if (!handle) continue;
      if (!existingHandles.has(handle)) {
        summary.notFound.push(handle);
        continue;
      }
      let didChange = false;
      rows = rows.map((r) => ({
        ...r,
        fields: r.fields.map((f) => {
          if (f.handle !== handle) return f;
          const next: FormField = { ...f };
          if (typeof op.label === "string" && op.label.trim() && op.label !== f.label) {
            next.label = op.label.trim();
            didChange = true;
          }
          if (typeof op.required === "boolean" && op.required !== f.required) {
            next.required = op.required;
            didChange = true;
          }
          if (typeof op.placeholder === "string" && op.placeholder !== f.placeholder) {
            next.placeholder = op.placeholder;
            didChange = true;
          }
          if (op.options !== undefined && isOptionType(f.type)) {
            const opts = Array.isArray(op.options)
              ? op.options.filter((o) => o?.value?.trim() && o?.label?.trim())
              : [];
            if (opts.length >= 2) {
              next.options = opts;
              didChange = true;
            }
          }
          if (op.defaultValue !== undefined) {
            if (op.defaultValue === null) {
              if (next.defaultValue !== undefined) {
                delete next.defaultValue;
                didChange = true;
              }
            } else {
              const wantsArray = isMultiType(f.type);
              const valid =
                wantsArray === Array.isArray(op.defaultValue) ||
                // single types accept string; array types accept array.
                (!wantsArray && typeof op.defaultValue === "string");
              if (valid) {
                if (isOptionType(f.type) && next.options) {
                  const validVals = new Set(next.options.map((o) => o.value));
                  const check = Array.isArray(op.defaultValue)
                    ? op.defaultValue
                    : [op.defaultValue];
                  if (check.every((v) => validVals.has(v))) {
                    next.defaultValue = op.defaultValue as string | string[];
                    didChange = true;
                  }
                } else {
                  next.defaultValue = op.defaultValue as string | string[];
                  didChange = true;
                }
              }
            }
          }
          return next;
        }),
      }));
      if (didChange) summary.updated++;
      continue;
    }

    if (op.op === "add_row") {
      if (!Array.isArray(op.fields) || op.fields.length === 0) continue;
      const newFields: FormField[] = [];
      for (const f of op.fields) {
        const handle = (f.handle || toHandle(f.label)).trim();
        if (!handle || !f.label || !f.type) continue;
        if (existingHandles.has(handle) || seenInThisGen.has(handle)) {
          summary.duplicatesSkipped++;
          continue;
        }
        if (isOptionType(f.type) && (!f.options || f.options.length < 2)) continue;
        if (summary.added >= MAX_NEW_FIELDS_PER_GENERATION) {
          summary.cappedAt = MAX_NEW_FIELDS_PER_GENERATION;
          break;
        }
        if (totalFieldsNow >= MAX_TOTAL_FIELDS_PER_FORM) {
          summary.totalCapped = MAX_TOTAL_FIELDS_PER_FORM;
          break;
        }
        seenInThisGen.add(handle);
        existingHandles.add(handle);
        totalFieldsNow++;
        summary.added++;
        newFields.push({
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
      if (newFields.length > 0) {
        rows.push({ id: uid(), fields: newFields });
      }
    }
  }

  return {
    newForm: {
      ...form,
      rows,
      updatedAt: new Date().toISOString(),
    },
    summary,
  };
}
