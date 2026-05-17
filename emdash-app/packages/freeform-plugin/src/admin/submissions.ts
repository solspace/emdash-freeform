import type { PluginContext } from "emdash";
import { resolveOptionLabels } from "../lib/options";
import { getSpamSettings } from "../lib/spam-settings";
import type { StoredForm, StoredSubmission } from "../types";

export async function submissionsBlocks(
  formId: string | null,
  ctx: PluginContext,
): Promise<object[]> {
  const where = formId ? { formId } : undefined;
  const { items } = await ctx.storage.submissions.query({
    where,
    orderBy: { createdAt: "desc" },
    limit: 50,
  });

  const subs = items as Array<{ id: string; data: StoredSubmission }>;
  const spam = await getSpamSettings(ctx);
  // Show spam columns when scoring is enabled OR any visible row already has a
  // stored score (e.g. legacy rows scored before scoring was disabled again).
  const showSpamColumn =
    spam.enabled || subs.some((s) => typeof s.data.spamScore === "number");
  const spamCell = (s: { data: StoredSubmission }) =>
    typeof s.data.spamScore === "number" ? String(s.data.spamScore) : "—";
  const spamReasonCell = (s: { data: StoredSubmission }) => s.data.spamReason || "—";

  if (formId) {
    const formData = (await ctx.storage.forms.get(formId)) as StoredForm | null;
    const formFields = formData
      ? formData.rows.flatMap((r) =>
          r.fields.map((f) => ({ handle: f.handle, label: f.label })),
        )
      : [];
    const formTitle = formData ? formData.name : formId;

    const columns = [
      ...formFields.map((f) => ({ key: f.handle, label: f.label })),
      ...(showSpamColumn
        ? [
            { key: "_spam", label: "Spam", format: "badge" },
            { key: "_spam_reason", label: "Reason" },
          ]
        : []),
      { key: "_date", label: "Submitted", format: "relative_time" },
    ];

    const rows = subs.map((s) => ({
      ...Object.fromEntries(
        formFields.map((f) => {
          const raw = s.data.data[f.handle];
          if (raw === undefined || raw === "") return [f.handle, "—"];
          return [f.handle, formData ? resolveOptionLabels(formData, f.handle, raw) : String(raw)];
        }),
      ),
      ...(showSpamColumn ? { _spam: spamCell(s), _spam_reason: spamReasonCell(s) } : {}),
      _date: s.data.createdAt,
    }));

    return [
      { type: "header", text: `${formTitle} — Submissions` },
      {
        type: "actions",
        elements: [{ type: "button", label: "← Back to Forms", action_id: "nav:forms" }],
      },
      {
        type: "stats",
        items: [{ label: "Submissions", value: String(subs.length), description: "shown" }],
      },
      { type: "divider" },
      subs.length === 0
        ? {
            type: "empty",
            title: "No submissions yet",
            description: "This form has not received any submissions.",
            size: "base",
          }
        : { type: "table", columns, rows },
    ];
  }

  // All-submissions view: per-form fields vary, so collapse to a preview string.
  // Labels aren't resolved here — the per-form view shows resolved labels.
  const rows = subs.map((s) => ({
    form: s.data.formName ?? s.data.formId,
    preview: Object.entries(s.data.data)
      .map(([k, v]) => {
        const flat = Array.isArray(v) ? v.join(", ") : String(v);
        return `${k}: ${flat.slice(0, 40)}`;
      })
      .join("  ·  "),
    ...(showSpamColumn ? { _spam: spamCell(s) } : {}),
    date: s.data.createdAt,
  }));

  return [
    { type: "header", text: "All Submissions" },
    {
      type: "actions",
      elements: [{ type: "button", label: "← Back to Forms", action_id: "nav:forms" }],
    },
    {
      type: "stats",
      items: [{ label: "Submissions", value: String(subs.length), description: "shown" }],
    },
    { type: "divider" },
    subs.length === 0
      ? {
          type: "empty",
          title: "No submissions yet",
          description: "No forms have received any submissions yet.",
          size: "base",
        }
      : {
          type: "table",
          columns: [
            { key: "form", label: "Form", format: "badge" },
            { key: "preview", label: "Submission" },
            ...(showSpamColumn ? [{ key: "_spam", label: "Spam", format: "badge" }] : []),
            { key: "date", label: "Submitted", format: "relative_time" },
          ],
          rows,
        },
  ];
}
