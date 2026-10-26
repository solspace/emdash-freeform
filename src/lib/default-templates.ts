import type { PluginContext } from "emdash";
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
      subject: "New submission: {{ form_name}}",
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
 * Ensures built-in notification templates exist. Idempotent: only writes when
 * the template id is missing (never overwrites — content is locked in product,
 * and we don't clobber any accidental local edits from older builds).
 */
export async function ensureDefaultTemplates(ctx: PluginContext): Promise<void> {
  const now = new Date().toISOString();
  for (const def of DEFAULT_TEMPLATES) {
    const existing = (await ctx.storage.templates.get(def.id)) as StoredTemplate | null;
    if (existing) continue;
    await ctx.storage.templates.put(def.id, {
      ...def.data,
      createdAt: now,
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
