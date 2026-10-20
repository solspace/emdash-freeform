import type { PluginContext } from "emdash";
import type { AiCredentials } from "../lib/ai-config";

export type LlmTier = "fast" | "smart";

export interface LlmToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

const MODELS: Record<AiCredentials["provider"], Record<LlmTier, string>> = {
  anthropic: {
    fast: "claude-haiku-4-5-20251001",
    smart: "claude-sonnet-4-6",
  },
  openai: {
    fast: "gpt-4o-mini",
    smart: "gpt-4o",
  },
};

export interface ToolUseCallOptions {
  tier: LlmTier;
  system?: string;
  userMessage: string;
  tool: LlmToolSpec;
  forceTool?: boolean;
}

export interface ToolUseCallResult {
  toolInput: Record<string, unknown>;
  text: string;
}

export interface ChatTurnCallOptions {
  tier?: LlmTier;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  tool: LlmToolSpec;
}

export interface ChatTurnCallResult {
  reply: string;
  toolInput?: Record<string, unknown>;
  toolUseId?: string;
}

function providerErrorLabel(provider: AiCredentials["provider"]): string {
  return provider === "openai" ? "OpenAI" : "Anthropic";
}

async function anthropicToolUse(
  ctx: PluginContext,
  creds: AiCredentials,
  opts: ToolUseCallOptions,
): Promise<ToolUseCallResult> {
  const res = await ctx.http!.fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": creds.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODELS.anthropic[opts.tier],
      max_tokens: opts.tier === "fast" ? 4096 : 1024,
      ...(opts.system ? { system: opts.system } : {}),
      tools: [
        {
          name: opts.tool.name,
          description: opts.tool.description,
          input_schema: opts.tool.input_schema,
        },
      ],
      ...(opts.forceTool !== false
        ? { tool_choice: { type: "tool", name: opts.tool.name } }
        : {}),
      messages: [{ role: "user", content: opts.userMessage }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${providerErrorLabel(creds.provider)} ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    content?: Array<
      | { type: "text"; text?: string }
      | { type: "tool_use"; name?: string; input?: Record<string, unknown> }
    >;
  };

  let text = "";
  let toolInput: Record<string, unknown> | undefined;
  for (const block of json.content ?? []) {
    if (block.type === "text" && block.text) text += block.text;
    if (block.type === "tool_use" && block.name === opts.tool.name) {
      toolInput = block.input ?? {};
    }
  }

  if (!toolInput) {
    throw new Error("Unexpected AI response format");
  }

  return { toolInput, text: text.trim() };
}

async function openaiToolUse(
  ctx: PluginContext,
  creds: AiCredentials,
  opts: ToolUseCallOptions,
): Promise<ToolUseCallResult> {
  const messages: Array<{ role: string; content: string }> = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.userMessage });

  const res = await ctx.http!.fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${creds.apiKey}`,
    },
    body: JSON.stringify({
      model: MODELS.openai[opts.tier],
      max_tokens: opts.tier === "fast" ? 4096 : 1024,
      messages,
      tools: [
        {
          type: "function",
          function: {
            name: opts.tool.name,
            description: opts.tool.description,
            parameters: opts.tool.input_schema,
          },
        },
      ],
      ...(opts.forceTool !== false
        ? { tool_choice: { type: "function", function: { name: opts.tool.name } } }
        : { tool_choice: "auto" }),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${providerErrorLabel(creds.provider)} ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{
          id?: string;
          function?: { name?: string; arguments?: string };
        }>;
      };
    }>;
  };

  const message = json.choices?.[0]?.message;
  let text = message?.content?.trim() ?? "";
  const call = message?.tool_calls?.find((tc) => tc.function?.name === opts.tool.name);
  if (!call?.function?.arguments) {
    throw new Error("Unexpected AI response format");
  }

  let toolInput: Record<string, unknown>;
  try {
    toolInput = JSON.parse(call.function.arguments) as Record<string, unknown>;
  } catch {
    throw new Error("Unexpected AI response format");
  }

  return { toolInput, text };
}

export async function callToolUse(
  ctx: PluginContext,
  creds: AiCredentials,
  opts: ToolUseCallOptions,
): Promise<ToolUseCallResult> {
  return creds.provider === "openai"
    ? openaiToolUse(ctx, creds, opts)
    : anthropicToolUse(ctx, creds, opts);
}

async function anthropicChatTurn(
  ctx: PluginContext,
  creds: AiCredentials,
  opts: ChatTurnCallOptions,
): Promise<ChatTurnCallResult> {
  const res = await ctx.http!.fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": creds.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODELS.anthropic[opts.tier ?? "smart"],
      max_tokens: 1024,
      system: opts.system,
      tools: [
        {
          name: opts.tool.name,
          description: opts.tool.description,
          input_schema: opts.tool.input_schema,
        },
      ],
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
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
  let toolInput: Record<string, unknown> | undefined;
  let toolUseId: string | undefined;
  for (const block of json.content ?? []) {
    if (block.type === "text") reply += block.text;
    if (block.type === "tool_use" && block.name === opts.tool.name) {
      toolInput = block.input;
      toolUseId = block.id;
    }
  }
  return { reply: reply.trim(), toolInput, toolUseId };
}

async function openaiChatTurn(
  ctx: PluginContext,
  creds: AiCredentials,
  opts: ChatTurnCallOptions,
): Promise<ChatTurnCallResult> {
  const res = await ctx.http!.fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${creds.apiKey}`,
    },
    body: JSON.stringify({
      model: MODELS.openai[opts.tier ?? "smart"],
      max_tokens: 1024,
      messages: [
        { role: "system", content: opts.system },
        ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      tools: [
        {
          type: "function",
          function: {
            name: opts.tool.name,
            description: opts.tool.description,
            parameters: opts.tool.input_schema,
          },
        },
      ],
      tool_choice: "auto",
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    ctx.log.warn("Chat turn failed", { status: res.status, body: errText });
    return { reply: "Sorry, I'm having trouble responding right now. Please try again." };
  }

  const json = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{
          id?: string;
          function?: { name?: string; arguments?: string };
        }>;
      };
    }>;
  };

  const message = json.choices?.[0]?.message;
  let reply = message?.content?.trim() ?? "";
  const call = message?.tool_calls?.find((tc) => tc.function?.name === opts.tool.name);
  if (!call?.function?.arguments) {
    return { reply };
  }

  let toolInput: Record<string, unknown>;
  try {
    toolInput = JSON.parse(call.function.arguments) as Record<string, unknown>;
  } catch {
    return { reply };
  }

  return { reply, toolInput, toolUseId: call.id };
}

export async function callChatTurn(
  ctx: PluginContext,
  creds: AiCredentials,
  opts: ChatTurnCallOptions,
): Promise<ChatTurnCallResult> {
  return creds.provider === "openai"
    ? openaiChatTurn(ctx, creds, opts)
    : anthropicChatTurn(ctx, creds, opts);
}
