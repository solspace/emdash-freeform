// Tool runner — dispatches MCP tools/call requests to Freeform plugin routes.

import { callPluginRoute } from "./client.ts";

// `siteUrl`    — base URL of the target EmDash site (no trailing slash)
// `authHeader` — the original Authorization header value, forwarded as-is
// `name`       — tool name from params.name
// `args`       — tool arguments from params.arguments
export async function runTool(
  siteUrl: string,
  authHeader: string | null,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const call = (
    routeName: string,
    init?: Parameters<typeof callPluginRoute>[3]
  ) => callPluginRoute(siteUrl, authHeader, routeName, init);

  // ── Submissions ──────────────────────────────────────────────

  if (name === "list_forms") {
    return call("list-forms");
  }

  if (name === "list_submissions") {
    const query: Record<string, string> = {};
    if (args.formId) query.formId = String(args.formId);
    if (args.includeArchived) query.includeArchived = "true";
    const data = (await call("list-submissions", { query })) as {
      submissions: Array<{ createdAt: string; spamScore: number | null; [k: string]: unknown }>;
    };
    let subs = data.submissions;
    if (args.since) {
      const t = new Date(String(args.since)).getTime();
      subs = subs.filter((s) => new Date(s.createdAt).getTime() >= t);
    }
    if (args.until) {
      const t = new Date(String(args.until)).getTime();
      subs = subs.filter((s) => new Date(s.createdAt).getTime() <= t);
    }
    if (typeof args.minSpamScore === "number") {
      const threshold = args.minSpamScore;
      subs = subs.filter((s) => typeof s.spamScore === "number" && s.spamScore >= threshold);
    }
    const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 500);
    subs = subs.slice(0, limit);
    return { count: subs.length, submissions: subs };
  }

  if (name === "get_form") {
    if (!args.id) throw new Error("Missing required argument: id");
    return call("get-form", { query: { id: String(args.id) } });
  }

  if (name === "get_form_prefill_url") {
    if (!args.handle) throw new Error("Missing required argument: handle");
    return call("build-prefill-url", {
      method: "POST",
      body: {
        handle: args.handle,
        values: args.values ?? {},
        origin: siteUrl,
      },
    });
  }

  if (name === "export_submissions_csv") {
    return call("prepare-export", {
      method: "POST",
      body: {
        formId: args.formId,
        submissionIds: Array.isArray(args.submissionIds) ? args.submissionIds : undefined,
        since: args.since,
        until: args.until,
        includeArchived: args.includeArchived === true,
        minSpamScore: typeof args.minSpamScore === "number" ? args.minSpamScore : undefined,
        filename: args.filename,
        origin: siteUrl,
      },
    });
  }

  // ── Form composition ──────────────────────────────────────────

  if (name === "create_form") {
    if (!args.name) throw new Error("Missing required argument: name");
    return call("save-form", {
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
    if (!args.id) throw new Error("Missing required argument: id");
    // `handle` is intentionally not forwarded — set_form_handle is the only
    // path that mutates handles, keeping the contract explicit.
    return call("save-form", {
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
    if (!args.id || !args.handle) throw new Error("Missing required arguments: id, handle");
    return call("set-form-handle", {
      method: "POST",
      body: { id: args.id, handle: args.handle },
    });
  }

  if (name === "delete_form") {
    if (!args.id) throw new Error("Missing required argument: id");
    return call("delete-form", { method: "POST", body: { id: args.id } });
  }

  if (name === "add_field") {
    if (!args.formId || !args.field) throw new Error("Missing required arguments: formId, field");
    return call("add-field", {
      method: "POST",
      body: {
        formId: args.formId,
        field: args.field,
        rowIndex: args.rowIndex ?? "new",
      },
    });
  }

  if (name === "remove_field") {
    if (!args.formId || !args.fieldId) {
      throw new Error("Missing required arguments: formId, fieldId");
    }
    return call("remove-field", {
      method: "POST",
      body: { formId: args.formId, fieldId: args.fieldId },
    });
  }

  if (name === "update_field") {
    if (!args.formId || !args.fieldId) {
      throw new Error("Missing required arguments: formId, fieldId");
    }
    return call("update-field", {
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

  // ── Spam filter ───────────────────────────────────────────────

  if (name === "get_spam_settings") {
    const query: Record<string, string> = {};
    if (args.formId) query.formId = String(args.formId);
    return call("get-spam-settings", { query });
  }

  if (name === "set_spam_settings") {
    return call("update-spam-settings", {
      method: "POST",
      body: {
        formId: args.formId,
        enabled: args.enabled,
        threshold: args.threshold,
        clearOverride: args.clearOverride === true,
      },
    });
  }

  if (name === "archive_spam_submissions") {
    if (typeof args.minScore !== "number") {
      throw new Error("Missing required argument: minScore (number)");
    }
    return call("archive-submissions", {
      method: "POST",
      body: {
        formId: args.formId,
        minScore: args.minScore,
        dryRun: args.dryRun === true,
      },
    });
  }

  // ── Notification templates ────────────────────────────────────

  if (name === "list_templates") {
    return call("list-templates");
  }

  if (name === "get_template") {
    if (!args.id) throw new Error("Missing required argument: id");
    return call("get-template", { query: { id: String(args.id) } });
  }

  if (name === "create_template") {
    if (!args.name || typeof args.subject !== "string" || typeof args.body !== "string") {
      throw new Error("Missing required arguments: name, subject, body");
    }
    return call("save-template", {
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
    if (!args.id) throw new Error("Missing required argument: id");
    // save-template expects all four core fields; fetch existing to fill gaps.
    const existing = (await call("get-template", {
      query: { id: String(args.id) },
    })) as { name: string; subject: string; body: string; format: "text" | "html" };
    return call("save-template", {
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
    if (!args.id) throw new Error("Missing required argument: id");
    return call("delete-template", { method: "POST", body: { id: args.id } });
  }

  // ── Per-form notification assignments ────────────────────────

  if (name === "list_form_notifications") {
    if (!args.formId) throw new Error("Missing required argument: formId");
    return call("list-form-notifications", { query: { formId: String(args.formId) } });
  }

  if (name === "attach_notification") {
    if (!args.formId || !args.templateId || !args.recipientType) {
      throw new Error("Missing required arguments: formId, templateId, recipientType");
    }
    return call("attach-notification", {
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
    if (!args.id) throw new Error("Missing required argument: id");
    return call("detach-notification", { method: "POST", body: { id: args.id } });
  }

  if (name === "update_form_notification") {
    if (!args.id) throw new Error("Missing required argument: id");
    return call("update-form-notification", {
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
