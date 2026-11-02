import type { PluginContext } from "emdash";
import { normalizeMustacheTags } from "./html";
import type { StoredTemplate } from "../types";

/** Stable storage ids for built-in templates — never rename. */
export const SYSTEM_TEMPLATE_IDS = {
  adminNotify: "ff_tpl_admin_notify",
  submitterReceipt: "ff_tpl_submitter_receipt",
} as const;

type DefaultTemplate = {
  id: string;
  data: StoredTemplate;
};

const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    id: SYSTEM_TEMPLATE_IDS.adminNotify,
    data: {
      name: "Admin Notify",
      subject: "New submission: {{form_name}}",
      body: `A new submission was received for {{form_name}}.

Submission ID: {{submission_id}}
Submitted at: {{submitted_at}}

{{all_fields}}
`,
      format: "text",
      system: true,
      createdAt: "",
      updatedAt: "",
    },
  },
  {
    id: SYSTEM_TEMPLATE_IDS.submitterReceipt,
    data: {
      name: "Submitter Receipt",
      subject: "We received your {{form_name}} submission",
      body: `Thanks for getting in touch.

We received your submission for {{form_name}} and will follow up soon.

{{all_fields}}
`,
      format: "text",
      system: true,
      createdAt: "",
      updatedAt: "",
    },
  },
];

/**
 * Ensures built-in notification templates exist.
 * - Missing ids are created from defaults.
 * - Existing system rows get Mustache tags normalized (`{{ form_name}}` →
 *   `{{form_name}}`) so older seeds stop showing spaced variables. Other
 *   content is left alone.
 */
export async function ensureDefaultTemplates(ctx: PluginContext): Promise<void> {
  const now = new Date().toISOString();
  for (const def of DEFAULT_TEMPLATES) {
    const existing = (await ctx.storage.templates.get(def.id)) as StoredTemplate | null;
    if (!existing) {
      await ctx.storage.templates.put(def.id, {
        ...def.data,
        createdAt: now,
        updatedAt: now,
      });
      continue;
    }

    // Always keep built-in subject/body in sync with shipped defaults (fixes
    // older seeds that stored `{{ form_name}}` with a space). replyTo and other
    // optional fields stay as-is after Mustache normalization.
    const subject = normalizeMustacheTags(def.data.subject);
    const body = normalizeMustacheTags(def.data.body);
    const replyTo = existing.replyTo
      ? normalizeMustacheTags(existing.replyTo)
      : existing.replyTo;
    if (
      subject === existing.subject &&
      body === existing.body &&
      replyTo === existing.replyTo
    ) {
      continue;
    }
    await ctx.storage.templates.put(def.id, {
      ...existing,
      name: def.data.name,
      subject,
      body,
      format: def.data.format,
      system: true,
      ...(replyTo !== undefined ? { replyTo } : {}),
      updatedAt: now,
    });
  }
}

export function isSystemTemplateId(id: string): boolean {
  return (
    id === SYSTEM_TEMPLATE_IDS.adminNotify ||
    id === SYSTEM_TEMPLATE_IDS.submitterReceipt
  );
}
