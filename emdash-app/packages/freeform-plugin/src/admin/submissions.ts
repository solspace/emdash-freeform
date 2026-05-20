import type { PluginContext } from "emdash";
import { resolveOptionLabels } from "../lib/options";
import { effectiveSpamSettings, getSpamSettings } from "../lib/spam-settings";
import type { StoredForm, StoredSubmission } from "../types";

const PAGE_SIZE = 25;

export async function submissionDetailBlocks(
  submissionId: string,
  backFormId: string | null,
  ctx: PluginContext,
): Promise<object[]> {
  const sub = (await ctx.storage.submissions.get(submissionId)) as StoredSubmission | null;
  if (!sub) {
    return [
      { type: "banner", title: "Submission not found", variant: "error" },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            label: "← Back",
            action_id: backFormId ? `subs:${backFormId}` : "nav:forms",
          },
        ],
      },
    ];
  }

  const formData = (await ctx.storage.forms.get(sub.formId)) as StoredForm | null;
  const formFields = formData
    ? formData.rows.flatMap((r) => r.fields.map((f) => ({ handle: f.handle, label: f.label })))
    : [];

  // Build field value rows, resolving option labels where possible.
  const fieldValueItems = formFields.length > 0
    ? formFields.map((f) => {
        const raw = sub.data[f.handle];
        if (raw === undefined || raw === "") return { label: f.label, value: "—" };
        const resolved = formData ? resolveOptionLabels(formData, f.handle, raw) : String(raw);
        return { label: f.label, value: resolved };
      })
    : Object.entries(sub.data).map(([k, v]) => ({
        label: k,
        value: Array.isArray(v) ? v.join(", ") : String(v),
      }));

  const metaItems: Array<{ label: string; value: string }> = [
    { label: "Submission ID", value: submissionId },
    { label: "Form", value: sub.formName ?? sub.formId },
    { label: "Submitted", value: new Date(sub.createdAt).toLocaleString() },
    { label: "Status", value: sub.archived ? "Archived" : "Active" },
  ];
  if (typeof sub.spamScore === "number") {
    metaItems.push({ label: "Spam score", value: `${sub.spamScore} / 10` });
    if (sub.spamReason) metaItems.push({ label: "Spam reason", value: sub.spamReason });
  }

  const briefBlocks: object[] = sub.brief
    ? [
        { type: "divider" },
        { type: "header", text: "AI Brief" },
        {
          type: "fields",
          fields: [
            { label: "Intent", value: sub.brief.intent },
            { label: "Urgency", value: sub.brief.urgency },
          ],
        },
        { type: "section", text: sub.brief.summary },
        ...(sub.brief.keyFacts.length > 0
          ? [{ type: "section", text: sub.brief.keyFacts.map((f) => `• ${f}`).join("\n") }]
          : []),
        ...(sub.brief.suggestedAction
          ? [{ type: "context", text: `Next step: ${sub.brief.suggestedAction}` }]
          : []),
      ]
    : [];

  return [
    { type: "header", text: "Submission Detail" },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          label: "← Back to Submissions",
          action_id: backFormId ? `subs:${backFormId}` : "nav:forms",
        },
      ],
    },
    { type: "divider" },
    { type: "header", text: "Fields" },
    { type: "fields", fields: fieldValueItems },
    { type: "divider" },
    { type: "header", text: "Metadata" },
    { type: "fields", fields: metaItems },
    ...briefBlocks,
  ];
}

