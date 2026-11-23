import { type PluginContext } from "emdash";
import { runChatTurn, type ChatMessage } from "../ai/chat";
import { findFormByHandle, runAgentSubmission } from "../lib/agent-submit";
import { getAiCredentials } from "../lib/ai-config";
import {
  CHAT_RATE_LIMIT_PER_HOUR,
  sanitizeChatMessages,
} from "../lib/chat-limits";
import { clientIp } from "../lib/client-ip";
import { formAccess, isChatEnabled } from "../lib/form-access";
import { rateLimitCheck } from "../lib/rate-limit";
import type { StoredForm, VisitorPageView } from "../types";

export {
  CHAT_MAX_MESSAGE_CHARS,
  CHAT_MAX_MESSAGES,
  CHAT_RATE_LIMIT_PER_HOUR,
} from "../lib/chat-limits";

interface ChatRequest {
  messages?: ChatMessage[];
  formHandle?: string;
  journey?: VisitorPageView[];
  /** Ignored — prompt injection vector; use form.access.chatSalesContext. */
  salesContext?: string;
  /** Ignored — use form.access.chatSiteName or form.name. */
  siteName?: string;
}

export const chatRoutes = {
  chat: {
    public: true,
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const body = (routeCtx.input ?? {}) as ChatRequest;
      const formHandle = body.formHandle;
      if (!formHandle) return { error: "Missing formHandle" };

      const creds = await getAiCredentials(ctx);
      if (!creds) return { error: "AI API key not configured." };

      const found = await findFormByHandle(ctx, formHandle);
      if (!found) return { error: `Form "${formHandle}" not found` };
      const form: StoredForm = found.data;

      if (!isChatEnabled(form)) {
        return { error: "AI chat is disabled for this form." };
      }

      const ip = clientIp(routeCtx.request);
      if (
        !(await rateLimitCheck(ctx, ip, {
          prefix: "chat-rl",
          limit: CHAT_RATE_LIMIT_PER_HOUR,
        }))
      ) {
        return { error: "Rate limit exceeded. Try again later." };
      }

      const sanitized = sanitizeChatMessages(body.messages);
      if (!Array.isArray(sanitized)) return { error: sanitized.error };

      const access = formAccess(form);
      // Never trust client salesContext / siteName (prompt injection + billing).
      const siteName = access.chatSiteName?.trim() || form.name;
      const salesContext = access.chatSalesContext?.trim() || "";

      const journey = Array.isArray(body.journey) ? body.journey : undefined;
      const turn = await runChatTurn(ctx, form, sanitized, siteName, salesContext, creds);

      if (turn.submission) {
        const result = await runAgentSubmission(ctx, {
          formId: found.id,
          data: turn.submission,
          journey,
          ip,
          fromChat: true,
        });
        return {
          kind: "submitted",
          reply: turn.reply,
          submission: result,
        };
      }

      return { kind: "text", reply: turn.reply };
    },
  },
};
