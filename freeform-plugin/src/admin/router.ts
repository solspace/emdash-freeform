import type { PluginContext } from "emdash";
import { editFormWithAI } from "../ai/generate";
import {
  clearAnthropicApiKey,
  clearOpenAiApiKey,
  getAiCredentials,
  getAiProvider,
  hasAnthropicKey,
  hasOpenAiKey,
  setAiProvider,
  setAnthropicApiKey,
  setOpenAiApiKey,
  type AiProvider,
} from "../lib/ai-config";
import { DEFAULT_SPAM_THRESHOLD } from "../constants";
import {
  applyNewFieldToRows,
  parseFieldFromValues,
  updateFieldInRows,
  type FieldFormValues,
} from "../lib/field-form-values";
import { setMcpWorkerUrl } from "../lib/mcp-settings";
import { deleteFormAndSubmissions, removeField } from "../lib/field-ops";
import {
  deriveUniqueFormHandle,
  ensureUniqueFormHandle,
  inferFormTitleFromDescription,
  isHandleTaken,
  isLabelTaken,
  isValidFormHandle,
} from "../lib/form-handles";
import { inferFormCardIconId, isFormCardIconId } from "../lib/form-icons";
import { uid } from "../lib/handles";
import { activateLicense, clearLicense, getTier } from "../lib/license";
import { deleteTemplateAndDetach } from "../lib/notifications";
import { ensureDemoSeed } from "../lib/seed";
import { setFormSpamOverride, setSpamSettings } from "../lib/spam-settings";
import { generateWebhookSecret } from "../lib/webhooks";
import { ensureRetryCronScheduled } from "../routes/webhooks";
import type {
  NotificationFormat,
  StoredAssignment,
  StoredForm,
  StoredTemplate,
  StoredWebhook,
} from "../types";
import {
  editorBlocks,
  listPageBlocks,
  defaultEditorUi,
  type EditorSection,
  type EditorUiState,
} from "./forms";
import { setCreateFormAiModalOpen } from "./create-form-ai";
import {
  clearWebhookSecretReveal,
  setWebhookSecretReveal,
  settingsBlocks,
  SETTINGS_TAB_AI,
} from "./settings";
import { submissionDetailBlocks, submissionsBlocks } from "./submissions";
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

function editorUi(overrides: Partial<EditorUiState> = {}): EditorUiState {
  return { ...defaultEditorUi, ...overrides };
}

async function renderEditor(
  formId: string,
  ctx: PluginContext,
  siteOrigin: string,
  ui: EditorUiState = defaultEditorUi,
) {
  return { blocks: await editorBlocks(formId, ctx, ui, siteOrigin) };
}

function parseFormAndFieldId(
  prefix: string,
  actionId: string,
): { formId: string; fieldId: string } | null {
  if (!actionId.startsWith(prefix)) return null;
  const rest = actionId.slice(prefix.length);
  const i = rest.indexOf(":");
  if (i < 0) return null;
  return { formId: rest.slice(0, i), fieldId: rest.slice(i + 1) };
}

