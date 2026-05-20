import type { PluginContext } from "emdash";
import type {
  StoredAssignment,
  StoredForm,
  StoredSubmission,
  StoredTemplate,
} from "../types";
import { renderMustache, stripHtml } from "./html";
import { resolveOptionLabels } from "./options";

export function buildTemplateVars(
  form: StoredForm,
  submission: StoredSubmission,
  submissionId: string,
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
  vars.all_fields = Object.entries(submission.data)
    .map(([k, v]) => `${labelByHandle.get(k) ?? k}: ${resolveOptionLabels(form, k, v)}`)
    .join("\n");
  return vars;
}

// Never throws: the submit response must not depend on email delivery.
// Failures are logged per-assignment.
export async function sendNotificationsForSubmission(
  ctx: PluginContext,
  form: StoredForm,
  submission: StoredSubmission,
  submissionId: string,
): Promise<void> {
  try {
    if (!ctx.email) {
      ctx.log.warn("Notifications: ctx.email unavailable; no email provider configured");
      return;
    }

    const { items } = await ctx.storage.notificationAssignments.query({
      where: { formId: submission.formId },
      limit: 200,
    });
    const assignments = items as Array<{ id: string; data: StoredAssignment }>;
    if (assignments.length === 0) return;

    const vars = buildTemplateVars(form, submission, submissionId);

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
        continue;
      }

      const subject = renderMustache(template.subject, vars, { escape: false });
      const renderedBody = renderMustache(template.body, vars, {
        escape: template.format === "html",
      });

      try {
        if (template.format === "html") {
          await ctx.email.send({
            to,
            subject,
            text: stripHtml(renderedBody),
            html: renderedBody,
          });
        } else {
          await ctx.email.send({ to, subject, text: renderedBody });
        }
        ctx.log.info("Notification sent", { assignmentId, to });
      } catch (err) {
        ctx.log.error("Notification send failed", {
          assignmentId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    ctx.log.error("Notification pipeline error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function deleteTemplateAndDetach(
  ctx: PluginContext,
  templateId: string,
): Promise<number> {
  await ctx.storage.templates.delete(templateId);
  const { items } = await ctx.storage.notificationAssignments.query({ limit: 1000 });
  let detached = 0;
  for (const item of items as Array<{ id: string; data: StoredAssignment }>) {
    if (item.data.templateId === templateId) {
      await ctx.storage.notificationAssignments.delete(item.id);
      detached++;
    }
  }
  return detached;
}
