import type { PluginContext } from "emdash";
import type { AiCredentials } from "../lib/ai-config";
import { fieldToSchema } from "../routes/agent";
import type { StoredForm } from "../types";
import { callChatTurn } from "./llm";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatTurnResult {
  reply: string;
  // When present, the model decided it has enough info to submit and is
  // asking the server to perform the submission with these field values.
  submission?: Record<string, unknown>;
  // The tool_use id Anthropic emits — must be returned to Claude on the next
  // turn (paired with a tool_result block) so the conversation stays valid.
  toolUseId?: string;
}

const SYSTEM_TEMPLATE = `Friendly concierge for {{siteName}}. Helpful, not pushy.

Company context:
{{salesContext}}

Tool: submit_contact_form — call when you have a useful inquiry (1–2 clarifying questions OK first).

- Brief greeting; ask what brought them.
- Collect required fields over a few turns; optional only if relevant.
- Never invent values; ask for required unknowns.
- Confirm gist, then submit; thank them and stop collecting.

Fields:
{{fieldList}}`;

const buildSystem = (
  form: StoredForm,
  siteName: string,
  salesContext: string,
): string => {
  const lines: string[] = [];
  for (const row of form.rows) {
    for (const field of row.fields) {
      const req = field.required ? "required" : "optional";
      const opts = field.options
        ? ` — options: ${field.options.map((o) => o.value).join(", ")}`
        : "";
      lines.push(`- ${field.handle} (${req}): ${field.label}${opts}`);
    }
  }
  return SYSTEM_TEMPLATE.replace("{{siteName}}", siteName)
    .replace("{{salesContext}}", salesContext.trim() || "(none provided)")
    .replace("{{fieldList}}", lines.join("\n"));
};

const buildToolSpec = (form: StoredForm): Record<string, unknown> => {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const row of form.rows) {
    for (const field of row.fields) {
      properties[field.handle] = fieldToSchema(field);
      if (field.required) required.push(field.handle);
    }
  }
  return {
    name: "submit_contact_form",
    description: `Submit ${form.name} on behalf of the visitor. Only call this when you have enough information for a sales engineer to follow up meaningfully.`,
    input_schema: {
      type: "object",
      required,
      properties,
    },
  };
};

export async function runChatTurn(
  ctx: PluginContext,
  form: StoredForm,
  messages: ChatMessage[],
  siteName: string,
  salesContext: string,
  creds: AiCredentials,
): Promise<ChatTurnResult> {
  const system = buildSystem(form, siteName, salesContext);
  const tool = buildToolSpec(form);

  const result = await callChatTurn(ctx, creds, {
    system,
    messages,
    tool: {
      name: String(tool.name),
      description: String(tool.description),
      input_schema: tool.input_schema as Record<string, unknown>,
    },
  });

  return {
    reply: result.reply,
    submission: result.toolInput,
    toolUseId: result.toolUseId,
  };
}
