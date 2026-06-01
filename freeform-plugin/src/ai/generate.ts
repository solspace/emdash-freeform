import type { PluginContext } from "emdash";
import type { AiCredentials } from "../lib/ai-config";
import { callToolUse } from "./llm";
import {
  ALL_FIELD_TYPES,
  FREE_FIELD_TYPES,
  MAX_NEW_FIELDS_PER_GENERATION,
  MAX_TOTAL_FIELDS_PER_FORM,
  RANGE_VALIDATION_TYPES,
  TEXT_VALIDATION_TYPES,
} from "../constants";
import {
  inferFormTitleFromDescription,
  isValidFormHandle,
} from "../lib/form-handles";
import { toHandle, uid } from "../lib/handles";
import { isMultiType, isOptionType } from "../lib/options";
import type {
  FieldOption,
  FieldType,
  FormField,
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

// ── AI operation types ────────────────────────────────────────────

interface AIValidation {
  minLength?: number | null;
  maxLength?: number | null;
  pattern?: string | null;
  patternError?: string | null;
  min?: number | string | null;
  max?: number | string | null;
}

interface AIField extends AIValidation {
  type: FieldType;
  label: string;
  handle?: string;
  required?: boolean;
  placeholder?: string;
  options?: FieldOption[];
  defaultValue?: string | string[];
}

type AIOp =
  | { op: "add_row"; fields: AIField[] }
  | ({
      op: "update_field";
      handle: string;
      label?: string;
      required?: boolean;
      placeholder?: string;
      options?: FieldOption[];
      defaultValue?: string | string[] | null;
    } & AIValidation)
  | { op: "remove_field"; handle: string };

// ── Helpers ────────────────────────────────────────────────────────

// Build a compact one-line summary of a field's current validation state.
function validationSummary(f: FormField): string {
  const parts: string[] = [];
  if (f.minLength != null) parts.push(`minLength=${f.minLength}`);
  if (f.maxLength != null) parts.push(`maxLength=${f.maxLength}`);
  if (f.pattern) parts.push(`pattern="${f.pattern}"`);
  if (f.patternError) parts.push(`patternError="${f.patternError}"`);
  if (f.min != null) parts.push(`min=${f.min}`);
  if (f.max != null) parts.push(`max=${f.max}`);
  return parts.join(" ");
}

// ── JSON Schema fragments ──────────────────────────────────────────

const OPTION_ITEM_SCHEMA = {
  type: "object",
  required: ["value", "label"],
  properties: {
    value: { type: "string", description: "snake_case machine value" },
    label: { type: "string", description: "Human-readable label" },
  },
} as const;

const VALIDATION_SCHEMA_PROPS = {
  minLength: {
    oneOf: [{ type: "number" }, { type: "null" }],
    description:
      "Minimum character count. Applies to text, email, textarea, phone. Pass null to clear.",
  },
  maxLength: {
    oneOf: [{ type: "number" }, { type: "null" }],
    description:
      "Maximum character count. Applies to text, email, textarea, phone. Pass null to clear.",
  },
  pattern: {
    oneOf: [{ type: "string" }, { type: "null" }],
    description:
      "Regex validation pattern (HTML5 `pattern` attribute). Applies to text, email, textarea, phone. Pass null to clear.",
  },
  patternError: {
    oneOf: [{ type: "string" }, { type: "null" }],
    description:
      "Message shown when the pattern does not match (rendered as HTML `title`). Applies to text, email, textarea, phone. Pass null to clear.",
  },
  min: {
    oneOf: [{ type: "number" }, { type: "string" }, { type: "null" }],
    description:
      "Minimum value (number) or earliest allowed date in YYYY-MM-DD (date). Pass null to clear.",
  },
  max: {
    oneOf: [{ type: "number" }, { type: "string" }, { type: "null" }],
    description:
      "Maximum value (number) or latest allowed date in YYYY-MM-DD (date). Pass null to clear.",
  },
} as const;

function buildFieldInputSchema(allowedTypes: readonly FieldType[]) {
  return {
    type: "object",
    required: ["type", "label"],
    properties: {
      type: { type: "string", enum: allowedTypes },
      label: {
        type: "string",
        description:
          "Human-readable label shown above the input. For `html`, this is an internal admin label only — not shown to users.",
      },
      handle: {
        type: "string",
        description: "snake_case identifier. Auto-derived from label if omitted.",
      },
      required: { type: "boolean" },
      placeholder: {
        type: "string",
        description: "Hint text inside the input. Not applicable to html or hidden.",
      },
      options: {
        type: "array",
        description:
          "Required for radio, select, multi_select, checkbox_group (≥ 2 entries). Omit for all other types.",
        items: OPTION_ITEM_SCHEMA,
      },
      defaultValue: {
        description:
          "Pre-filled value. String for single-value types; array for checkbox_group/multi_select. " +
          "For `checkbox` (single), use 'true' to default-checked. " +
          "For `html`, this IS the HTML content to render (not a default value). " +
          "For `hidden`, this is the fixed value submitted with the form.",
        oneOf: [
          { type: "string" },
          { type: "array", items: { type: "string" } },
        ],
      },
      ...VALIDATION_SCHEMA_PROPS,
    },
  } as const;
}

// ── Main entry point ───────────────────────────────────────────────

export async function editFormWithAI(
  description: string,
  tier: "free" | "pro",
  existingForm: StoredForm,
  ctx: PluginContext,
  creds: AiCredentials,
): Promise<EditResult> {
  const allowed = tier === "pro" ? ALL_FIELD_TYPES : FREE_FIELD_TYPES;

  // Build existing-fields summary with validation state so the AI knows
  // what is already set and can reference handles correctly.
  const existingFields = existingForm.rows.flatMap((r) => r.fields);
  const existingSummary =
    existingFields.length === 0
      ? "The form is empty."
      : existingFields
          .map((f, i) => {
            const base = `  ${i + 1}. handle="${f.handle}" label="${f.label}" type=${f.type} required=${f.required}`;
            const defaultPart =
              f.type === "html"
                ? ` content="${String(f.defaultValue ?? "").slice(0, 60).replace(/\n/g, " ")}…"`
                : f.type === "hidden"
                  ? ` value="${f.defaultValue ?? ""}"`
                  : f.defaultValue !== undefined
                    ? ` defaultValue=${JSON.stringify(f.defaultValue)}`
                    : "";
            const valPart = validationSummary(f);
            return base + defaultPart + (valPart ? ` [${valPart}]` : "");
          })
          .join("\n");

  const FIELD_INPUT_SCHEMA = buildFieldInputSchema(allowed);
  const applyFormMeta = shouldApplyAiFormMeta(existingForm, existingFields.length);
  const formMetaHint = applyFormMeta
    ? `Current form name: "${existingForm.name || "(none)"}" · handle: "${existingForm.handle || "(none)"}"\n\n`
    : `Current form name: "${existingForm.name}" · handle: "${existingForm.handle}" (do not change unless the user asks to rename)\n\n`;

  const { toolInput } = await callToolUse(ctx, creds, {
    tier: "fast",
    tool: {
      name: "apply_form_edits",
      description:
        "Apply a batch of edits to the existing form. Each operation is one of: " +
        "`add_row` (append a new row of one or more fields), " +
        "`update_field` (change properties of an existing field referenced by handle), " +
        "or `remove_field` (delete an existing field by handle). " +
        "Use the minimum number of operations needed to satisfy the user's request.",
      input_schema: {
        type: "object",
        required: applyFormMeta
          ? ["operations", "form_name", "form_handle"]
          : ["operations"],
        properties: {
          form_name: {
            type: "string",
            description:
              "Display name for the form (e.g. Contact Us, Job Application). " +
              "Required when the form has no fields yet.",
          },
          form_handle: {
            type: "string",
            description:
              "URL slug: lowercase snake_case, starts with a letter (e.g. contact_us). " +
              "Required when the form has no fields yet. Must not collide with field handles.",
          },
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
                fields: {
                  type: "array",
                  minItems: 1,
                  maxItems: 4,
                  description:
                    "For `add_row` only. Fields displayed side-by-side on the new row. " +
                    "All field properties including validation are accepted here.",
                  items: FIELD_INPUT_SCHEMA,
                },
                handle: {
                  type: "string",
                  description:
                    "For `update_field` and `remove_field`: the handle of an EXISTING field listed in the form summary above.",
                },
                label: { type: "string" },
                required: { type: "boolean" },
                placeholder: { type: "string" },
                options: {
                  type: "array",
                  description:
                    "For `update_field` on option-bearing types only: full replacement options array (≥ 2 entries). Only include when the user wants the choice list changed.",
                  items: OPTION_ITEM_SCHEMA,
                },
                defaultValue: {
                  description:
                    "For `update_field`: new default/content/value (same rules as add_row). Pass null to clear.",
                  oneOf: [
                    { type: "string" },
                    { type: "array", items: { type: "string" } },
                    { type: "null" },
                  ],
                },
                ...VALIDATION_SCHEMA_PROPS,
              },
            },
          },
        },
      },
    },
    userMessage:
      (applyFormMeta
        ? `You are creating a new form from the user's description. Set form_name and form_handle, then add fields.\n\n`
        : `You are editing an existing form. Emit the minimum operations to satisfy the request.\n\n`) +
      formMetaHint +
      `Existing fields:\n${existingSummary}\n\n` +
      `User request: "${description}"\n\n` +
      `## Rules\n\n` +
      (applyFormMeta
        ? `### Form metadata (required)\n` +
          `- \`form_name\`: short title inferred from the request (not "New Form").\n` +
          `- \`form_handle\`: unique snake_case slug from the name (e.g. contact_us, demo_request).\n\n`
        : `### Form metadata\n` +
          `- Omit \`form_name\` and \`form_handle\` unless the user explicitly asks to rename the form.\n\n`) +
      `### Operations\n` +
      `- \`add_row\` — append new fields in a new row. Each row can hold 1–4 fields side-by-side.\n` +
      `- \`update_field\` — patch an existing field by its handle. Only include properties that should change; omit everything else.\n` +
      `- \`remove_field\` — delete an existing field by its handle.\n` +
      `- Never invent handles for update_field/remove_field. Only use handles from the "Existing fields" list.\n` +
      `- Do not duplicate existing fields in add_row. Skip if already present.\n` +
      `- Return an empty operations array if the request is already satisfied.\n\n` +
      `### Field types\n` +
      `Available: ${allowed.join(", ")}\n` +
      `- \`text\` — single-line text input.\n` +
      `- \`email\` — email input (validated by browser).\n` +
      `- \`textarea\` — multi-line text.\n` +
      `- \`number\` — numeric input. Use min/max for range constraints.\n` +
      `- \`phone\` — telephone input (type="tel").\n` +
      `- \`date\` — date picker (type="date"). Use min/max for YYYY-MM-DD bounds.\n` +
      `- \`checkbox\` — a single yes/no toggle. defaultValue "true" = pre-checked.\n` +
      `- \`checkbox_group\` — multi-pick checkboxes. REQUIRES options array (≥ 2).\n` +
      `- \`radio\` — pick exactly one. REQUIRES options array (≥ 2).\n` +
      `- \`select\` — dropdown, pick one. REQUIRES options array (≥ 2).\n` +
      `- \`multi_select\` — dropdown, pick many. REQUIRES options array (≥ 2).\n` +
      `- \`hidden\` — invisible field submitted with the form. No label shown to users. Set defaultValue to the fixed submitted value.\n` +
      `- \`html\` — a static HTML content block inside the form (instructions, headings, copy). No user input. label is an internal admin name only. Set defaultValue to the raw HTML string to display.\n\n` +
      `### Validation (applies to specific types)\n` +
      `- \`minLength\` / \`maxLength\` — character limits. Apply to: text, email, textarea, phone.\n` +
      `- \`pattern\` — HTML5 regex pattern. Apply to: text, email, textarea, phone.\n` +
      `- \`patternError\` — message shown on pattern mismatch (browser title attribute). Apply to: text, email, textarea, phone.\n` +
      `- \`min\` / \`max\` — numeric range for number fields; YYYY-MM-DD date bounds for date fields.\n` +
      `- Pass \`null\` for any validation prop in \`update_field\` to clear an existing rule.\n` +
      `- Only set validation props when the user requests them. Do not invent constraints.\n\n` +
      `### Other rules\n` +
      `- "Make only X required" → set required=true on X AND required=false on all other currently-required fields. One op per affected field.\n` +
      `- For defaultValue: string for single-value types; array for checkbox_group/multi_select.\n` +
      `- New handles (in add_row) must be unique snake_case, not colliding with any existing handle.\n` +
      `- Only include "options" in update_field when the user explicitly wants the choice list replaced.\n`,
  });

  const operations = toolInput.operations;
  if (!Array.isArray(operations)) {
    throw new Error("Unexpected AI response format");
  }

  const result = applyOps(existingForm, operations as AIOp[]);
  const newForm = applyAiFormMeta(
    result.newForm,
    toolInput,
    description,
    applyFormMeta,
  );
  return { newForm, summary: result.summary };
}

