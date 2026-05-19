import { PluginRouteError, type PluginContext } from "emdash";
import { findFormByHandle, runAgentSubmission } from "../lib/agent-submit";
import type { FormField, StoredForm, VisitorPageView } from "../types";

// Routes that let an AI agent discover and submit forms without an MCP install.
// Public counterparts to the human-facing get-form/submit pair, with the
// browser-only protections (CSRF, honeypot, timing) replaced by content
// scoring + per-IP rate limit.

// Public URL surfaced in manifests. The actual plugin handler lives at
// /_emdash/api/plugins/freeform/submit-agent, but EmDash's default robots.txt
// disallows /_emdash/*. The host app proxies this public path to the plugin
// route so well-behaved AI agents can POST without robots.txt blocking them.
const AGENT_SUBMIT_PATH = "/api/freeform/submit";

export const fieldToSchema = (field: FormField): Record<string, unknown> => {
  const base: Record<string, unknown> = { title: field.label };
  switch (field.type) {
    case "email":
      return { ...base, type: "string", format: "email" };
    case "number":
      return { ...base, type: "string", pattern: "^-?\\d+(\\.\\d+)?$" };
    case "phone":
      return { ...base, type: "string" };
    case "textarea":
    case "text":
      return { ...base, type: "string" };
    case "checkbox":
      return { ...base, type: "string", enum: ["true", "false"] };
    case "radio":
    case "select":
      return {
        ...base,
        type: "string",
        enum: (field.options ?? []).map((o) => o.value),
      };
    case "checkbox_group":
    case "multi_select":
      return {
        ...base,
        type: "array",
        items: { type: "string", enum: (field.options ?? []).map((o) => o.value) },
      };
    default:
      return { ...base, type: "string" };
  }
};

const buildManifest = (
  form: StoredForm,
  formId: string,
  origin: string,
): Record<string, unknown> => {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const row of form.rows) {
    for (const field of row.fields) {
      properties[field.handle] = fieldToSchema(field);
      if (field.required) required.push(field.handle);
    }
  }
  return {
    version: 1,
    id: form.handle,
    kind: "form.submit",
    title: form.name,
    endpoint: {
      method: "POST",
      url: `${origin}${AGENT_SUBMIT_PATH}`,
      content_type: "application/json",
    },
    request_schema: {
      type: "object",
      required: ["formId", ...required],
      properties: {
        formId: { type: "string", const: formId, description: "Stable form id from the catalog." },
        ...properties,
      },
      additionalProperties: false,
    },
    response_schema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        message: { type: "string" },
        error: { type: "string" },
      },
    },
  };
};

export const agentRoutes = {
  "list-public-forms": {
    public: true,
    handler: async (_routeCtx: any, ctx: PluginContext) => {
      const { items } = await ctx.storage.forms.query({ orderBy: { createdAt: "desc" } });
      return {
        forms: (items as Array<{ id: string; data: StoredForm }>).map((f) => ({
          id: f.id,
          handle: f.data.handle,
          name: f.data.name,
          fieldCount: f.data.rows.reduce((n, r) => n + r.fields.length, 0),
        })),
      };
    },
  },

  "get-form-manifest": {
    public: true,
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const url = new URL(routeCtx.request.url);
      const handle = url.searchParams.get("handle");
      const origin = url.searchParams.get("origin") ?? "";
      if (!handle) throw PluginRouteError.badRequest("Missing ?handle=");

      const found = await findFormByHandle(ctx, handle);
      if (!found) throw PluginRouteError.notFound(`Form "${handle}" not found`);

      return buildManifest(found.data, found.id, origin);
    },
  },

  "submit-agent": {
    public: true,
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const body = routeCtx.input as Record<string, unknown>;
      const { formId, __ff_journey, ...rawData } = body;
      const journey = Array.isArray(__ff_journey)
        ? (__ff_journey as VisitorPageView[])
        : undefined;
      const ip = routeCtx.request.headers.get("cf-connecting-ip");

      return runAgentSubmission(ctx, {
        formId: typeof formId === "string" ? formId : "",
        data: rawData,
        journey,
        ip,
      });
    },
  },
};
