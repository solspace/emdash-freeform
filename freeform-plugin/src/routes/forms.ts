import { PluginRouteError, type PluginContext } from "emdash";
import { MAX_TOTAL_FIELDS_PER_FORM, RANGE_VALIDATION_TYPES, TEXT_VALIDATION_TYPES } from "../constants";
import { deleteFormAndSubmissions, removeField } from "../lib/field-ops";
import {
  deriveUniqueFormHandle,
  isHandleTaken,
  isValidFormHandle,
} from "../lib/form-handles";
import { toHandle, uid } from "../lib/handles";
import { getTier } from "../lib/license";
import { isMultiType, isOptionType } from "../lib/options";
import type {
  FieldOption,
  FieldType,
  FormField,
  FormRow,
  StoredForm,
  StoredSubmission,
} from "../types";

// Picks validation properties from an input object, only keeping those
// applicable to the given field type. Returns only defined values.
function pickValidation(
  type: FieldType,
  input: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    patternError?: string;
    min?: number | string;
    max?: number | string;
  },
): Partial<FormField> {
  const out: Partial<FormField> = {};
  if (TEXT_VALIDATION_TYPES.includes(type)) {
    if (input.minLength != null && Number.isFinite(Number(input.minLength))) {
      out.minLength = Number(input.minLength);
    }
    if (input.maxLength != null && Number.isFinite(Number(input.maxLength))) {
      out.maxLength = Number(input.maxLength);
    }
    if (typeof input.pattern === "string" && input.pattern.trim()) {
      out.pattern = input.pattern.trim();
    }
    if (typeof input.patternError === "string" && input.patternError.trim()) {
      out.patternError = input.patternError.trim();
    }
  }
  if (RANGE_VALIDATION_TYPES.includes(type)) {
    if (input.min != null) out.min = input.min;
    if (input.max != null) out.max = input.max;
  }
  return out;
}

