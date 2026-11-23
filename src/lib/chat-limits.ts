import type { ChatMessage } from "../ai/chat";

/** Soft cap before the LLM call — stops unbounded AI spend. */
export const CHAT_RATE_LIMIT_PER_HOUR = 20;
export const CHAT_MAX_MESSAGES = 40;
export const CHAT_MAX_MESSAGE_CHARS = 4_000;

export function sanitizeChatMessages(
  raw: unknown,
): ChatMessage[] | { error: string } {
  if (!Array.isArray(raw)) return [];
  if (raw.length > CHAT_MAX_MESSAGES) {
    return {
      error: `Too many messages (max ${CHAT_MAX_MESSAGES}). Start a new conversation.`,
    };
  }
  const out: ChatMessage[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const role = (m as ChatMessage).role;
    if (role !== "user" && role !== "assistant") continue;
    const content =
      typeof (m as ChatMessage).content === "string"
        ? (m as ChatMessage).content
        : "";
    if (content.length > CHAT_MAX_MESSAGE_CHARS) {
      return {
        error: `Message too long (max ${CHAT_MAX_MESSAGE_CHARS} characters).`,
      };
    }
    out.push({ role, content });
  }
  return out;
}
