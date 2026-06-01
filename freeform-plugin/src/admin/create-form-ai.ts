import type { PluginContext } from "emdash";

const CREATE_FORM_AI_OPEN_KEY = "ui:createFormAiOpen";

export async function isCreateFormAiModalOpen(ctx: PluginContext): Promise<boolean> {
  return !!(await ctx.kv.get<boolean>(CREATE_FORM_AI_OPEN_KEY));
}

export async function setCreateFormAiModalOpen(
  ctx: PluginContext,
  open: boolean,
): Promise<void> {
  if (open) await ctx.kv.set(CREATE_FORM_AI_OPEN_KEY, true);
  else await ctx.kv.delete(CREATE_FORM_AI_OPEN_KEY);
}

/** Prompt panel at top of forms list (modal-style flow in Block Kit). */
export function createFormAiModalBlocks(): object[] {
  return [
    { type: "header", text: "Create form with AI" },
    {
      type: "section",
      text: "Describe the form you want. AI will add the fields, then you can refine them in the editor.",
    },
    {
      type: "form",
      block_id: "create_form_ai",
      fields: [
        {
          type: "text_input",
          action_id: "description",
          label: "Instructions",
          placeholder: "Contact form with name, email, phone, and message",
          multiline: true,
        },
      ],
      submit: {
        label: "Generate form",
        action_id: "submit_create_form_ai",
        style: "primary",
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          label: "Cancel",
          action_id: "cancel_create_form_ai",
          style: "secondary",
        },
      ],
    },
    { type: "divider" },
  ];
}
