import type { PluginContext } from "emdash";
import type { StoredTemplate } from "../types";
import { freeformNavBlocks, pageHeader, shortDate } from "./layout";

export const TEMPLATE_VARIABLE_REFERENCE =
  "Variables: {{ form_name }}, {{ submission_id }}, {{ submitted_at }}, {{ all_fields }}, {{ field_handle }}";

export async function templatesPageBlocks(ctx: PluginContext): Promise<object[]> {
  const { items } = await ctx.storage.templates.query({
    orderBy: { createdAt: "desc" },
  });
  const templates = items as Array<{ id: string; data: StoredTemplate }>;

  if (templates.length === 0) {
    return [
      ...(await freeformNavBlocks(ctx, "templates")),
      ...pageHeader("Templates"),
      {
        type: "empty",
        title: "No templates yet",
        description: TEMPLATE_VARIABLE_REFERENCE,
        size: "lg",
        actions: [
          {
            type: "button",
            label: "Create template",
            action_id: "new_template",
            style: "primary",
          },
        ],
      },
    ];
  }

  const rows = templates.flatMap((t) => [
    {
      type: "fields",
      fields: [
        { label: "Name", value: t.data.name },
        { label: "Subject", value: t.data.subject || "—" },
        { label: "Format", value: t.data.format === "html" ? "HTML" : "Text" },
        { label: "Updated", value: shortDate(t.data.updatedAt) },
      ],
    },
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
            title: `Delete "${t.data.name}"?`,
            text: "Forms using this template will stop sending this email.",
            confirm: "Delete",
            deny: "Cancel",
          },
        },
      ],
    },
    { type: "divider" },
  ]);

  return [
    ...(await freeformNavBlocks(ctx, "templates")),
    ...pageHeader("Templates", "Edit a template or create a new one."),
    {
      type: "actions",
      elements: [
        {
          type: "button",
          label: "Create template",
          action_id: "new_template",
          style: "primary",
        },
      ],
    },
    { type: "divider" },
    ...rows,
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
        elements: [
          { type: "button", label: "Back to templates", action_id: "nav:templates" },
        ],
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
    ...pageHeader(templateId ? `Edit: ${initial.name}` : "New template"),
    { type: "context", text: TEMPLATE_VARIABLE_REFERENCE },
    {
      type: "actions",
      elements: [
        { type: "button", label: "Back to templates", action_id: "nav:templates" },
      ],
    },
    {
      type: "form",
      block_id: "template",
      fields: [
        {
          type: "text_input",
          action_id: "name",
          label: "Template name",
          placeholder: "Admin alert",
          initial_value: initial.name,
        },
        {
          type: "text_input",
          action_id: "subject",
          label: "Email subject",
          placeholder: "New submission on {{ form_name }}",
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
          label: "Email body",
          placeholder: "Hi,\n\n{{ all_fields }}\n\n— {{ form_name }}",
          initial_value: initial.body,
        },
      ],
      submit: {
        label: templateId ? "Save template" : "Create template",
        action_id: templateId ? `save_template:${templateId}` : "save_template:new",
        style: "primary",
      },
    },
  ];
}
