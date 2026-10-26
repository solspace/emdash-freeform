import type { PluginContext } from "emdash";
import { FORM_TEMPLATES } from "../../lib/form-templates";

const NEW_FORM_MODAL_KEY = "ui:newFormModal";
const IMPORT_FORM_MODAL_KEY = "ui:importFormModal";

export type ListModal = "new_form" | "import_form" | null;

export async function getListModal(ctx: PluginContext): Promise<ListModal> {
  if (await ctx.kv.get<boolean>(NEW_FORM_MODAL_KEY)) return "new_form";
  if (await ctx.kv.get<boolean>(IMPORT_FORM_MODAL_KEY)) return "import_form";
  return null;
}

export async function setListModal(
  ctx: PluginContext,
  modal: ListModal,
): Promise<void> {
  await ctx.kv.delete(NEW_FORM_MODAL_KEY);
  await ctx.kv.delete(IMPORT_FORM_MODAL_KEY);
  if (modal === "new_form") await ctx.kv.set(NEW_FORM_MODAL_KEY, true);
  if (modal === "import_form") await ctx.kv.set(IMPORT_FORM_MODAL_KEY, true);
}

export function newFormTemplateModalBlocks(): object[] {
  return [
    { type: "header", text: "Create form" },
    {
      type: "section",
      text: "Pick a starter template, or start blank.",
    },
    {
      type: "form",
      block_id: "new_form_template",
      fields: [
        {
          type: "select",
          action_id: "template_id",
          label: "Template",
          options: FORM_TEMPLATES.map((t) => ({
            value: t.id,
            label: `${t.name} — ${t.description}`,
          })),
          initial_value: "contact",
        },
        {
          type: "text_input",
          action_id: "form_name",
          label: "Form name (optional)",
          placeholder: "Uses the template name if empty",
        },
      ],
      submit: {
        label: "Create form",
        action_id: "submit_new_form_template",
        style: "primary",
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          label: "Cancel",
          action_id: "cancel_list_modal",
          style: "secondary",
        },
      ],
    },
    { type: "divider" },
  ];
}

export function importFormModalBlocks(): object[] {
  return [
    { type: "header", text: "Import form JSON" },
    {
      type: "section",
      text: "Paste a Freeform export (or compatible JSON). A new form is created; the handle is made unique if needed.",
    },
    {
      type: "form",
      block_id: "import_form",
      fields: [
        {
          type: "text_input",
          action_id: "form_json",
          label: "JSON",
          placeholder: '{ "version": 1, "name": "Contact", "rows": [...] }',
          multiline: true,
        },
      ],
      submit: {
        label: "Import",
        action_id: "submit_import_form",
        style: "primary",
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          label: "Cancel",
          action_id: "cancel_list_modal",
          style: "secondary",
        },
      ],
    },
    { type: "divider" },
  ];
}
