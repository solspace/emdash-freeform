import type { PluginContext } from "emdash";
import type {
  NotificationLogEntry,
  StoredAssignment,
  StoredForm,
  StoredSubmission,
  StoredTemplate,
} from "../types";
import { sendEmail } from "./email-sender";
import { uid } from "./handles";
import { renderMustache, stripHtml } from "./html";
import { resolveOptionLabels } from "./options";

export function buildTemplateVars(
  form: StoredForm,
  submission: StoredSubmission,
  submissionId: string,
  format: "text" | "html" = "text",
): Record<string, string> {
  const vars: Record<string, string> = {
    form_name: form.name,
    submission_id: submissionId,
    submitted_at: submission.createdAt,
  };
  // Option-typed fields are stored as values; resolve them to labels for display.
  // Multi-value fields are joined with ", ".
  for (const [k, v] of Object.entries(submission.data)) {
    vars[k] = resolveOptionLabels(form, k, v);
  }
  const labelByHandle = new Map(
    form.rows.flatMap((r) => r.fields.map((f) => [f.handle, f.label] as const)),
  );

  if (format === "html") {
    const rowsHtml = Object.entries(submission.data)
      .map(([k, v], idx) => {
        const label = labelByHandle.get(k) ?? k;
        const value = resolveOptionLabels(form, k, v);
        const bg = idx % 2 === 0 ? "#ffffff" : "#f9fafb";
        return `<tr style="background-color: ${bg}; border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 10px 14px; font-weight: 600; color: #374151; width: 35%; vertical-align: top;">${label}</td>
          <td style="padding: 10px 14px; color: #111827; vertical-align: top;">${value}</td>
        </tr>`;
      })
      .join("");

    vars.all_fields = `<table style="width: 100%; border-collapse: collapse; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; margin: 16px 0; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>`;
  } else {
    vars.all_fields = Object.entries(submission.data)
      .map(([k, v]) => `${labelByHandle.get(k) ?? k}: ${resolveOptionLabels(form, k, v)}`)
      .join("\n");
  }

  return vars;
}

function resolveEmailList(raw: string | undefined, vars: Record<string, string>): string[] {
  if (!raw || !raw.trim()) return [];
  const parts = raw.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
  const resolved: string[] = [];
  for (const p of parts) {
    if (p.startsWith("{{") && p.endsWith("}}")) {
      const handle = p.slice(2, -2).trim();
      const val = vars[handle];
      if (val && /\S+@\S+\.\S+/.test(val)) resolved.push(val);
    } else if (/\S+@\S+\.\S+/.test(p)) {
      resolved.push(p);
    }
  }
  return resolved;
}

function resolveReplyTo(
  raw: string | undefined,
  vars: Record<string, string>,
  submitterEmail?: string,
): string | undefined {
  if (!raw || !raw.trim()) return submitterEmail;
  const trimmed = raw.trim();
  if (trimmed === "{submitter}" || trimmed === "{{submitter}}") {
    return submitterEmail;
  }
  if (trimmed.startsWith("{{") && trimmed.endsWith("}}")) {
    const handle = trimmed.slice(2, -2).trim();
    const val = vars[handle];
    if (val && /\S+@\S+\.\S+/.test(val)) return val;
  }
  if (/\S+@\S+\.\S+/.test(trimmed)) return trimmed;
  return submitterEmail;
}