function shouldApplyAiFormMeta(form: StoredForm, fieldCount: number): boolean {
  if (fieldCount > 0) return false;
  const name = form.name?.trim().toLowerCase() ?? "";
  return !name || name === "new form";
}

function applyAiFormMeta(
  form: StoredForm,
  toolInput: Record<string, unknown>,
  description: string,
  applyMeta: boolean,
): StoredForm {
  if (!applyMeta) return form;

  const next = { ...form };
  const aiName =
    typeof toolInput.form_name === "string" ? toolInput.form_name.trim() : "";
  const aiHandle =
    typeof toolInput.form_handle === "string" ? toolInput.form_handle.trim() : "";

  if (aiName) next.name = aiName;
  else if (!next.name?.trim() || next.name.trim().toLowerCase() === "new form") {
    next.name = inferFormTitleFromDescription(description);
  }

  if (aiHandle) {
    const normalized = isValidFormHandle(aiHandle) ? aiHandle : toHandle(aiHandle);
    if (isValidFormHandle(normalized)) next.handle = normalized;
  } else if (!next.handle?.trim() || next.handle.trim().toLowerCase() === "new_form") {
    next.handle = toHandle(next.name);
  }

  return next;
}

// ── Apply operations ───────────────────────────────────────────────

function applyValidationPatch(field: FormField, patch: AIValidation): boolean {
  let changed = false;

  const canText = TEXT_VALIDATION_TYPES.includes(field.type);
  const canRange = RANGE_VALIDATION_TYPES.includes(field.type);

  if (canText) {
    if (patch.minLength !== undefined) {
      if (patch.minLength === null) { if (field.minLength !== undefined) { delete field.minLength; changed = true; } }
      else if (Number.isFinite(Number(patch.minLength)) && patch.minLength !== field.minLength) {
        field.minLength = Number(patch.minLength); changed = true;
      }
    }
    if (patch.maxLength !== undefined) {
      if (patch.maxLength === null) { if (field.maxLength !== undefined) { delete field.maxLength; changed = true; } }
      else if (Number.isFinite(Number(patch.maxLength)) && patch.maxLength !== field.maxLength) {
        field.maxLength = Number(patch.maxLength); changed = true;
      }
    }
    if (patch.pattern !== undefined) {
      if (patch.pattern === null || patch.pattern === "") { if (field.pattern !== undefined) { delete field.pattern; changed = true; } }
      else if (patch.pattern !== field.pattern) { field.pattern = patch.pattern; changed = true; }
    }
    if (patch.patternError !== undefined) {
      if (patch.patternError === null || patch.patternError === "") { if (field.patternError !== undefined) { delete field.patternError; changed = true; } }
      else if (patch.patternError !== field.patternError) { field.patternError = patch.patternError; changed = true; }
    }
  }

  if (canRange) {
    if (patch.min !== undefined) {
      if (patch.min === null) { if (field.min !== undefined) { delete field.min; changed = true; } }
      else if (patch.min !== field.min) { field.min = patch.min; changed = true; }
    }
    if (patch.max !== undefined) {
      if (patch.max === null) { if (field.max !== undefined) { delete field.max; changed = true; } }
      else if (patch.max !== field.max) { field.max = patch.max; changed = true; }
    }
  }

  return changed;
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
    // ── remove_field ─────────────────────────────────────────────
    if (op.op === "remove_field") {
      const handle = op.handle?.trim();
      if (!handle) continue;
      if (!existingHandles.has(handle)) { summary.notFound.push(handle); continue; }
      let removed = false;
      rows = rows
        .map((r) => {
          const before = r.fields.length;
          const next = r.fields.filter((f) => f.handle !== handle);
          if (next.length !== before) removed = true;
          return { ...r, fields: next };
        })
        .filter((r) => r.fields.length > 0);
      if (removed) { existingHandles.delete(handle); totalFieldsNow--; summary.removed++; }
      continue;
    }

    // ── update_field ─────────────────────────────────────────────
    if (op.op === "update_field") {
      const handle = op.handle?.trim();
      if (!handle) continue;
      if (!existingHandles.has(handle)) { summary.notFound.push(handle); continue; }
      let didChange = false;
      rows = rows.map((r) => ({
        ...r,
        fields: r.fields.map((f) => {
          if (f.handle !== handle) return f;
          const next: FormField = { ...f };

          if (typeof op.label === "string" && op.label.trim() && op.label !== f.label) {
            next.label = op.label.trim(); didChange = true;
          }
          if (typeof op.required === "boolean" && op.required !== f.required) {
            next.required = op.required; didChange = true;
          }
          if (typeof op.placeholder === "string" && op.placeholder !== f.placeholder) {
            next.placeholder = op.placeholder; didChange = true;
          }
          if (op.options !== undefined && isOptionType(f.type)) {
            const opts = Array.isArray(op.options)
              ? op.options.filter((o) => o?.value?.trim() && o?.label?.trim())
              : [];
            if (opts.length >= 2) { next.options = opts; didChange = true; }
          }
          if (op.defaultValue !== undefined) {
            if (op.defaultValue === null) {
              if (next.defaultValue !== undefined) { delete next.defaultValue; didChange = true; }
            } else {
              const wantsArray = isMultiType(f.type);
              const shapeOk =
                (wantsArray && Array.isArray(op.defaultValue)) ||
                (!wantsArray && typeof op.defaultValue === "string");
              if (shapeOk) {
                if (isOptionType(f.type) && next.options) {
                  const valid = new Set(next.options.map((o) => o.value));
                  const check = Array.isArray(op.defaultValue) ? op.defaultValue : [op.defaultValue];
                  if (check.every((v) => valid.has(v))) {
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

          // Validation fields
          if (applyValidationPatch(next, op)) didChange = true;

          return next;
        }),
      }));
      if (didChange) summary.updated++;
      continue;
    }

    // ── add_row ───────────────────────────────────────────────────
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

        const newField: FormField = {
          id: uid(),
          type: f.type,
          label: f.label,
          handle,
          required: f.required ?? false,
          placeholder: f.placeholder,
          options: isOptionType(f.type) ? f.options : undefined,
          defaultValue: f.defaultValue,
        };

        // Apply any validation from the AI response.
        applyValidationPatch(newField, f);

        newFields.push(newField);
      }
      if (newFields.length > 0) {
        rows.push({ id: uid(), fields: newFields });
      }
    }
  }

  return {
    newForm: { ...form, rows, updatedAt: new Date().toISOString() },
    summary,
  };
}