export const formsRoutes = {
  "list-forms": {
    handler: async (_routeCtx: any, ctx: PluginContext) => {
      const tier = await getTier(ctx);
      const { items: forms } = await ctx.storage.forms.query({
        orderBy: { createdAt: "desc" },
      });
      const { items: allSubs } = await ctx.storage.submissions.query({ limit: 10000 });
      const subCountMap = new Map<string, number>();
      for (const s of allSubs as Array<{ id: string; data: StoredSubmission }>) {
        subCountMap.set(s.data.formId, (subCountMap.get(s.data.formId) ?? 0) + 1);
      }
      return {
        tier,
        forms: (forms as Array<{ id: string; data: StoredForm }>).map((f) => ({
          id: f.id,
          name: f.data.name,
          handle: f.data.handle,
          fieldCount: f.data.rows.reduce((n, r) => n + r.fields.length, 0),
          subCount: subCountMap.get(f.id) ?? 0,
          createdAt: f.data.createdAt,
          updatedAt: f.data.updatedAt,
        })),
      };
    },
  },

  "save-form": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const { id, name, handle, rows, successMessage } = routeCtx.input as {
        id?: string;
        name?: string;
        handle?: string;
        rows?: FormRow[];
        successMessage?: string;
      };
      const formId = id ?? uid();
      const existing = id
        ? ((await ctx.storage.forms.get(id)) as StoredForm | null)
        : null;

      // Resolve the name first since handle derivation depends on it.
      const resolvedName =
        name !== undefined
          ? name.trim() || "Untitled Form"
          : existing?.name ?? "Untitled Form";

      // Handle policy:
      //   - On create: caller can supply one (validated + uniqueness-checked)
      //     or omit and we derive it from the name.
      //   - On update: handle is sticky. We do NOT accept a new handle through
      //     this route — use `set-form-handle` for that explicit, risky change.
      let resolvedHandle: string;
      if (existing) {
        resolvedHandle = existing.handle || (await deriveUniqueFormHandle(ctx, resolvedName, formId));
      } else if (handle !== undefined) {
        const trimmed = handle.trim();
        if (!isValidFormHandle(trimmed)) {
          throw PluginRouteError.badRequest(
            "handle must be lowercase snake_case starting with a letter (e.g. contact_us).",
          );
        }
        if (await isHandleTaken(ctx, trimmed)) {
          throw PluginRouteError.badRequest(
            `handle "${trimmed}" is already in use by another form.`,
          );
        }
        resolvedHandle = trimmed;
      } else {
        resolvedHandle = await deriveUniqueFormHandle(ctx, resolvedName);
      }

      const form: StoredForm = {
        name: resolvedName,
        handle: resolvedHandle,
        rows: rows ?? existing?.rows ?? [],
        successMessage:
          successMessage ?? existing?.successMessage ?? "Thank you for your submission!",
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await ctx.storage.forms.put(formId, form);
      return { id: formId, ...form };
    },
  },

  // Dedicated route for changing a form's handle — separate from save-form
  // because this operation breaks any page or external reference using the
  // old handle. Callers must opt in explicitly.
  "set-form-handle": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const { id, handle } = routeCtx.input as { id: string; handle: string };
      if (!id) throw PluginRouteError.badRequest("Missing id");
      if (!handle) throw PluginRouteError.badRequest("Missing handle");
      const trimmed = handle.trim();
      if (!isValidFormHandle(trimmed)) {
        throw PluginRouteError.badRequest(
          "handle must be lowercase snake_case starting with a letter (e.g. contact_us).",
        );
      }
      const existing = (await ctx.storage.forms.get(id)) as StoredForm | null;
      if (!existing) throw PluginRouteError.notFound("Form not found");
      if (existing.handle === trimmed) return { id, ...existing };
      if (await isHandleTaken(ctx, trimmed, id)) {
        throw PluginRouteError.badRequest(
          `handle "${trimmed}" is already in use by another form.`,
        );
      }
      const updated: StoredForm = {
        ...existing,
        handle: trimmed,
        updatedAt: new Date().toISOString(),
      };
      await ctx.storage.forms.put(id, updated);
      return { id, ...updated, previousHandle: existing.handle };
    },
  },

  "delete-form": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const { id } = routeCtx.input as { id: string };
      if (!id) throw PluginRouteError.badRequest("Missing id");
      await deleteFormAndSubmissions(ctx, id);
      return { ok: true };
    },
  },

  "add-field": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const { formId, field, rowIndex } = routeCtx.input as {
        formId: string;
        field: {
          type: FieldType;
          label: string;
          handle?: string;
          required?: boolean;
          placeholder?: string;
          options?: FieldOption[];
          defaultValue?: string | string[];
          minLength?: number;
          maxLength?: number;
          pattern?: string;
          patternError?: string;
          min?: number | string;
          max?: number | string;
        };
        // "new" creates a new row at the end; a number appends to an existing
        // row; omit to default to "new".
        rowIndex?: number | "new";
      };
      if (!formId) throw PluginRouteError.badRequest("Missing formId");
      if (!field?.type || !field?.label) {
        throw PluginRouteError.badRequest("field.type and field.label are required");
      }
      if (isOptionType(field.type)) {
        if (!Array.isArray(field.options) || field.options.length < 2) {
          throw PluginRouteError.badRequest(
            `Field type "${field.type}" requires at least 2 options (each with value and label).`,
          );
        }
        for (const opt of field.options) {
          if (!opt?.value?.trim() || !opt?.label?.trim()) {
            throw PluginRouteError.badRequest(
              "Each option must have a non-empty value and label.",
            );
          }
        }
      }

      if (field.defaultValue !== undefined) {
        const wantsArray = isMultiType(field.type);
        if (wantsArray && !Array.isArray(field.defaultValue)) {
          throw PluginRouteError.badRequest(
            `defaultValue for "${field.type}" must be an array of option values.`,
          );
        }
        if (!wantsArray && Array.isArray(field.defaultValue)) {
          throw PluginRouteError.badRequest(
            `defaultValue for "${field.type}" must be a string.`,
          );
        }
        if (isOptionType(field.type) && field.options) {
          const valid = new Set(field.options.map((o) => o.value));
          const check = Array.isArray(field.defaultValue)
            ? field.defaultValue
            : [field.defaultValue];
          const bad = check.find((v) => !valid.has(v));
          if (bad !== undefined) {
            throw PluginRouteError.badRequest(
              `defaultValue "${bad}" is not one of the option values.`,
            );
          }
        }
      }

      const tier = await getTier(ctx);
      if (field.type === "email" && tier === "free") {
        throw PluginRouteError.badRequest(
          "Email fields require a Pro license. Activate Pro in Settings first.",
        );
      }

      const form = (await ctx.storage.forms.get(formId)) as StoredForm | null;
      if (!form) throw PluginRouteError.notFound("Form not found");

      const totalExisting = form.rows.reduce((n, r) => n + r.fields.length, 0);
      if (totalExisting >= MAX_TOTAL_FIELDS_PER_FORM) {
        throw PluginRouteError.badRequest(
          `Form is at the ${MAX_TOTAL_FIELDS_PER_FORM}-field cap. Remove a field first.`,
        );
      }

      // Caller-supplied handles must be unique; auto-derived handles get a
      // numeric suffix on collision.
      const existingHandles = new Set(
        form.rows.flatMap((r) => r.fields.map((f) => f.handle)),
      );
      const callerSupplied = !!field.handle?.trim();
      let handle = callerSupplied ? field.handle!.trim() : toHandle(field.label);
      if (existingHandles.has(handle)) {
        if (callerSupplied) {
          throw PluginRouteError.badRequest(
            `A field with handle "${handle}" already exists on this form.`,
          );
        }
        let n = 2;
        while (existingHandles.has(`${handle}_${n}`)) n++;
        handle = `${handle}_${n}`;
      }

      const newField: FormField = {
        id: uid(),
        type: field.type,
        label: field.label,
        handle,
        required: field.required ?? false,
        placeholder: field.placeholder,
        ...(isOptionType(field.type) ? { options: field.options } : {}),
        ...(field.defaultValue !== undefined ? { defaultValue: field.defaultValue } : {}),
        ...pickValidation(field.type, field),
      };

      let rows = [...form.rows];
      const target = rowIndex ?? "new";
      if (target === "new" || rows.length === 0 || typeof target !== "number") {
        rows.push({ id: uid(), fields: [newField] });
      } else {
        const i = Math.max(0, Math.min(target, rows.length - 1));
        rows = rows.map((r, idx) =>
          idx === i ? { ...r, fields: [...r.fields, newField] } : r,
        );
      }

      await ctx.storage.forms.put(formId, {
        ...form,
        rows,
        updatedAt: new Date().toISOString(),
      });
      return { id: formId, rows, field: newField };
    },
  },

  "remove-field": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const { formId, fieldId } = routeCtx.input as { formId: string; fieldId: string };
      if (!formId || !fieldId) {
        throw PluginRouteError.badRequest("Missing formId or fieldId");
      }
      const form = (await ctx.storage.forms.get(formId)) as StoredForm | null;
      if (!form) throw PluginRouteError.notFound("Form not found");
      const rows = removeField(form.rows, fieldId);
      await ctx.storage.forms.put(formId, {
        ...form,
        rows,
        updatedAt: new Date().toISOString(),
      });
      return { id: formId, rows };
    },
  },

  // Partial update of a single field. Field id, handle, and type are
  // immutable — use remove-field + add-field to change those.
  "update-field": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const input = routeCtx.input as {
        formId: string;
        fieldId: string;
        label?: string;
        required?: boolean;
        placeholder?: string;
        options?: FieldOption[];
        defaultValue?: string | string[] | null;
        minLength?: number | null;
        maxLength?: number | null;
        pattern?: string | null;
        patternError?: string | null;
        min?: number | string | null;
        max?: number | string | null;
      };
      if (!input?.formId || !input?.fieldId) {
        throw PluginRouteError.badRequest("Missing formId or fieldId");
      }
      const form = (await ctx.storage.forms.get(input.formId)) as StoredForm | null;
      if (!form) throw PluginRouteError.notFound("Form not found");

      let found: FormField | undefined;
      const rows = form.rows.map((row) => ({
        ...row,
        fields: row.fields.map((field) => {
          if (field.id !== input.fieldId) return field;
          const next: FormField = { ...field };
          if (input.label !== undefined) next.label = input.label;
          if (input.required !== undefined) next.required = input.required;
          if (input.placeholder !== undefined) next.placeholder = input.placeholder;
          if (input.options !== undefined) {
            if (!isOptionType(next.type)) {
              throw PluginRouteError.badRequest(
                `Field type "${next.type}" does not accept options.`,
              );
            }
            if (!Array.isArray(input.options) || input.options.length < 2) {
              throw PluginRouteError.badRequest(
                "options must be an array of at least 2 entries (each with value and label).",
              );
            }
            for (const opt of input.options) {
              if (!opt?.value?.trim() || !opt?.label?.trim()) {
                throw PluginRouteError.badRequest(
                  "Each option must have a non-empty value and label.",
                );
              }
            }
            next.options = input.options;
          }
          if (input.defaultValue !== undefined) {
            // Pass `null` to clear; otherwise validate against current options.
            if (input.defaultValue === null) {
              delete next.defaultValue;
            } else {
              const wantsArray = isMultiType(next.type);
              if (wantsArray && !Array.isArray(input.defaultValue)) {
                throw PluginRouteError.badRequest(
                  `defaultValue for "${next.type}" must be an array of option values.`,
                );
              }
              if (!wantsArray && Array.isArray(input.defaultValue)) {
                throw PluginRouteError.badRequest(
                  `defaultValue for "${next.type}" must be a string.`,
                );
              }
              if (isOptionType(next.type) && next.options) {
                const valid = new Set(next.options.map((o) => o.value));
                const check = Array.isArray(input.defaultValue)
                  ? input.defaultValue
                  : [input.defaultValue];
                const bad = check.find((v) => !valid.has(v));
                if (bad !== undefined) {
                  throw PluginRouteError.badRequest(
                    `defaultValue "${bad}" is not one of the option values.`,
                  );
                }
              }
              next.defaultValue = input.defaultValue;
            }
          }
          // Validation fields — null clears, undefined leaves unchanged.
          if (input.minLength !== undefined) {
            if (input.minLength === null) delete next.minLength;
            else next.minLength = Number(input.minLength);
          }
          if (input.maxLength !== undefined) {
            if (input.maxLength === null) delete next.maxLength;
            else next.maxLength = Number(input.maxLength);
          }
          if (input.pattern !== undefined) {
            if (input.pattern === null || input.pattern === "") delete next.pattern;
            else next.pattern = input.pattern;
          }
          if (input.patternError !== undefined) {
            if (input.patternError === null || input.patternError === "") delete next.patternError;
            else next.patternError = input.patternError;
          }
          if (input.min !== undefined) {
            if (input.min === null) delete next.min;
            else next.min = input.min;
          }
          if (input.max !== undefined) {
            if (input.max === null) delete next.max;
            else next.max = input.max;
          }
          found = next;
          return next;
        }),
      }));

      if (!found) throw PluginRouteError.notFound("Field not found on this form");

      await ctx.storage.forms.put(input.formId, {
        ...form,
        rows,
        updatedAt: new Date().toISOString(),
      });
      return { id: input.formId, field: found };
    },
  },
};