// Never throws: the submit response must not depend on email delivery.
// Failures are logged per-assignment and recorded into submission.notificationLogs.
export async function sendNotificationsForSubmission(
  ctx: PluginContext,
  form: StoredForm,
  submission: StoredSubmission,
  submissionId: string,
): Promise<NotificationLogEntry[]> {
  const newLogs: NotificationLogEntry[] = [];

  try {
    const { items } = await ctx.storage.notification_assignments.query({
      where: { formId: submission.formId },
      limit: 200,
    });
    const assignments = items as Array<{ id: string; data: StoredAssignment }>;
    if (assignments.length === 0) return [];

    // Find submitter email if any
    let submitterEmail: string | undefined;
    for (const [k, v] of Object.entries(submission.data)) {
      if (typeof v === "string" && /\S+@\S+\.\S+/.test(v)) {
        submitterEmail = v;
        break;
      }
    }

    for (const { id: assignmentId, data: a } of assignments) {
      if (!a.enabled) continue;

      let to: string | null = null;
      if (a.recipientType === "submitter" && a.recipientField) {
        const raw = submission.data[a.recipientField];
        if (typeof raw === "string" && /\S+@\S+\.\S+/.test(raw)) to = raw;
      } else if (a.recipientType === "custom" && a.customRecipient) {
        to = a.customRecipient;
      }

      if (!to) {
        ctx.log.warn("Notification skipped: no valid recipient", { assignmentId });
        newLogs.push({
          id: uid(),
          templateId: a.templateId,
          templateName: "Unknown",
          to: "none",
          status: "skipped",
          error: "No valid recipient email resolved",
          sentAt: new Date().toISOString(),
        });
        continue;
      }

      const template = (await ctx.storage.templates.get(a.templateId)) as
        | StoredTemplate
        | null;
      if (!template) {
        ctx.log.warn("Notification skipped: template missing", {
          assignmentId,
          templateId: a.templateId,
        });
        newLogs.push({
          id: uid(),
          templateId: a.templateId,
          templateName: "Missing Template",
          to,
          status: "skipped",
          error: `Template ${a.templateId} not found`,
          sentAt: new Date().toISOString(),
        });
        continue;
      }

      const vars = buildTemplateVars(form, submission, submissionId, template.format);
      const subject = renderMustache(template.subject, vars, { escape: false });
      const renderedBody = renderMustache(template.body, vars, {
        escape: template.format === "html",
      });

      const replyTo = resolveReplyTo(template.replyTo, vars, submitterEmail);
      const ccList = resolveEmailList(template.cc, vars);
      const bccList = resolveEmailList(template.bcc, vars);

      let fromHeader: string | undefined = undefined;
      if (template.fromEmail) {
        if (template.fromName) {
          fromHeader = `"${template.fromName}" <${template.fromEmail}>`;
        } else {
          fromHeader = template.fromEmail;
        }
      }

      try {
        const result = await sendEmail(ctx, {
          to,
          from: fromHeader,
          replyTo,
          cc: ccList.length ? ccList : undefined,
          bcc: bccList.length ? bccList : undefined,
          subject,
          text: template.format === "html" ? stripHtml(renderedBody) : renderedBody,
          html: template.format === "html" ? renderedBody : undefined,
        });

        ctx.log.info("Notification sent", { assignmentId, to, provider: result.provider });
        newLogs.push({
          id: uid(),
          templateId: a.templateId,
          templateName: template.name,
          to,
          status: "delivered",
          provider: result.provider,
          sentAt: new Date().toISOString(),
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        ctx.log.error("Notification send failed", {
          assignmentId,
          error: errorMsg,
        });
        newLogs.push({
          id: uid(),
          templateId: a.templateId,
          templateName: template.name,
          to,
          status: "failed",
          error: errorMsg,
          sentAt: new Date().toISOString(),
        });
      }
    }

    if (newLogs.length > 0) {
      submission.notificationLogs = [
        ...(submission.notificationLogs || []),
        ...newLogs,
      ];
      await ctx.storage.submissions.put(submissionId, submission);
    }
  } catch (err) {
    ctx.log.error("Notification pipeline error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return newLogs;
}

export async function resendNotificationsForSubmission(
  ctx: PluginContext,
  submissionId: string,
): Promise<{ ok: boolean; logs: NotificationLogEntry[] }> {
  const submission = (await ctx.storage.submissions.get(submissionId)) as StoredSubmission | null;
  if (!submission) {
    throw new Error(`Submission ${submissionId} not found`);
  }
  const form = (await ctx.storage.forms.get(submission.formId)) as StoredForm | null;
  if (!form) {
    throw new Error(`Form ${submission.formId} not found`);
  }

  await sendNotificationsForSubmission(ctx, form, submission, submissionId);
  const updated = (await ctx.storage.submissions.get(submissionId)) as StoredSubmission | null;
  return { ok: true, logs: updated?.notificationLogs || [] };
}

export async function deleteTemplateAndDetach(
  ctx: PluginContext,
  templateId: string,
): Promise<number> {
  await ctx.storage.templates.delete(templateId);
  const { items } = await ctx.storage.notification_assignments.query({ limit: 1000 });
  let detached = 0;
  for (const item of items as Array<{ id: string; data: StoredAssignment }>) {
    if (item.data.templateId === templateId) {
      await ctx.storage.notification_assignments.delete(item.id);
      detached++;
    }
  }
  return detached;
}
