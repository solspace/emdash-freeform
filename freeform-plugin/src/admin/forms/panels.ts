import type { PluginContext } from "emdash";
import { FORM_CARD_ICON_OPTIONS } from "../../lib/form-icons";
import { effectiveSpamSettings, getSpamSettings } from "../../lib/spam-settings";
import type { StoredAssignment, StoredForm, StoredTemplate } from "../../types";

export function metaPanelBlocks(formId: string, formData: StoredForm): object[] {
  return [
    {
      type: "form",
      block_id: "form_meta",
      fields: [
        {
          type: "text_input",
          action_id: "label",
          label: "Form name",
          initial_value: formData.name,
          placeholder: "Contact us",
        },
        {
          type: "text_input",
          action_id: "handle",
          label: "Handle (used in code)",
          initial_value: formData.handle,
          placeholder: "contact_us",
        },
        {
          type: "text_input",
          action_id: "success_message",
          label: "Message after submit",
          initial_value: formData.successMessage ?? "",
          placeholder: "Thank you! We will be in touch soon.",
        },
        {
          type: "select",
          action_id: "card_icon",
          label: "List icon",
          options: FORM_CARD_ICON_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
          initial_value: formData.cardIcon ?? "auto",
        },
      ],
      submit: { label: "Save", action_id: `save_meta:${formId}`, style: "primary" },
    },
  ];
}

export function integratePanelBlocks(
  _formId: string,
  formData: StoredForm,
  siteOrigin: string,
): object[] {
  return [
    {
      type: "context",
      text: "Drop the form on a page or link to its public URL.",
    },
    {
      type: "fields",
      fields: [
        {
          label: "Astro component",
          value: `<FreeformForm formId="${formData.handle}" />`,
        },
        {
          label: "Public form page",
          value: `${siteOrigin}/forms/${formData.handle}`,
        },
      ],
    },
  ];
}

export async function spamPanelBlocks(
  formId: string,
  form: StoredForm,
  tier: "free" | "pro",
  ctx: PluginContext,
): Promise<object[]> {
  if (tier !== "pro") {
    return [
      {
        type: "banner",
        title: "Pro feature",
        description: "Add a Pro license under Settings to enable AI spam scoring.",
        variant: "default",
      },
    ];
  }

  const globalDefaults = await getSpamSettings(ctx);
  const effective = effectiveSpamSettings(form, globalDefaults);
  const hasOverride = !!form.spam;

  return [
    {
      type: "stats",
      items: [
        { label: "Status", value: effective.enabled ? "On" : "Off" },
        { label: "Threshold", value: `${effective.threshold} / 10` },
        { label: "Mode", value: hasOverride ? "Custom for this form" : "Site default" },
      ],
    },
    {
      type: "form",
      block_id: "form_spam",
      fields: [
        {
          type: "toggle",
          action_id: "use_custom",
          label: "Override site default for this form",
          initial_value: hasOverride,
        },
        {
          type: "toggle",
          action_id: "enabled",
          label: "Enable spam scoring",
          initial_value: hasOverride ? !!form.spam?.enabled : effective.enabled,
        },
        {
          type: "text_input",
          action_id: "threshold",
          label: "Flag when score is at or above (0–10)",
          initial_value: String(
            hasOverride ? form.spam!.threshold : effective.threshold,
          ),
          placeholder: "7",
        },
      ],
      submit: {
        label: "Save",
        action_id: `save_form_spam:${formId}`,
        style: "primary",
      },
    },
  ];
}

export async function notificationsPanelBlocks(
  formId: string,
  ctx: PluginContext,
): Promise<object[]> {
  const form = (await ctx.storage.forms.get(formId)) as StoredForm | null;
  if (!form) return [];

  const { items: assignmentItems } =
    await ctx.storage.notificationAssignments.query({
      where: { formId },
      limit: 100,
    });
  const assignments = assignmentItems as Array<{
    id: string;
    data: StoredAssignment;
  }>;

  const { items: templateItems } = await ctx.storage.templates.query({});
  const templates = templateItems as Array<{
    id: string;
    data: StoredTemplate;
  }>;
  const templateById = new Map(templates.map((t) => [t.id, t.data] as const));

  const emailFields = form.rows
    .flatMap((r) => r.fields)
    .filter((f) => f.type === "email")
    .map((f) => ({ value: f.handle, label: `Submitter — ${f.label}` }));

  if (templates.length === 0) {
    return [
      {
        type: "empty",
        title: "Create a template first",
        description:
          "Go to Templates in the sidebar, create an email template, then return here to attach it.",
        size: "base",
        actions: [
          {
            type: "button",
            label: "Go to Templates",
            action_id: "nav:templates",
            style: "primary",
          },
        ],
      },
    ];
  }

  const list: object[] =
    assignments.length === 0
      ? [
          {
          },
        ]
      : assignments.flatMap(({ id, data: a }) => {
          const template = templateById.get(a.templateId);
          const templateLabel = template?.name ?? "Missing template";
          const recipientLabel =
            a.recipientType === "submitter"
              ? `Submitter (${a.recipientField ?? "?"})`
              : (a.customRecipient ?? "—");
          return [
            {
              type: "fields",
              fields: [
                { label: "Template", value: templateLabel },
                { label: "To", value: recipientLabel },
                { label: "Enabled", value: a.enabled ? "Yes" : "No" },
              ],
            },
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  label: a.enabled ? "Turn off" : "Turn on",
                  action_id: `toggle_notif:${id}`,
                },
                {
                  type: "button",
                  label: "Remove",
                  action_id: `detach_notif:${id}`,
                  style: "danger",
                },
              ],
            },
            { type: "divider" },
          ];
        });

  const recipientOptions = [
    ...emailFields,
    { value: "__custom__", label: "Custom email address" },
  ];

  return [
    ...list,
    {
      type: "form",
      block_id: "attach_notif",
      fields: [
        {
          type: "select",
          action_id: "template_id",
          label: "Email template",
          options: templates.map((t) => ({ label: t.data.name, value: t.id })),
          initial_value: templates[0]?.id,
        },
        {
          type: "select",
          action_id: "recipient",
          label: "Send to",
          options: recipientOptions.length
            ? recipientOptions
            : [{ value: "__custom__", label: "Custom email (no email field on form)" }],
          initial_value: recipientOptions[0]?.value ?? "__custom__",
        },
        {
          type: "text_input",
          action_id: "custom_email",
          label: "Custom email address",
          placeholder: "team@example.com",
        },
      ],
      submit: {
        label: "Attach notification",
        action_id: `attach_notif:${formId}`,
        style: "primary",
      },
    },
  ];
}
