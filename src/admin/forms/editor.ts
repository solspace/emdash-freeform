import type { PluginContext } from "emdash";
import { ensureFormHandle } from "../../lib/form-handles";
import {
  backToFormsButton,
  editorTopActions,
  pageHeader,
  shortDate,
} from "../layout";
import type { StoredForm } from "../../types";
import {
  addFieldFormBlocks,
  editFieldFormBlocks,
  findField,
} from "./field-blocks";
import {
  integratePanelBlocks,
  metaPanelBlocks,
  notificationsPanelBlocks,
  spamPanelBlocks,
} from "./panels";

export type EditorSection =
  | "build"
  | "settings"
  | "notifications"
  | "spam"
  | "integrate";

export interface EditorUiState {
  section: EditorSection;
  selectedFieldId?: string | null;
  showAddField?: boolean;
  /** Show AI prompt first (new form with AI flow). */
  focusAiBuilder?: boolean;
}

export const defaultEditorUi: EditorUiState = {
  section: "build",
  selectedFieldId: null,
  showAddField: false,
};

const SECTIONS: Array<{ id: EditorSection; label: string }> = [
  { id: "build", label: "Fields" },
  { id: "settings", label: "Settings" },
  { id: "notifications", label: "Notifications" },
  { id: "spam", label: "Spam" },
  { id: "integrate", label: "Render" },
];

function sectionNav(formId: string, active: EditorSection): object {
  return {
    type: "actions",
    elements: SECTIONS.map((s) => ({
      type: "button",
      label: s.label,
      action_id: `view_${s.id}:${formId}`,
      ...(s.id === active ? { style: "primary" as const } : {}),
    })),
  };
}

function fieldRowBlocks(formId: string, formData: StoredForm): object[] {
  const flat = formData.rows.flatMap((r) => r.fields);
  if (flat.length === 0) {
    return [
      {
        type: "empty",
        title: "No fields yet",
        description: "Add a field below or use AI to build the form.",
        size: "base",
      },
    ];
  }

  return flat.flatMap((f) => {
    const details = [
      f.type,
      f.required ? "required" : "optional",
      f.handle,
    ].join(" · ");
    return [
      {
        type: "fields",
        fields: [
          {
            label: f.label,
            value: details,
          },
        ],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            label: "Edit field",
            action_id: `select_field:${formId}:${f.id}`,
          },
          {
            type: "button",
            label: "Remove",
            action_id: `rm_selected:${formId}:${f.id}`,
            style: "danger",
          },
        ],
      },
    ];
  });
}

function aiBuilderColumnBlocks(formId: string): object[] {
  return [
    { type: "header", text: "AI form builder" },
    {
      type: "context",
      text: "Describe changes in plain language — e.g. add one more phone field.",
    },
    {
      type: "form",
      block_id: "ai_gen",
      fields: [
        {
          type: "text_input",
          action_id: "description",
          label: "Instructions",
          placeholder: "Add a phone field after email, optional",
          multiline: true,
        },
      ],
      submit: { label: "Apply with AI", action_id: `ai:${formId}`, style: "primary" },
    },
  ];
}

function buildFieldsColumnBlocks(formId: string, formData: StoredForm): object[] {
  return [
    { type: "header", text: "Fields" },
    ...fieldRowBlocks(formId, formData),
    { type: "divider" },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          label: "Add field",
          action_id: `show_add:${formId}`,
          style: "primary",
        },
      ],
    },
  ];
}

async function mainPanelBlocks(
  formId: string,
  formData: StoredForm,
  ctx: PluginContext,
  ui: EditorUiState,
  siteOrigin: string,
): Promise<object[]> {
  switch (ui.section) {
    case "settings":
      return metaPanelBlocks(formId, formData);
    case "notifications":
      return notificationsPanelBlocks(formId, ctx);
    case "spam":
      return spamPanelBlocks(formId, formData, ctx);
    case "integrate":
      return integratePanelBlocks(formId, formData, siteOrigin);
    case "build":
    default:
      break;
  }

  if (ui.focusAiBuilder) {
    return [
      {
        type: "banner",
        title: "Describe your form",
        description:
          "Tell AI what fields you need — for example: contact form with name, email, and message.",
        variant: "default",
      },
      {
        type: "form",
        block_id: "ai_gen",
        fields: [
          {
            type: "text_input",
            action_id: "description",
            label: "Instructions",
            placeholder: "Contact form with name, email, phone, and message",
          },
        ],
        submit: {
          label: "Generate fields",
          action_id: `ai:${formId}`,
          style: "primary",
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            label: "Start with a blank form",
            action_id: `dismiss_ai_builder:${formId}`,
            style: "secondary",
          },
        ],
      },
    ];
  }

  if (ui.showAddField) {
    return addFieldFormBlocks(formId, formData);
  }

  if (ui.selectedFieldId) {
    const field = findField(formData.rows, ui.selectedFieldId);
    if (field) {
      return [
        {
          type: "actions",
          elements: [
            {
              type: "button",
              label: "← Back to all fields",
              action_id: `deselect_field:${formId}`,
            },
          ],
        },
        ...editFieldFormBlocks(formId, field),
      ];
    }
  }

  return [
    {
      type: "columns",
      columns: [buildFieldsColumnBlocks(formId, formData), aiBuilderColumnBlocks(formId)],
    },
  ];
}

export async function editorBlocks(
  formId: string,
  ctx: PluginContext,
  ui: EditorUiState = defaultEditorUi,
  siteOrigin = "",
): Promise<object[]> {
  let formData = (await ctx.storage.forms.get(formId)) as StoredForm | null;

  if (!formData) {
    return [
      { type: "banner", title: "Form not found", variant: "error" },
      backToFormsButton(),
    ];
  }

  if (!formData.handle) {
    formData = await ensureFormHandle(ctx, formId, formData);
  }

  const flatFields = formData.rows.flatMap((r) => r.fields);
  const { items: subItems } = await ctx.storage.submissions.query({
    where: { formId },
    limit: 10000,
  });

  const content = await mainPanelBlocks(formId, formData, ctx, ui, siteOrigin);

  return [
    ...pageHeader(formData.name),
    editorTopActions(formId),
    {
      type: "stats",
      items: [
        { label: "Fields", value: String(flatFields.length) },
        { label: "Submissions", value: String(subItems.length) },
        { label: "Handle", value: formData.handle },
        { label: "Updated", value: shortDate(formData.updatedAt) },
      ],
    },
    { type: "divider" },
    sectionNav(formId, ui.section),
    { type: "divider" },
    ...content,
  ];
}
