import { PluginRouteError, type PluginContext } from "emdash";
import { ensureDefaultTemplates } from "../lib/default-templates";
import { sendEmail } from "../lib/email-sender";
import { uid } from "../lib/handles";
import { renderMustache, stripHtml } from "../lib/html";
import { deleteTemplateAndDetach } from "../lib/notifications";
import type { NotificationFormat, StoredTemplate } from "../types";

function sortTemplates(
  items: Array<{ id: string; data: StoredTemplate }>,
): Array<{ id: string } & StoredTemplate> {
  return items
    .map((t) => ({ id: t.id, ...t.data }))
    .sort((a, b) => {
      const sys = Number(Boolean(b.system)) - Number(Boolean(a.system));
      if (sys !== 0) return sys;
      return a.name.localeCompare(b.name);
    });
}

export const templateRoutes = {
  "list-templates": {
    handler: async (_routeCtx: any, ctx: PluginContext) => {
      await ensureDefaultTemplates(ctx);
      const { items } = await ctx.storage.templates.query({
        orderBy: { createdAt: "desc" },
      });
      return {
        templates: sortTemplates(items as Array<{ id: string; data: StoredTemplate }>),
      };
    },
  },

  "get-template": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const id = new URL(routeCtx.request.url).searchParams.get("id");
      if (!id) throw PluginRouteError.badRequest("Missing ?id=");
      const tpl = (await ctx.storage.templates.get(id)) as StoredTemplate | null;
      if (!tpl) throw PluginRouteError.notFound("Template not found");
      return { id, ...tpl };
    },
  },

  "save-template": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const input = routeCtx.input as {
        id?: string;
        name: string;
        subject: string;
        body: string;
        format?: NotificationFormat;
        replyTo?: string;
        fromName?: string;
        fromEmail?: string;
        cc?: string;
        bcc?: string;
      };
      if (!input?.name?.trim()) throw PluginRouteError.badRequest("name is required");
      if (typeof input.subject !== "string") {
        throw PluginRouteError.badRequest("subject is required");
      }
      if (typeof input.body !== "string") {
        throw PluginRouteError.badRequest("body is required");
      }

      const existing = input.id
        ? ((await ctx.storage.templates.get(input.id)) as StoredTemplate | null)
        : null;
      if (existing?.system) {
        throw PluginRouteError.badRequest(
          "Built-in templates can’t be edited. Duplicate one to customize.",
        );
      }

      const format: NotificationFormat = input.format === "html" ? "html" : "text";
      const now = new Date().toISOString();
      const tid = input.id ?? uid();
      const tpl: StoredTemplate = {
        name: input.name.trim(),
        subject: input.subject,
        body: input.body,
        format,
        replyTo: input.replyTo?.trim() || undefined,
        fromName: input.fromName?.trim() || undefined,
        fromEmail: input.fromEmail?.trim() || undefined,
        cc: input.cc?.trim() || undefined,
        bcc: input.bcc?.trim() || undefined,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await ctx.storage.templates.put(tid, tpl);
      return { id: tid, ...tpl };
    },
  },

  "send-test-email": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const input = routeCtx.input as {
        toEmail: string;
        templateId?: string;
        subject?: string;
        body?: string;
        format?: NotificationFormat;
        replyTo?: string;
        fromName?: string;
        fromEmail?: string;
        cc?: string;
        bcc?: string;
      };

      if (!input?.toEmail || !/\S+@\S+\.\S+/.test(input.toEmail)) {
        throw PluginRouteError.badRequest("Valid toEmail is required");
      }

      let subject = input.subject;
      let body = input.body;
      let format = input.format ?? "text";
      let replyTo = input.replyTo;
      let fromName = input.fromName;
      let fromEmail = input.fromEmail;
      let cc = input.cc;
      let bcc = input.bcc;

      if (input.templateId && (!subject || !body)) {
        const stored = (await ctx.storage.templates.get(input.templateId)) as StoredTemplate | null;
        if (stored) {
          subject = subject ?? stored.subject;
          body = body ?? stored.body;
          format = format ?? stored.format;
          replyTo = replyTo ?? stored.replyTo;
          fromName = fromName ?? stored.fromName;
          fromEmail = fromEmail ?? stored.fromEmail;
          cc = cc ?? stored.cc;
          bcc = bcc ?? stored.bcc;
        }
      }

      subject = subject || "Test Notification: Contact Form";
      body = body || "This is a test notification from Freeform.\n\n{{all_fields}}";

      const sampleFieldsTableHtml = `<table style="width: 100%; border-collapse: collapse; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; margin: 16px 0; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
        <tbody>
          <tr style="background-color: #f9fafb; border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 10px 14px; font-weight: 600; color: #374151; width: 35%;">Full Name</td>
            <td style="padding: 10px 14px; color: #111827;">Alex Doe</td>
          </tr>
          <tr style="background-color: #ffffff; border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 10px 14px; font-weight: 600; color: #374151; width: 35%;">Email Address</td>
            <td style="padding: 10px 14px; color: #111827;">alex.doe@example.com</td>
          </tr>
          <tr style="background-color: #f9fafb; border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 10px 14px; font-weight: 600; color: #374151; width: 35%;">Message</td>
            <td style="padding: 10px 14px; color: #111827;">Hello! This is a sample submission message testing the Freeform email template.</td>
          </tr>
        </tbody>
      </table>`;

      const sampleVars: Record<string, string> = {
        form_name: "Contact Form",
        submission_id: "sub_test_" + Date.now().toString(36),
        submitted_at: new Date().toLocaleString(),
        name: "Alex Doe",
        email: "alex.doe@example.com",
        message: "Hello! This is a sample submission message testing the Freeform email template.",
        all_fields: format === "html"
          ? sampleFieldsTableHtml
          : "Full Name: Alex Doe\nEmail Address: alex.doe@example.com\nMessage: Hello! This is a sample submission message.",
      };

      const renderedSubject = renderMustache(`[TEST] ${subject}`, sampleVars, { escape: false });
      const renderedBody = renderMustache(body, sampleVars, { escape: format === "html" });

      let fromHeader: string | undefined = undefined;
      if (fromEmail) {
        fromHeader = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;
      }

      const ccList = cc ? cc.split(/[,;]+/).map((s) => s.trim()).filter((s) => /\S+@\S+\.\S+/.test(s)) : undefined;
      const bccList = bcc ? bcc.split(/[,;]+/).map((s) => s.trim()).filter((s) => /\S+@\S+\.\S+/.test(s)) : undefined;

      try {
        const result = await sendEmail(ctx, {
          to: input.toEmail.trim(),
          from: fromHeader,
          replyTo: replyTo && /\S+@\S+\.\S+/.test(replyTo) ? replyTo.trim() : undefined,
          cc: ccList,
          bcc: bccList,
          subject: renderedSubject,
          text: format === "html" ? stripHtml(renderedBody) : renderedBody,
          html: format === "html" ? renderedBody : undefined,
        });

        return {
          ok: true,
          provider: result.provider,
          messageId: result.id,
          to: input.toEmail,
        };
      } catch (err: any) {
        throw PluginRouteError.badRequest(`Test email delivery failed: ${err.message || String(err)}`);
      }
    },
  },

  "delete-template": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const { id } = routeCtx.input as { id: string };
      if (!id) throw PluginRouteError.badRequest("Missing id");
      const existing = (await ctx.storage.templates.get(id)) as StoredTemplate | null;
      if (existing?.system) {
        throw PluginRouteError.badRequest("Built-in templates can’t be deleted.");
      }
      const detached = await deleteTemplateAndDetach(ctx, id);
      return { ok: true, assignmentsDetached: detached };
    },
  },
};
