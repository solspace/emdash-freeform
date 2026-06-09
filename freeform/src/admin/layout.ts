import type { PluginContext } from "emdash";
import { hasApiKey } from "../lib/ai-key";
import { resolveFormCardGlyph } from "../lib/form-icons";

export const FORMS_PER_ROW = 3;

export type FreeformNavSection = "forms" | "submissions" | "templates" | "settings";

/** In-plugin section nav (one Plugins sidebar entry). */
export function freeformNavBlocks(active: FreeformNavSection): object[] {
  const items: Array<{
    section: FreeformNavSection;
    label: string;
    action_id: string;
  }> = [
    { section: "forms", label: "Forms", action_id: "nav:forms" },
    { section: "submissions", label: "Submissions", action_id: "nav:submissions" },
    { section: "templates", label: "Templates", action_id: "nav:templates" },
    { section: "settings", label: "Settings", action_id: "nav:settings" },
  ];

  const navButtons = items.map(({ section, label, action_id }) => ({
    type: "button",
    label,
    action_id,
    style: section === active ? "primary" : "secondary",
  }));

  return [
    { type: "actions", elements: navButtons },
    { type: "divider" },
  ];
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Section title only — no extra lines under it. */
export function sectionHeader(title: string): object[] {
  return [{ type: "header", text: title }, { type: "divider" }];
}

/** Page title + optional one-line subtitle (section text — visible in EmDash admin). */
export function pageHeader(title: string, hint?: string): object[] {
  if (!hint?.trim()) {
    return [{ type: "header", text: title }];
  }
  return [
    { type: "header", text: title },
    { type: "section", text: hint.trim() },
  ];
}

export function settingsNavButton(): object {
  return {
    type: "button",
    label: "Settings",
    action_id: "nav:settings",
    style: "secondary",
  };
}

export function backToFormsButton(): object {
  return {
    type: "actions",
    elements: [
      { type: "button", label: "Back to all forms", action_id: "nav:forms" },
      settingsNavButton(),
    ],
  };
}

/** Form editor top bar — back, submissions, plugin settings (once). */
export function editorTopActions(formId: string): object {
  return {
    type: "actions",
    elements: [
      {
        type: "button",
        label: "Back to all forms",
        action_id: "nav:forms",
        style: "secondary",
      },
      {
        type: "button",
        label: "View submissions",
        action_id: `subs:${formId}`,
        style: "secondary",
      },
      settingsNavButton(),
    ],
  };
}

/** Settings page title. */
export function settingsPageToolbar(): object[] {
  return [{ type: "header", text: "Settings" }, { type: "divider" }];
}

const WEBHOOKS_PER_ROW = 2;

/** One webhook card — name, scope/status meta, inline actions. */
export function webhookCardColumnBlocks(
  webhookId: string,
  wh: { name: string; formId?: string; enabled: boolean },
  scopeLabel: string,
): object[] {
  const status = wh.enabled ? "Active" : "Paused";

  return [
    {
      type: "empty",
      title: wh.name,
      description: `${scopeLabel} · ${status}`,
      size: "sm",
      actions: [
        {
          type: "button",
          label: wh.enabled ? "Pause" : "Resume",
          action_id: `toggle_webhook:${webhookId}`,
          style: "secondary",
        },
        {
          type: "button",
          label: "Log",
          action_id: `log_webhook:${webhookId}`,
          style: "secondary",
        },
        {
          type: "button",
          label: "Rotate",
          action_id: `rotate_webhook_secret:${webhookId}`,
          style: "secondary",
          confirm: {
            title: "Rotate secret?",
            text: "Update your endpoint with the new secret immediately.",
            confirm: "Rotate",
            deny: "Cancel",
          },
        },
        {
          type: "button",
          label: "Delete",
          action_id: `del_webhook:${webhookId}`,
          style: "danger",
          confirm: {
            title: `Delete "${wh.name}"?`,
            text: "Stops all future deliveries.",
            confirm: "Delete",
            deny: "Cancel",
          },
        },
      ],
    },
  ];
}

/** Grid of webhook cards — up to {@link WEBHOOKS_PER_ROW} per row. */
export function webhookGridBlocks(
  webhooks: Array<{ id: string; data: { name: string; formId?: string; enabled: boolean } }>,
  scopeFor: (data: { formId?: string }) => string,
): object[] {
  if (webhooks.length === 0) return [];

  const rows: object[] = [];
  for (let i = 0; i < webhooks.length; i += WEBHOOKS_PER_ROW) {
    const slice = webhooks.slice(i, i + WEBHOOKS_PER_ROW);
    const columns = slice.map((w) =>
      webhookCardColumnBlocks(w.id, w.data, scopeFor(w.data)),
    );
    while (columns.length > 0 && columns.length < 2) {
      columns.push([{ type: "context", text: "\u00a0" }]);
    }
    rows.push({ type: "columns", columns });
  }
  return rows;
}

/** Forms page title + create actions on the right. */
export async function formsPageHeader(ctx: PluginContext): Promise<object[]> {
  const apiKeyConfigured = await hasApiKey(ctx);

  const createFormButton = {
    type: "button",
    label: "Create form",
    action_id: "new_form",
    style: "secondary",
  };

  const blocks: object[] = [
    {
      type: "section",
      text: "Forms",
      ...(!apiKeyConfigured && {
        accessory: {
          type: "button",
          label: "Enable AI",
          action_id: "enable_ai",
          style: "primary",
        },
      }),
    },
    {
      type: "actions",
      align: "end",
      elements: apiKeyConfigured
        ? [
            {
              type: "button",
              label: "Create form with AI",
              action_id: "new_form_ai",
              style: "primary",
            },
            createFormButton,
          ]
        : [createFormButton],
    },
  ];

  blocks.push({ type: "divider" });
  return blocks;
}

/** Delete confirm dialog for a form card. */
function formDeleteConfirm(
  formName: string,
  subCount: number,
): {
  title: string;
  text: string;
  confirm: string;
  deny: string;
} {
  return {
    title: `Delete "${formName}"?`,
    text:
      subCount === 0
        ? "This form will be permanently deleted."
        : `${subCount} submission${subCount === 1 ? "" : "s"} will be permanently deleted.`,
    confirm: "Delete",
    deny: "Cancel",
  };
}

/**
 * One form card (`empty` block — title, meta, and actions in one bordered container).
 */
export function formCardColumnBlocks(
  formId: string,
  form: {
    name: string;
    handle: string;
    updatedAt: string;
    cardIcon?: string;
    rows: { fields: { type: string }[] }[];
  },
  fieldCount: number,
  subCount: number,
): object[] {
  const subLabel =
    subCount === 0
      ? "No submissions yet"
      : `${subCount} submission${subCount === 1 ? "" : "s"}`;

  const meta = `${form.handle} · ${fieldCount} field${fieldCount === 1 ? "" : "s"} · Updated ${shortDate(form.updatedAt)}`;
  const glyph = resolveFormCardGlyph(form);

  return [
    {
      type: "empty",
      icon: glyph,
      title: form.name,
      description: meta,
      size: "sm",
      actions: [
        {
          type: "button",
          label: subLabel,
          action_id: `subs:${formId}`,
          style: "secondary",
        },
        {
          type: "button",
          label: "Edit",
          action_id: `edit:${formId}`,
          style: "secondary",
        },
        {
          type: "button",
          label: "Delete",
          action_id: `confirm_del:${formId}`,
          style: "danger",
          confirm: formDeleteConfirm(form.name, subCount),
        },
      ],
    },
  ];
}

/** Grid of form cards — up to {@link FORMS_PER_ROW} per row (Block Kit columns max is 3). */
export function formGridBlocks(
  forms: Array<{
    id: string;
    data: {
      name: string;
      handle: string;
      updatedAt: string;
      cardIcon?: string;
      rows: { fields: { type: string }[] }[];
    };
  }>,
  subCountMap: Map<string, number>,
): object[] {
  const rows: object[] = [];
  for (let i = 0; i < forms.length; i += FORMS_PER_ROW) {
    const slice = forms.slice(i, i + FORMS_PER_ROW);
    const columns = slice.map((f) => {
      const fieldCount = f.data.rows.reduce((n, r) => n + r.fields.length, 0);
      const subCount = subCountMap.get(f.id) ?? 0;
      return formCardColumnBlocks(f.id, f.data, fieldCount, subCount);
    });
    // Block Kit requires 2–3 columns per row.
    while (columns.length > 0 && columns.length < 2) {
      columns.push([{ type: "context", text: "\u00a0" }]);
    }
    rows.push({ type: "columns", columns });
  }
  return rows;
}
