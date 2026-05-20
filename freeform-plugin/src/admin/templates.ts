import type { PluginContext } from "emdash";
import type { StoredTemplate } from "../types";

export const TEMPLATE_VARIABLE_REFERENCE =
  "Variables (Mustache): " +
  "`{{ form_name }}`, `{{ submission_id }}`, `{{ submitted_at }}`, " +
  "`{{ all_fields }}` (Label: value list), plus `{{ <field_handle> }}` for any submission field.";

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export async function templatesPageBlocks(ctx: PluginContext): Promise<object[]> {
  const { items } = await ctx.storage.templates.query({
    orderBy: { createdAt: "desc" },
  });
  const templates = items as Array<{ id: string; data: StoredTemplate }>;

  if (templates.length === 0) {
    return [
      { type: "header", text: "Notification Templates" },
      { type: "section", text: TEMPLATE_VARIABLE_REFERENCE },
      {
        type: "empty",
        title: "No templates yet",
        description:
          "Templates are reusable email bodies. Assign them per form to send notifications on submission.",
        size: "lg",
        actions: [
          { type: "button", label: "+ New Template", action_id: "new_template", style: "primary" },
        ],
      },
    ];
  }

  return [
    { type: "header", text: "Notification Templates" },
    { type: "section", text: TEMPLATE_VARIABLE_REFERENCE },
    {
      type: "actions",
      elements: [
        { type: "button", label: "+ New Template", action_id: "new_template", style: "primary" },
      ],
    },
    { type: "divider" },
    ...templates.flatMap((t) => [
      {
        type: "columns",
        columns: [
          [
            { type: "section", text: `${t.data.name}` },
            {
              type: "fields",
              fields: [
                { label: "Subject", value: t.data.subject || "—" },
                { label: "Format", value: t.data.format },
                { label: "Updated", value: shortDate(t.data.updatedAt) },
              ],
            },
          ],
          [
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  label: "Edit",
                  action_id: `edit_template:${t.id}`,
                  style: "primary",
                },
                {
                  type: "button",
                  label: "Delete",
                  action_id: `del_template:${t.id}`,
                  style: "danger",
                  confirm: {
                    title: "Delete this template?",
                    text: "Any form notifications using it will stop sending.",
                    confirm: "Delete",
                    deny: "Cancel",
                  },
                },
              ],
            },
          ],
        ],
      },
      { type: "divider" },
    ]),
  ];
}

export async function templateEditorBlocks(
  templateId: string | null,
  ctx: PluginContext,
): Promise<object[]> {
  const t = templateId
    ? ((await ctx.storage.templates.get(templateId)) as StoredTemplate | null)
    : null;

  if (templateId && !t) {
    return [
      { type: "banner", title: "Template not found", variant: "error" },
      {
        type: "actions",
        elements: [{ type: "button", label: "← Back", action_id: "nav:templates" }],
      },
    ];
  }

  const initial: StoredTemplate = t ?? {
    name: "",
    subject: "",
    body: "",
    format: "text",
    createdAt: "",
    updatedAt: "",
  };

  return [
    { type: "header", text: templateId ? `Edit Template: ${initial.name}` : "New Template" },
    {
      type: "actions",
      elements: [{ type: "button", label: "← Back to Templates", action_id: "nav:templates" }],
    },
    { type: "section", text: TEMPLATE_VARIABLE_REFERENCE },
    { type: "divider" },
    {
      type: "form",
      block_id: "template",
      fields: [
        {
          type: "text_input",
          action_id: "name",
          label: "Template name",
          placeholder: "e.g. Admin Alert",
          initial_value: initial.name,
        },
        {
          type: "text_input",
          action_id: "subject",
          label: "Subject",
          placeholder: "New submission from {{ form_name }}",
          initial_value: initial.subject,
        },
        {
          type: "select",
          action_id: "format",
          label: "Format",
          options: [
            { label: "Plain text", value: "text" },
            { label: "HTML", value: "html" },
          ],
          initial_value: initial.format,
        },
        {
          type: "text_input",
          action_id: "body",
          label: "Body",
          placeholder:
            "New submission from {{ form_name }} at {{ submitted_at }}:\\n\\n{{ all_fields }}",
          initial_value: initial.body,
        },
      ],
      submit: {
        label: templateId ? "Save changes" : "Create template",
        action_id: templateId ? `save_template:${templateId}` : "save_template:new",
      },
    },
    {
      type: "context",
      text: "Tip: for multi-line bodies, use literal newlines via MCP `create_template` — Block Kit text inputs are single-line.",
    },
  ];
}
