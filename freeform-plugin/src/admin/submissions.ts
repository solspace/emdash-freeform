import type { PluginContext } from "emdash";
import { resolveOptionLabels } from "../lib/options";
import { effectiveSpamSettings, getSpamSettings } from "../lib/spam-settings";
import type { StoredForm, StoredSubmission } from "../types";
import {
  backToFormsButton,
  freeformNavBlocks,
  pageHeader,
  sectionHeader,
} from "./layout";

const PAGE_SIZE = 25;
const PREVIEW_FIELD_LIMIT = 2;

function submissionRef(index: number): string {
  return `#${index + 1}`;
}

function previewValue(value: unknown, maxLength = 80): string {
  const text = Array.isArray(value) ? value.join(", ") : String(value ?? "");

  if (!text.trim()) return "—";

  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}…` : text;
}

function visibleSubmissionFields(
  sub: StoredSubmission,
  formData: StoredForm | null,
  limit = PREVIEW_FIELD_LIMIT,
): Array<{ label: string; value: string }> {
  if (formData && formData.rows.length > 0) {
    const fields = formData.rows.flatMap((r) => r.fields);

    return fields
      .map((field) => {
        const raw = sub.data[field.handle];

        if (raw === undefined || raw === "") {
          return null;
        }

        return {
          label: field.label,
          value: previewValue(resolveOptionLabels(formData, field.handle, raw)),
        };
      })
      .filter((field): field is { label: string; value: string } => Boolean(field))
      .slice(0, limit);
  }

  return Object.entries(sub.data)
    .filter(([, value]) => value !== undefined && value !== "")
    .slice(0, limit)
    .map(([key, value]) => ({
      label: key,
      value: previewValue(value),
    }));
}

function moreFieldsLabel(
  sub: StoredSubmission,
  formData: StoredForm | null,
  shownCount: number,
): string | null {
  const total = formData
    ? formData.rows.flatMap((r) => r.fields).length
    : Object.keys(sub.data).length;

  const remaining = Math.max(total - shownCount, 0);

  return remaining > 0 ? `+${remaining} more` : null;
}

export async function submissionDetailBlocks(
  submissionId: string,
  backFormId: string | null,
  ctx: PluginContext,
  submissionLabel?: string,
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

  const submissionTitle = submissionLabel
  ? `Submission ${submissionLabel}`
  : `Submission ${submissionId.slice(0, 8)}`;

  const formData = (await ctx.storage.forms.get(sub.formId)) as StoredForm | null;

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
    ...pageHeader(submissionTitle),
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
    ...sectionHeader("Submission Data"),
    {
      type: "table",
      columns: [
        { key: "label", label: "Field" },
        { key: "value", label: "Value" },
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

  const showBriefFields = subs.some((s) => s.data.brief);

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

  if (formId) {
    const formData = (await ctx.storage.forms.get(formId)) as StoredForm | null;
    const formTitle = formData ? formData.name : "Form";
    const effective = effectiveSpamSettings(formData, globalSpam);
    const showSpamField = effective.enabled || anyScored;

    return [
      ...pageHeader(
        `${formTitle} — Submissions`,
        "Select a submission below to view details.",
      ),
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
      ...(subs.length === 0
        ? [
            {
              type: "empty",
              title: "No submissions yet",
              description:
                "Share your form or embed it on a page. New entries will appear here.",
              size: "base",
            },
          ]
        : subs.flatMap((s, i) => {
            const visibleFields = visibleSubmissionFields(s.data, formData);
            const moreFields = moreFieldsLabel(s.data, formData, visibleFields.length);

            return [
              {
                type: "fields",
                fields: [
                  { label: "Submission ID", value: submissionRef(i) },
                  { label: "Record ID", value: s.id },
                  {
                    label: "When",
                    value: new Date(s.data.createdAt).toLocaleString(),
                  },
                  ...visibleFields,
                  ...(moreFields
                    ? [{ label: "More fields", value: moreFields }]
                    : []),
                ],
              },
              {
                type: "actions",
                elements: [
                  {
                    type: "button",
                    label: `View Submission`,
                    action_id: `sub_view:${formId}:${s.id}:${i + 1}`,
                    style: "primary",
                  },
                ],
              },
              { type: "divider" },
            ];
          })),
      ...paginationBlocks(cursor),
    ];
  }

  const showSpamField = globalSpam.enabled || anyScored;

  return [
    ...(await freeformNavBlocks(ctx, "submissions")),
    ...pageHeader("All submissions", "Open a form’s submissions for all field columns."),
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
    ...(subs.length === 0
      ? [
          {
            type: "empty",
            title: "No submissions yet",
            description: "When a form receives a response, it will show up here.",
            size: "base",
          },
        ]
      : await Promise.all(
          subs.map(async (s, i) => {
            const formData = (await ctx.storage.forms.get(
              s.data.formId,
            )) as StoredForm | null;
            const visibleFields = visibleSubmissionFields(s.data, formData);
            const moreFields = moreFieldsLabel(s.data, formData, visibleFields.length);

            return [
              {
                type: "fields",
                fields: [
                  { label: "Submission ID", value: submissionRef(i) },
                  { label: "Record ID", value: s.id },
                  { label: "Form", value: s.data.formName ?? s.data.formId },
                  {
                    label: "When",
                    value: new Date(s.data.createdAt).toLocaleString(),
                  },
                  ...visibleFields,
                  ...(moreFields
                    ? [{ label: "More fields", value: moreFields }]
                    : []),
                ],
              },
              {
                type: "actions",
                elements: [
                  {
                    type: "button",
                    label: `View Submission`,
                    action_id: `sub_view:all:${s.id}:${i + 1}`,
                    style: "primary",
                  },
                ],
              },
              { type: "divider" },
            ];
          }),
        ).then((blocks) => blocks.flat())),
    ...paginationBlocks(cursor),
  ];
}