async function widgetBlocks(ctx: PluginContext): Promise<object[]> {
  const { items: forms } = await ctx.storage.forms.query({});
  const totalSubs = await ctx.storage.submissions.count();
  return [
    {
      type: "stats",
      items: [
        { label: "Forms", value: String(forms.length) },
        { label: "Submissions", value: String(totalSubs) },
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
      // Idempotent: fills the demo Contact form on first admin load if the
      // plugin:install hook never fired (trusted-plugin path). No-ops once
      // the seed flag is set.
      await ensureDemoSeed(ctx);
      if (page === "/settings") return { blocks: await settingsBlocks(ctx, siteOrigin) };
      if (page === "/templates") return { blocks: await templatesPageBlocks(ctx) };
      if (page === "/submissions") {
        return { blocks: await submissionsBlocks(null, ctx) };
      }
      return { blocks: await listPageBlocks(ctx) };
    }

    if (actionId === "nav:forms") {
      await setCreateFormAiModalOpen(ctx, false);
      return { blocks: await listPageBlocks(ctx) };
    }
    if (actionId === "nav:settings") return { blocks: await settingsBlocks(ctx, siteOrigin) };
    if (actionId === "nav:templates") return { blocks: await templatesPageBlocks(ctx) };
    if (actionId === "nav:submissions") {
      return { blocks: await submissionsBlocks(null, ctx) };
    }

    if (actionId === "cancel_del") {
      return { blocks: await listPageBlocks(ctx) };
    }

    const viewMatch = actionId.match(
      /^view_(build|settings|notifications|spam|integrate):(.+)$/,
    );
    if (viewMatch) {
      return renderEditor(
        viewMatch[2],
        ctx,
        siteOrigin,
        editorUi({
          section: viewMatch[1] as EditorSection,
          selectedFieldId: null,
          showAddField: false,
        }),
      );
    }

    const selectField = parseFormAndFieldId("select_field:", actionId);
    if (selectField) {
      return renderEditor(
        selectField.formId,
        ctx,
        siteOrigin,
        editorUi({
          section: "build",
          selectedFieldId: selectField.fieldId,
          showAddField: false,
        }),
      );
    }

    if (actionId.startsWith("deselect_field:")) {
      const fid = actionId.slice("deselect_field:".length);
      return renderEditor(
        fid,
        ctx,
        siteOrigin,
        editorUi({ section: "build", selectedFieldId: null, showAddField: false }),
      );
    }

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
      return renderEditor(id, ctx, siteOrigin);
    }

    if (actionId === "new_form_ai") {
      const creds = await getAiCredentials(ctx);
      if (!creds) {
        return {
          blocks: await settingsBlocks(ctx, siteOrigin, undefined, SETTINGS_TAB_AI),
          toast: {
            message: "Add an API key in Settings → AI to create forms with AI.",
            type: "info",
          },
        };
      }
      await setCreateFormAiModalOpen(ctx, true);
      return { blocks: await listPageBlocks(ctx) };
    }

    if (actionId === "cancel_create_form_ai") {
      await setCreateFormAiModalOpen(ctx, false);
      return { blocks: await listPageBlocks(ctx) };
    }

    if (actionId === "submit_create_form_ai") {
      const description = ((values.description as string) ?? "").trim();
      if (!description) {
        return {
          blocks: await listPageBlocks(ctx),
          toast: { message: "Please describe the form you want.", type: "error" },
        };
      }

      const creds = await getAiCredentials(ctx);
      if (!creds) {
        await setCreateFormAiModalOpen(ctx, false);
        return {
          blocks: await settingsBlocks(ctx, siteOrigin, undefined, SETTINGS_TAB_AI),
          toast: {
            message: "AI API key not configured. Add it in Settings → AI.",
            type: "error",
          },
        };
      }

      const id = uid();
      const handle = await deriveUniqueFormHandle(ctx, "New Form");
      const emptyForm: StoredForm = {
        name: "New Form",
        handle,
        rows: [],
        successMessage: "Thank you for your submission!",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await ctx.storage.forms.put(id, emptyForm);

      const tier = await getTier(ctx);

      try {
        const { newForm, summary } = await editFormWithAI(
          description,
          tier,
          emptyForm,
          ctx,
          creds,
        );
        const formName =
          newForm.name.trim() || inferFormTitleFromDescription(description);
        const formHandle = await ensureUniqueFormHandle(
          ctx,
          newForm.handle?.trim() || formName,
          id,
        );
        const cardIcon = inferFormCardIconId({
          name: formName,
          handle: formHandle,
          rows: newForm.rows,
          hint: description,
        });
        const savedForm: StoredForm = {
          ...newForm,
          name: formName,
          handle: formHandle,
          cardIcon,
          updatedAt: new Date().toISOString(),
        };
        const metaChanged =
          formName !== emptyForm.name || formHandle !== emptyForm.handle;
        const anyChange =
          summary.added > 0 ||
          summary.updated > 0 ||
          summary.removed > 0 ||
          metaChanged;
        await ctx.storage.forms.put(id, savedForm);

        await setCreateFormAiModalOpen(ctx, false);

        const parts: string[] = [];
        if (summary.added > 0) {
          parts.push(`Added ${summary.added} field${summary.added !== 1 ? "s" : ""}.`);
        }
        if (!anyChange) {
          parts.push("Open the editor to add fields manually.");
        }

        return {
          ...(await renderEditor(id, ctx, siteOrigin)),
          toast: {
            message: parts.join(" ") || "Form created.",
            type: anyChange ? "success" : "info",
          },
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.log.error("AI create form failed", { error: msg });
        await ctx.storage.forms.delete(id);
        return {
          blocks: await listPageBlocks(ctx),
          toast: { message: `AI error: ${msg}`, type: "error" },
        };
      }
    }

    if (actionId === "enable_ai") {
      return {
        blocks: await settingsBlocks(ctx, siteOrigin, undefined, SETTINGS_TAB_AI),
        toast: {
          message: "Add an API key in Settings → AI to enable AI features.",
          type: "info",
        },
      };
    }

    if (actionId.startsWith("dismiss_ai_builder:")) {
      const fid = actionId.slice("dismiss_ai_builder:".length);
      return renderEditor(
        fid,
        ctx,
        siteOrigin,
        editorUi({ section: "build", focusAiBuilder: false }),
      );
    }

    if (actionId.startsWith("edit:")) {
      return renderEditor(actionId.slice(5), ctx, siteOrigin);
    }

    if (actionId.startsWith("del:")) {
      return { blocks: await listPageBlocks(ctx) };
    }
    if (actionId.startsWith("cancel_del:")) {
      return { blocks: await listPageBlocks(ctx) };
    }
    if (actionId.startsWith("confirm_del:")) {
      await deleteFormAndSubmissions(ctx, actionId.slice("confirm_del:".length));
      return {
        blocks: await listPageBlocks(ctx),
        toast: { message: "Form deleted", type: "success" },
      };
    }

    if (actionId.startsWith("subs:")) {
      return { blocks: await submissionsBlocks(actionId.slice(5), ctx) };
    }

    // Pagination: subs_next:<formId>:<cursor> / subs_prev:<formId>:<cursor>
    if (actionId.startsWith("subs_next:") || actionId.startsWith("subs_prev:")) {
      const rest = actionId.startsWith("subs_next:")
        ? actionId.slice("subs_next:".length)
        : actionId.slice("subs_prev:".length);
      const colonIdx = rest.indexOf(":");
      const fid = rest.slice(0, colonIdx);
      const cur = rest.slice(colonIdx + 1);
      return { blocks: await submissionsBlocks(fid, ctx, cur) };
    }
    if (actionId.startsWith("all_subs_next:") || actionId.startsWith("all_subs_prev:")) {
      const cur = actionId.startsWith("all_subs_next:")
        ? actionId.slice("all_subs_next:".length)
        : actionId.slice("all_subs_prev:".length);
      return { blocks: await submissionsBlocks(null, ctx, cur) };
    }

    // Submission detail
    if (actionId.startsWith("sub_detail:")) {
      const fidPart = actionId.slice("sub_detail:".length);
      const subId = (values.sub_id as string) ?? "";
      const backFormId = fidPart === "all" ? null : fidPart;
      if (!subId) {
        return {
          blocks: await submissionsBlocks(backFormId, ctx),
          toast: { message: "Choose a submission first.", type: "error" },
        };
      }
      return { blocks: await submissionDetailBlocks(subId, backFormId, ctx) };
    }

    if (actionId.startsWith("save_meta:")) {
      const fid = actionId.slice("save_meta:".length);
      const form = (await ctx.storage.forms.get(fid)) as StoredForm | null;
      if (!form) return { blocks: await listPageBlocks(ctx) };

      const newLabel = ((values.label as string) ?? "").trim();
      const newHandle = ((values.handle as string) ?? "").trim();
      const newSuccessMessage = ((values.success_message as string) ?? "").trim();
      const cardIconRaw = ((values.card_icon as string) ?? "auto").trim();
      const newCardIcon = isFormCardIconId(cardIconRaw) ? cardIconRaw : "auto";

      if (!newLabel) {
        return {
          ...(await renderEditor(
            fid,
            ctx,
            siteOrigin,
            editorUi({ section: "settings" }),
          )),
          toast: { message: "Form name cannot be empty.", type: "error" },
        };
      }
      if (!newHandle) {
        return {
          ...(await renderEditor(
            fid,
            ctx,
            siteOrigin,
            editorUi({ section: "settings" }),
          )),
          toast: { message: "Handle cannot be empty.", type: "error" },
        };
      }

      const labelChanged = newLabel !== form.name;
      const handleChanged = newHandle !== form.handle;
      const successChanged = newSuccessMessage !== (form.successMessage ?? "");
      const iconChanged = newCardIcon !== (form.cardIcon ?? "auto");

      if (labelChanged && (await isLabelTaken(ctx, newLabel, fid))) {
        return {
          ...(await renderEditor(
            fid,
            ctx,
            siteOrigin,
            editorUi({ section: "settings" }),
          )),
          toast: {
            message: `Name "${newLabel}" is already in use by another form.`,
            type: "error",
          },
        };
      }

      if (handleChanged) {
        if (!isValidFormHandle(newHandle)) {
          return {
            ...(await renderEditor(
              fid,
              ctx,
              siteOrigin,
              editorUi({ section: "settings" }),
            )),
            toast: {
              message:
                "Handle must be lowercase snake_case starting with a letter (e.g. contact_us).",
              type: "error",
            },
          };
        }
        if (await isHandleTaken(ctx, newHandle, fid)) {
          return {
            ...(await renderEditor(
              fid,
              ctx,
              siteOrigin,
              editorUi({ section: "settings" }),
            )),
            toast: {
              message: `Handle "${newHandle}" is already in use by another form.`,
              type: "error",
            },
          };
        }
      }

      if (!labelChanged && !handleChanged && !successChanged && !iconChanged) {
        return renderEditor(fid, ctx, siteOrigin, editorUi({ section: "settings" }));
      }

      await ctx.storage.forms.put(fid, {
        ...form,
        name: newLabel,
        handle: newHandle,
        successMessage: newSuccessMessage || "Thank you for your submission!",
        cardIcon: newCardIcon,
        updatedAt: new Date().toISOString(),
      });

      const message = handleChanged
        ? `Saved. Handle is now "${newHandle}" — update any page references.`
        : "Settings saved.";
      return {
        ...(await renderEditor(fid, ctx, siteOrigin, editorUi({ section: "settings" }))),
        toast: { message, type: "success" },
      };
    }

    if (actionId.startsWith("show_add:")) {
      const fid = actionId.slice(9);
      return renderEditor(
        fid,
        ctx,
        siteOrigin,
        editorUi({ section: "build", showAddField: true, selectedFieldId: null }),
      );
    }
    if (actionId.startsWith("cancel_add:")) {
      const fid = actionId.slice(11);
      return renderEditor(
        fid,
        ctx,
        siteOrigin,
        editorUi({ section: "build", showAddField: false }),
      );
    }

    const rmSelected = parseFormAndFieldId("rm_selected:", actionId);
    if (rmSelected) {
      const form = (await ctx.storage.forms.get(rmSelected.formId)) as StoredForm | null;
      if (!form) return { blocks: await listPageBlocks(ctx) };
      await ctx.storage.forms.put(rmSelected.formId, {
        ...form,
        rows: removeField(form.rows, rmSelected.fieldId),
        updatedAt: new Date().toISOString(),
      });
      return {
        ...(await renderEditor(rmSelected.formId, ctx, siteOrigin)),
        toast: { message: "Field removed.", type: "success" },
      };
    }

    if (actionId.startsWith("save_edit:")) {
      const parsed = parseFormAndFieldId("save_edit:", actionId);
      if (!parsed) return { blocks: await listPageBlocks(ctx) };
      const { formId: fid, fieldId } = parsed;
      const tier = await getTier(ctx);
      const form = (await ctx.storage.forms.get(fid)) as StoredForm | null;
      if (!form) return { blocks: await listPageBlocks(ctx) };

      const existing = form.rows
        .flatMap((r) => r.fields)
        .find((f) => f.id === fieldId);
      if (!existing) {
        return renderEditor(fid, ctx, siteOrigin);
      }

      const result = parseFieldFromValues(values as FieldFormValues, {
        tier,
        existingId: fieldId,
      });
      if (!result.ok) {
        return {
          ...(await renderEditor(
            fid,
            ctx,
            siteOrigin,
            editorUi({ section: "build", selectedFieldId: fieldId }),
          )),
          toast: { message: result.message, type: "error" },
        };
      }

      const duplicateHandle = form.rows.some((r) =>
        r.fields.some(
          (f) => f.id !== fieldId && f.handle === result.field.handle,
        ),
      );
      if (duplicateHandle) {
        return {
          ...(await renderEditor(
            fid,
            ctx,
            siteOrigin,
            editorUi({ section: "build", selectedFieldId: fieldId }),
          )),
          toast: {
            message: `Handle "${result.field.handle}" is already used on this form.`,
            type: "error",
          },
        };
      }

      await ctx.storage.forms.put(fid, {
        ...form,
        rows: updateFieldInRows(form.rows, fieldId, result.field),
        updatedAt: new Date().toISOString(),
      });
      return {
        ...(await renderEditor(
          fid,
          ctx,
          siteOrigin,
          editorUi({ section: "build", selectedFieldId: fieldId }),
        )),
        toast: { message: `"${result.field.label}" saved.`, type: "success" },
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
        ...(await renderEditor(fid, ctx, siteOrigin)),
        toast: { message: "Field removed.", type: "success" },
      };
    }

    if (actionId.startsWith("add:")) {
      const fid = actionId.slice(4);
      const tier = await getTier(ctx);
      const form = (await ctx.storage.forms.get(fid)) as StoredForm | null;
      if (!form) return { blocks: await listPageBlocks(ctx) };

      const addUi = editorUi({
        section: "build",
        showAddField: true,
        selectedFieldId: null,
      });
      const result = parseFieldFromValues(values as FieldFormValues, { tier });
      if (!result.ok) {
        return {
          ...(await renderEditor(fid, ctx, siteOrigin, addUi)),
          toast: { message: result.message, type: "error" },
        };
      }

      await ctx.storage.forms.put(fid, {
        ...form,
        rows: applyNewFieldToRows(form.rows, result.field, result.rowTarget),
        updatedAt: new Date().toISOString(),
      });
      return {
        ...(await renderEditor(fid, ctx, siteOrigin)),
        toast: { message: `"${result.field.label}" added.`, type: "success" },
      };
    }

    if (actionId.startsWith("ai:")) {
      const fid = actionId.slice(3);
      const description = ((values.description as string) ?? "").trim();
      if (!description) {
        return {
          ...(await renderEditor(
            fid,
            ctx,
            siteOrigin,
            editorUi({ section: "build", focusAiBuilder: true }),
          )),
          toast: { message: "Please enter a description first", type: "error" },
        };
      }

      const creds = await getAiCredentials(ctx);
      if (!creds) {
        return {
          blocks: await settingsBlocks(ctx, siteOrigin, undefined, SETTINGS_TAB_AI),
          toast: {
            message: "AI API key not configured. Add it in Settings → AI.",
            type: "error",
          },
        };
      }

      const form = (await ctx.storage.forms.get(fid)) as StoredForm | null;
      if (!form) return { blocks: await listPageBlocks(ctx) };

      const tier = await getTier(ctx);

      try {
        const { newForm, summary } = await editFormWithAI(description, tier, form, ctx, creds);
        const anyChange =
          summary.added > 0 || summary.updated > 0 || summary.removed > 0;
        if (anyChange) {
          const cardIcon =
            (form.cardIcon ?? "auto") === "auto"
              ? inferFormCardIconId({
                  name: newForm.name,
                  handle: newForm.handle,
                  rows: newForm.rows,
                  hint: description,
                })
              : form.cardIcon;
          await ctx.storage.forms.put(fid, {
            ...newForm,
            cardIcon,
            updatedAt: new Date().toISOString(),
          });
        }

        const parts: string[] = [];
        if (summary.added > 0) {
          parts.push(`Added ${summary.added} field${summary.added !== 1 ? "s" : ""}.`);
        }
        if (summary.updated > 0) {
          parts.push(`Updated ${summary.updated} field${summary.updated !== 1 ? "s" : ""}.`);
        }
        if (summary.removed > 0) {
          parts.push(`Removed ${summary.removed} field${summary.removed !== 1 ? "s" : ""}.`);
        }
        if (!anyChange) {
          parts.push(
            "No changes applied — the request was already satisfied or didn't map to a valid operation.",
          );
        }
        if (summary.duplicatesSkipped > 0) {
          parts.push(
            `${summary.duplicatesSkipped} duplicate${summary.duplicatesSkipped !== 1 ? "s" : ""} skipped.`,
          );
        }
        if (summary.notFound.length > 0) {
          parts.push(
            `Couldn't find: ${summary.notFound.slice(0, 3).join(", ")}${summary.notFound.length > 3 ? "…" : ""}.`,
          );
        }
        if (summary.cappedAt !== null) {
          parts.push(`Capped at ${summary.cappedAt} added per request.`);
        }
        if (summary.totalCapped !== null) {
          parts.push(`Form is at the ${summary.totalCapped}-field cap; stopped early.`);
        }

        return {
          ...(await renderEditor(
            fid,
            ctx,
            siteOrigin,
            editorUi({ section: "build", focusAiBuilder: false }),
          )),
          toast: {
            message: parts.join(" "),
            type: anyChange ? "success" : "info",
          },
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.log.error("AI edit failed", { error: msg });
        return {
          ...(await renderEditor(
            fid,
            ctx,
            siteOrigin,
            editorUi({ section: "build", focusAiBuilder: true }),
          )),
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
          ...(await renderEditor(
            fid,
            ctx,
            siteOrigin,
            editorUi({ section: "notifications" }),
          )),
          toast: { message: "Pick a template.", type: "error" },
        };
      }

      const now = new Date().toISOString();
      let assignment: StoredAssignment;
      if (recipient === "__custom__") {
        if (!/\S+@\S+\.\S+/.test(customEmail)) {
          return {
            ...(await renderEditor(
              fid,
              ctx,
              siteOrigin,
              editorUi({ section: "notifications" }),
            )),
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
        ...(await renderEditor(
          fid,
          ctx,
          siteOrigin,
          editorUi({ section: "notifications" }),
        )),
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
        ...(await renderEditor(
          a.formId,
          ctx,
          siteOrigin,
          editorUi({ section: "notifications" }),
        )),
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
        ...(await renderEditor(
          a.formId,
          ctx,
          siteOrigin,
          editorUi({ section: "notifications" }),
        )),
        toast: { message: "Notification detached", type: "success" },
      };
    }

    if (actionId === "save_mcp_worker_url") {
      const url = ((values.mcp_worker_url as string) ?? "").trim();
      const result = await setMcpWorkerUrl(ctx, url || null);
      if (!result.ok) {
        return {
          blocks: await settingsBlocks(ctx, siteOrigin),
          toast: { message: result.message, type: "error" },
        };
      }
      return {
        blocks: await settingsBlocks(ctx, siteOrigin),
        toast: {
          message: url ? "MCP Worker URL saved." : "MCP Worker URL cleared.",
          type: "success",
        },
      };
    }

    if (actionId === "save_ai_settings") {
      const provider = ((values.ai_provider as string) ?? "anthropic").trim() as AiProvider;
      const apiKey = ((values.api_key as string) ?? "").trim();

      if (provider !== "openai" && provider !== "anthropic") {
        return {
          blocks: await settingsBlocks(ctx, siteOrigin, undefined, SETTINGS_TAB_AI),
          toast: { message: "Choose Anthropic or OpenAI as the provider.", type: "error" },
        };
      }

      await setAiProvider(ctx, provider);

      if (apiKey) {
        if (provider === "openai") await setOpenAiApiKey(ctx, apiKey);
        else await setAnthropicApiKey(ctx, apiKey);
      }

      const hasActive =
        provider === "openai"
          ? apiKey || (await hasOpenAiKey(ctx))
          : apiKey || (await hasAnthropicKey(ctx));

      if (!hasActive) {
        return {
          blocks: await settingsBlocks(ctx, siteOrigin, undefined, SETTINGS_TAB_AI),
          toast: {
            message: `Enter a ${provider === "openai" ? "OpenAI" : "Anthropic"} API key for the selected provider.`,
            type: "error",
          },
        };
      }

      return {
        blocks: await settingsBlocks(ctx, siteOrigin, undefined, SETTINGS_TAB_AI),
        toast: { message: "AI settings saved.", type: "success" },
      };
    }

    if (actionId === "remove_active_api_key") {
      const provider = await getAiProvider(ctx);
      if (provider === "openai") await clearOpenAiApiKey(ctx);
      else await clearAnthropicApiKey(ctx);
      return {
        blocks: await settingsBlocks(ctx, siteOrigin, undefined, SETTINGS_TAB_AI),
        toast: { message: "API key removed.", type: "info" },
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

    if (actionId.startsWith("save_form_spam:")) {
      const fid = actionId.slice("save_form_spam:".length);
      const tier = await getTier(ctx);
      if (tier !== "pro") {
        return {
          ...(await renderEditor(
            fid,
            ctx,
            siteOrigin,
            editorUi({ section: "spam" }),
          )),
          toast: { message: "AI spam filtering requires a Pro license.", type: "error" },
        };
      }
      const useCustom = (values.use_custom as boolean) ?? false;
      if (!useCustom) {
        const updated = await setFormSpamOverride(ctx, fid, null);
        if (!updated) return { blocks: await listPageBlocks(ctx) };
        return {
          ...(await renderEditor(fid, ctx, siteOrigin, editorUi({ section: "spam" }))),
          toast: {
            message: "Custom spam settings cleared. Form inherits the global default.",
            type: "success",
          },
        };
      }
      const enabled = (values.enabled as boolean) ?? false;
      const thresholdRaw = ((values.threshold as string) ?? "").trim();
      const thresholdNum =
        thresholdRaw === "" ? DEFAULT_SPAM_THRESHOLD : Number(thresholdRaw);
      if (!Number.isFinite(thresholdNum) || thresholdNum < 0 || thresholdNum > 10) {
        return {
          ...(await renderEditor(fid, ctx, siteOrigin, editorUi({ section: "spam" }))),
          toast: { message: "Threshold must be a number from 0 to 10.", type: "error" },
        };
      }
      const updated = await setFormSpamOverride(ctx, fid, {
        enabled,
        threshold: thresholdNum,
      });
      if (!updated) return { blocks: await listPageBlocks(ctx) };
      return {
        ...(await renderEditor(fid, ctx, siteOrigin, editorUi({ section: "spam" }))),
        toast: {
          message: enabled
            ? `Custom spam filter on for this form, threshold ${Math.round(thresholdNum)}.`
            : "Custom spam filter off for this form.",
          type: "success",
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

    // ── Webhook actions ───────────────────────────────────────────

    if (actionId === "add_webhook") {
      const name = ((values.webhook_name as string) ?? "").trim();
      const url = ((values.webhook_url as string) ?? "").trim();
      const formScope = ((values.webhook_form as string) ?? "__all__").trim();

      if (!name) {
        return {
          blocks: await settingsBlocks(ctx, siteOrigin),
          toast: { message: "Webhook name is required.", type: "error" },
        };
      }
      if (!url) {
        return {
          blocks: await settingsBlocks(ctx, siteOrigin),
          toast: { message: "Webhook URL is required.", type: "error" },
        };
      }
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return {
          blocks: await settingsBlocks(ctx, siteOrigin),
          toast: { message: "Webhook URL is not a valid URL.", type: "error" },
        };
      }
      if (parsedUrl.protocol !== "https:") {
        return {
          blocks: await settingsBlocks(ctx, siteOrigin),
          toast: { message: "Webhook URL must use HTTPS.", type: "error" },
        };
      }

      const secret = generateWebhookSecret();
      const now = new Date().toISOString();
      const wid = uid();
      await ctx.storage.webhooks.put(wid, {
        name,
        url,
        secret,
        enabled: true,
        formId: formScope === "__all__" ? undefined : formScope,
        createdAt: now,
        updatedAt: now,
      } as StoredWebhook);

      await ensureRetryCronScheduled(ctx);
      await setWebhookSecretReveal(ctx, {
        webhookId: wid,
        webhookName: name,
        secret,
        action: "created",
      });

      return {
        blocks: await settingsBlocks(ctx, siteOrigin),
        toast: {
          message: `Webhook "${name}" created. Copy the signing secret from the Settings panel.`,
          type: "success",
        },
      };
    }

    if (actionId === "hide_webhook_secret") {
      await clearWebhookSecretReveal(ctx);
      return {
        blocks: await settingsBlocks(ctx, siteOrigin),
        toast: { message: "Webhook secret hidden.", type: "success" },
      };
    }

    if (actionId.startsWith("toggle_webhook:")) {
      const wid = actionId.slice("toggle_webhook:".length);
      const wh = (await ctx.storage.webhooks.get(wid)) as StoredWebhook | null;
      if (!wh) return { blocks: await settingsBlocks(ctx, siteOrigin) };
      await ctx.storage.webhooks.put(wid, {
        ...wh,
        enabled: !wh.enabled,
        updatedAt: new Date().toISOString(),
      });
      return {
        blocks: await settingsBlocks(ctx, siteOrigin),
        toast: { message: wh.enabled ? "Webhook paused." : "Webhook enabled.", type: "success" },
      };
    }

    if (actionId.startsWith("del_webhook:")) {
      const wid = actionId.slice("del_webhook:".length);
      await ctx.storage.webhooks.delete(wid);
      return {
        blocks: await settingsBlocks(ctx, siteOrigin),
        toast: { message: "Webhook deleted.", type: "success" },
      };
    }

    if (actionId === "close_webhook_log") {
      return { blocks: await settingsBlocks(ctx, siteOrigin) };
    }

    if (actionId.startsWith("log_webhook:")) {
      const wid = actionId.slice("log_webhook:".length);
      return { blocks: await settingsBlocks(ctx, siteOrigin, wid) };
    }

    if (actionId.startsWith("rotate_webhook_secret:")) {
      const wid = actionId.slice("rotate_webhook_secret:".length);
      const wh = (await ctx.storage.webhooks.get(wid)) as StoredWebhook | null;
      if (!wh) return { blocks: await settingsBlocks(ctx, siteOrigin) };
      const secret = generateWebhookSecret();
      await ctx.storage.webhooks.put(wid, {
        ...wh,
        secret,
        updatedAt: new Date().toISOString(),
      });
      await setWebhookSecretReveal(ctx, {
        webhookId: wid,
        webhookName: wh.name,
        secret,
        action: "rotated",
      });
      return {
        blocks: await settingsBlocks(ctx, siteOrigin),
        toast: {
          message: `Secret rotated for "${wh.name}". Copy it from the Settings panel.`,
          type: "success",
        },
      };
    }

    return { blocks: await listPageBlocks(ctx) };
  },
};
