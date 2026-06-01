import { ALL_FIELD_TYPES, FREE_FIELD_TYPES } from "../../constants";
import type { FormField, FormRow, StoredForm } from "../../types";

function fieldTypeOptions(tier: "free" | "pro") {
  return (tier === "pro" ? ALL_FIELD_TYPES : FREE_FIELD_TYPES).map((t) => ({
    label: t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    value: t,
  }));
}

function validationFields(f?: FormField): object[] {
  return [
    {
      type: "text_input",
      action_id: "field_min_length",
      label: "Min length (optional)",
      placeholder: "e.g. 2",
      initial_value: f?.minLength != null ? String(f.minLength) : undefined,
    },
    {
      type: "text_input",
      action_id: "field_max_length",
      label: "Max length (optional)",
      placeholder: "e.g. 255",
      initial_value: f?.maxLength != null ? String(f.maxLength) : undefined,
    },
    {
      type: "text_input",
      action_id: "field_pattern",
      label: "Validation pattern (regex, optional)",
      placeholder: "e.g. [A-Za-z]+",
      initial_value: f?.pattern,
    },
    {
      type: "text_input",
      action_id: "field_pattern_error",
      label: "Pattern error message (optional)",
      placeholder: "e.g. Letters only",
      initial_value: f?.patternError,
    },
    {
      type: "text_input",
      action_id: "field_min",
      label: "Min value or date (optional)",
      placeholder: "number: 0 · date: 2026-01-01",
      initial_value: f?.min != null ? String(f.min) : undefined,
    },
    {
      type: "text_input",
      action_id: "field_max",
      label: "Max value or date (optional)",
      placeholder: "number: 100 · date: 2099-12-31",
      initial_value: f?.max != null ? String(f.max) : undefined,
    },
  ];
}

function defaultValueString(f?: FormField): string | undefined {
  if (!f?.defaultValue) return undefined;
  return Array.isArray(f.defaultValue)
    ? f.defaultValue.join(", ")
    : String(f.defaultValue);
}

function optionsString(f?: FormField): string | undefined {
  if (!f?.options?.length) return undefined;
  return f.options.map((o) => `${o.value}: ${o.label}`).join(", ");
}

export function addFieldFormBlocks(
  formId: string,
  formData: StoredForm,
  tier: "free" | "pro",
): object[] {
  return [
    {
      type: "form",
      block_id: "add_field",
      fields: [
        {
          type: "select",
          action_id: "field_type",
          label: "Field type",
          options: fieldTypeOptions(tier),
          initial_value: "text",
        },
        {
          type: "text_input",
          action_id: "field_label",
          label: "Label",
          placeholder: "e.g. First Name",
        },
        {
          type: "text_input",
          action_id: "field_handle",
          label: "Handle (optional)",
          placeholder: "auto-derived from label",
        },
        {
          type: "text_input",
          action_id: "field_options",
          label: "Options (radio, select, multi_select, checkbox_group)",
          placeholder: "us: United States, ca: Canada",
        },
        {
          type: "text_input",
          action_id: "field_default",
          label: "Default value",
          placeholder: "checkbox: true · multi: comma-separated",
        },
        {
          type: "toggle",
          action_id: "field_required",
          label: "Required",
          initial_value: false,
        },
        ...validationFields(),
        {
          type: "select",
          action_id: "field_row",
          label: "Add to row",
          options: [
            { label: "New row at the end", value: "new" },
            ...formData.rows.map((r, i) => ({
              label: `Row ${i + 1} — ${r.fields.map((f) => f.label).join(", ")}`,
              value: r.id,
            })),
          ],
          initial_value: "new",
        },
      ],
      submit: { label: "Add field", action_id: `add:${formId}` },
    },
    {
      type: "actions",
      elements: [
        { type: "button", label: "Cancel", action_id: `cancel_add:${formId}` },
      ],
    },
  ];
}

export function editFieldFormBlocks(
  formId: string,
  field: FormField,
  tier: "free" | "pro",
): object[] {
  return [
    ...(tier === "free" && field.type === "email"
      ? [
          {
            type: "context",
            text: "Email fields require Pro to add new ones; editing existing is allowed.",
          },
        ]
      : []),
    {
      type: "form",
      block_id: "edit_field",
      fields: [
        {
          type: "select",
          action_id: "field_type",
          label: "Field type",
          options: fieldTypeOptions(tier),
          initial_value: field.type,
        },
        {
          type: "text_input",
          action_id: "field_label",
          label: "Label",
          initial_value: field.label,
        },
        {
          type: "text_input",
          action_id: "field_handle",
          label: "Handle",
          initial_value: field.handle,
        },
        {
          type: "text_input",
          action_id: "field_options",
          label: "Options",
          initial_value: optionsString(field),
          placeholder: "us: United States, ca: Canada",
        },
        {
          type: "text_input",
          action_id: "field_default",
          label: "Default value",
          initial_value: defaultValueString(field),
        },
        {
          type: "toggle",
          action_id: "field_required",
          label: "Required",
          initial_value: field.required,
        },
        ...validationFields(field),
      ],
      submit: {
        label: "Save field",
        action_id: `save_edit:${formId}:${field.id}`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          label: "Remove field",
          action_id: `rm_selected:${formId}:${field.id}`,
          style: "danger",
        },
        {
          type: "button",
          label: "← Back to build",
          action_id: `deselect_field:${formId}`,
        },
      ],
    },
  ];
}

export function findField(rows: FormRow[], fieldId: string): FormField | undefined {
  for (const row of rows) {
    const f = row.fields.find((x) => x.id === fieldId);
    if (f) return f;
  }
  return undefined;
}
