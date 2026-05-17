import type { PluginContext } from "emdash";
import { ALL_FIELD_TYPES, FREE_FIELD_TYPES } from "../constants";
import { ensureFormHandle } from "../lib/form-handles";
import { getTier } from "../lib/license";
import type {
  StoredAssignment,
  StoredForm,
  StoredSubmission,
  StoredTemplate,
} from "../types";

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export async function listPageBlocks(ctx: PluginContext): Promise<object[]> {
  const tier = await getTier(ctx);
  const { items: forms } = await ctx.storage.forms.query({
    orderBy: { createdAt: "desc" },
  });
  const totalSubs = await ctx.storage.submissions.count();
  const formItems = forms as Array<{ id: string; data: StoredForm }>;

  const { items: allSubs } = await ctx.storage.submissions.query({ limit: 10000 });
  const subCountMap = new Map<string, number>();
  for (const s of allSubs as Array<{ id: string; data: StoredSubmission }>) {
    subCountMap.set(s.data.formId, (subCountMap.get(s.data.formId) ?? 0) + 1);
  }

  // Backfill handles for any forms created before the `handle` field existed.
  for (const f of formItems) {
    if (!f.data.handle) f.data = await ensureFormHandle(ctx, f.id, f.data);
  }

  const formBlocks =
    formItems.length === 0
      ? [
          {
            type: "empty",
            title: "No forms yet",
            description: "Create your first form to start collecting submissions.",
            size: "lg",
            actions: [
              { type: "button", label: "+ New Form", action_id: "new_form", style: "primary" },
            ],
          },
        ]
      : formItems.flatMap((f) => {
          const fieldCount = f.data.rows.reduce((n, r) => n + r.fields.length, 0);
          const subCount = subCountMap.get(f.id) ?? 0;
          return [
            {
              type: "columns",
              columns: [
                [
                  { type: "section", text: `${f.data.name}` },
                  {
                    type: "fields",
                    fields: [
                      { label: "Fields", value: String(fieldCount) },
                      { label: "Submissions", value: String(subCount) },
                      { label: "Updated", value: shortDate(f.data.updatedAt) },
                    ],
                  },
                ],
                [
                  {
                    type: "actions",
                    elements: [
                      { type: "button", label: "Edit", action_id: `edit:${f.id}`, style: "primary" },
                      { type: "button", label: "Submissions", action_id: `subs:${f.id}` },
                      {
                        type: "button",
                        label: "Delete",
                        action_id: `del:${f.id}`,
                        style: "danger",
                        confirm: {
                          title: "Delete this form?",
                          text: "All submissions will also be permanently deleted.",
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
          ];
        });

  return [
    { type: "header", text: "Freeform" },
    {
      type: "stats",
      items: [
        { label: "Forms", value: String(formItems.length), description: "active forms" },
        { label: "Submissions", value: String(totalSubs), description: "all time" },
        { label: "Plan", value: tier === "pro" ? "Pro ✓" : "Free" },
      ],
    },
    tier === "free"
      ? {
          type: "banner",
          title: "Free Plan",
          description:
            "Email fields are locked. Add a license key in Settings to unlock Pro features.",
          variant: "default",
        }
      : {
          type: "banner",
          title: "Pro Plan Active",
          description: "All field types and features are unlocked.",
          variant: "default",
        },
    {
      type: "actions",
      elements: [
        { type: "button", label: "+ New Form", action_id: "new_form", style: "primary" },
        { type: "button", label: "⚙ Settings", action_id: "nav:settings" },
      ],
    },
    { type: "divider" },
    ...formBlocks,
  ];
}

export async function editorBlocks(
  formId: string,
  ctx: PluginContext,
  showAddField = false,
): Promise<object[]> {
  const tier = await getTier(ctx);
  let formData = (await ctx.storage.forms.get(formId)) as StoredForm | null;

  if (!formData) {
    return [
      { type: "banner", title: "Form not found", variant: "error" },
      {
        type: "actions",
        elements: [{ type: "button", label: "← Back", action_id: "nav:forms" }],
      },
    ];
  }

  if (!formData.handle) formData = await ensureFormHandle(ctx, formId, formData);

  const flatFields = formData.rows.flatMap((row, rowIdx) =>
    row.fields.map((field, colIdx) => ({ ...field, rowId: row.id, rowIdx, colIdx })),
  );

  const fieldBlocks =
    flatFields.length === 0
      ? [
          {
            type: "empty",
            title: "No fields yet",
            description: "Use AI to generate fields, or add them manually below.",
            size: "base",
          },
        ]
      : [
          {
            type: "table",
            page_action_id: "fields_page",
            columns: [
              { key: "label", label: "Label" },
              { key: "type", label: "Type", format: "badge" },
              { key: "handle", label: "Handle", format: "code" },
              { key: "required", label: "Required" },
            ],
            rows: flatFields.map((f) => ({
              label: f.type === "email" && tier === "free" ? `🔒 ${f.label}` : f.label,
              type: f.type,
              handle: f.handle,
              required: f.required ? "Yes" : "—",
            })),
          },
          { type: "divider" },
          {
            type: "form",
            block_id: "remove_field",
            fields: [
              {
                type: "select",
                action_id: "field_id",
                label: "Remove a field",
                options: flatFields.map((f) => ({
                  label: `${f.label} (${f.type})`,
                  value: f.id,
                })),
              },
            ],
            submit: { label: "Remove", action_id: `rm_field:${formId}` },
          },
        ];

  const addFieldSection = showAddField
    ? [
        { type: "divider" },
        { type: "header", text: "Add Field" },
        ...(tier === "free"
          ? [
              {
                type: "banner",
                description:
                  "Email fields require Pro. Enter a license key in Settings to unlock them.",
                variant: "default",
              },
            ]
          : []),
        {
          type: "form",
          block_id: "add_field",
          fields: [
            {
              type: "select",
              action_id: "field_type",
              label: "Field Type",
              options: (tier === "pro" ? ALL_FIELD_TYPES : FREE_FIELD_TYPES).map((t) => ({
                label: t.charAt(0).toUpperCase() + t.slice(1),
                value: t,
              })),
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
              placeholder: "auto-generated from label",
            },
            {
              type: "text_input",
              action_id: "field_options",
              label: "Options (radio, select, multi_select, checkbox_group only)",
              placeholder: "us: United States, ca: Canada, mx: Mexico",
            },
            {
              type: "text_input",
              action_id: "field_default",
              label: "Default value",
              placeholder: "checkbox: 'true' to default-checked. Multi: comma-separated values.",
            },
            {
              type: "toggle",
              action_id: "field_required",
              label: "Required",
              initial_value: false,
            },
            {
              type: "select",
              action_id: "field_row",
              label: "Add to",
              options: [
                { label: "New row", value: "new" },
                ...formData.rows.map((r, i) => ({
                  label: `Row ${i + 1} (alongside: ${r.fields.map((f) => f.label).join(", ")})`,
                  value: r.id,
                })),
              ],
              initial_value: "new",
            },
          ],
          submit: { label: "Add Field", action_id: `add:${formId}` },
        },
        {
          type: "actions",
          elements: [
            { type: "button", label: "Cancel", action_id: `cancel_add:${formId}` },
          ],
        },
      ]
    : [
        {
          type: "actions",
          elements: [
            {
              type: "button",
              label: "+ Add Field",
              action_id: `show_add:${formId}`,
              style: "primary",
            },
          ],
        },
      ];

  return [
    { type: "header", text: `Editing: ${formData.name}` },
    {
      type: "actions",
      elements: [{ type: "button", label: "← Back to Forms", action_id: "nav:forms" }],
    },
    {
      type: "context",
      text: `Reference this form in templates with \`<FreeformForm formId="${formData.handle}" />\`.`,
    },
    { type: "divider" },
    {
      type: "form",
      block_id: "rename",
      fields: [
        {
          type: "text_input",
          action_id: "name",
          label: "Form Name (display)",
          initial_value: formData.name,
        },
      ],
      submit: { label: "Save Name", action_id: `rename:${formId}` },
    },
    {
      type: "form",
      block_id: "set_handle",
      fields: [
        {
          type: "text_input",
          action_id: "handle",
          label: "Handle (stable reference key)",
          initial_value: formData.handle,
          placeholder: "contact_us",
        },
      ],
      submit: {
        label: "Change Handle",
        action_id: `set_handle:${formId}`,
        confirm: {
          title: "Change this form's handle?",
          text: "Any page or external tool referencing the old handle will stop resolving until updated. This is a deliberate breaking change.",
          confirm: "Change handle",
          deny: "Cancel",
        },
      },
    },
    { type: "divider" },
    { type: "header", text: "✨ AI Form Builder" },
    {
      type: "section",
      text: "Describe fields to add. AI will append them to your existing fields.",
    },
    ...(tier === "free"
      ? [
          {
            type: "context",
            text: "Free plan: email field type will not be generated. Upgrade to Pro to include email fields.",
          },
        ]
      : []),
    {
      type: "form",
      block_id: "ai_gen",
      fields: [
        {
          type: "text_input",
          action_id: "description",
          label: "Describe your form",
          placeholder:
            'e.g. "First name and last name side by side, then email on the next row, then a message box"',
        },
      ],
      submit: { label: "✨ Generate with AI", action_id: `ai:${formId}` },
    },
    { type: "divider" },
    { type: "header", text: "Form Fields" },
    ...fieldBlocks,
    ...addFieldSection,
    { type: "divider" },
    ...(await notificationsForFormBlocks(formId, ctx)),
  ];
}

async function notificationsForFormBlocks(
  formId: string,
  ctx: PluginContext,
): Promise<object[]> {
  const form = (await ctx.storage.forms.get(formId)) as StoredForm | null;
  if (!form) return [];

  const { items: assignmentItems } = await ctx.storage.notificationAssignments.query({
    where: { formId },
    limit: 100,
  });
  const assignments = assignmentItems as Array<{ id: string; data: StoredAssignment }>;

  const { items: templateItems } = await ctx.storage.templates.query({});
  const templates = templateItems as Array<{ id: string; data: StoredTemplate }>;
  const templateById = new Map(templates.map((t) => [t.id, t.data] as const));

  const emailFields = form.rows
    .flatMap((r) => r.fields)
    .filter((f) => f.type === "email")
    .map((f) => ({ value: f.handle, label: `Submitter (${f.label})` }));

  const header = { type: "header", text: "Notifications" };

  if (templates.length === 0) {
    return [
      header,
      {
        type: "empty",
        title: "No templates available",
        description:
          "Create a template in the Templates page first, then come back here to attach it.",
        size: "base",
      },
    ];
  }

  const list =
    assignments.length === 0
      ? [
          {
            type: "empty",
            title: "No notifications on this form",
            description: "Attach a template below to send email when this form is submitted.",
            size: "base",
          },
        ]
      : assignments.flatMap(({ id, data: a }) => {
          const template = templateById.get(a.templateId);
          const templateLabel = template ? template.name : `(deleted template ${a.templateId})`;
          const recipientLabel =
            a.recipientType === "submitter"
              ? `Submitter via "${a.recipientField ?? "?"}"`
              : a.customRecipient ?? "(no recipient)";
          return [
            {
              type: "columns",
              columns: [
                [
                  { type: "section", text: `**${templateLabel}**` },
                  {
                    type: "fields",
                    fields: [
                      { label: "Recipient", value: recipientLabel },
                      { label: "Status", value: a.enabled ? "Enabled" : "Disabled" },
                    ],
                  },
                ],
                [
                  {
                    type: "actions",
                    elements: [
                      {
                        type: "button",
                        label: a.enabled ? "Disable" : "Enable",
                        action_id: `toggle_notif:${id}`,
                      },
                      {
                        type: "button",
                        label: "Detach",
                        action_id: `detach_notif:${id}`,
                        style: "danger",
                      },
                    ],
                  },
                ],
              ],
            },
            { type: "divider" },
          ];
        });

  const recipientOptions = [
    ...emailFields,
    { value: "__custom__", label: "Custom email address" },
  ];

  const attachForm = {
    type: "form",
    block_id: "attach_notif",
    fields: [
      {
        type: "select",
        action_id: "template_id",
        label: "Template",
        options: templates.map((t) => ({ label: t.data.name, value: t.id })),
        initial_value: templates[0]?.id,
      },
      {
        type: "select",
        action_id: "recipient",
        label: "Recipient",
        options: recipientOptions,
        initial_value: recipientOptions[0]?.value,
      },
      {
        type: "text_input",
        action_id: "custom_email",
        label: "Custom recipient email (if Custom selected above)",
        placeholder: "you@example.com",
      },
    ],
    submit: { label: "Attach Notification", action_id: `attach_notif:${formId}` },
  };

  return [header, ...list, { type: "header", text: "Attach a notification" }, attachForm];
}
