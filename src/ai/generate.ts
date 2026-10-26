import type { PluginContext } from "emdash";
import type { AiCredentials } from "../lib/ai-config";
import { callToolUse } from "./llm";
import {
  ALL_FIELD_TYPES,
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
  minLength: { oneOf: [{ type: "number" }, { type: "null" }], description: "Min chars; null clears." },
  maxLength: { oneOf: [{ type: "number" }, { type: "null" }], description: "Max chars; null clears." },
  pattern: { oneOf: [{ type: "string" }, { type: "null" }], description: "Regex; null clears." },
  patternError: { oneOf: [{ type: "string" }, { type: "null" }], description: "Mismatch msg; null clears." },
  min: { oneOf: [{ type: "number" }, { type: "string" }, { type: "null" }], description: "Min num/date; null clears." },
  max: { oneOf: [{ type: "number" }, { type: "string" }, { type: "null" }], description: "Max num/date; null clears." },
} as const;

function buildFieldInputSchema(allowedTypes: readonly FieldType[]) {
  return {
    type: "object",
    required: ["type", "label"],
    properties: {
      type: { type: "string", enum: allowedTypes },
      label: { type: "string", description: "Label (admin-only for html)." },
      handle: { type: "string", description: "snake_case; from label if omitted." },
      required: { type: "boolean" },
      placeholder: { type: "string", description: "Hint (not html/hidden)." },
      options: {
        type: "array",
        description: "≥2 for option types.",
        items: OPTION_ITEM_SCHEMA,
      },
      defaultValue: {
        description: "Prefill; checkbox 'true'; html=body; hidden=value.",
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
  existingForm: StoredForm,
  ctx: PluginContext,
  creds: AiCredentials,
): Promise<EditResult> {
  const allowed = ALL_FIELD_TYPES;

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
        "Edit a form via add_row / update_field / remove_field. Prefer the fewest ops.",
      input_schema: {
        type: "object",
        required: applyFormMeta
          ? ["operations", "form_name", "form_handle"]
          : ["operations"],
        properties: {
          form_name: {
            type: "string",
            description: "Form title. Required for empty forms.",
          },
          form_handle: {
            type: "string",
            description: "snake_case slug (e.g. contact_us). Required for empty forms.",
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
                  maxItems: 2,
                  description:
                    "add_row only: 1 field, or 2 related short fields. Never pair textarea/html/checkbox_group.",
                  items: FIELD_INPUT_SCHEMA,
                },
                handle: {
                  type: "string",
                  description: "Existing field handle for update/remove.",
                },
                label: { type: "string" },
                required: { type: "boolean" },
                placeholder: { type: "string" },
                options: {
                  type: "array",
                  description: "Replace options (≥2) when user asks.",
                  items: OPTION_ITEM_SCHEMA,
                },
                defaultValue: {
                  description: "New default; null clears.",
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
        ? `Create a form from the description. Set form_name + form_handle, then add fields.\n\n`
        : `Edit the form with the fewest operations.\n\n`) +
      formMetaHint +
      `Existing fields:\n${existingSummary}\n\n` +
      `Request: "${description}"\n\n` +
      `Rules:\n` +
      (applyFormMeta
        ? `- form_name: short title (not "New Form"). form_handle: unique snake_case.\n`
        : `- Omit form_name/form_handle unless asked to rename.\n`) +
      `- Ops: add_row (one visual row), update_field, remove_field. Empty ops if already done.\n` +
      `- update/remove handles must exist above. No duplicate add_row handles.\n` +
      `- Layout: separate add_row per row. Full-width alone: textarea, html, checkbox_group, consent.\n` +
      `- Pair only related shorts (max 2): first+last, email+phone, city+state/zip, start+end dates. Else 1/row.\n` +
      `- Types: ${allowed.join(", ")}. Option types need ≥2 options. hidden/html use defaultValue.\n` +
      `- Validation only if asked (minLength/maxLength/pattern/min/max). null clears on update.\n` +
      `- "Only X required" → set X required true and others false. New handles unique snake_case.\n`,
  });

  const operations = toolInput.operations;
  if (!Array.isArray(operations)) {
    throw new Error("Unexpected AI response format");
  }

  const result = applyOps(existingForm, operations as AIOp[]);
  let newForm = applyAiFormMeta(
    result.newForm,
    toolInput,
    description,
    applyFormMeta,
  );
  // New forms (and fat single-row dumps) get a Craft-like multi-row reflow.
  if (applyFormMeta || shouldReflowRows(newForm.rows)) {
    newForm = { ...newForm, rows: reflowFormRows(newForm.rows) };
  }
  return { newForm, summary: result.summary };
}

/** Types that should sit alone on a full-width row. */
const FULL_WIDTH_TYPES = new Set<FieldType>([
  "textarea",
  "html",
  "checkbox_group",
  "hidden",
]);

function isFullWidthField(field: FormField): boolean {
  if (FULL_WIDTH_TYPES.has(field.type)) return true;
  if (field.type === "checkbox") return true;
  if (field.type === "radio" && (field.options?.length ?? 0) >= 4) return true;
  return false;
}

function isCompactField(field: FormField): boolean {
  return !isFullWidthField(field);
}

/** Heuristic pairs that look good side-by-side. */
function areNaturalPair(a: FormField, b: FormField): boolean {
  const ha = a.handle.toLowerCase();
  const hb = b.handle.toLowerCase();
  const pair = (x: string, y: string) =>
    (ha.includes(x) && hb.includes(y)) || (ha.includes(y) && hb.includes(x));

  if (pair("first", "last")) return true;
  if (pair("first_name", "last_name")) return true;
  if (pair("email", "phone") || pair("email", "tel") || pair("email", "mobile"))
    return true;
  if (pair("city", "state") || pair("city", "zip") || pair("state", "zip") || pair("state", "postal"))
    return true;
  if (pair("start", "end")) return true;
  if (a.type === "date" && b.type === "date") return true;
  if (
    (a.type === "text" || a.type === "number") &&
    (b.type === "text" || b.type === "number" || b.type === "select")
  ) {
    // Short adjacent text-ish fields — allow pairing when labels are short.
    return a.label.length <= 18 && b.label.length <= 18;
  }
  return false;
}

function shouldReflowRows(rows: FormRow[]): boolean {
  if (rows.length === 0) return false;
  // Single packed row with 3+ fields — AI dumped everything together.
  if (rows.length === 1 && (rows[0]?.fields.length ?? 0) >= 3) return true;
  // Any row wider than 2 compact fields.
  return rows.some((r) => r.fields.length > 2);
}

/**
 * Reflow fields into a nicer multi-row layout:
 * full-width alone, natural pairs side-by-side, otherwise one per row.
 */
export function reflowFormRows(rows: FormRow[]): FormRow[] {
  const fields = rows.flatMap((r) => r.fields);
  if (fields.length === 0) return [];

  const out: FormRow[] = [];
  let i = 0;
  while (i < fields.length) {
    const field = fields[i]!;
    const next = fields[i + 1];

    if (isFullWidthField(field) || !next || !isCompactField(field) || !isCompactField(next)) {
      out.push({ id: uid(), fields: [field] });
      i += 1;
      continue;
    }

    if (areNaturalPair(field, next)) {
      out.push({ id: uid(), fields: [field, next] });
      i += 2;
      continue;
    }

    // Default: one field per row (cleaner than forcing pairs).
    out.push({ id: uid(), fields: [field] });
    i += 1;
  }
  return out;
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
