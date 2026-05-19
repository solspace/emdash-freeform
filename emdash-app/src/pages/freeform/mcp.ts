import type { APIRoute } from "astro";
// Astro 6 removed Astro.locals.runtime.env. The replacement is this virtual
// module exposed by the Cloudflare adapter (and shimmed by Miniflare in dev).
import { env } from "cloudflare:workers";

export const prerender = false;

// Freeform MCP server — Streamable HTTP transport, OAuth-gated via EmDash.
//
// Lives outside the plugin package because plugin route returns are
// unconditionally wrapped in `{ data: ... }` and cannot set custom status,
// content-type, or WWW-Authenticate headers — all of which MCP needs.
//
// Auth model: this endpoint demands a Bearer token. Actual validation is
// delegated by forwarding the token to a non-public Freeform plugin route;
// EmDash's auth middleware validates it there and we propagate any 401.

const MCP_PROTOCOL_VERSION = "2025-06-18";
const PLUGIN_BASE = "/_emdash/api/plugins/freeform";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: any;
}

function rpcResult(id: any, result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    headers: { "Content-Type": "application/json" },
  });
}

function rpcError(id: any, code: number, message: string, data?: unknown): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id, error: { code, message, data } }),
    { headers: { "Content-Type": "application/json" } }
  );
}

// Behind cloudflared/any reverse proxy, request.url is the localhost HTTP url.
// Honor X-Forwarded-Proto / X-Forwarded-Host to build the public origin so the
// URLs we hand to MCP clients are reachable from the outside.
export function publicOrigin(request: Request): string {
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? request.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}

