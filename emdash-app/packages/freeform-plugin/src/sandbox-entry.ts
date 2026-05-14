import { definePlugin, PluginRouteError } from "emdash";
import type { PluginContext } from "emdash";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type FieldType = "text" | "email" | "textarea" | "number" | "phone";

interface FormField {
  id: string;
  type: FieldType;
  label: string;
  handle: string;
  required: boolean;
  placeholder?: string;
}

interface FormRow {
  id: string;
  fields: FormField[];
}

interface StoredForm {
  name: string;
  rows: FormRow[];
  successMessage: string;
  createdAt: string;
  updatedAt: string;
}

interface StoredSubmission {
  formId: string;
  formName: string;
  data: Record<string, string>;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

// Hardcoded for PoC — in production, proxy through Solspace license server
const ANTHROPIC_API_KEY =
  "REDACTED";

const ALL_FIELD_TYPES: FieldType[] = ["text", "email", "textarea", "number", "phone"];
const FREE_FIELD_TYPES: FieldType[] = ["text", "textarea", "number", "phone"];

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

function toHandle(label: string): string {
  return (
    label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") || "field"
  );
}

async function getTier(ctx: PluginContext): Promise<"free" | "pro"> {
  return (await ctx.kv.get<string>("license:tier")) === "pro" ? "pro" : "free";
}

// PoC validation: any key starting with "FF-" and ≥ 8 chars is "Pro"
function isValidKey(key: string): boolean {
  const k = key.trim().toUpperCase();
  return k.startsWith("FF-") && k.length >= 8;
}

// ─────────────────────────────────────────────────────────────
// AI form generation
// ─────────────────────────────────────────────────────────────

async function generateWithAI(
  description: string,
  tier: "free" | "pro",
  ctx: PluginContext
): Promise<FormRow[]> {
  const allowed = tier === "pro" ? ALL_FIELD_TYPES : FREE_FIELD_TYPES;

  const res = await ctx.http!.fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      tools: [
        {
          name: "build_form",
          description:
            "Converts a plain-English form description into a structured schema. " +
            "Each row contains one or more fields displayed side-by-side on the same line.",
          input_schema: {
            type: "object",
            required: ["rows"],
            properties: {
              rows: {
                type: "array",
                description: "Rows of the form. Fields within a row are shown side-by-side.",
                items: {
                  type: "object",
                  required: ["fields"],
                  properties: {
                    fields: {
                      type: "array",
                      minItems: 1,
                      maxItems: 3,
                      items: {
                        type: "object",
                        required: ["type", "label", "handle", "required"],
                        properties: {
                          type: { type: "string", enum: allowed },
                          label: { type: "string" },
                          handle: {
                            type: "string",
                            description: "snake_case identifier derived from label",
                          },
                          required: { type: "boolean" },
                          placeholder: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      ],
      tool_choice: { type: "tool", name: "build_form" },
      messages: [
        {
          role: "user",
          content:
            `Build a web form for: "${description}". ` +
            `Available field types: ${allowed.join(", ")}. ` +
            `IMPORTANT: only use the listed field types. If the description requests a field type that is not available (e.g. email on the free plan), omit that field entirely — do not substitute it with a different type.`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    content: Array<{
      type: string;
      input: {
        rows: Array<{
          fields: Array<{
            type: FieldType;
            label: string;
            handle: string;
            required: boolean;
            placeholder?: string;
          }>;
        }>;
      };
    }>;
  };

  const toolUse = json.content.find((c) => c.type === "tool_use");
  if (!toolUse?.input?.rows) throw new Error("Unexpected AI response format");

  return toolUse.input.rows.map((row) => ({
    id: uid(),
    fields: row.fields.map((f) => ({
      id: uid(),
      type: f.type,
      label: f.label,
      handle: f.handle || toHandle(f.label),
      required: f.required ?? false,
      placeholder: f.placeholder,
    })),
  }));
}

// ─────────────────────────────────────────────────────────────
// Block Kit renderers
// ─────────────────────────────────────────────────────────────

async function listPageBlocks(ctx: PluginContext): Promise<object[]> {
  const tier = await getTier(ctx);
  const { items: forms } = await ctx.storage.forms.query({
    orderBy: { createdAt: "desc" },
  });
  const totalSubs = await ctx.storage.submissions.count();

  const formItems = forms as Array<{ id: string; data: StoredForm }>;

  const formBlocks =
    formItems.length === 0
      ? [
          {
            type: "section",
            text: "No forms yet. Click **+ New Form** to build your first form.",
          },
        ]
      : formItems.flatMap((f) => {
          const fieldCount = f.data.rows.reduce((n, r) => n + r.fields.length, 0);
          return [
            {
              type: "section",
              text: `**${f.data.name}** — ${fieldCount} field${fieldCount !== 1 ? "s" : ""}`,
              accessory: {
                type: "button",
                label: "Edit",
                action_id: `edit:${f.id}`,
                style: "primary",
              },
            },
            {
              type: "actions",
              elements: [
                { type: "button", label: "Submissions", action_id: `subs:${f.id}` },
                {
                  type: "button",
                  label: "Delete",
                  action_id: `del:${f.id}`,
                  style: "danger",
                  confirm: {
                    title: "Delete this form?",
                    text: "All submissions will also be permanently deleted.",
                    confirm: "Delete",
                    deny: "Cancel",
                  },
                },
              ],
            },
            { type: "divider" },
          ];
        });

  return [
    { type: "header", text: "Freeform" },
    {
      type: "stats",
      items: [
        { label: "Forms", value: String(formItems.length) },
        { label: "Total Submissions", value: String(totalSubs) },
        { label: "Plan", value: tier === "pro" ? "Pro ✓" : "Free" },
      ],
    },
    tier === "free"
      ? {
          type: "banner",
          title: "Free Plan",
          description:
            "Email fields are locked. Add a license key in Settings to unlock Pro features.",
          variant: "default",
        }
      : {
          type: "banner",
          title: "Pro Plan Active",
          description: "All field types and features are unlocked.",
          variant: "default",
        },
    {
      type: "actions",
      elements: [
        { type: "button", label: "+ New Form", action_id: "new_form", style: "primary" },
        { type: "button", label: "⚙ Settings", action_id: "nav:settings" },
        { type: "button", label: "All Submissions", action_id: "nav:all_subs" },
      ],
    },
    { type: "divider" },
    ...formBlocks,
  ];
}

async function editorBlocks(
  formId: string,
  ctx: PluginContext,
  showAddField = false
): Promise<object[]> {
  const tier = await getTier(ctx);
  const formData = (await ctx.storage.forms.get(formId)) as StoredForm | null;

  if (!formData) {
    return [
      { type: "banner", title: "Form not found", variant: "error" },
      {
        type: "actions",
        elements: [{ type: "button", label: "← Back", action_id: "nav:forms" }],
      },
    ];
  }

  // Flatten for display, keeping row/column metadata
  const flatFields = formData.rows.flatMap((row, rowIdx) =>
    row.fields.map((field, colIdx) => ({ ...field, rowId: row.id, rowIdx, colIdx }))
  );

  const fieldBlocks =
    flatFields.length === 0
      ? [
          {
            type: "section",
            text: "_No fields yet. Use AI to generate them, or add manually below._",
          },
        ]
      : flatFields.flatMap((f, i) => {
          const isEmailLocked = f.type === "email" && tier === "free";
          return [
            {
              type: "section",
              text:
                `${isEmailLocked ? "🔒 " : ""}**${f.label}** \`${f.type}\`` +
                `${f.required ? " _(required)_" : ""} — Row ${f.rowIdx + 1}, Col ${f.colIdx + 1}`,
              accessory: {
                type: "button",
                label: "Remove",
                action_id: `rm:${formId}:${f.id}`,
                style: "danger",
              },
            },
            ...(i > 0 || i < flatFields.length - 1
              ? [
                  {
                    type: "actions",
                    elements: [
                      ...(i > 0
                        ? [{ type: "button", label: "↑ Up", action_id: `up:${formId}:${f.id}` }]
                        : []),
                      ...(i < flatFields.length - 1
                        ? [{ type: "button", label: "↓ Down", action_id: `dn:${formId}:${f.id}` }]
                        : []),
                    ],
                  },
                ]
              : []),
          ];
        });

  const addFieldSection = showAddField
    ? [
        { type: "divider" },
        { type: "header", text: "Add Field" },
        ...(tier === "free"
          ? [
              {
                type: "banner",
                description:
                  "Email fields require Pro. Enter a license key in Settings to unlock them.",
                variant: "default",
              },
            ]
          : []),
        {
          type: "form",
          block_id: "add_field",
          fields: [
            {
              type: "select",
              action_id: "field_type",
              label: "Field Type",
              options: (tier === "pro" ? ALL_FIELD_TYPES : FREE_FIELD_TYPES).map((t) => ({
                label: t.charAt(0).toUpperCase() + t.slice(1),
                value: t,
              })),
              initial_value: "text",
            },
            {
              type: "text_input",
              action_id: "field_label",
              label: "Label",
              placeholder: "e.g. First Name",
            },
            {
              type: "text_input",
              action_id: "field_handle",
              label: "Handle (optional)",
              placeholder: "auto-generated from label",
            },
            {
              type: "toggle",
              action_id: "field_required",
              label: "Required",
              initial_value: false,
            },
            {
              type: "select",
              action_id: "field_row",
              label: "Add to",
              options: [
                { label: "New row", value: "new" },
                ...formData.rows.map((r, i) => ({
                  label: `Row ${i + 1} (alongside: ${r.fields.map((f) => f.label).join(", ")})`,
                  value: r.id,
                })),
              ],
              initial_value: "new",
            },
          ],
          submit: { label: "Add Field", action_id: `add:${formId}` },
        },
        {
          type: "actions",
          elements: [
            { type: "button", label: "Cancel", action_id: `cancel_add:${formId}` },
          ],
        },
      ]
    : [
        {
          type: "actions",
          elements: [
            {
              type: "button",
              label: "+ Add Field",
              action_id: `show_add:${formId}`,
              style: "primary",
            },
          ],
        },
      ];

  return [
    { type: "header", text: `Editing: ${formData.name}` },
    {
      type: "actions",
      elements: [{ type: "button", label: "← Back to Forms", action_id: "nav:forms" }],
    },
    { type: "context", text: `Form ID: \`${formId}\` — use this in \`<FreeformForm formId="${formId}" />\`` },
    { type: "divider" },
    {
      type: "form",
      block_id: "rename",
      fields: [
        {
          type: "text_input",
          action_id: "name",
          label: "Form Name",
          initial_value: formData.name,
        },
      ],
      submit: { label: "Save Name", action_id: `rename:${formId}` },
    },
    { type: "divider" },
    { type: "header", text: "✨ AI Form Builder" },
    {
      type: "section",
      text: "Describe fields to add. AI will append them to your existing fields.",
    },
    ...(tier === "free"
      ? [
          {
            type: "context",
            text: "Free plan: email field type will not be generated. Upgrade to Pro to include email fields.",
          },
        ]
      : []),
    {
      type: "form",
      block_id: "ai_gen",
      fields: [
        {
          type: "text_input",
          action_id: "description",
          label: "Describe your form",
          placeholder:
            'e.g. "First name and last name side by side, then email on the next row, then a message box"',
        },
      ],
      submit: { label: "✨ Generate with AI", action_id: `ai:${formId}` },
    },
    { type: "divider" },
    { type: "header", text: "Form Fields" },
    ...fieldBlocks,
    ...addFieldSection,
  ];
}

async function settingsBlocks(ctx: PluginContext): Promise<object[]> {
  const tier = await getTier(ctx);
  const storedKey = (await ctx.kv.get<string>("license:key")) ?? "";
  const maskedKey = storedKey
    ? storedKey.slice(0, 3) + "•".repeat(Math.max(0, storedKey.length - 3))
    : "";

  return [
    { type: "header", text: "Freeform — Settings" },
    {
      type: "actions",
      elements: [{ type: "button", label: "← Back to Forms", action_id: "nav:forms" }],
    },
    { type: "divider" },
    {
      type: "stats",
      items: [
        { label: "Current Plan", value: tier === "pro" ? "Pro" : "Free" },
        { label: "Email Fields", value: tier === "pro" ? "Unlocked ✓" : "Locked 🔒" },
      ],
    },
    tier === "pro"
      ? {
          type: "banner",
          title: "Pro license active",
          description: `Key on file: ${maskedKey}. All features are unlocked.`,
          variant: "default",
        }
      : {
          type: "banner",
          title: "Free Plan",
          description:
            'Enter your Freeform license key to unlock Pro features including email fields. ' +
            'For this demo, any key starting with "FF-" (e.g. FF-DEMO-1234) will activate Pro.',
          variant: "default",
        },
    { type: "divider" },
    { type: "header", text: "License Key" },
    {
      type: "form",
      block_id: "license",
      fields: [
        {
          type: "secret_input",
          action_id: "key",
          label: "License Key",
          placeholder: "FF-XXXX-XXXX-XXXX",
        },
      ],
      submit: { label: "Validate & Save", action_id: "save_license" },
    },
    ...(storedKey
      ? [
          {
            type: "actions",
            elements: [
              {
                type: "button",
                label: "Remove License Key",
                action_id: "remove_license",
                style: "danger",
                confirm: {
                  title: "Remove license key?",
                  text: "You will be reverted to the free plan and email fields will be locked.",
                  confirm: "Remove",
                  deny: "Cancel",
                },
              },
            ],
          },
        ]
      : []),
  ];
}

async function submissionsBlocks(
  formId: string | null,
  ctx: PluginContext
): Promise<object[]> {
  const where = formId ? { formId } : undefined;
  const { items } = await ctx.storage.submissions.query({
    where,
    orderBy: { createdAt: "desc" },
    limit: 50,
  });

  const subs = items as Array<{ id: string; data: StoredSubmission }>;

  const rows = subs.map((s) => {
    const preview = Object.entries(s.data.data)
      .map(([k, v]) => `${k}: ${String(v).slice(0, 30)}`)
      .join(" | ");
    return {
      form: s.data.formName ?? s.data.formId,
      data: preview,
      date: new Date(s.data.createdAt).toLocaleDateString(),
    };
  });

  return [
    { type: "header", text: formId ? "Form Submissions" : "All Submissions" },
    {
      type: "actions",
      elements: [{ type: "button", label: "← Back to Forms", action_id: "nav:forms" }],
    },
    { type: "stats", items: [{ label: "Showing", value: String(subs.length) }] },
    { type: "divider" },
    subs.length === 0
      ? { type: "section", text: "No submissions yet." }
      : {
          type: "table",
          columns: [
            { key: "form", label: "Form" },
            { key: "data", label: "Data" },
            { key: "date", label: "Date" },
          ],
          rows,
        },
  ];
}

// ─────────────────────────────────────────────────────────────
// Field manipulation helpers
// ─────────────────────────────────────────────────────────────

function flattenFields(rows: FormRow[]): Array<FormField & { rowId: string }> {
  return rows.flatMap((row) => row.fields.map((f) => ({ ...f, rowId: row.id })));
}

function rebuildRows(flat: Array<FormField & { rowId: string }>): FormRow[] {
  const order: string[] = [];
  const map = new Map<string, FormField[]>();
  for (const f of flat) {
    if (!map.has(f.rowId)) {
      order.push(f.rowId);
      map.set(f.rowId, []);
    }
    const { rowId: _rid, ...field } = f;
    map.get(f.rowId)!.push(field);
  }
  return order
    .map((id) => ({ id, fields: map.get(id)! }))
    .filter((r) => r.fields.length > 0);
}

function moveField(rows: FormRow[], fieldId: string, dir: "up" | "down"): FormRow[] {
  const flat = flattenFields(rows);
  const idx = flat.findIndex((f) => f.id === fieldId);
  if (idx < 0) return rows;
  const target = dir === "up" ? idx - 1 : idx + 1;
  if (target < 0 || target >= flat.length) return rows;

  const moved = [...flat];
  // When crossing a row boundary, move the field into the adjacent row
  if (moved[idx].rowId !== moved[target].rowId) {
    moved[idx] = { ...moved[idx], rowId: moved[target].rowId };
  }
  [moved[idx], moved[target]] = [moved[target], moved[idx]];
  return rebuildRows(moved);
}

function removeField(rows: FormRow[], fieldId: string): FormRow[] {
  return rows
    .map((r) => ({ ...r, fields: r.fields.filter((f) => f.id !== fieldId) }))
    .filter((r) => r.fields.length > 0);
}

// ─────────────────────────────────────────────────────────────
// Plugin definition
// ─────────────────────────────────────────────────────────────

export default definePlugin({
  hooks: {
    "plugin:install": {
      handler: async (_event: unknown, ctx: PluginContext) => {
        await ctx.kv.set("license:tier", "free");

        // Seed a demo contact form on install
        const contactForm: StoredForm = {
          name: "Contact Us",
          rows: [
            {
              id: uid(),
              fields: [
                {
                  id: uid(),
                  type: "text",
                  label: "First Name",
                  handle: "first_name",
                  required: true,
                  placeholder: "Jane",
                },
                {
                  id: uid(),
                  type: "text",
                  label: "Last Name",
                  handle: "last_name",
                  required: false,
                  placeholder: "Smith",
                },
              ],
            },
            {
              id: uid(),
              fields: [
                {
                  id: uid(),
                  type: "text",
                  label: "Subject",
                  handle: "subject",
                  required: true,
                },
              ],
            },
            {
              id: uid(),
              fields: [
                {
                  id: uid(),
                  type: "textarea",
                  label: "Message",
                  handle: "message",
                  required: true,
                  placeholder: "How can we help you?",
                },
              ],
            },
          ],
          successMessage: "Thank you! We'll be in touch shortly.",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await ctx.storage.forms.put("contact", contactForm);
        ctx.log.info("Freeform installed with demo contact form");
      },
    },
  },

  routes: {
    // ───────────────────────────────
    // Block Kit admin route
    // ───────────────────────────────
    admin: {
      handler: async (routeCtx: any, ctx: PluginContext) => {
        const interaction = routeCtx.input as {
          type: string;
          page?: string;
          action_id?: string;
          values?: Record<string, unknown>;
          widget_id?: string;
        };

        const { type, page } = interaction;
        const actionId = interaction.action_id ?? "";
        const values = interaction.values ?? {};

        // Page loads (widget sends page_load with page: "widget:<id>")
        if (type === "page_load") {
          if (page?.startsWith("widget:")) {
            const tier = await getTier(ctx);
            const { items: forms } = await ctx.storage.forms.query({});
            const totalSubs = await ctx.storage.submissions.count();
            return {
              blocks: [
                {
                  type: "stats",
                  items: [
                    { label: "Forms", value: String(forms.length) },
                    { label: "Submissions", value: String(totalSubs) },
                    { label: "Plan", value: tier === "pro" ? "Pro ✓" : "Free" },
                  ],
                },
              ],
            };
          }
          if (page === "/settings") return { blocks: await settingsBlocks(ctx) };
          if (page === "/submissions") return { blocks: await submissionsBlocks(null, ctx) };
          return { blocks: await listPageBlocks(ctx) };
        }

        // Navigation buttons
        if (actionId === "nav:forms") return { blocks: await listPageBlocks(ctx) };
        if (actionId === "nav:settings") return { blocks: await settingsBlocks(ctx) };
        if (actionId === "nav:all_subs") return { blocks: await submissionsBlocks(null, ctx) };

        // Create new form
        if (actionId === "new_form") {
          const id = uid();
          await ctx.storage.forms.put(id, {
            name: "New Form",
            rows: [],
            successMessage: "Thank you for your submission!",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as StoredForm);
          return { blocks: await editorBlocks(id, ctx) };
        }

        // Edit form
        if (actionId.startsWith("edit:")) {
          return { blocks: await editorBlocks(actionId.slice(5), ctx) };
        }

        // Delete form + its submissions
        if (actionId.startsWith("del:")) {
          const fid = actionId.slice(4);
          await ctx.storage.forms.delete(fid);
          const { items: subs } = await ctx.storage.submissions.query({
            where: { formId: fid },
            limit: 1000,
          });
          for (const s of subs as Array<{ id: string }>) {
            await ctx.storage.submissions.delete(s.id);
          }
          return {
            blocks: await listPageBlocks(ctx),
            toast: { message: "Form deleted", type: "success" },
          };
        }

        // View submissions for a specific form
        if (actionId.startsWith("subs:")) {
          return { blocks: await submissionsBlocks(actionId.slice(5), ctx) };
        }

        // Rename form
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

        // Show / cancel add-field form
        if (actionId.startsWith("show_add:")) {
          return { blocks: await editorBlocks(actionId.slice(9), ctx, true) };
        }
        if (actionId.startsWith("cancel_add:")) {
          return { blocks: await editorBlocks(actionId.slice(11), ctx) };
        }

        // Add a field
        if (actionId.startsWith("add:")) {
          const fid = actionId.slice(4);
          const tier = await getTier(ctx);
          const form = (await ctx.storage.forms.get(fid)) as StoredForm | null;
          if (!form) return { blocks: await listPageBlocks(ctx) };

          const fieldType = ((values.field_type as string) ?? "text") as FieldType;

          // ── License gate: email requires Pro ──────────────────
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
          const handle =
            ((values.field_handle as string) ?? "").trim() || toHandle(label);
          const required = (values.field_required as boolean) ?? false;
          const rowTarget = (values.field_row as string) ?? "new";

          const newField: FormField = { id: uid(), type: fieldType, label, handle, required };
          let rows = [...form.rows];

          if (rowTarget === "new" || rows.length === 0) {
            rows.push({ id: uid(), fields: [newField] });
          } else {
            rows = rows.map((r) =>
              r.id === rowTarget ? { ...r, fields: [...r.fields, newField] } : r
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

        // Remove a field
        if (actionId.startsWith("rm:")) {
          const [, fid, fieldId] = actionId.split(":");
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

        // Move field up or down
        if (actionId.startsWith("up:") || actionId.startsWith("dn:")) {
          const dir = actionId.startsWith("up:") ? "up" : "down";
          const [, fid, fieldId] = actionId.split(":");
          const form = (await ctx.storage.forms.get(fid)) as StoredForm | null;
          if (!form) return { blocks: await listPageBlocks(ctx) };
          await ctx.storage.forms.put(fid, {
            ...form,
            rows: moveField(form.rows, fieldId, dir),
            updatedAt: new Date().toISOString(),
          });
          return { blocks: await editorBlocks(fid, ctx) };
        }

        // AI generate
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

          // Gate: block AI generation if free tier and description mentions email
          if (tier === "free" && /\bemail\b/i.test(description)) {
            return {
              blocks: await editorBlocks(fid, ctx),
              toast: {
                message: "Email fields require a Pro license. Remove 'email' from your description or upgrade in Settings.",
                type: "error",
              },
            };
          }

          try {
            const newRows = await generateWithAI(description, tier, ctx);
            const rows = [...form.rows, ...newRows];
            const fieldCount = newRows.reduce((n, r) => n + r.fields.length, 0);
            await ctx.storage.forms.put(fid, {
              ...form,
              rows,
              updatedAt: new Date().toISOString(),
            });
            return {
              blocks: await editorBlocks(fid, ctx),
              toast: {
                message: `Added ${fieldCount} field${fieldCount !== 1 ? "s" : ""} across ${newRows.length} new row${newRows.length !== 1 ? "s" : ""}`,
                type: "success",
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

        // Save license key
        if (actionId === "save_license") {
          const key = ((values.key as string) ?? "").trim();
          if (!key) {
            return {
              blocks: await settingsBlocks(ctx),
              toast: { message: "Please enter a license key", type: "error" },
            };
          }
          if (isValidKey(key)) {
            await ctx.kv.set("license:key", key);
            await ctx.kv.set("license:tier", "pro");
            return {
              blocks: await settingsBlocks(ctx),
              toast: {
                message: "Pro license activated! Email fields are now unlocked.",
                type: "success",
              },
            };
          }
          return {
            blocks: await settingsBlocks(ctx),
            toast: {
              message: 'Invalid key. For this demo any key starting with "FF-" activates Pro.',
              type: "error",
            },
          };
        }

        // Remove license key
        if (actionId === "remove_license") {
          await ctx.kv.set("license:key", "");
          await ctx.kv.set("license:tier", "free");
          return {
            blocks: await settingsBlocks(ctx),
            toast: { message: "License removed. Reverted to free plan.", type: "info" },
          };
        }

        // Fallback
        return { blocks: await listPageBlocks(ctx) };
      },
    },

    // ───────────────────────────────
    // Public: fetch form config for frontend rendering
    // ───────────────────────────────
    "get-form": {
      public: true,
      handler: async (routeCtx: any, ctx: PluginContext) => {
        const id = new URL(routeCtx.request.url).searchParams.get("id");
        if (!id) throw PluginRouteError.badRequest("Missing ?id=");
        let resolvedId = id;
        let formData = (await ctx.storage.forms.get(id)) as StoredForm | null;
        if (!formData) {
          // Fall back to name-based lookup so "contact" matches a form named "Contact Us"
          const { items } = await ctx.storage.forms.query({ orderBy: { createdAt: "asc" } });
          const match = (items as Array<{ id: string; data: StoredForm }>).find(
            (f) => f.data.name.toLowerCase().replace(/\s+/g, "-") === id.toLowerCase() ||
                   f.data.name.toLowerCase() === id.toLowerCase()
          );
          if (match) { resolvedId = match.id; formData = match.data; }
        }
        if (!formData) throw PluginRouteError.notFound(`Form "${id}" not found`);
        return { id: resolvedId, ...formData };
      },
    },

    // ───────────────────────────────
    // Public: handle frontend form submission
    // ───────────────────────────────
    submit: {
      public: true,
      handler: async (routeCtx: any, ctx: PluginContext) => {
        const body = routeCtx.input as Record<string, unknown>;
        const { formId, ...rawData } = body;

        if (!formId || typeof formId !== "string") {
          return { success: false, error: "Missing formId" };
        }

        const formData = (await ctx.storage.forms.get(formId)) as StoredForm | null;
        if (!formData) {
          return { success: false, error: "Form not found" };
        }

        const submission: StoredSubmission = {
          formId,
          formName: formData.name,
          data: Object.fromEntries(
            Object.entries(rawData).map(([k, v]) => [k, String(v)])
          ),
          createdAt: new Date().toISOString(),
        };

        await ctx.storage.submissions.put(uid(), submission);

        return {
          success: true,
          message: formData.successMessage || "Thank you for your submission!",
        };
      },
    },
  },
});
