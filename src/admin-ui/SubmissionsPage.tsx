import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import {
  FF_UNDERLINE_TABLIST,
  ffUnderlineTabClass,
  resolveFormColor,
} from "./ff-nav";
import {
  FF_CHIP,
  FF_FILTER_TRIGGER,
  FF_LIST_PAGE,
  FF_TOOLBAR_BTN,
  FfCheckbox,
  FfDataTable,
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

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function PaperPlaneIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

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
  const [formFilterOpen, setFormFilterOpen] = useState(false);
  const formFilterRef = useRef<HTMLDivElement>(null);

  const openSubmissionEditor = useCallback((id: string) => {
    setSelected(null);
    setDetailId(id);
    writeSubmissionDeepLink(id);
  }, []);

  const closeSubmission = useCallback(() => {
    setDetailId(null);
    writeSubmissionDeepLink(null);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (formFilterRef.current && !formFilterRef.current.contains(e.target as Node)) {
        setFormFilterOpen(false);
      }
    }
    if (formFilterOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [formFilterOpen]);

  const formColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of forms) {
      map.set(f.id, resolveFormColor(f));
    }
    return map;
  }, [forms]);

  const selectedForm = useMemo(() => {
    return forms.find((f) => f.id === formId) ?? null;
  }, [forms, formId]);

  const totalSubmissionsAcrossAllForms = useMemo(() => {
    return forms.reduce((acc, f) => acc + (f.subCount || 0), 0);
  }, [forms]);

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
        {/* Title & Action Row (EmDash ContentList Header) */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-semibold leading-tight text-kumo-strong">
              Submissions
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              type="button"
              className={FF_TOOLBAR_BTN}
              disabled={busy || filtered.length === 0}
              onClick={() => void onExport(filtered.map((s) => s.id))}
            >
              <DownloadIcon /> Export CSV
            </button>
            <button
              type="button"
              className={FF_TOOLBAR_BTN}
              onClick={() => void refresh()}
            >
              <RefreshIcon /> Refresh
            </button>
          </div>
        </div>

        {/* Kumo underline tabs — same spacing as Content List All / Trash */}
        <nav className={FF_UNDERLINE_TABLIST} aria-label="Submissions views">
          <button
            type="button"
            onClick={() => {
              setActiveTab("all");
              setPage(1);
            }}
            className={ffUnderlineTabClass(activeTab === "all")}
          >
            All
            <span className={FF_CHIP}>{subs.length}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("spam");
              setPage(1);
            }}
            className={ffUnderlineTabClass(activeTab === "spam")}
          >
            <WarningIcon />
            Spam
            {spamCount > 0 && (
              <span className={`${FF_CHIP} !bg-red-500/15 !text-red-600 dark:!text-red-400`}>
                {spamCount}
              </span>
            )}
          </button>
        </nav>

        {/* Table Toolbar — EmDash TableToolbar + FilterBar recipes */}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <FfListSearch
              placeholder="Search submissions…"
              aria-label="Search submissions"
              value={query}
              onChange={(v) => {
                setQuery(v);
                setPage(1);
              }}
            />

            {/* Form filter (custom popover — forms list with counts/colors) */}
            <div className="relative inline-block" ref={formFilterRef}>
              <button
                type="button"
                onClick={() => setFormFilterOpen((o) => !o)}
                className={`${FF_FILTER_TRIGGER} !pe-2 ${
                  formId ? "border-kumo-brand bg-kumo-tint/50 text-kumo-strong" : ""
                }`}
                aria-haspopup="listbox"
                aria-expanded={formFilterOpen}
                aria-label="Filter submissions by form"
              >
                {selectedForm ? (
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ background: formColorMap.get(selectedForm.id) || "#3b82f6" }}
                    aria-hidden="true"
                  />
                ) : (
                  <FilterIcon />
                )}
                <span className="truncate max-w-36">
                  {selectedForm ? selectedForm.name : "All forms"}
                </span>
                <ChevronDownIcon />
              </button>

              {formFilterOpen && (
                <div
                  className="absolute start-0 mt-1 z-30 min-w-[220px] rounded-lg bg-kumo-base py-1 shadow-lg ring ring-kumo-line"
                  role="listbox"
                >
                  <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-kumo-subtle">
                    Filter by form
                  </div>
                  <button
                    type="button"
                    role="option"
                    aria-selected={!formId}
                    onClick={() => {
                      handleFormChange("");
                      setFormFilterOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-sm text-start flex items-center justify-between gap-2 hover:bg-kumo-tint transition-colors ${
                      !formId ? "font-semibold text-kumo-strong bg-kumo-tint/40" : "text-kumo-default"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <FilterIcon />
                      <span>All forms</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-kumo-subtle">{totalSubmissionsAcrossAllForms}</span>
                      {!formId && <CheckIcon />}
                    </span>
                  </button>

                  <div className="border-t border-kumo-hairline my-1" />

                  {forms.map((f) => {
                    const isSelected = formId === f.id;
                    const color = formColorMap.get(f.id) || "#3b82f6";
                    return (
                      <button
                        key={f.id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          handleFormChange(f.id);
                          setFormFilterOpen(false);
                        }}
                        className={`w-full px-3 py-2 text-sm text-start flex items-center justify-between gap-2 hover:bg-kumo-tint transition-colors ${
                          isSelected ? "font-semibold text-kumo-strong bg-kumo-tint/40" : "text-kumo-default"
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ background: color }}
                            aria-hidden="true"
                          />
                          <span className="truncate">{f.name}</span>
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-kumo-subtle">{f.subCount}</span>
                          {isSelected && <CheckIcon />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <FfFilterSelect
              aria-label="Filter by status"
              value={statusFilter}
              disabled={activeTab === "spam"}
              onChange={(e) => {
                setStatusFilter(e.target.value as StatusFilter);
                setPage(1);
              }}
            >
              <option value="all">All statuses</option>
              <option value="open">Open</option>
              <option value="spam">Spam</option>
            </FfFilterSelect>

            <FfFilterSelect
              aria-label="Filter by date"
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value as DateFilter);
                setPage(1);
              }}
            >
              <option value="all">All time</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </FfFilterSelect>

            {hasExtraFilters && (
              <button
                type="button"
                onClick={clearExtraFilters}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-kumo-line bg-kumo-control px-3 text-sm font-medium text-kumo-subtle transition-colors hover:bg-kumo-tint hover:text-kumo-default"
                title="Clear filters"
              >
                <XIcon />
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Bulk Action Bar (Matches ContentList Bulk Bar) */}
        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-kumo-elevated px-4 py-2 ring ring-kumo-line">
            <span className="text-sm font-medium text-kumo-strong">
              {selectedIds.size} selected
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={FF_TOOLBAR_BTN}
                style={{ height: "1.75rem", fontSize: "0.75rem" }}
                onClick={() => void onExport(Array.from(selectedIds))}
              >
                <DownloadIcon /> Export
              </button>
              <button
                type="button"
                className="ff-btn ff-btn-danger ff-btn-sm"
                onClick={() => setPendingBulkDelete(true)}
              >
                <TrashIcon /> Delete
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {/* EmDash DataTable recipe */}
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
              <th scope="col" className="w-0 text-end">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="!border-t text-center text-kumo-subtle">
                  <div className="py-4.5">Loading submissions…</div>
                </td>
              </tr>
            ) : pagedItems.length === 0 ? (
              <tr>
                <td colSpan={6} className="!border-t text-center text-kumo-subtle">
                  <div className="py-4.5">
                    {activeTab === "spam"
                      ? "No spam submissions found."
                      : "No submissions found."}
                  </div>
                </td>
              </tr>
            ) : (
              pagedItems.map((s) => {
                const isChecked = selectedIds.has(s.id);
                const flagged = submissionIsSpam(s);
                const formAccent = formColorMap.get(s.formId) || "#006ff7";
                return (
                  <tr
                    key={s.id}
                    data-selected={isChecked ? "" : undefined}
                    className="cursor-pointer [&_td]:hover:bg-kumo-tint/40"
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
                        className="max-w-lg line-clamp-1 text-start font-medium text-kumo-default hover:text-kumo-brand"
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
                      {flagged ? (
                        <span
                          className="ff-badge is-warn"
                          title={s.spamReason ?? undefined}
                        >
                          Spam
                          {typeof s.spamScore === "number"
                            ? ` (${s.spamScore.toFixed(1)})`
                            : ""}
                        </span>
                      ) : (
                        <span className="ff-badge is-success">Open</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-kumo-subtle">
                      <bdi>{formatWhen(s.createdAt)}</bdi>
                    </td>
                    <td className="w-0 text-end" onClick={(e) => e.stopPropagation()}>
                      <RowActionsMenu
                        label={`Actions for submission from ${s.formName || "form"}`}
                      >
                        <DropdownMenu.Item onClick={() => setSelected(s)}>
                          View
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          onClick={() => openSubmissionEditor(s.id)}
                        >
                          Edit
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          disabled={busy}
                          onClick={() => void onExport([s.id])}
                        >
                          Export CSV
                        </DropdownMenu.Item>
                        <DropdownMenu.Separator />
                        <DropdownMenu.Item
                          variant="danger"
                          onClick={() => setPendingDelete(s)}
                        >
                          Delete
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
                      {submissionIsSpam(selected) ? (
                        <span
                          className="ff-badge is-warn"
                          title={selected.spamReason ?? undefined}
                        >
                          Spam
                          {typeof selected.spamScore === "number"
                            ? ` (${selected.spamScore.toFixed(1)}/10)`
                            : ""}
                        </span>
                      ) : (
                        <span className="ff-badge is-success">
                          Open
                          {typeof selected.spamScore === "number"
                            ? ` (${selected.spamScore.toFixed(1)}/10)`
                            : ""}
                        </span>
                      )}
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
                      <button
                        type="button"
                        className="ff-btn ff-btn-secondary ff-btn-sm"
                        disabled={resending}
                        onClick={() => void handleResendNotifications(selected.id)}
                      >
                        <PaperPlaneIcon /> {resending ? "Sending…" : "Resend"}
                      </button>
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
                  <button
                    type="button"
                    className="ff-btn ff-btn-secondary"
                    disabled={busy}
                    onClick={() => void onExport([selected.id])}
                  >
                    <DownloadIcon /> Export CSV
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="ff-btn ff-btn-danger"
                      disabled={busy}
                      onClick={() => setPendingDelete(selected)}
                    >
                      <TrashIcon /> Delete
                    </button>
                    <button
                      type="button"
                      className="ff-btn"
                      onClick={() => openSubmissionEditor(selected.id)}
                    >
                      <PencilIcon /> Edit
                    </button>
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
          title="Delete submission?"
          description={
            <>
              Permanently delete this submission from{" "}
              <strong>{pendingDelete?.formName}</strong>? This cannot be undone.
            </>
          }
          confirmLabel="Delete"
          pendingLabel="Deleting..."
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
          title={`Delete ${selectedIds.size} submission${selectedIds.size === 1 ? "" : "s"}?`}
          description={`Permanently delete ${selectedIds.size} selected submission${selectedIds.size === 1 ? "" : "s"}? This cannot be undone.`}
          confirmLabel="Delete"
          pendingLabel="Deleting..."
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