function unauthorized(origin: string): Response {
  return new Response(
    JSON.stringify({
      error: { code: "UNAUTHORIZED", message: "Bearer token required" },
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        // Point at our own resource metadata at the RFC 9728 convention path.
        // mcp-remote uses convention-based discovery (not this hint), but
        // emitting it correctly is good hygiene for clients that do follow it.
        "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/freeform/mcp"`,
      },
    }
  );
}

// A Fetcher is anything with a `fetch` method matching the global signature.
// In production it's `env.SELF` (a service binding); in dev it's `globalThis`.
// Threading it through avoids the Cloudflare loopback restriction that blocks
// a worker from making HTTP requests back to its own hostname.
type Fetcher = { fetch: typeof fetch };

async function callPluginRoute(
  fetcher: Fetcher,
  request: Request,
  routeName: string,
  init?: { method?: "GET" | "POST"; query?: Record<string, string>; body?: unknown }
): Promise<unknown> {
  const url = new URL(`${PLUGIN_BASE}/${routeName}`, new URL(request.url).origin);
  if (init?.query) {
    for (const [k, v] of Object.entries(init.query)) url.searchParams.set(k, v);
  }
  const auth = request.headers.get("Authorization");
  const res = await fetcher.fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      ...(auth ? { Authorization: auth } : {}),
      ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Plugin route ${routeName} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data: unknown };
  return json.data;
}

// Must stay in sync with ALL_FIELD_TYPES in @local/freeform-plugin/constants.
// The plugin enforces the Pro gate on `email`; we still advertise it so Claude
// can attempt it and the plugin returns a clear license error on Free.
const FIELD_TYPES = [
  "text",
  "email",
  "textarea",
  "number",
  "phone",
  "checkbox",
  "checkbox_group",
  "radio",
  "select",
  "multi_select",
] as const;

const OPTION_FIELD_TYPES = ["checkbox_group", "radio", "select", "multi_select"] as const;

const OPTION_SCHEMA = {
  type: "object",
  required: ["value", "label"],
  properties: {
    value: { type: "string", description: "Stable machine value (snake_case)" },
    label: { type: "string", description: "Human-readable label shown to the user" },
  },
  additionalProperties: false,
} as const;

const FIELD_SCHEMA = {
  type: "object",
  required: ["type", "label"],
  properties: {
    type: { type: "string", enum: FIELD_TYPES },
    label: { type: "string", description: "Human-readable label, e.g. 'First Name'" },
    handle: {
      type: "string",
      description: "Optional snake_case identifier. Auto-derived from label if omitted.",
    },
    required: { type: "boolean", description: "Is this field required? (default false)" },
    placeholder: { type: "string" },
    options: {
      type: "array",
      minItems: 2,
      description: `Choices for ${OPTION_FIELD_TYPES.join(", ")} fields. Required for those types; omit for all other types.`,
      items: OPTION_SCHEMA,
    },
    defaultValue: {
      description:
        "Optional pre-filled value. For text/email/textarea/number/phone, a plain string. For 'checkbox' (single), use 'true' to default-checked. For radio/select, the chosen option's value. For checkbox_group/multi_select, an array of option values. Option-bearing types: must match available option values.",
      oneOf: [
        { type: "string" },
        { type: "array", items: { type: "string" } },
      ],
    },
  },
  additionalProperties: false,
} as const;

const ROW_SCHEMA = {
  type: "object",
  required: ["fields"],
  properties: {
    fields: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      description:
        "Fields placed side-by-side on this row. Use multiple fields per row for column layouts (e.g., First Name + Last Name on one row).",
      items: FIELD_SCHEMA,
    },
  },
  additionalProperties: false,
} as const;

const TOOLS = [
  {
    name: "list_forms",
    description:
      "List all Freeform forms on this site. Returns id, name, field count, submission count, and timestamps. Use this to find a form's id before calling list_submissions.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_submissions",
    description:
      "List form submissions, most recent first. Includes the AI-generated brief (intent, urgency low/medium/high, 1-2 sentence summary, key facts, suggested next action) and the visitor's pre-submission page journey when captured. Also includes spamScore (0-10, null if scoring disabled), spamReason, and archived flag. Optionally filter by form id and/or date range (ISO 8601). Archived submissions excluded by default.",
    inputSchema: {
      type: "object",
      properties: {
        formId: { type: "string", description: "Filter to a single form id" },
        since: { type: "string", description: "ISO 8601 timestamp; include submissions at/after this time" },
        until: { type: "string", description: "ISO 8601 timestamp; include submissions at/before this time" },
        limit: { type: "number", description: "Max results (default 50, hard cap 500)" },
        includeArchived: { type: "boolean", description: "Include archived submissions (default false)" },
        minSpamScore: { type: "number", description: "Only include submissions with spamScore >= this value (0-10)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_form",
    description: "Fetch a single form's full configuration (rows, fields, settings) by id or slug.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Form id or slug" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_form_prefill_url",
    description:
      "Compose a deep link the user can click to land on a form with values already filled in. Use this when the user wants help submitting a form but cannot or should not let an AI POST on their behalf — typical Claude Desktop flow. Pass field values keyed by handle (get the handle from `list_forms` or `get_form`). Values are validated against the form's options server-side; mismatches are reported in `dropped` but the URL is still returned with the valid subset. Hand the returned `url` to the user as a clickable link — DO NOT fetch it yourself. The user will review the prefilled form and press Submit.",
    inputSchema: {
      type: "object",
      required: ["handle", "values"],
      properties: {
        handle: { type: "string", description: "Form handle (lowercase_snake_case)." },
        values: {
          type: "object",
          description:
            "Map of field handle → value. For checkbox_group / multi_select pass an array. For single checkbox pass true / 'true' to mark it checked.",
          additionalProperties: {
            oneOf: [
              { type: "string" },
              { type: "boolean" },
              { type: "array", items: { type: "string" } },
            ],
          },
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "export_submissions_csv",
    description:
      "Prepare a CSV download of submissions matching a filter. Returns a short-lived (15 min) signed URL the user can click in chat to download the file. Use this when the user wants a spreadsheet — e.g. after narrowing submissions in conversation, or for an ad-hoc report. Pass `submissionIds` to export an exact set you've already gathered; otherwise pass the same filter shape as `list_submissions` and the export route re-queries server-side. For a single form, columns are derived from the form's field handles; across forms, the row data is emitted as a JSON column. Archived submissions are excluded by default. If no rows match, the response has `rowCount: 0` and a null url — tell the user, don't fabricate a link.",
    inputSchema: {
      type: "object",
      properties: {
        formId: { type: "string", description: "Limit to one form id (recommended — gives column-per-field output)" },
        submissionIds: {
          type: "array",
          items: { type: "string" },
          description: "Export exactly these submission ids (capped at 1000). Combines with other filters via AND.",
        },
        since: { type: "string", description: "ISO 8601 lower bound on createdAt" },
        until: { type: "string", description: "ISO 8601 upper bound on createdAt" },
        includeArchived: { type: "boolean", description: "Include archived submissions (default false)" },
        minSpamScore: { type: "number", description: "Only include rows with spamScore >= this (0-10)" },
        filename: {
          type: "string",
          description: "Optional override; default is `freeform-<form_handle>-<YYYY-MM-DD>.csv`",
        },
      },
      additionalProperties: false,
    },
  },

  // ── Form composition ─────────────────────────────────────────
  {
    name: "create_form",
    description:
      "Create a new form. Forms are composed of rows; each row holds one or more fields displayed side-by-side. Use multi-field rows for column layouts (First Name + Last Name on one row, etc.). Fields support `defaultValue` to pre-fill/pre-select values. Returns the new form's id and handle.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", description: "Display name shown in the admin UI." },
        handle: {
          type: "string",
          description:
            "Stable reference key used by page templates (`<FreeformForm formId=\"...\" />`) and by other MCP tools. lowercase_snake_case. Auto-derived from `name` if omitted. Treat this as part of the public API — changing it later breaks any reference.",
        },
        successMessage: { type: "string", description: "Shown after a successful submission" },
        rows: {
          type: "array",
          description: "Initial layout. Omit to start with an empty form.",
          items: ROW_SCHEMA,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "update_form",
    description:
      "Update a form's display name, success message, and/or layout. Only provided fields are changed; omit a field to leave it untouched. Does NOT change `handle` — use `set_form_handle` for that, which is a separate, breaking operation. Prefer `update_field` over passing `rows` here when you only need to change a single field.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        name: { type: "string", description: "New display name (safe — does not affect references)." },
        successMessage: { type: "string" },
        rows: { type: "array", items: ROW_SCHEMA },
      },
      additionalProperties: false,
    },
  },
  {
    name: "set_form_handle",
    description:
      "Change a form's stable reference handle. WARNING: any page or external tool referencing the old handle will stop resolving until updated. This is intentionally a separate tool from `update_form` to prevent accidental breakage. Returns the new and previous handle.",
    inputSchema: {
      type: "object",
      required: ["id", "handle"],
      properties: {
        id: { type: "string" },
        handle: {
          type: "string",
          description: "New handle. lowercase_snake_case, must be unique across forms.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "delete_form",
    description:
      "Permanently delete a form AND all of its submissions. This cannot be undone.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "add_field",
    description:
      "Append a field to a form. By default the field goes into a new row at the end. To place it alongside existing fields in a column layout, pass `rowIndex` (0-based). Use `field.defaultValue` to pre-fill or pre-select the field (e.g. a newsletter checkbox that defaults to checked: type 'checkbox', defaultValue 'true').",
    inputSchema: {
      type: "object",
      required: ["formId", "field"],
      properties: {
        formId: { type: "string" },
        field: FIELD_SCHEMA,
        rowIndex: {
          oneOf: [{ type: "number" }, { type: "string", enum: ["new"] }],
          description: "0-based index of an existing row to append into, or 'new' for a new row at the end. Default: 'new'.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "remove_field",
    description: "Remove a field from a form by field id. Empty rows are pruned automatically.",
    inputSchema: {
      type: "object",
      required: ["formId", "fieldId"],
      properties: {
        formId: { type: "string" },
        fieldId: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "update_field",
    description:
      "Update properties of an existing field. Only provided properties change; omitted ones are untouched. Prefer this over `update_form` for single-field edits — it avoids the risk of accidentally clobbering other form state. Field id, handle, and type are immutable (use remove_field + add_field to change those). Pass defaultValue: null to clear a default.",
    inputSchema: {
      type: "object",
      required: ["formId", "fieldId"],
      properties: {
        formId: { type: "string" },
        fieldId: { type: "string" },
        label: { type: "string" },
        required: { type: "boolean" },
        placeholder: { type: "string" },
        options: {
          type: "array",
          minItems: 2,
          description: `Replacement options array for ${OPTION_FIELD_TYPES.join(", ")} fields.`,
          items: OPTION_SCHEMA,
        },
        defaultValue: {
          description:
            "Pre-filled value (same shape rules as add_field). Pass null to clear an existing default.",
          oneOf: [
            { type: "string" },
            { type: "array", items: { type: "string" } },
            { type: "null" },
          ],
        },
      },
      additionalProperties: false,
    },
  },

  // ── AI spam filter ───────────────────────────────────────────
  {
    name: "get_spam_settings",
    description:
      "Get AI spam filter settings. Without `formId`, returns the global defaults. With `formId`, returns that form's effective settings (override if set, otherwise the inherited global) plus the override state and the global defaults for reference. Pro license required for scoring to actually run.",
    inputSchema: {
      type: "object",
      properties: {
        formId: {
          type: "string",
          description: "When provided, returns this form's effective settings + override state.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "set_spam_settings",
    description:
      "Update AI spam filter settings. Pro license required. Without `formId`, writes the global defaults used by any form that doesn't override. With `formId`, writes a per-form override (`enabled` AND `threshold` both required). Pass `formId` with `clearOverride: true` to remove a per-form override and revert that form to inheriting the global. Submissions flagged at/above the effective threshold do NOT trigger notifications.",
    inputSchema: {
      type: "object",
      properties: {
        formId: {
          type: "string",
          description: "Target a single form's override. Omit to set the global defaults.",
        },
        enabled: { type: "boolean" },
        threshold: { type: "number", description: "0-10; submissions scoring >= this are considered spam-like" },
        clearOverride: {
          type: "boolean",
          description: "When true (with formId), removes the form's override so it inherits the global.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "archive_spam_submissions",
    description:
      "Archive submissions whose spam score is >= minScore. Archived submissions are soft-deleted: they're hidden from default lists but remain in storage. Pass dryRun:true to preview without modifying.",
    inputSchema: {
      type: "object",
      required: ["minScore"],
      properties: {
        minScore: { type: "number", description: "Threshold (0-10). Submissions scoring at or above this are archived." },
        formId: { type: "string", description: "Optional — limit to a single form" },
        dryRun: { type: "boolean", description: "If true, just return what would be archived" },
      },
      additionalProperties: false,
    },
  },

  // ── Notification templates ─────────────────────────────────
  {
    name: "list_templates",
    description:
      "List all notification templates. Templates are global, reusable email bodies that get attached per-form via attach_notification.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_template",
    description: "Fetch a single notification template by id.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "create_template",
    description:
      "Create a notification template. Subject and body support Mustache variables: `{{ form_name }}`, `{{ submission_id }}`, `{{ submitted_at }}`, `{{ all_fields }}` (Label: value list), and any submission field by handle e.g. `{{ first_name }}`. Format defaults to 'text'; use 'html' for HTML emails (values are auto-escaped).",
    inputSchema: {
      type: "object",
      required: ["name", "subject", "body"],
      properties: {
        name: { type: "string", description: "Human-readable name, e.g. 'Admin Alert'" },
        subject: { type: "string", description: "Mustache-templated email subject" },
        body: { type: "string", description: "Mustache-templated email body. Use literal \\n for newlines in plain text." },
        format: { type: "string", enum: ["text", "html"], description: "Default: text" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "update_template",
    description: "Update a notification template. Only provided fields are changed.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        subject: { type: "string" },
        body: { type: "string" },
        format: { type: "string", enum: ["text", "html"] },
      },
      additionalProperties: false,
    },
  },
  {
    name: "delete_template",
    description:
      "Delete a notification template. Any form notifications using it will be automatically detached.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
      additionalProperties: false,
    },
  },

  // ── Per-form notification assignments ──────────────────────
  {
    name: "list_form_notifications",
    description:
      "List notification assignments for a form. Each assignment binds a template to a form with a recipient configuration.",
    inputSchema: {
      type: "object",
      required: ["formId"],
      properties: { formId: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "attach_notification",
    description:
      "Attach a notification template to a form. Use recipientType 'submitter' to send to the email entered in a specific form field (pass recipientField). Use recipientType 'custom' to send to a fixed email address (pass customRecipient). Notifications are enabled by default. Submissions flagged at or above the spam threshold do NOT trigger notifications.",
    inputSchema: {
      type: "object",
      required: ["formId", "templateId", "recipientType"],
      properties: {
        formId: { type: "string" },
        templateId: { type: "string" },
        recipientType: { type: "string", enum: ["submitter", "custom"] },
        recipientField: {
          type: "string",
          description: "Form field handle that holds the recipient email (required when recipientType='submitter')",
        },
        customRecipient: {
          type: "string",
          description: "Recipient email address (required when recipientType='custom')",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "detach_notification",
    description: "Remove a notification assignment by id.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "update_form_notification",
    description:
      "Update a notification assignment — toggle enabled, switch recipient type, or change the recipient field/email.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        enabled: { type: "boolean" },
        recipientType: { type: "string", enum: ["submitter", "custom"] },
        recipientField: { type: "string" },
        customRecipient: { type: "string" },
      },
      additionalProperties: false,
    },
  },
] as const;

async function runTool(
  fetcher: Fetcher,
  request: Request,
  name: string,
  args: any,
): Promise<unknown> {
  if (name === "list_forms") {
    return callPluginRoute(fetcher, request, "list-forms");
  }
  if (name === "list_submissions") {
    const query: Record<string, string> = {};
    if (args?.formId) query.formId = String(args.formId);
    if (args?.includeArchived) query.includeArchived = "true";
    const data = (await callPluginRoute(fetcher, request, "list-submissions", { query })) as {
      submissions: Array<{ createdAt: string; spamScore: number | null; [k: string]: unknown }>;
    };
    let subs = data.submissions;
    if (args?.since) {
      const t = new Date(args.since).getTime();
      subs = subs.filter((s) => new Date(s.createdAt).getTime() >= t);
    }
    if (args?.until) {
      const t = new Date(args.until).getTime();
      subs = subs.filter((s) => new Date(s.createdAt).getTime() <= t);
    }
    if (typeof args?.minSpamScore === "number") {
      const threshold = args.minSpamScore;
      subs = subs.filter((s) => typeof s.spamScore === "number" && s.spamScore >= threshold);
    }
    const limit = Math.min(Math.max(Number(args?.limit) || 50, 1), 500);
    subs = subs.slice(0, limit);
    return { count: subs.length, submissions: subs };
  }
  if (name === "get_form") {
    if (!args?.id) throw new Error("Missing required argument: id");
    return callPluginRoute(fetcher, request, "get-form", { query: { id: String(args.id) } });
  }
  if (name === "get_form_prefill_url") {
    if (!args?.handle) throw new Error("Missing required argument: handle");
    return callPluginRoute(fetcher, request, "build-prefill-url", {
      method: "POST",
      body: {
        handle: args.handle,
        values: args.values ?? {},
        origin: publicOrigin(request),
      },
    });
  }
  if (name === "export_submissions_csv") {
    return callPluginRoute(fetcher, request, "prepare-export", {
      method: "POST",
      body: {
        formId: args?.formId,
        submissionIds: Array.isArray(args?.submissionIds) ? args.submissionIds : undefined,
        since: args?.since,
        until: args?.until,
        includeArchived: args?.includeArchived === true,
        minSpamScore: typeof args?.minSpamScore === "number" ? args.minSpamScore : undefined,
        filename: args?.filename,
        origin: publicOrigin(request),
      },
    });
  }

  // ── Form composition ──────────────────────────────
  if (name === "create_form") {
    if (!args?.name) throw new Error("Missing required argument: name");
    return callPluginRoute(fetcher, request, "save-form", {
      method: "POST",
      body: {
        name: args.name,
        handle: args.handle,
        rows: Array.isArray(args.rows) ? args.rows : undefined,
        successMessage: args.successMessage,
      },
    });
  }
  if (name === "update_form") {
    if (!args?.id) throw new Error("Missing required argument: id");
    // Intentional: `handle` is not forwarded. The save-form route would ignore
    // it on update anyway, but suppressing it here keeps the contract honest
    // and makes set_form_handle the only path that mutates handles.
    return callPluginRoute(fetcher, request, "save-form", {
      method: "POST",
      body: {
        id: args.id,
        name: args.name,
        rows: Array.isArray(args.rows) ? args.rows : undefined,
        successMessage: args.successMessage,
      },
    });
  }
  if (name === "set_form_handle") {
    if (!args?.id || !args?.handle) {
      throw new Error("Missing required arguments: id, handle");
    }
    return callPluginRoute(fetcher, request, "set-form-handle", {
      method: "POST",
      body: { id: args.id, handle: args.handle },
    });
  }
  if (name === "delete_form") {
    if (!args?.id) throw new Error("Missing required argument: id");
    return callPluginRoute(fetcher, request, "delete-form", {
      method: "POST",
      body: { id: args.id },
    });
  }
  if (name === "add_field") {
    if (!args?.formId || !args?.field) {
      throw new Error("Missing required arguments: formId, field");
    }
    return callPluginRoute(fetcher, request, "add-field", {
      method: "POST",
      body: {
        formId: args.formId,
        field: args.field,
        rowIndex: args.rowIndex ?? "new",
      },
    });
  }
  if (name === "remove_field") {
    if (!args?.formId || !args?.fieldId) {
      throw new Error("Missing required arguments: formId, fieldId");
    }
    return callPluginRoute(fetcher, request, "remove-field", {
      method: "POST",
      body: { formId: args.formId, fieldId: args.fieldId },
    });
  }
  if (name === "update_field") {
    if (!args?.formId || !args?.fieldId) {
      throw new Error("Missing required arguments: formId, fieldId");
    }
    return callPluginRoute(fetcher, request, "update-field", {
      method: "POST",
      body: {
        formId: args.formId,
        fieldId: args.fieldId,
        label: args.label,
        required: args.required,
        placeholder: args.placeholder,
        options: args.options,
        defaultValue: args.defaultValue,
      },
    });
  }

  // ── Spam filter ───────────────────────────────────
  if (name === "get_spam_settings") {
    const query: Record<string, string> = {};
    if (args?.formId) query.formId = String(args.formId);
    return callPluginRoute(fetcher, request, "get-spam-settings", { query });
  }
  if (name === "set_spam_settings") {
    return callPluginRoute(fetcher, request, "update-spam-settings", {
      method: "POST",
      body: {
        formId: args?.formId,
        enabled: args?.enabled,
        threshold: args?.threshold,
        clearOverride: args?.clearOverride === true,
      },
    });
  }
  if (name === "archive_spam_submissions") {
    if (typeof args?.minScore !== "number") {
      throw new Error("Missing required argument: minScore (number)");
    }
    return callPluginRoute(fetcher, request, "archive-submissions", {
      method: "POST",
      body: {
        formId: args.formId,
        minScore: args.minScore,
        dryRun: args.dryRun === true,
      },
    });
  }

  // ── Notification templates ────────────────────────
  if (name === "list_templates") {
    return callPluginRoute(fetcher, request, "list-templates");
  }
  if (name === "get_template") {
    if (!args?.id) throw new Error("Missing required argument: id");
    return callPluginRoute(fetcher, request, "get-template", { query: { id: String(args.id) } });
  }
  if (name === "create_template") {
    if (!args?.name || typeof args.subject !== "string" || typeof args.body !== "string") {
      throw new Error("Missing required arguments: name, subject, body");
    }
    return callPluginRoute(fetcher, request, "save-template", {
      method: "POST",
      body: {
        name: args.name,
        subject: args.subject,
        body: args.body,
        format: args.format,
      },
    });
  }
  if (name === "update_template") {
    if (!args?.id) throw new Error("Missing required argument: id");
    // save-template expects all four core fields; merge with existing.
    const existing = (await callPluginRoute(fetcher, request, "get-template", {
      query: { id: String(args.id) },
    })) as { name: string; subject: string; body: string; format: "text" | "html" };
    return callPluginRoute(fetcher, request, "save-template", {
      method: "POST",
      body: {
        id: args.id,
        name: args.name ?? existing.name,
        subject: typeof args.subject === "string" ? args.subject : existing.subject,
        body: typeof args.body === "string" ? args.body : existing.body,
        format: args.format ?? existing.format,
      },
    });
  }
  if (name === "delete_template") {
    if (!args?.id) throw new Error("Missing required argument: id");
    return callPluginRoute(fetcher, request, "delete-template", {
      method: "POST",
      body: { id: args.id },
    });
  }

  // ── Per-form notification assignments ────────────
  if (name === "list_form_notifications") {
    if (!args?.formId) throw new Error("Missing required argument: formId");
    return callPluginRoute(fetcher, request, "list-form-notifications", {
      query: { formId: String(args.formId) },
    });
  }
  if (name === "attach_notification") {
    if (!args?.formId || !args?.templateId || !args?.recipientType) {
      throw new Error("Missing required arguments: formId, templateId, recipientType");
    }
    return callPluginRoute(fetcher, request, "attach-notification", {
      method: "POST",
      body: {
        formId: args.formId,
        templateId: args.templateId,
        recipientType: args.recipientType,
        recipientField: args.recipientField,
        customRecipient: args.customRecipient,
      },
    });
  }
  if (name === "detach_notification") {
    if (!args?.id) throw new Error("Missing required argument: id");
    return callPluginRoute(fetcher, request, "detach-notification", {
      method: "POST",
      body: { id: args.id },
    });
  }
  if (name === "update_form_notification") {
    if (!args?.id) throw new Error("Missing required argument: id");
    return callPluginRoute(fetcher, request, "update-form-notification", {
      method: "POST",
      body: {
        id: args.id,
        enabled: args.enabled,
        recipientType: args.recipientType,
        recipientField: args.recipientField,
        customRecipient: args.customRecipient,
      },
    });
  }

  throw new Error(`Unknown tool: ${name}`);
}

export const POST: APIRoute = async ({ request }) => {
  const origin = publicOrigin(request);

  const auth = request.headers.get("Authorization");
  if (!auth?.toLowerCase().startsWith("bearer ")) {
    return unauthorized(origin);
  }

  // env.SELF on Cloudflare; globalThis.fetch in local dev (no service binding
  // to look up, and same-origin subrequests work fine without one).
  const fetcher: Fetcher = (env as any).SELF ?? globalThis;

  let body: JsonRpcRequest;
  try {
    body = (await request.json()) as JsonRpcRequest;
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  const { id = null, method, params } = body;
  const isNotification = id === null || id === undefined;

  try {
    if (method === "initialize") {
      return rpcResult(id, {
        protocolVersion: params?.protocolVersion ?? MCP_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "freeform", version: "1.0.0" },
      });
    }

    if (method === "notifications/initialized") {
      return new Response(null, { status: 202 });
    }

    if (method === "tools/list") {
      return rpcResult(id, { tools: TOOLS });
    }

    if (method === "tools/call") {
      const result = await runTool(fetcher, request, params?.name, params?.arguments ?? {});
      return rpcResult(id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      });
    }

    if (isNotification) return new Response(null, { status: 202 });
    return rpcError(id, -32601, `Method not found: ${method}`);
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") return unauthorized(origin);
    return rpcError(id, -32603, e?.message ?? "Internal error");
  }
};

// MCP Streamable HTTP allows GET for an SSE event stream. We don't push
// server-initiated events, so reject GET — Claude Desktop falls back to POST.
export const GET: APIRoute = () => new Response(null, { status: 405 });
