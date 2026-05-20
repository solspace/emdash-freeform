import type { PluginContext } from "emdash";
import { fieldToSchema } from "../routes/agent";
import type { StoredForm } from "../types";

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

const SYSTEM_TEMPLATE = `You are a friendly concierge for {{siteName}}, helping a website visitor get in touch with the company. You are not a salesperson — be helpful and direct, not pushy.

About the company:
{{salesContext}}

You have one tool available, submit_contact_form. When you have enough information to submit a useful inquiry, call it. Don't call it prematurely; one or two clarifying questions are usually fine before submitting.

Guidance:
- Open with a warm, brief greeting and ask what brought them here.
- Collect the required fields conversationally over a few turns — don't pepper them with a wall of questions.
- For optional fields, only ask if it seems relevant to their inquiry.
- Never invent values. If they haven't said something, leave it out (unless it's required, in which case ask).
- When you have a clear inquiry that a sales engineer could act on, briefly confirm the gist back to the visitor and then call submit_contact_form.
- After a successful submission, thank them and confirm a human will follow up. Don't keep collecting more information.

The form has these fields (use them to know what to ask and what to pass):
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
  apiKey: string,
): Promise<ChatTurnResult> {
  const system = buildSystem(form, siteName, salesContext);
  const tool = buildToolSpec(form);

  const res = await ctx.http!.fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system,
      tools: [tool],
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    ctx.log.warn("Chat turn failed", { status: res.status, body: errText });
    return { reply: "Sorry, I'm having trouble responding right now. Please try again." };
  }

  const json = (await res.json()) as {
    content?: Array<
      | { type: "text"; text: string }
      | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
    >;
  };

  let reply = "";
  let submission: Record<string, unknown> | undefined;
  let toolUseId: string | undefined;
  for (const block of json.content ?? []) {
    if (block.type === "text") reply += block.text;
    if (block.type === "tool_use" && block.name === "submit_contact_form") {
      submission = block.input;
      toolUseId = block.id;
    }
  }
  return { reply: reply.trim(), submission, toolUseId };
}
