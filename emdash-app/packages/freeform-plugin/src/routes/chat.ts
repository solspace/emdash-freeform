import { type PluginContext } from "emdash";
import { runChatTurn, type ChatMessage } from "../ai/chat";
import { getApiKey } from "../lib/ai-key";
import { findFormByHandle, runAgentSubmission } from "../lib/agent-submit";
import type { StoredForm, VisitorPageView } from "../types";

interface ChatRequest {
  messages?: ChatMessage[];
  formHandle?: string;
  journey?: VisitorPageView[];
  salesContext?: string;
  siteName?: string;
}

export const chatRoutes = {
  chat: {
    public: true,
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const body = (routeCtx.input ?? {}) as ChatRequest;
      const formHandle = body.formHandle;
      if (!formHandle) return { error: "Missing formHandle" };

      const apiKey = await getApiKey(ctx);
      if (!apiKey) return { error: "Anthropic API key not configured." };

      const found = await findFormByHandle(ctx, formHandle);
      if (!found) return { error: `Form "${formHandle}" not found` };
      const form: StoredForm = found.data;

      const messages = Array.isArray(body.messages) ? body.messages : [];
      const journey = Array.isArray(body.journey) ? body.journey : undefined;
      const siteName = body.siteName?.trim() || form.name;
      const salesContext = body.salesContext?.trim() || "";

      const turn = await runChatTurn(ctx, form, messages, siteName, salesContext, apiKey);

      if (turn.submission) {
        const ip = routeCtx.request.headers.get("cf-connecting-ip");
        const result = await runAgentSubmission(ctx, {
          formId: found.id,
          data: turn.submission,
          journey,
          ip,
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
