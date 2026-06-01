import type { PluginContext } from "emdash";
import { resolveOptionLabels } from "../lib/options";
import { effectiveSpamSettings, getSpamSettings } from "../lib/spam-settings";
import type { StoredForm, StoredSubmission } from "../types";
import { backToFormsButton, pageHeader, sectionHeader, settingsNavButton } from "./layout";

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
            label: "Back",
            action_id: backFormId ? `subs:${backFormId}` : "nav:submissions",
          },
        ],
      },
    ];
  }

  const formData = (await ctx.storage.forms.get(sub.formId)) as StoredForm | null;
  const formTitle = formData?.name ?? sub.formName ?? "Submission";

  const fieldValueItems =
    formData && formData.rows.length > 0
      ? formData.rows.flatMap((r) => r.fields).map((f) => {
          const raw = sub.data[f.handle];
          const value =
            raw === undefined || raw === ""
              ? "—"
              : resolveOptionLabels(formData, f.handle, raw);
          return { label: f.label, value: String(value) };
        })
      : Object.entries(sub.data).map(([k, v]) => ({
          label: k,
          value: Array.isArray(v) ? v.join(", ") : String(v),
        }));

  const briefBlocks: object[] = sub.brief
    ? [
        ...sectionHeader("AI summary"),
        {
          type: "fields",
          fields: [
            { label: "Intent", value: sub.brief.intent },
            { label: "Urgency", value: sub.brief.urgency },
          ],
        },
        { type: "section", text: sub.brief.summary },
        ...(sub.brief.suggestedAction
          ? [
              {
                type: "context",
                text: `Suggested next step: ${sub.brief.suggestedAction}`,
              },
            ]
          : []),
      ]
    : [];

  return [
    ...pageHeader("Submission detail"),
    {
      type: "actions",
      elements: [
        {
          type: "button",
          label: "Back to list",
          action_id: backFormId ? `subs:${backFormId}` : "nav:submissions",
        },
        ...(backFormId
          ? [
              {
                type: "button",
                label: "Edit form",
                action_id: `edit:${backFormId}`,
              },
            ]
          : []),
      ],
    },
    {
      type: "stats",
      items: [
        { label: "Status", value: sub.archived ? "Archived" : "Active" },
        ...(typeof sub.spamScore === "number"
          ? [{ label: "Spam score", value: `${sub.spamScore} / 10` }]
          : []),
      ],
    },
    ...sectionHeader("Submitted answers"),
    {
      type: "table",
      columns: [
        { key: "label", label: "Field" },
        { key: "value", label: "Answer" },
      ],
      rows: fieldValueItems.map((r) => ({ label: r.label, value: r.value })),
    },
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
  const anyScored = subs.some((s) => typeof s.data.spamScore === "number");
  const spamCell = (s: { data: StoredSubmission }) =>
    typeof s.data.spamScore === "number" ? String(s.data.spamScore) : "—";
  const showBriefColumns = subs.some((s) => s.data.brief);
  const intentCell = (s: { data: StoredSubmission }) => s.data.brief?.intent || "—";
  const urgencyCell = (s: { data: StoredSubmission }) => s.data.brief?.urgency || "—";

  const paginationBlocks = (prevCursor?: string): object[] => {
    if (!hasMore && !prevCursor) return [];
    return [
      {
        type: "actions",
        elements: [
          ...(prevCursor
            ? [
                {
                  type: "button",
                  label: "Previous page",
                  action_id: formId
                    ? `subs_prev:${formId}:${prevCursor}`
                    : `all_subs_prev:${prevCursor}`,
                },
              ]
            : []),
          ...(hasMore && nextCursor
            ? [
                {
                  type: "button",
                  label: "Next page",
                  action_id: formId
                    ? `subs_next:${formId}:${nextCursor}`
                    : `all_subs_next:${nextCursor}`,
                },
              ]
            : []),
        ],
      },
    ];
  };

  const detailPicker =
    subs.length > 0
      ? [
          ...sectionHeader("Open submission"),
          {
            type: "form",
            block_id: "view_submission",
            fields: [
              {
                type: "select",
                action_id: "sub_id",
                label: "Which one?",
                options: subs.map((s, i) => ({
                  label: `${new Date(s.data.createdAt).toLocaleString()} — #${i + 1}`,
                  value: s.id,
                })),
              },
            ],
            submit: {
              label: "View full details",
              action_id: `sub_detail:${formId ?? "all"}`,
              style: "primary",
            },
          },
        ]
      : [];

  if (formId) {
    const formData = (await ctx.storage.forms.get(formId)) as StoredForm | null;
    const formFields = formData
      ? formData.rows.flatMap((r) =>
          r.fields.map((f) => ({ handle: f.handle, label: f.label })),
        )
      : [];
    const formTitle = formData ? formData.name : "Form";
    const effective = effectiveSpamSettings(formData, globalSpam);
    const showSpamColumn = effective.enabled || anyScored;

    const columns = [
      ...(showBriefColumns
        ? [
            { key: "_intent", label: "Intent", format: "badge" },
            { key: "_urgency", label: "Urgency", format: "badge" },
          ]
        : []),
      ...formFields.slice(0, 4).map((f) => ({ key: f.handle, label: f.label })),
      ...(formFields.length > 4
        ? [{ key: "_more", label: "More fields", format: "text" as const }]
        : []),
      ...(showSpamColumn ? [{ key: "_spam", label: "Spam", format: "badge" }] : []),
      { key: "_date", label: "When", format: "relative_time" },
    ];

    const rows = subs.map((s) => {
      const extra =
        formFields.length > 4
          ? `+${formFields.length - 4} more`
          : "—";
      return {
        ...(showBriefColumns
          ? { _intent: intentCell(s), _urgency: urgencyCell(s) }
          : {}),
        ...Object.fromEntries(
          formFields.slice(0, 4).map((f) => {
            const raw = s.data.data[f.handle];
            if (raw === undefined || raw === "") return [f.handle, "—"];
            return [
              f.handle,
              formData ? resolveOptionLabels(formData, f.handle, raw) : String(raw),
            ];
          }),
        ),
        ...(formFields.length > 4 ? { _more: extra } : {}),
        ...(showSpamColumn ? { _spam: spamCell(s) } : {}),
        _date: s.data.createdAt,
      };
    });

    return [
      ...pageHeader(`${formTitle} — Submissions`, "Select a submission below to view details."),
      backToFormsButton(),
      {
        type: "actions",
        elements: [
          {
            type: "button",
            label: "Edit this form",
            action_id: `edit:${formId}`,
          },
        ],
      },
      {
        type: "stats",
        items: [
          {
            label: "On this page",
            value: String(subs.length),
            description: `Up to ${PAGE_SIZE} per page`,
          },
        ],
      },
      ...sectionHeader("Inbox"),
      subs.length === 0
        ? {
            type: "empty",
            title: "No submissions yet",
            description:
              "Share your form or embed it on a page. New entries will appear here.",
            size: "base",
          }
        : { type: "table", columns, rows },
      ...paginationBlocks(cursor),
      ...detailPicker,
    ];
  }

  const showSpamColumn = globalSpam.enabled || anyScored;
  const rows = subs.map((s) => ({
    form: s.data.formName ?? s.data.formId,
    ...(showBriefColumns
      ? { _intent: intentCell(s), _urgency: urgencyCell(s) }
      : []),
    preview:
      s.data.brief?.summary?.slice(0, 80) ||
      Object.values(s.data.data)
        .map((v) => (Array.isArray(v) ? v.join(", ") : String(v)))
        .join(" · ")
        .slice(0, 80) ||
      "—",
    ...(showSpamColumn ? { _spam: spamCell(s) } : {}),
    date: s.data.createdAt,
  }));

  return [
    ...pageHeader("All submissions", "Open a form’s submissions for all field columns."),
    { type: "actions", elements: [settingsNavButton()] },
    {
      type: "stats",
      items: [
        {
          label: "On this page",
          value: String(subs.length),
          description: `Up to ${PAGE_SIZE} per page`,
        },
      ],
    },
    ...sectionHeader("Inbox"),
    subs.length === 0
      ? {
          type: "empty",
          title: "No submissions yet",
          description: "When a form receives a response, it will show up here.",
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
            { key: "preview", label: "Preview" },
            ...(showSpamColumn ? [{ key: "_spam", label: "Spam", format: "badge" }] : []),
            { key: "date", label: "When", format: "relative_time" },
          ],
          rows,
        },
    ...paginationBlocks(cursor),
    ...detailPicker,
  ];
}