export async function submissionsBlocks(
  formId: string | null,
  ctx: PluginContext,
  cursor?: string,
): Promise<object[]> {
  const where = formId ? { formId } : undefined;
  const { items, cursor: nextCursor, hasMore } = await ctx.storage.submissions.query({
    where,
    orderBy: { createdAt: "desc" },
    limit: PAGE_SIZE,
    cursor,
  });

  const subs = items as Array<{ id: string; data: StoredSubmission }>;
  const globalSpam = await getSpamSettings(ctx);
  // Per-form view uses this form's effective settings to decide column
  // visibility; the all-form view falls back to globals. Either way we still
  // show the column whenever any visible row already has a stored score.
  const anyScored = subs.some((s) => typeof s.data.spamScore === "number");
  const spamCell = (s: { data: StoredSubmission }) =>
    typeof s.data.spamScore === "number" ? String(s.data.spamScore) : "—";
  const spamReasonCell = (s: { data: StoredSubmission }) => s.data.spamReason || "—";

  // AI brief surfaces as Intent + Urgency columns whenever any submission has
  // a generated brief. Both are short strings well-suited to badge format.
  const showBriefColumns = subs.some((s) => s.data.brief);
  const intentCell = (s: { data: StoredSubmission }) => s.data.brief?.intent || "—";
  const urgencyCell = (s: { data: StoredSubmission }) => s.data.brief?.urgency || "—";

  // Pagination nav — only rendered when there are results
  const paginationBlocks = (prevCursor?: string): object[] => {
    if (!hasMore && !prevCursor) return [];
    return [
      {
        type: "actions",
        elements: [
          ...(prevCursor
            ? [{ type: "button", label: "← Prev", action_id: formId ? `subs_prev:${formId}:${prevCursor}` : `all_subs_prev:${prevCursor}` }]
            : []),
          ...(hasMore && nextCursor
            ? [{ type: "button", label: "Next →", action_id: formId ? `subs_next:${formId}:${nextCursor}` : `all_subs_next:${nextCursor}` }]
            : []),
        ],
      },
    ];
  };

  if (formId) {
    const formData = (await ctx.storage.forms.get(formId)) as StoredForm | null;
    const formFields = formData
      ? formData.rows.flatMap((r) =>
          r.fields.map((f) => ({ handle: f.handle, label: f.label })),
        )
      : [];
    const formTitle = formData ? formData.name : formId;
    const effective = effectiveSpamSettings(formData, globalSpam);
    const showSpamColumn = effective.enabled || anyScored;

    const columns = [
      ...(showBriefColumns
        ? [
            { key: "_intent", label: "Intent", format: "badge" },
            { key: "_urgency", label: "Urgency", format: "badge" },
          ]
        : []),
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
      ...(showBriefColumns ? { _intent: intentCell(s), _urgency: urgencyCell(s) } : {}),
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

    const detailSection: object[] =
      subs.length > 0
        ? [
            { type: "divider" },
            {
              type: "form",
              block_id: "view_submission",
              fields: [
                {
                  type: "select",
                  action_id: "sub_id",
                  label: "View submission detail",
                  options: subs.map((s, i) => ({
                    label: `#${i + 1} — ${new Date(s.data.createdAt).toLocaleString()}`,
                    value: s.id,
                  })),
                },
              ],
              submit: { label: "View", action_id: `sub_detail:${formId}` },
            },
          ]
        : [];

    return [
      { type: "header", text: `${formTitle} — Submissions` },
      {
        type: "actions",
        elements: [{ type: "button", label: "← Back to Forms", action_id: "nav:forms" }],
      },
      {
        type: "stats",
        items: [{ label: "Submissions", value: String(subs.length), description: `shown (${PAGE_SIZE} per page)` }],
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
      ...paginationBlocks(cursor),
      ...detailSection,
    ];
  }

  // All-submissions view: per-form fields vary, so collapse to a preview string.
  const showSpamColumn = globalSpam.enabled || anyScored;
  const rows = subs.map((s) => ({
    form: s.data.formName ?? s.data.formId,
    ...(showBriefColumns ? { _intent: intentCell(s), _urgency: urgencyCell(s) } : {}),
    preview:
      s.data.brief?.summary ||
      Object.entries(s.data.data)
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
      items: [{ label: "Submissions", value: String(subs.length), description: `shown (${PAGE_SIZE} per page)` }],
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
            ...(showBriefColumns
              ? [
                  { key: "_intent", label: "Intent", format: "badge" },
                  { key: "_urgency", label: "Urgency", format: "badge" },
                ]
              : []),
            { key: "preview", label: showBriefColumns ? "Brief" : "Submission" },
            ...(showSpamColumn ? [{ key: "_spam", label: "Spam", format: "badge" }] : []),
            { key: "date", label: "Submitted", format: "relative_time" },
          ],
          rows,
        },
    ...paginationBlocks(cursor),
  ];
}
