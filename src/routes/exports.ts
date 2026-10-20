import { PluginRouteError, type PluginContext } from "emdash";
import { buildCsv, type CsvColumn } from "../lib/csv";
import {
  EXPORT_TOKEN_TTL_MS,
  signExportToken,
  verifyExportToken,
  type ExportFilter,
} from "../lib/export-token";
import type { StoredForm, StoredSubmission } from "../types";

const STANDARD_COLUMNS: CsvColumn[] = [
  { key: "submission_id", label: "submission_id" },
  { key: "form_handle", label: "form_handle" },
  { key: "form_name", label: "form_name" },
  { key: "created_at", label: "created_at" },
  { key: "spam_score", label: "spam_score" },
  { key: "archived", label: "archived" },
];

const MAX_EXPORT_ROWS = 10000;
const MAX_SUBMISSION_IDS = 1000;

interface MatchedSubmission {
  id: string;
  data: StoredSubmission;
}

function applyFilter(
  all: MatchedSubmission[],
  filter: ExportFilter,
): MatchedSubmission[] {
  let rows = all;
  if (filter.formId) rows = rows.filter((r) => r.data.formId === filter.formId);
  if (filter.submissionIds?.length) {
    const wanted = new Set(filter.submissionIds);
    rows = rows.filter((r) => wanted.has(r.id));
  }
  if (filter.since) {
    const t = new Date(filter.since).getTime();
    if (Number.isFinite(t)) rows = rows.filter((r) => new Date(r.data.createdAt).getTime() >= t);
  }
  if (filter.until) {
    const t = new Date(filter.until).getTime();
    if (Number.isFinite(t)) rows = rows.filter((r) => new Date(r.data.createdAt).getTime() <= t);
  }
  if (!filter.includeArchived) rows = rows.filter((r) => !r.data.archived);
  if (typeof filter.minSpamScore === "number") {
    const min = filter.minSpamScore;
    rows = rows.filter(
      (r) => typeof r.data.spamScore === "number" && r.data.spamScore >= min,
    );
  }
  return rows;
}

function defaultFilename(filter: ExportFilter, form: StoredForm | null): string {
  const date = new Date().toISOString().slice(0, 10);
  const slug = form?.handle ?? "submissions";
  return `freeform-${slug}-${date}.csv`;
}

async function loadSubmissions(ctx: PluginContext): Promise<MatchedSubmission[]> {
  const { items } = await ctx.storage.submissions.query({
    orderBy: { createdAt: "desc" },
    limit: MAX_EXPORT_ROWS,
  });
  return (items as Array<{ id: string; data: StoredSubmission }>).map((it) => ({
    id: it.id,
    data: it.data,
  }));
}

async function resolveForm(
  ctx: PluginContext,
  formId: string | undefined,
): Promise<StoredForm | null> {
  if (!formId) return null;
  return (await ctx.storage.forms.get(formId)) as StoredForm | null;
}

function columnsForForm(form: StoredForm): CsvColumn[] {
  const fieldCols: CsvColumn[] = form.rows
    .flatMap((r) => r.fields)
    .map((f) => ({ key: `f:${f.handle}`, label: f.handle }));
  return [...STANDARD_COLUMNS, ...fieldCols];
}

function multiFormColumns(): CsvColumn[] {
  return [...STANDARD_COLUMNS, { key: "data_json", label: "data_json" }];
}

function rowFor(
  match: MatchedSubmission,
  form: StoredForm | null,
  formNameByHandle: Map<string, { name: string; handle: string }>,
): Record<string, unknown> {
  const s = match.data;
  const info = formNameByHandle.get(s.formId);
  const base: Record<string, unknown> = {
    submission_id: match.id,
    form_handle: info?.handle ?? "",
    form_name: s.formName ?? info?.name ?? "",
    created_at: s.createdAt,
    spam_score: typeof s.spamScore === "number" ? s.spamScore : "",
    archived: s.archived ? "true" : "false",
  };
  if (form) {
    for (const r of form.rows) {
      for (const f of r.fields) {
        base[`f:${f.handle}`] = s.data?.[f.handle] ?? "";
      }
    }
  } else {
    base.data_json = JSON.stringify(s.data ?? {});
  }
  return base;
}

export const exportsRoutes = {
  // Admin-authenticated: issues a signed, short-lived URL the caller can hand
  // off (Claude returns it as a markdown link in chat). The token contains the
  // filter; we re-query at download time so no temp file is needed.
  "prepare-export": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const input = (routeCtx.input ?? {}) as ExportFilter & { origin?: string };
      if (input.submissionIds && input.submissionIds.length > MAX_SUBMISSION_IDS) {
        throw PluginRouteError.badRequest(
          `submissionIds is capped at ${MAX_SUBMISSION_IDS} per export.`,
        );
      }
      const filter: ExportFilter = {
        formId: input.formId,
        submissionIds: input.submissionIds,
        since: input.since,
        until: input.until,
        includeArchived: input.includeArchived,
        minSpamScore: input.minSpamScore,
        filename: input.filename,
      };

      const all = await loadSubmissions(ctx);
      const matched = applyFilter(all, filter);
      if (matched.length === 0) {
        return { rowCount: 0, url: null, filename: null, expiresAt: null };
      }

      const { token, expiresAt } = await signExportToken(ctx, filter);
      const form = await resolveForm(ctx, filter.formId);
      const filename = filter.filename || defaultFilename(filter, form);

      const origin = input.origin || new URL(routeCtx.request.url).origin;
      const url = `${origin.replace(/\/$/, "")}/freeform/export/${token}`;

      return {
        url,
        filename,
        rowCount: matched.length,
        expiresAt,
        ttlSeconds: Math.floor(EXPORT_TOKEN_TTL_MS / 1000),
      };
    },
  },

  // Token-authenticated. Returns the CSV body + filename in the standard
  // plugin response wrapper. The Astro download page strips the wrapper and
  // re-emits with text/csv + Content-Disposition.
  "export-csv": {
    public: true,
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const url = new URL(routeCtx.request.url);
      const token = url.searchParams.get("token") ?? "";
      if (!token) throw PluginRouteError.badRequest("Missing token");
      const payload = await verifyExportToken(ctx, token);
      if (!payload) throw PluginRouteError.unauthorized("Token invalid or expired");

      const all = await loadSubmissions(ctx);
      const matched = applyFilter(all, payload.filter);

      const form = await resolveForm(ctx, payload.filter.formId);
      const columns = form ? columnsForForm(form) : multiFormColumns();

      const { items: forms } = await ctx.storage.forms.query({ limit: 10000 });
      const formIndex = new Map<string, { name: string; handle: string }>();
      for (const f of forms as Array<{ id: string; data: StoredForm }>) {
        formIndex.set(f.id, { name: f.data.name, handle: f.data.handle });
      }

      const rows = matched.map((m) => rowFor(m, form, formIndex));
      const csv = buildCsv(rows, columns);
      const filename = payload.filter.filename || defaultFilename(payload.filter, form);
      return { csv, filename, rowCount: matched.length };
    },
  },
};
