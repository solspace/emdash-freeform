import { PluginRouteError, type PluginContext } from "emdash";
import { findFormByHandle, runAgentSubmission } from "../lib/agent-submit";
import { isMultiType, isOptionType } from "../lib/options";
import { ensureDemoSeed } from "../lib/seed";
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

// Canonical page that renders a form and honors query-string prefill. Lets the
// AI compose a deep link the user clicks — sidestepping the outbound-POST wall
// while still putting a reviewable form in front of the user before submit.
const FORM_PAGE_PATH = (handle: string) => `/forms/${encodeURIComponent(handle)}`;

interface PrefillParam {
  name: string;
  type: "string" | "array" | "boolean";
  format?: "email";
  enum?: string[];
  repeat?: true;
  true_value?: "true";
}

function fieldToPrefillParam(field: FormField): PrefillParam {
  if (isMultiType(field.type)) {
    return {
      name: field.handle,
      type: "array",
      repeat: true,
      ...(field.options ? { enum: field.options.map((o) => o.value) } : {}),
    };
  }
  if (field.type === "checkbox") {
    return { name: field.handle, type: "boolean", true_value: "true" };
  }
  if (isOptionType(field.type) && field.options) {
    return { name: field.handle, type: "string", enum: field.options.map((o) => o.value) };
  }
  if (field.type === "email") {
    return { name: field.handle, type: "string", format: "email" };
  }
  return { name: field.handle, type: "string" };
}

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
  const prefillParams: PrefillParam[] = [];
  for (const row of form.rows) {
    for (const field of row.fields) {
      properties[field.handle] = fieldToSchema(field);
      if (field.required) required.push(field.handle);
      prefillParams.push(fieldToPrefillParam(field));
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
    prefill: {
      page_url: `${origin}${FORM_PAGE_PATH(form.handle)}`,
      encoding: "application/x-www-form-urlencoded",
      params: prefillParams,
      notes: [
        "Append params as a standard URL query string. Arrays may repeat the key (?h=a&h=b) or use a single comma-separated value (?h=a,b).",
        "Booleans set the field when the value is one of: 1, true, yes, on (case-insensitive). Any other value leaves the field unchecked.",
        "Option fields drop values that do not match the listed `enum`. Unknown params are ignored.",
        "This is a HUMAN-IN-THE-LOOP flow: the AI composes the URL, the user clicks it, reviews the prefilled form, then presses Submit. Do not POST to page_url.",
      ],
    },
  };
};

export const agentRoutes = {
  "list-public-forms": {
    public: true,
    handler: async (_routeCtx: any, ctx: PluginContext) => {
      // See note in routes/public.ts get-form: ensures the default Contact form
      // exists before an agent's first lookup of /.well-known/freeform.json.
      await ensureDemoSeed(ctx);
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
      await ensureDemoSeed(ctx);

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

  // Compose a prefill URL for a form. Validates each supplied value against
  // the field's options before encoding so the returned URL is always a link
  // that will populate the form cleanly on arrival.
  //
  // Defense-in-depth: the renderer also caps and sanitizes inbound params, so
  // even a hand-crafted URL bypassing this composer is bounded. We enforce the
  // same caps here so the AI's link is honest about what will survive landing.
  "build-prefill-url": {
    public: true,
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const { handle, values, origin } = (routeCtx.input ?? {}) as {
        handle?: string;
        values?: Record<string, unknown>;
        origin?: string;
      };
      if (!handle || typeof handle !== "string") {
        throw PluginRouteError.badRequest("Missing handle");
      }
      if (!origin || typeof origin !== "string") {
        throw PluginRouteError.badRequest("Missing origin");
      }
      const found = await findFormByHandle(ctx, handle);
      if (!found) throw PluginRouteError.notFound(`Form "${handle}" not found`);

      const MAX_VALUE_LENGTH = 2000;
      const MAX_MULTI_VALUES = 50;
      const CONTROL_CHARS = /[\x00-\x08\x0B-\x1F\x7F]/g;
      const sanitize = (raw: string): string => {
        const stripped = raw.replace(CONTROL_CHARS, "");
        return stripped.length > MAX_VALUE_LENGTH
          ? stripped.slice(0, MAX_VALUE_LENGTH)
          : stripped;
      };

      const fieldByHandle = new Map<string, FormField>();
      for (const row of found.data.rows) {
        for (const field of row.fields) fieldByHandle.set(field.handle, field);
      }

      const params = new URLSearchParams();
      const applied: string[] = [];
      const dropped: Array<{ handle: string; reason: string }> = [];

      for (const [key, raw] of Object.entries(values ?? {})) {
        const field = fieldByHandle.get(key);
        if (!field) {
          dropped.push({ handle: key, reason: "no field with this handle" });
          continue;
        }

        if (isMultiType(field.type)) {
          const list = Array.isArray(raw)
            ? raw.map((v) => String(v))
            : typeof raw === "string"
              ? [raw]
              : [];
          const allowed = field.options
            ? new Set(field.options.map((o) => o.value))
            : null;
          const cleaned = list
            .map((v) => sanitize(v).trim())
            .filter(Boolean)
            .slice(0, MAX_MULTI_VALUES);
          const kept = cleaned.filter((v) => !allowed || allowed.has(v));
          const skipped = list.length - kept.length;
          if (kept.length === 0) {
            dropped.push({
              handle: key,
              reason: skipped > 0 ? "no values matched the field's options" : "empty value",
            });
            continue;
          }
          for (const v of kept) params.append(key, v);
          applied.push(key);
          if (skipped > 0) {
            dropped.push({ handle: key, reason: `${skipped} value(s) outside the field's options were skipped` });
          }
          continue;
        }

        if (field.type === "checkbox") {
          const truthy =
            raw === true ||
            (typeof raw === "string" && ["1", "true", "yes", "on"].includes(raw.toLowerCase()));
          if (!truthy) {
            dropped.push({ handle: key, reason: "checkbox not enabled (value was not truthy)" });
            continue;
          }
          params.set(key, "true");
          applied.push(key);
          continue;
        }

        const rawString = typeof raw === "string" ? raw : String(raw ?? "");
        const stringValue = sanitize(rawString).trim();
        if (!stringValue) {
          dropped.push({ handle: key, reason: "empty value" });
          continue;
        }
        if (isOptionType(field.type) && field.options) {
          const allowed = new Set(field.options.map((o) => o.value));
          if (!allowed.has(stringValue)) {
            dropped.push({ handle: key, reason: `value "${stringValue}" is not in the field's options` });
            continue;
          }
        }
        params.set(key, stringValue);
        applied.push(key);
      }

      const qs = params.toString();
      const trimmedOrigin = origin.replace(/\/+$/, "");
      const url = `${trimmedOrigin}/forms/${encodeURIComponent(found.data.handle)}${qs ? `?${qs}` : ""}`;
      return { url, applied, dropped };
    },
  },
};
