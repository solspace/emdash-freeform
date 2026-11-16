import { Badge, Button, Tabs } from "@cloudflare/kumo";
import {
  ArrowClockwise,
  CheckCircle,
  DownloadSimple,
  Eye,
  PaperPlaneTilt,
  PencilSimple,
  Trash,
  Warning,
  X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { FormField, SubmissionBrief } from "../types";
import {
  deleteSubmission,
  getForm,
  listForms,
  listSubmissions,
  prepareExport,
  resendSubmissionNotifications,
  type FormDocument,
  type FormListItem,
  type SubmissionListItem,
} from "./ff-api";
import { resolveFormColor } from "./ff-nav";
import {
  FF_LIST_PAGE,
  FF_ROW_TITLE,
  FF_TABLE_TOOLBAR,
  FF_TABLE_TOOLBAR_START,
  FfCheckbox,
  FfDataTable,
  FfDataTableBulkBar,
  FfDataTableMessage,
  FfFilterSelect,
  FfListPagination,
  FfListSearch,
} from "./ff-list";
import { ConfirmDialog } from "./ConfirmDialog";
import { FreeformShell } from "./FreeformShell";
import { DropdownMenu, RowActionsMenu } from "./RowActionsMenu";
import { SubmissionDetailPage } from "./SubmissionDetailPage";
import "./styles.css";

/** Deep-link: `/submissions?id=` opens the single-submission page. */
function readSubmissionDeepLink(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("id")?.trim() || null;
}

function writeSubmissionDeepLink(id: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("id", id);
  else url.searchParams.delete("id");
  window.history.replaceState({}, "", url.pathname + url.search + url.hash);
}

const PAGE_SIZES = [10, 20, 50, 100] as const;
type StatusFilter = "all" | "open" | "spam";
type DateFilter = "all" | "7d" | "30d" | "90d";

function preview(data: Record<string, unknown>): string {
  const values = Object.values(data)
    .filter((v) => v !== undefined && v !== null && String(v).trim() !== "")
    .slice(0, 2)
    .map((v) => (Array.isArray(v) ? v.join(", ") : String(v)));
  if (values.length === 0) return "—";
  const text = values.join(" · ");
  return text.length > 80 ? `${text.slice(0, 80).trim()}…` : text;
}

function briefText(
  brief: SubmissionBrief | null | undefined,
  data: Record<string, unknown>,
): string {
  if (brief && typeof brief === "object") {
    const summary = typeof brief.summary === "string" ? brief.summary.trim() : "";
    if (summary) return summary.length > 100 ? `${summary.slice(0, 100).trim()}…` : summary;
    const intent = typeof brief.intent === "string" ? brief.intent.trim() : "";
    if (intent) return intent;
  }
  return preview(data);
}

function briefSearchHay(brief: SubmissionBrief | null | undefined): string {
  if (!brief || typeof brief !== "object") return "";
  return [
    brief.intent,
    brief.summary,
    brief.suggestedAction,
    ...(Array.isArray(brief.keyFacts) ? brief.keyFacts : []),
  ]
    .filter(Boolean)
    .join(" ");
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function submissionIsSpam(s: SubmissionListItem): boolean {
  return typeof s.spamScore === "number" && s.spamScore >= 5;
}

/** EmDash ContentStatusLabel — icon + text for filter triggers/options. */
function SubmissionStatusLabel({
  status,
  className = "",
}: {
  status: "open" | "spam";
  className?: string;
}) {
  if (status === "spam") {
    return (
      <span className={`inline-flex items-center gap-1.5 ${className}`.trim()}>
        <Warning className="h-3.5 w-3.5 text-kumo-warning" aria-hidden="true" />
        Spam
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`.trim()}>
      <CheckCircle className="h-3.5 w-3.5 text-kumo-success" aria-hidden="true" />
      Open
    </span>
  );
}

/** EmDash ContentStatusBadge treatment — Kumo Badge + Phosphor icon. */
function SubmissionStatusBadge({
  spam,
  score,
  title,
  scoreOutOfTen = false,
}: {
  spam: boolean;
  score?: number | null;
  title?: string;
  scoreOutOfTen?: boolean;
}) {
  const scoreLabel =
    typeof score === "number"
      ? scoreOutOfTen
        ? ` (${score.toFixed(1)}/10)`
        : ` (${score.toFixed(1)})`
      : "";

  if (spam) {
    return (
      <span title={title}>
        <Badge variant="warning" className="gap-1.5">
          <Warning className="h-3 w-3" aria-hidden="true" />
          Spam{scoreLabel}
        </Badge>
      </span>
    );
  }

  return (
    <Badge variant="success" className="gap-1.5">
      <CheckCircle className="h-3 w-3" aria-hidden="true" />
      Open{scoreLabel}
    </Badge>
  );
}

const STATUS_FILTER_ITEMS = {
  all: "All statuses",
  open: <SubmissionStatusLabel status="open" />,
  spam: <SubmissionStatusLabel status="spam" />,
} as const;

export function SubmissionsPage() {
  const [detailId, setDetailId] = useState<string | null>(() => readSubmissionDeepLink());
  const [forms, setForms] = useState<FormListItem[]>([]);
  const [subs, setSubs] = useState<SubmissionListItem[]>([]);
  const [formId, setFormId] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("formId") ?? "";
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "spam">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [selected, setSelected] = useState<SubmissionListItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [pendingDelete, setPendingDelete] = useState<SubmissionListItem | null>(null);
  const [formSchemas, setFormSchemas] = useState<Record<string, FormDocument>>({});
  const [resending, setResending] = useState(false);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<(typeof PAGE_SIZES)[number]>(20);

  const openSubmissionEditor = useCallback((id: string) => {
    setSelected(null);
    setDetailId(id);
    writeSubmissionDeepLink(id);
  }, []);

  const closeSubmission = useCallback(() => {
    setDetailId(null);
    writeSubmissionDeepLink(null);
  }, []);

  const formColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of forms) {
      map.set(f.id, resolveFormColor(f));
    }
    return map;
  }, [forms]);

  /** Same Kumo Select items as All statuses — small, one-line triggers. */
  const formFilterItems = useMemo(() => {
    const items: Record<string, ReactNode> = {
      all: "All forms",
    };
    for (const f of forms) {
      const color = formColorMap.get(f.id) || "#3b82f6";
      items[f.id] = (
        <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: color }}
            aria-hidden="true"
          />
          <span className="truncate">{f.name}</span>
        </span>
      );
    }
    return items;
  }, [forms, formColorMap]);

  const handleFormChange = (next: string) => {
    setFormId(next);
    setPage(1);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (next) url.searchParams.set("formId", next);
      else url.searchParams.delete("formId");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  };

  useEffect(() => {
    if (selected?.formId && !formSchemas[selected.formId]) {
      void getForm(selected.formId)
        .then((doc) => {
          setFormSchemas((prev) => ({ ...prev, [doc.id]: doc }));
        })
        .catch(() => {});
    }
  }, [selected?.formId, formSchemas]);

  const activeFieldsMap = useMemo(() => {
    if (!selected?.formId) return new Map<string, FormField>();
    const doc = formSchemas[selected.formId];
    if (!doc?.rows) return new Map<string, FormField>();
    const map = new Map<string, FormField>();
    for (const row of doc.rows) {
      for (const f of row.fields) {
        map.set(f.handle, f);
      }
    }
    return map;
  }, [selected?.formId, formSchemas]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [formList, submissionList] = await Promise.all([
        listForms(),
        listSubmissions(formId || undefined),
      ]);
      setForms(formList);
      setSubs(submissionList);
      setSelected((prev) =>
        prev ? submissionList.find((s) => s.id === prev.id) ?? null : null,
      );
      setSelectedIds((prev) => {
        const next = new Set<string>();
        for (const id of prev) {
          if (submissionList.some((s) => s.id === id)) next.add(id);
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [formId]);

  useEffect(() => {
    if (detailId) return;
    void refresh();
  }, [refresh, detailId]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  };

  const handleResendNotifications = async (submissionId: string) => {
    setResending(true);
    try {
      const res = await resendSubmissionNotifications(submissionId);
      showToast("Notification resent successfully");
      setSelected((prev) =>
        prev && prev.id === submissionId
          ? { ...prev, notificationLogs: res.logs }
          : prev,
      );
      setSubs((prev) =>
        prev.map((s) =>
          s.id === submissionId ? { ...s, notificationLogs: res.logs } : s,
        ),
      );
    } catch (err: any) {
      showToast(`Resend failed: ${err.message || String(err)}`);
    } finally {
      setResending(false);
    }
  };

  const spamCount = useMemo(() => {
    return subs.filter(submissionIsSpam).length;
  }, [subs]);

  const filtered = useMemo(() => {
    let result = subs;

    // Tab (All vs Spam) — mirrors EmDash All / Trash
    if (activeTab === "spam") {
      result = result.filter(submissionIsSpam);
    } else if (statusFilter === "spam") {
      result = result.filter(submissionIsSpam);
    } else if (statusFilter === "open") {
      result = result.filter((s) => !submissionIsSpam(s));
    }

    if (dateFilter !== "all") {
      const days = dateFilter === "7d" ? 7 : dateFilter === "30d" ? 30 : 90;
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      result = result.filter((s) => {
        const t = Date.parse(s.createdAt);
        return Number.isFinite(t) && t >= cutoff;
      });
    }

    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter((s) => {
        const briefHay = briefSearchHay(s.brief).toLowerCase();
        if (briefHay.includes(q)) return true;
        const formHay = (s.formName || "").toLowerCase();
        if (formHay.includes(q)) return true;
        const valuesHay = Object.values(s.data)
          .map((v) => (v === undefined || v === null ? "" : String(v).toLowerCase()))
          .join(" ");
        return valuesHay.includes(q);
      });
    }

    return result;
  }, [subs, activeTab, statusFilter, dateFilter, query]);

  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / perPage) || 1));
  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * perPage;
    return filtered.slice(start, start + perPage);
  }, [filtered, currentPage, perPage]);

  const hasExtraFilters =
    Boolean(formId) || statusFilter !== "all" || dateFilter !== "all" || Boolean(query.trim());

  const clearExtraFilters = () => {
    handleFormChange("");
    setStatusFilter("all");
    setDateFilter("all");
    setQuery("");
    setPage(1);
  };

  const allPageSelected =
    pagedItems.length > 0 && pagedItems.every((item) => selectedIds.has(item.id));

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const item of pagedItems) next.delete(item.id);
      } else {
        for (const item of pagedItems) next.add(item.id);
      }
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onExport = async (ids: string[]) => {
    if (ids.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const { url } = await prepareExport({ submissionIds: ids });
      if (url) window.location.href = url;
      showToast(`Exported ${ids.length} submission(s)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmDeleteSubmission = async (s: SubmissionListItem) => {
    setBusy(true);
    setError(null);
    try {
      await deleteSubmission(s.id);
      if (selected?.id === s.id) setSelected(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(s.id);
        return next;
      });
      setPendingDelete(null);
      await refresh();
      showToast("Submission deleted");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmBulkDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      const idsToDelete = Array.from(selectedIds);
      await Promise.all(idsToDelete.map((id) => deleteSubmission(id)));
      if (selected && idsToDelete.includes(selected.id)) setSelected(null);
      setSelectedIds(new Set());
      setPendingBulkDelete(false);
      await refresh();
      showToast(`Deleted ${idsToDelete.length} submission(s)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (detailId) {
    return (
      <FreeformShell>
        <SubmissionDetailPage
          submissionId={detailId}
          onBack={() => {
            closeSubmission();
            void refresh();
          }}
        />
      </FreeformShell>
    );
  }

  return (
    <FreeformShell>
      <div className={FF_LIST_PAGE}>
        {/* EmDash ContentList header */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 items-center gap-4">
            <h1 className="text-2xl font-semibold leading-tight">Submissions</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Button
              variant="secondary"
              size="sm"
              disabled={busy || filtered.length === 0}
              icon={<DownloadSimple aria-hidden="true" />}
              onClick={() => void onExport(filtered.map((s) => s.id))}
            >
              Export CSV
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<ArrowClockwise aria-hidden="true" />}
              onClick={() => void refresh()}
            >
              Refresh
            </Button>
          </div>
        </div>

        {/* EmDash ContentList Tabs — All / Trash pattern → All / Spam */}
        <Tabs
          variant="underline"
          value={activeTab}
          onValueChange={(v) => {
            if (v === "all" || v === "spam") {
              setActiveTab(v);
              setPage(1);
              setSelectedIds(new Set());
            }
          }}
          tabs={[
            { value: "all", label: "All" },
            {
              value: "spam",
              label: (
                <span className="flex items-center gap-2">
                  <Warning className="h-4 w-4" aria-hidden="true" />
                  Spam
                  {spamCount > 0 ? (
                    <Badge variant="secondary">{spamCount}</Badge>
                  ) : null}
                </span>
              ),
            },
          ]}
        />

        {/* EmDash TableToolbar — only on All (Trash view has no filter bar) */}
        {activeTab === "all" && (
          <div className={FF_TABLE_TOOLBAR}>
            <div className={FF_TABLE_TOOLBAR_START}>
              <FfListSearch
                placeholder="Search submissions..."
                aria-label="Search submissions"
                value={query}
                onChange={(v) => {
                  setQuery(v);
                  setPage(1);
                }}
              />

              <FfFilterSelect
                aria-label="Filter by form"
                value={formId || "all"}
                items={formFilterItems}
                renderValue={(v) => {
                  if (v === "all" || !v) return "All forms";
                  return formFilterItems[v] ?? "All forms";
                }}
                onValueChange={(v) => {
                  handleFormChange(v === "all" ? "" : v);
                }}
              />

              <FfFilterSelect
                aria-label="Filter by status"
                value={statusFilter}
                items={STATUS_FILTER_ITEMS}
                renderValue={(v) =>
                  v === "all" ? "All statuses" : <SubmissionStatusLabel status={v} />
                }
                onValueChange={(v) => {
                  setStatusFilter(v);
                  setPage(1);
                }}
              />

              <FfFilterSelect
                aria-label="Filter by date"
                value={dateFilter}
                items={{
                  all: "All time",
                  "7d": "Last 7 days",
                  "30d": "Last 30 days",
                  "90d": "Last 90 days",
                }}
                onValueChange={(v) => {
                  setDateFilter(v);
                  setPage(1);
                }}
              />

              {hasExtraFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<X aria-hidden="true" />}
                  onClick={clearExtraFilters}
                >
                  Clear filters
                </Button>
              )}
            </div>
          </div>
        )}

        {/* EmDash DataTableBulkBar */}
        {selectedIds.size > 0 && (
          <FfDataTableBulkBar
            selectedCount={selectedIds.size}
            busy={busy}
            onClear={() => setSelectedIds(new Set())}
          >
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              icon={<DownloadSimple aria-hidden="true" />}
              onClick={() => void onExport(Array.from(selectedIds))}
            >
              Export
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              icon={<Trash aria-hidden="true" />}
              onClick={() => setPendingBulkDelete(true)}
            >
              Move to trash
            </Button>
          </FfDataTableBulkBar>
        )}

        {error && !pendingDelete && !pendingBulkDelete && (
          <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <FfDataTable>
          <thead>
            <tr>
              <th scope="col" className="w-10">
                <FfCheckbox
                  checked={allPageSelected}
                  onChange={toggleSelectAll}
                  aria-label="Select all on this page"
                />
              </th>
              <th scope="col">Submission</th>
              <th scope="col">Form</th>
              <th scope="col">Status</th>
              <th scope="col">Date</th>
              <th scope="col" className="w-0">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <FfDataTableMessage colSpan={6}>Loading submissions…</FfDataTableMessage>
            ) : pagedItems.length === 0 ? (
              <FfDataTableMessage colSpan={6}>
                {activeTab === "spam" ? "Spam is empty" : "No submissions found."}
              </FfDataTableMessage>
            ) : (
              pagedItems.map((s) => {
                const isChecked = selectedIds.has(s.id);
                const flagged = submissionIsSpam(s);
                const formAccent = formColorMap.get(s.formId) || "#006ff7";
                return (
                  <tr
                    key={s.id}
                    data-selected={isChecked || undefined}
                    data-clickable=""
                    onClick={() => setSelected(s)}
                  >
                    <td className="w-10" onClick={(e) => e.stopPropagation()}>
                      <FfCheckbox
                        checked={isChecked}
                        onChange={() => toggleOne(s.id)}
                        aria-label={`Select submission from ${s.formName}`}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`${FF_ROW_TITLE} max-w-lg line-clamp-1`}
                        onClick={() => setSelected(s)}
                      >
                        {briefText(s.brief, s.data)}
                      </button>
                    </td>
                    <td className="whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: formAccent }}
                          aria-hidden="true"
                        />
                        <span>{s.formName || "—"}</span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap">
                      <SubmissionStatusBadge
                        spam={flagged}
                        score={s.spamScore}
                        title={s.spamReason ?? undefined}
                      />
                    </td>
                    <td className="whitespace-nowrap text-kumo-subtle">
                      <bdi>{formatWhen(s.createdAt)}</bdi>
                    </td>
                    <td className="w-0 text-end" onClick={(e) => e.stopPropagation()}>
                      <RowActionsMenu
                        label={`Actions for submission from ${s.formName || "form"}`}
                      >
                        <DropdownMenu.Item
                          icon={<Eye className="size-4" aria-hidden="true" />}
                          onClick={() => setSelected(s)}
                        >
                          View
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          icon={<PencilSimple className="size-4" aria-hidden="true" />}
                          onClick={() => openSubmissionEditor(s.id)}
                        >
                          Edit
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          icon={<DownloadSimple className="size-4" aria-hidden="true" />}
                          disabled={busy}
                          onClick={() => void onExport([s.id])}
                        >
                          Export CSV
                        </DropdownMenu.Item>
                        <DropdownMenu.Separator />
                        <DropdownMenu.Item
                          variant="danger"
                          icon={<Trash className="size-4" aria-hidden="true" />}
                          onClick={() => setPendingDelete(s)}
                        >
                          Move to trash
                        </DropdownMenu.Item>
                      </RowActionsMenu>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </FfDataTable>

        {!loading && (
          <FfListPagination
            page={currentPage}
            perPage={perPage}
            totalCount={filtered.length}
            pageSizes={[...PAGE_SIZES]}
            label="Submissions pagination"
            onPageChange={setPage}
            onPageSizeChange={(n) => {
              setPerPage(n as (typeof PAGE_SIZES)[number]);
              setPage(1);
            }}
          />
        )}

        {selected && (
          <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
              onClick={() => setSelected(null)}
              aria-hidden="true"
            />
            <div className="fixed inset-y-0 end-0 flex max-w-full pl-10">
              <div className="w-screen max-w-lg bg-kumo-base border-s border-kumo-line shadow-2xl flex flex-col">
                <div className="flex items-center justify-between border-b border-kumo-line px-6 py-4">
                  <div>
                    <h2 className="text-lg font-semibold text-kumo-strong">
                      {selected.formName}
                    </h2>
                    <p className="text-xs text-kumo-subtle mt-0.5">
                      Submitted {formatWhen(selected.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="ff-icon-btn text-base"
                    onClick={() => setSelected(null)}
                    aria-label="Close panel"
                  >
                    ✕
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  <div className="rounded-lg border border-kumo-line bg-kumo-tint/20 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-kumo-subtle">
                        Status &amp; Security
                      </span>
                      <SubmissionStatusBadge
                        spam={submissionIsSpam(selected)}
                        score={selected.spamScore}
                        title={selected.spamReason ?? undefined}
                        scoreOutOfTen
                      />
                    </div>
                    {selected.spamReason && (
                      <p className="text-xs text-kumo-subtle mt-1">{selected.spamReason}</p>
                    )}
                  </div>

                  {selected.brief && (
                    <div className="rounded-lg border border-kumo-line bg-kumo-base p-4 space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wider text-kumo-subtle">
                        AI Summary
                      </div>
                      {selected.brief.summary && (
                        <p className="text-sm text-kumo-default">{selected.brief.summary}</p>
                      )}
                      {selected.brief.intent && (
                        <div className="text-xs text-kumo-subtle">
                          <strong>Intent:</strong> {selected.brief.intent}
                        </div>
                      )}
                      {selected.brief.suggestedAction && (
                        <div className="text-xs text-kumo-subtle">
                          <strong>Suggested Action:</strong> {selected.brief.suggestedAction}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wider text-kumo-subtle border-b border-kumo-line pb-2">
                      Submitted Values
                    </div>
                    <dl className="divide-y divide-kumo-line">
                      {Object.entries(selected.data).map(([key, value]) => {
                        const fieldDef = activeFieldsMap.get(key);
                        const fieldLabel = fieldDef?.label || key;
                        const options = fieldDef?.options || [];
                        const optMap = new Map(
                          options.map((o) => [
                            typeof o === "string" ? o : o.value,
                            typeof o === "string" ? o : o.label,
                          ]),
                        );

                        let renderedValue: ReactNode;
                        if (Array.isArray(value)) {
                          renderedValue = (
                            <div className="flex flex-wrap gap-1.5">
                              {value.map((v, i) => {
                                const valStr = String(v);
                                return (
                                  <span key={i} className="ff-sub-chip">
                                    {optMap.get(valStr) || valStr}
                                  </span>
                                );
                              })}
                            </div>
                          );
                        } else if (fieldDef?.type === "rating") {
                          renderedValue = (
                            <span className="inline-flex items-center gap-1.5 font-medium text-kumo-strong">
                              <span>{String(value)}</span>
                              <span className="text-amber-500">★</span>
                            </span>
                          );
                        } else {
                          const valStr = String(value ?? "—");
                          const optLabel = optMap.get(valStr);
                          renderedValue =
                            optLabel && optLabel !== valStr ? (
                              <div>
                                <span className="font-medium text-kumo-strong">{optLabel}</span>
                                <span className="text-xs text-kumo-subtle ms-2 font-mono">
                                  ({valStr})
                                </span>
                              </div>
                            ) : (
                              <span className="text-kumo-strong whitespace-pre-wrap">{valStr}</span>
                            );
                        }

                        return (
                          <div key={key} className="py-2.5 grid grid-cols-3 gap-4 items-start">
                            <dt className="text-xs font-medium text-kumo-subtle tracking-wider">
                              <div className="uppercase font-semibold">{fieldLabel}</div>
                              {fieldLabel !== key && (
                                <div className="text-[10px] text-kumo-subtle font-mono opacity-70">
                                  {key}
                                </div>
                              )}
                            </dt>
                            <dd className="col-span-2 text-sm break-words">{renderedValue}</dd>
                          </div>
                        );
                      })}
                    </dl>
                  </div>

                  <div className="space-y-3 pt-4 border-t border-kumo-line">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-kumo-subtle">
                        Notifications
                        {selected.notificationLogs?.length
                          ? ` (${selected.notificationLogs.length})`
                          : ""}
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={resending}
                        icon={<PaperPlaneTilt aria-hidden="true" />}
                        onClick={() => void handleResendNotifications(selected.id)}
                      >
                        {resending ? "Sending…" : "Resend"}
                      </Button>
                    </div>
                    {!selected.notificationLogs?.length ? (
                      <div className="text-xs text-kumo-subtle italic bg-kumo-tint/20 p-3 rounded">
                        No delivery attempts logged yet.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selected.notificationLogs.map((log) => (
                          <div
                            key={log.id}
                            className="rounded-md border border-kumo-line bg-kumo-base p-3 text-xs space-y-1.5 shadow-2xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-kumo-strong">
                                {log.templateName}
                              </span>
                              <span
                                className={`ff-badge ${
                                  log.status === "delivered"
                                    ? "is-success"
                                    : log.status === "failed"
                                      ? "is-danger"
                                      : "is-warn"
                                }`}
                              >
                                {log.status}
                              </span>
                            </div>
                            <div className="text-kumo-subtle text-[11px]">
                              To: <strong className="font-mono text-kumo-default">{log.to}</strong>
                              {" · "}
                              {formatWhen(log.sentAt)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {(selected.ip || (selected.consent && selected.consent.length > 0)) && (
                    <div className="space-y-3 pt-4 border-t border-kumo-line text-xs text-kumo-subtle">
                      {selected.ip && (
                        <div className="flex justify-between">
                          <span className="font-medium">IP Address:</span>
                          <span className="font-mono">{selected.ip}</span>
                        </div>
                      )}
                      {selected.consent?.map((c) => (
                        <div
                          key={c.fieldHandle}
                          className="bg-kumo-tint/30 p-2 rounded text-xs space-y-0.5"
                        >
                          <div className="font-medium text-kumo-default">{c.label}</div>
                          <div>Consented on {formatWhen(c.consentedAt)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t border-kumo-line px-6 py-4 flex items-center justify-between gap-3 bg-kumo-base">
                  <Button
                    variant="secondary"
                    disabled={busy}
                    icon={<DownloadSimple aria-hidden="true" />}
                    onClick={() => void onExport([selected.id])}
                  >
                    Export CSV
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="destructive"
                      disabled={busy}
                      icon={<Trash aria-hidden="true" />}
                      onClick={() => setPendingDelete(selected)}
                    >
                      Move to trash
                    </Button>
                    <Button
                      icon={<PencilSimple aria-hidden="true" />}
                      onClick={() => openSubmissionEditor(selected.id)}
                    >
                      Edit
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <ConfirmDialog
          open={Boolean(pendingDelete)}
          onClose={() => {
            if (busy) return;
            setPendingDelete(null);
            setError(null);
          }}
          role="alertdialog"
          title="Move to Trash?"
          description={
            <>
              Move this submission from <strong>{pendingDelete?.formName}</strong> to
              trash? This permanently removes it and cannot be undone.
            </>
          }
          confirmLabel="Move to Trash"
          pendingLabel="Moving..."
          isPending={busy}
          error={pendingDelete ? error : null}
          preventCloseWhilePending
          onConfirm={() => {
            if (pendingDelete) void confirmDeleteSubmission(pendingDelete);
          }}
        />

        <ConfirmDialog
          open={pendingBulkDelete}
          onClose={() => {
            if (busy) return;
            setPendingBulkDelete(false);
            setError(null);
          }}
          role="alertdialog"
          title="Move to Trash?"
          description={
            selectedIds.size === 1
              ? "Move 1 item to trash? This permanently removes it and cannot be undone."
              : `Move ${selectedIds.size} items to trash? This permanently removes them and cannot be undone.`
          }
          confirmLabel="Move to Trash"
          pendingLabel="Moving..."
          isPending={busy}
          error={pendingBulkDelete ? error : null}
          preventCloseWhilePending
          onConfirm={() => void confirmBulkDelete()}
        />

        {toast && <div className="ff-toast">{toast}</div>}
      </div>
    </FreeformShell>
  );
}
