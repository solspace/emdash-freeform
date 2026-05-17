import type { PluginContext } from "emdash";
import { generateWithAI } from "../ai/generate";
import { DEFAULT_SPAM_THRESHOLD } from "../constants";
import { deleteFormAndSubmissions, removeField } from "../lib/field-ops";
import {
  deriveUniqueFormHandle,
  isHandleTaken,
  isValidFormHandle,
} from "../lib/form-handles";
import { activateLicense, clearLicense, getTier } from "../lib/license";
import { deleteTemplateAndDetach } from "../lib/notifications";
import { isMultiType, isOptionType, parseOptionsInput } from "../lib/options";
import { setSpamSettings } from "../lib/spam-settings";
import { uid, toHandle } from "../lib/handles";
import type {
  FieldType,
  FormField,
  NotificationFormat,
  StoredAssignment,
  StoredForm,
  StoredTemplate,
} from "../types";
import { editorBlocks, listPageBlocks } from "./forms";
import { settingsBlocks } from "./settings";
import { submissionsBlocks } from "./submissions";
import { templateEditorBlocks, templatesPageBlocks } from "./templates";

interface AdminInteraction {
  type: string;
  page?: string;
  action_id?: string;
  values?: Record<string, unknown>;
  widget_id?: string;
}

// Public origin honoring reverse-proxy headers, so tunnels (cloudflared, ngrok)
// surface the external URL on the Settings page rather than the internal one.
function deriveSiteOrigin(request: Request): string {
  const reqUrl = new URL(request.url);
  const fwdProto = request.headers?.get?.("x-forwarded-proto")?.split(",")[0]?.trim();
  const fwdHost = request.headers?.get?.("x-forwarded-host")?.split(",")[0]?.trim();
  return `${fwdProto ?? reqUrl.protocol.replace(":", "")}://${fwdHost ?? reqUrl.host}`;
}

async function widgetBlocks(ctx: PluginContext): Promise<object[]> {
  const tier = await getTier(ctx);
  const { items: forms } = await ctx.storage.forms.query({});
  const totalSubs = await ctx.storage.submissions.count();
  return [
    {
      type: "stats",
      items: [
        { label: "Forms", value: String(forms.length) },
        { label: "Submissions", value: String(totalSubs) },
        { label: "Plan", value: tier === "pro" ? "Pro ✓" : "Free" },
      ],
    },
  ];
}

export const adminRoute = {
  handler: async (routeCtx: any, ctx: PluginContext) => {
    const interaction = routeCtx.input as AdminInteraction;
    const { type, page } = interaction;
    const actionId = interaction.action_id ?? "";
    const values = interaction.values ?? {};
    const siteOrigin = deriveSiteOrigin(routeCtx.request);

    if (type === "page_load") {
      if (page?.startsWith("widget:")) {
        return { blocks: await widgetBlocks(ctx) };
      }
      if (page === "/settings") return { blocks: await settingsBlocks(ctx, siteOrigin) };
      if (page === "/templates") return { blocks: await templatesPageBlocks(ctx) };
      return { blocks: await listPageBlocks(ctx) };
    }

    if (actionId === "nav:forms") return { blocks: await listPageBlocks(ctx) };
    if (actionId === "nav:settings") return { blocks: await settingsBlocks(ctx, siteOrigin) };
    if (actionId === "nav:templates") return { blocks: await templatesPageBlocks(ctx) };

    if (actionId === "new_form") {
      const id = uid();
      const handle = await deriveUniqueFormHandle(ctx, "New Form");
      await ctx.storage.forms.put(id, {
        name: "New Form",
        handle,
        rows: [],
        successMessage: "Thank you for your submission!",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as StoredForm);
      return { blocks: await editorBlocks(id, ctx) };
    }

    if (actionId.startsWith("edit:")) {
      return { blocks: await editorBlocks(actionId.slice(5), ctx) };
    }

    if (actionId.startsWith("del:")) {
      await deleteFormAndSubmissions(ctx, actionId.slice(4));
      return {
        blocks: await listPageBlocks(ctx),
        toast: { message: "Form deleted", type: "success" },
      };
    }

    if (actionId.startsWith("subs:")) {
      return { blocks: await submissionsBlocks(actionId.slice(5), ctx) };
    }

    if (actionId.startsWith("rename:")) {
      const fid = actionId.slice(7);
      const form = (await ctx.storage.forms.get(fid)) as StoredForm | null;
      if (!form) return { blocks: await listPageBlocks(ctx) };
      const newName = ((values.name as string) ?? "").trim() || form.name;
      await ctx.storage.forms.put(fid, {
        ...form,
        name: newName,
        updatedAt: new Date().toISOString(),
      });
      return {
        blocks: await editorBlocks(fid, ctx),
        toast: { message: "Form renamed", type: "success" },
      };
    }

    if (actionId.startsWith("set_handle:")) {
      const fid = actionId.slice("set_handle:".length);
      const form = (await ctx.storage.forms.get(fid)) as StoredForm | null;
      if (!form) return { blocks: await listPageBlocks(ctx) };
      const newHandle = ((values.handle as string) ?? "").trim();
      if (!newHandle) {
        return {
          blocks: await editorBlocks(fid, ctx),
          toast: { message: "Handle cannot be empty.", type: "error" },
        };
      }
      if (newHandle === form.handle) {
        return { blocks: await editorBlocks(fid, ctx) };
      }
      if (!isValidFormHandle(newHandle)) {
        return {
          blocks: await editorBlocks(fid, ctx),
          toast: {
            message:
              "Handle must be lowercase snake_case starting with a letter (e.g. contact_us).",
            type: "error",
          },
        };
      }
      if (await isHandleTaken(ctx, newHandle, fid)) {
        return {
          blocks: await editorBlocks(fid, ctx),
          toast: {
            message: `Handle "${newHandle}" is already in use by another form.`,
            type: "error",
          },
        };
      }
      await ctx.storage.forms.put(fid, {
        ...form,
        handle: newHandle,
        updatedAt: new Date().toISOString(),
      });
      return {
        blocks: await editorBlocks(fid, ctx),
        toast: {
          message: `Handle changed to "${newHandle}". Update any page references.`,
          type: "success",
        },
      };
    }

    if (actionId.startsWith("show_add:")) {
      return { blocks: await editorBlocks(actionId.slice(9), ctx, true) };
    }
    if (actionId.startsWith("cancel_add:")) {
      return { blocks: await editorBlocks(actionId.slice(11), ctx) };
    }

    if (actionId.startsWith("add:")) {
      const fid = actionId.slice(4);
      const tier = await getTier(ctx);
      const form = (await ctx.storage.forms.get(fid)) as StoredForm | null;
      if (!form) return { blocks: await listPageBlocks(ctx) };

      const fieldType = ((values.field_type as string) ?? "text") as FieldType;
      if (fieldType === "email" && tier === "free") {
        return {
          blocks: await editorBlocks(fid, ctx, true),
          toast: {
            message:
              "Email fields require a Pro license. Add your key in Settings to unlock them.",
            type: "error",
          },
        };
      }

      const label = ((values.field_label as string) ?? "").trim() || "New Field";
      const handle = ((values.field_handle as string) ?? "").trim() || toHandle(label);
      const required = (values.field_required as boolean) ?? false;
      const rowTarget = (values.field_row as string) ?? "new";

      const options = isOptionType(fieldType)
        ? parseOptionsInput((values.field_options as string) ?? "")
        : undefined;
      if (isOptionType(fieldType) && (!options || options.length < 2)) {
        return {
          blocks: await editorBlocks(fid, ctx, true),
          toast: {
            message:
              "This field type needs at least two options. Use `value:label, value:label`.",
            type: "error",
          },
        };
      }

      const defaultRaw = ((values.field_default as string) ?? "").trim();
      let defaultValue: string | string[] | undefined;
      if (defaultRaw) {
        if (isMultiType(fieldType)) {
          defaultValue = defaultRaw.split(",").map((v) => v.trim()).filter(Boolean);
          if (defaultValue.length === 0) defaultValue = undefined;
        } else {
          defaultValue = defaultRaw;
        }
        if (options && defaultValue !== undefined) {
          const valid = new Set(options.map((o) => o.value));
          const check = Array.isArray(defaultValue) ? defaultValue : [defaultValue];
          const bad = check.find((v) => !valid.has(v));
          if (bad) {
            return {
              blocks: await editorBlocks(fid, ctx, true),
              toast: {
                message: `Default value "${bad}" is not one of the option values.`,
                type: "error",
              },
            };
          }
        }
      }

      const newField: FormField = {
        id: uid(),
        type: fieldType,
        label,
        handle,
        required,
        ...(options ? { options } : {}),
        ...(defaultValue !== undefined ? { defaultValue } : {}),
      };
      let rows = [...form.rows];

      if (rowTarget === "new" || rows.length === 0) {
        rows.push({ id: uid(), fields: [newField] });
      } else {
        rows = rows.map((r) =>
          r.id === rowTarget ? { ...r, fields: [...r.fields, newField] } : r,
        );
      }

      await ctx.storage.forms.put(fid, {
        ...form,
        rows,
        updatedAt: new Date().toISOString(),
      });
      return {
        blocks: await editorBlocks(fid, ctx),
        toast: { message: `"${label}" added`, type: "success" },
      };
    }

    if (actionId.startsWith("rm_field:")) {
      const fid = actionId.slice("rm_field:".length);
      const fieldId = (values.field_id as string) ?? "";
      const form = (await ctx.storage.forms.get(fid)) as StoredForm | null;
      if (!form) return { blocks: await listPageBlocks(ctx) };
      await ctx.storage.forms.put(fid, {
        ...form,
        rows: removeField(form.rows, fieldId),
        updatedAt: new Date().toISOString(),
      });
      return {
        blocks: await editorBlocks(fid, ctx),
        toast: { message: "Field removed", type: "success" },
      };
    }

    if (actionId.startsWith("ai:")) {
      const fid = actionId.slice(3);
      const description = ((values.description as string) ?? "").trim();
      if (!description) {
        return {
          blocks: await editorBlocks(fid, ctx),
          toast: { message: "Please enter a description first", type: "error" },
        };
      }

      const form = (await ctx.storage.forms.get(fid)) as StoredForm | null;
      if (!form) return { blocks: await listPageBlocks(ctx) };

      const tier = await getTier(ctx);
      if (tier === "free" && /\bemail\b/i.test(description)) {
        return {
          blocks: await editorBlocks(fid, ctx),
          toast: {
            message:
              "Email fields require a Pro license. Remove 'email' from your description or upgrade in Settings.",
            type: "error",
          },
        };
      }

      try {
        const result = await generateWithAI(description, tier, form, ctx);
        await ctx.storage.forms.put(fid, {
          ...form,
          rows: [...form.rows, ...result.rows],
          updatedAt: new Date().toISOString(),
        });

        const parts: string[] = [];
        if (result.added === 0) {
          parts.push(
            "No new fields added — they already exist or no usable suggestions were returned.",
          );
        } else {
          parts.push(
            `Added ${result.added} field${result.added !== 1 ? "s" : ""} across ${result.rows.length} new row${result.rows.length !== 1 ? "s" : ""}.`,
          );
        }
        if (result.duplicatesSkipped > 0) {
          parts.push(
            `${result.duplicatesSkipped} duplicate${result.duplicatesSkipped !== 1 ? "s" : ""} skipped.`,
          );
        }
        if (result.cappedAt !== null) parts.push(`Capped at ${result.cappedAt} per generation.`);
        if (result.totalCapped !== null) {
          parts.push(`Form is at the ${result.totalCapped}-field cap; stopped early.`);
        }

        return {
          blocks: await editorBlocks(fid, ctx),
          toast: {
            message: parts.join(" "),
            type: result.added > 0 ? "success" : "info",
          },
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.log.error("AI generation failed", { error: msg });
        return {
          blocks: await editorBlocks(fid, ctx),
          toast: { message: `AI error: ${msg}`, type: "error" },
        };
      }
    }

    if (actionId === "new_template") {
      return { blocks: await templateEditorBlocks(null, ctx) };
    }
    if (actionId.startsWith("edit_template:")) {
      return {
        blocks: await templateEditorBlocks(actionId.slice("edit_template:".length), ctx),
      };
    }
    if (actionId.startsWith("del_template:")) {
      await deleteTemplateAndDetach(ctx, actionId.slice("del_template:".length));
      return {
        blocks: await templatesPageBlocks(ctx),
        toast: { message: "Template deleted", type: "success" },
      };
    }
    if (actionId.startsWith("save_template:")) {
      const idPart = actionId.slice("save_template:".length);
      const name = ((values.name as string) ?? "").trim();
      const subject = ((values.subject as string) ?? "").trim();
      const body = (values.body as string) ?? "";
      const format = (((values.format as string) ?? "text") === "html"
        ? "html"
        : "text") as NotificationFormat;

      if (!name) {
        return {
          blocks: await templateEditorBlocks(idPart === "new" ? null : idPart, ctx),
          toast: { message: "Template name is required.", type: "error" },
        };
      }

      const now = new Date().toISOString();
      if (idPart === "new") {
        const tid = uid();
        await ctx.storage.templates.put(tid, {
          name,
          subject,
          body,
          format,
          createdAt: now,
          updatedAt: now,
        });
        return {
          blocks: await templatesPageBlocks(ctx),
          toast: { message: `Template "${name}" created`, type: "success" },
        };
      }
      const existing = (await ctx.storage.templates.get(idPart)) as StoredTemplate | null;
      if (!existing) {
        return {
          blocks: await templatesPageBlocks(ctx),
          toast: { message: "Template not found", type: "error" },
        };
      }
      await ctx.storage.templates.put(idPart, {
        ...existing,
        name,
        subject,
        body,
        format,
        updatedAt: now,
      });
      return {
        blocks: await templatesPageBlocks(ctx),
        toast: { message: "Template saved", type: "success" },
      };
    }

    if (actionId.startsWith("attach_notif:")) {
      const fid = actionId.slice("attach_notif:".length);
      const form = (await ctx.storage.forms.get(fid)) as StoredForm | null;
      if (!form) return { blocks: await listPageBlocks(ctx) };

      const templateId = ((values.template_id as string) ?? "").trim();
      const recipient = ((values.recipient as string) ?? "").trim();
      const customEmail = ((values.custom_email as string) ?? "").trim();

      if (!templateId) {
        return {
          blocks: await editorBlocks(fid, ctx),
          toast: { message: "Pick a template.", type: "error" },
        };
      }

      const now = new Date().toISOString();
      let assignment: StoredAssignment;
      if (recipient === "__custom__") {
        if (!/\S+@\S+\.\S+/.test(customEmail)) {
          return {
            blocks: await editorBlocks(fid, ctx),
            toast: { message: "Enter a valid custom email.", type: "error" },
          };
        }
        assignment = {
          formId: fid,
          templateId,
          recipientType: "custom",
          customRecipient: customEmail,
          enabled: true,
          createdAt: now,
          updatedAt: now,
        };
      } else {
        assignment = {
          formId: fid,
          templateId,
          recipientType: "submitter",
          recipientField: recipient,
          enabled: true,
          createdAt: now,
          updatedAt: now,
        };
      }

      await ctx.storage.notificationAssignments.put(uid(), assignment);
      return {
        blocks: await editorBlocks(fid, ctx),
        toast: { message: "Notification attached", type: "success" },
      };
    }

    if (actionId.startsWith("toggle_notif:")) {
      const aid = actionId.slice("toggle_notif:".length);
      const a = (await ctx.storage.notificationAssignments.get(aid)) as StoredAssignment | null;
      if (!a) return { blocks: await listPageBlocks(ctx) };
      await ctx.storage.notificationAssignments.put(aid, {
        ...a,
        enabled: !a.enabled,
        updatedAt: new Date().toISOString(),
      });
      return {
        blocks: await editorBlocks(a.formId, ctx),
        toast: {
          message: a.enabled ? "Notification disabled" : "Notification enabled",
          type: "success",
        },
      };
    }

    if (actionId.startsWith("detach_notif:")) {
      const aid = actionId.slice("detach_notif:".length);
      const a = (await ctx.storage.notificationAssignments.get(aid)) as StoredAssignment | null;
      if (!a) return { blocks: await listPageBlocks(ctx) };
      await ctx.storage.notificationAssignments.delete(aid);
      return {
        blocks: await editorBlocks(a.formId, ctx),
        toast: { message: "Notification detached", type: "success" },
      };
    }

    if (actionId === "save_license") {
      const key = ((values.key as string) ?? "").trim();
      if (!key) {
        return {
          blocks: await settingsBlocks(ctx, siteOrigin),
          toast: { message: "Please enter a license key", type: "error" },
        };
      }
      const activated = await activateLicense(ctx, key);
      return {
        blocks: await settingsBlocks(ctx, siteOrigin),
        toast: activated
          ? {
              message: "Pro license activated! Email fields are now unlocked.",
              type: "success",
            }
          : {
              message: 'Invalid key. For this demo any key starting with "FF-" activates Pro.',
              type: "error",
            },
      };
    }

    if (actionId === "save_spam_settings") {
      const tier = await getTier(ctx);
      if (tier !== "pro") {
        return {
          blocks: await settingsBlocks(ctx, siteOrigin),
          toast: { message: "AI spam filtering requires a Pro license.", type: "error" },
        };
      }
      const enabled = (values.spam_enabled as boolean) ?? false;
      const thresholdRaw = ((values.spam_threshold as string) ?? "").trim();
      const thresholdNum =
        thresholdRaw === "" ? DEFAULT_SPAM_THRESHOLD : Number(thresholdRaw);
      if (!Number.isFinite(thresholdNum) || thresholdNum < 0 || thresholdNum > 10) {
        return {
          blocks: await settingsBlocks(ctx, siteOrigin),
          toast: { message: "Threshold must be a number from 0 to 10.", type: "error" },
        };
      }
      await setSpamSettings(ctx, { enabled, threshold: thresholdNum });
      return {
        blocks: await settingsBlocks(ctx, siteOrigin),
        toast: {
          message: enabled
            ? `Spam filter on, threshold ${Math.round(thresholdNum)}.`
            : "Spam filter off.",
          type: "success",
        },
      };
    }

    if (actionId === "remove_license") {
      await clearLicense(ctx);
      return {
        blocks: await settingsBlocks(ctx, siteOrigin),
        toast: { message: "License removed. Reverted to free plan.", type: "info" },
      };
    }

    return { blocks: await listPageBlocks(ctx) };
  },
};
