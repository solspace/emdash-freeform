import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { FreeformShell } from "./FreeformShell";
import "./styles.css";

const PAGE_SIZE = 15;

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

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
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
  const [selected, setSelected] = useState<SubmissionListItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [pendingDelete, setPendingDelete] = useState<SubmissionListItem | null>(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [formFilterOpen, setFormFilterOpen] = useState(false);
  const formFilterRef = useRef<HTMLDivElement>(null);

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

  const [formSchemas, setFormSchemas] = useState<Record<string, FormDocument>>({});

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
      setSelected((prev) => (prev ? submissionList.find((s) => s.id === prev.id) ?? null : null));
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
    void refresh();
  }, [refresh]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  };

  const [resending, setResending] = useState(false);

  const handleResendNotifications = async (submissionId: string) => {
    setResending(true);
    try {
      const res = await resendSubmissionNotifications(submissionId);
      showToast("Notification resent successfully");
      setSelected((prev) => (prev && prev.id === submissionId ? { ...prev, notificationLogs: res.logs } : prev));
      setSubs((prev) =>
        prev.map((s) => (s.id === submissionId ? { ...s, notificationLogs: res.logs } : s)),
      );
    } catch (err: any) {
      showToast(`Resend failed: ${err.message || String(err)}`);
    } finally {
      setResending(false);
    }
  };

  const spamCount = useMemo(() => {
    return subs.filter((s) => typeof s.spamScore === "number" && s.spamScore >= 5).length;
  }, [subs]);

  const filtered = useMemo(() => {
    let result = subs;

    // Filter by tab (all vs spam)
    if (activeTab === "spam") {
      result = result.filter((s) => typeof s.spamScore === "number" && s.spamScore >= 5);
    }

    // Filter by search query
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
  }, [subs, activeTab, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

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
      await refresh();
      showToast("Submission deleted");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmBulkDelete = async () => {
    setPendingBulkDelete(false);
    setBusy(true);
    setError(null);
    try {
      const idsToDelete = Array.from(selectedIds);
      await Promise.all(idsToDelete.map((id) => deleteSubmission(id)));
      if (selected && idsToDelete.includes(selected.id)) setSelected(null);
      setSelectedIds(new Set());
      await refresh();
      showToast(`Deleted ${idsToDelete.length} submission(s)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const startRecord = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endRecord = Math.min(currentPage * PAGE_SIZE, filtered.length);

  return (
    <FreeformShell section="submissions">
      <div className="space-y-4">
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
              className="ff-btn ff-btn-secondary"
              disabled={busy || filtered.length === 0}
              onClick={() => void onExport(filtered.map((s) => s.id))}
            >
              <DownloadIcon /> Export CSV
            </button>
            <button
              type="button"
              className="ff-btn ff-btn-secondary"
              onClick={() => void refresh()}
            >
              <RefreshIcon /> Refresh
            </button>
          </div>
        </div>

        {/* EmDash Underline Tabs (All vs Spam, like All vs Trash in content/posts) */}
        <div className="border-b border-kumo-line">
          <nav className="flex space-x-6 -mb-px" aria-label="Submissions views">
            <button
              type="button"
              onClick={() => {
                setActiveTab("all");
                setPage(1);
              }}
              className={`inline-flex items-center gap-2 border-b-2 py-2 px-1 text-sm font-medium transition-colors ${
                activeTab === "all"
                  ? "border-kumo-brand text-kumo-strong"
                  : "border-transparent text-kumo-subtle hover:text-kumo-default hover:border-kumo-line"
              }`}
            >
              All
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-kumo-tint text-kumo-subtle font-semibold">
                {subs.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("spam");
                setPage(1);
              }}
              className={`inline-flex items-center gap-2 border-b-2 py-2 px-1 text-sm font-medium transition-colors ${
                activeTab === "spam"
                  ? "border-kumo-brand text-kumo-strong"
                  : "border-transparent text-kumo-subtle hover:text-kumo-default hover:border-kumo-line"
              }`}
            >
              <WarningIcon />
              Spam
              {spamCount > 0 && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-red-500/15 text-red-600 dark:text-red-400 font-semibold">
                  {spamCount}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* Table Toolbar (Search + Form Filter, matching TableToolbar) */}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-kumo-subtle">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="m21 21-4.3-4.3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <input
                type="search"
                placeholder="Search submissions…"
                className="h-9 w-full rounded-md border border-kumo-line bg-kumo-control ps-9 pe-3 text-sm text-kumo-default placeholder:text-kumo-subtle focus:outline-none focus:ring-2 focus:ring-kumo-focus"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                aria-label="Search submissions"
              />
            </div>

            {/* Form Filter Dropdown Button (EmDash / Kumo style) */}
            <div className="relative inline-block" ref={formFilterRef}>
              <button
                type="button"
                onClick={() => setFormFilterOpen((o) => !o)}
                className={`h-9 px-3 rounded-md border text-sm font-medium transition-colors inline-flex items-center gap-2 shadow-xs cursor-pointer ${
                  formId
                    ? "border-kumo-brand bg-kumo-tint/60 text-kumo-strong"
                    : "border-kumo-line bg-kumo-base hover:bg-kumo-tint text-kumo-default"
                }`}
                aria-haspopup="listbox"
                aria-expanded={formFilterOpen}
                aria-label="Filter submissions by form"
              >
                {selectedForm ? (
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ background: formColorMap.get(selectedForm.id) || "#3b82f6" }}
                    aria-hidden="true"
                  />
                ) : (
                  <FilterIcon />
                )}
                <span>{selectedForm ? selectedForm.name : "All forms"}</span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-kumo-tint text-kumo-subtle font-semibold">
                  {selectedForm ? selectedForm.subCount : totalSubmissionsAcrossAllForms}
                </span>
                <ChevronDownIcon />
              </button>

              {/* Form Filter Popover Dropdown */}
              {formFilterOpen && (
                <div
                  className="absolute start-0 mt-1 z-30 min-w-[220px] rounded-lg border border-kumo-line bg-kumo-base py-1 shadow-lg ring-1 ring-black/5"
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

                  <div className="border-t border-kumo-line my-1" />

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
                            className="h-2.5 w-2.5 rounded-full shrink-0"
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

            {/* Clear Form Filter Button */}
            {formId && (
              <button
                type="button"
                onClick={() => handleFormChange("")}
                className="h-9 px-2.5 rounded-md text-xs font-medium text-kumo-subtle hover:text-kumo-strong hover:bg-kumo-tint/60 transition-colors inline-flex items-center gap-1 cursor-pointer"
                title="Clear form filter"
              >
                <XIcon />
                <span>Reset filter</span>
              </button>
            )}
          </div>

          <div className="text-sm text-kumo-subtle shrink-0">
            {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
            {!loading && subs.length !== filtered.length ? ` of ${subs.length}` : ""}
          </div>
        </div>

        {/* Bulk Action Bar (Matches ContentList Bulk Bar) */}
        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-kumo-line bg-kumo-tint/40 px-4 py-2">
            <span className="text-sm font-medium text-kumo-strong">
              {selectedIds.size} {selectedIds.size === 1 ? "selected" : "selected"}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="ff-btn ff-btn-secondary ff-btn-sm"
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

        {/* Table Structure: Exactly matching ContentList in content/posts */}
        <div className="rounded-md border border-kumo-line bg-kumo-base overflow-x-auto shadow-xs">
          <table className="w-full text-start">
            <thead>
              <tr className="border-b border-kumo-line bg-kumo-tint/50">
                <th scope="col" className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-kumo-line text-kumo-brand focus:ring-kumo-focus cursor-pointer"
                    checked={allPageSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all on this page"
                  />
                </th>
                <th scope="col" className="px-4 py-3 text-start text-sm font-medium text-kumo-subtle">
                  Submission
                </th>
                <th scope="col" className="px-4 py-3 text-start text-sm font-medium text-kumo-subtle">
                  Form
                </th>
                <th scope="col" className="px-4 py-3 text-start text-sm font-medium text-kumo-subtle">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-start text-sm font-medium text-kumo-subtle">
                  Date
                </th>
                <th scope="col" className="px-4 py-3 text-end text-sm font-medium text-kumo-subtle">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-kumo-line">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-kumo-subtle">
                    Loading submissions…
                  </td>
                </tr>
              ) : pagedItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-kumo-subtle">
                    {activeTab === "spam"
                      ? "No spam submissions found."
                      : "No submissions found."}
                  </td>
                </tr>
              ) : (
                pagedItems.map((s) => {
                  const isChecked = selectedIds.has(s.id);
                  const isSpam = typeof s.spamScore === "number" && s.spamScore >= 5;
                  const formAccent = formColorMap.get(s.formId) || "#006ff7";
                  return (
                    <tr
                      key={s.id}
                      className={`transition-colors hover:bg-kumo-tint/25 cursor-pointer ${
                        isChecked ? "bg-kumo-tint/40" : ""
                      }`}
                      onClick={() => setSelected(s)}
                    >
                      {/* Checkbox Column */}
                      <td className="w-10 px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-kumo-line text-kumo-brand focus:ring-kumo-focus cursor-pointer"
                          checked={isChecked}
                          onChange={() => toggleOne(s.id)}
                          aria-label={`Select submission from ${s.formName}`}
                        />
                      </td>

                      {/* Main Title / Preview Link */}
                      <td className="px-4 py-3 text-sm">
                        <button
                          type="button"
                          className="font-medium text-kumo-strong hover:text-kumo-brand text-start line-clamp-1 max-w-lg"
                          onClick={() => setSelected(s)}
                        >
                          {briefText(s.brief, s.data)}
                        </button>
                      </td>

                      {/* Form Column */}
                      <td className="px-4 py-3 text-sm text-kumo-default whitespace-nowrap">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ background: formAccent }}
                            aria-hidden="true"
                          />
                          <span className="font-medium text-kumo-strong">{s.formName || "—"}</span>
                        </span>
                      </td>

                      {/* Status Column (StatusBadge Style) */}
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        {isSpam ? (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-500/15 text-red-600 dark:text-red-400"
                            title={s.spamReason ?? undefined}
                          >
                            Spam ({s.spamScore?.toFixed(1)})
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-500/15 text-green-600 dark:text-green-400">
                            Clean
                          </span>
                        )}
                      </td>

                      {/* Date Column */}
                      <td className="px-4 py-3 text-sm text-kumo-subtle whitespace-nowrap">
                        <bdi>{formatWhen(s.createdAt)}</bdi>
                      </td>

                      {/* Actions Column (Ghost square buttons matching ContentListItem) */}
                      <td className="px-4 py-3 text-end" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            type="button"
                            className="ff-icon-btn"
                            title="View details"
                            aria-label="View details"
                            onClick={() => setSelected(s)}
                          >
                            <EyeIcon />
                          </button>
                          <button
                            type="button"
                            className="ff-icon-btn-danger"
                            title="Delete submission"
                            aria-label="Delete submission"
                            onClick={() => setPendingDelete(s)}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* EmDash Pagination Footer */}
          {!loading && filtered.length > 0 && (
            <footer className="flex flex-col sm:flex-row items-center justify-between border-t border-kumo-line bg-kumo-base px-4 py-3 gap-3 text-sm text-kumo-subtle">
              <div>
                Showing <strong>{startRecord}</strong>–<strong>{endRecord}</strong> of{" "}
                <strong>{filtered.length}</strong>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="ff-btn ff-btn-secondary ff-btn-sm"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span className="text-xs font-medium text-kumo-strong px-1">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  className="ff-btn ff-btn-secondary ff-btn-sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            </footer>
          )}
        </div>

        {/* EmDash Native Slide-Over Drawer for Submission Details (Like CommentDetail) */}
        {selected && (
          <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
              onClick={() => setSelected(null)}
              aria-hidden="true"
            />
            {/* Slide-over panel */}
            <div className="fixed inset-y-0 end-0 flex max-w-full pl-10">
              <div className="w-screen max-w-lg bg-kumo-base border-s border-kumo-line shadow-2xl flex flex-col">
                {/* Header */}
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

                {/* Content body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {/* Status / Spam assessment */}
                  <div className="rounded-lg border border-kumo-line bg-kumo-tint/20 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-kumo-subtle">
                        Status &amp; Security
                      </span>
                      {typeof selected.spamScore === "number" && selected.spamScore >= 5 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-500/15 text-red-600 dark:text-red-400">
                          Spam ({selected.spamScore.toFixed(1)}/10)
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-500/15 text-green-600 dark:text-green-400">
                          Clean {selected.spamScore !== null ? `(${selected.spamScore?.toFixed(1)}/10)` : ""}
                        </span>
                      )}
                    </div>
                    {selected.spamReason && (
                      <p className="text-xs text-kumo-subtle mt-1">{selected.spamReason}</p>
                    )}
                  </div>

                  {/* AI Brief / Intent Summary */}
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

                  {/* Form Submission Data Fields */}
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
                          ])
                        );

                        let renderedValue: React.ReactNode;
                        if (Array.isArray(value)) {
                          renderedValue = (
                            <div className="flex flex-wrap gap-1.5">
                              {value.map((v, i) => {
                                const valStr = String(v);
                                const optLabel = optMap.get(valStr) || valStr;
                                return (
                                  <span
                                    key={i}
                                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-kumo-tint border border-kumo-line text-kumo-strong"
                                  >
                                    {optLabel}
                                  </span>
                                );
                              })}
                            </div>
                          );
                        } else if (typeof value === "boolean") {
                          renderedValue = value ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-500/15 text-green-600 dark:text-green-400">
                              Yes
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-kumo-tint text-kumo-subtle">
                              No
                            </span>
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
                          if (optLabel && optLabel !== valStr) {
                            renderedValue = (
                              <div>
                                <span className="font-medium text-kumo-strong">{optLabel}</span>
                                <span className="text-xs text-kumo-subtle ms-2 font-mono">
                                  ({valStr})
                                </span>
                              </div>
                            );
                          } else {
                            renderedValue = <span className="text-kumo-strong">{valStr}</span>;
                          }
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

                  {/* Notification Delivery Logs */}
                  <div className="space-y-3 pt-4 border-t border-kumo-line">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-kumo-subtle">
                        Notification Delivery Logs {selected.notificationLogs?.length ? `(${selected.notificationLogs.length})` : ""}
                      </span>
                      <button
                        type="button"
                        className="ff-btn ff-btn-secondary ff-btn-sm"
                        disabled={resending}
                        onClick={() => void handleResendNotifications(selected.id)}
                      >
                        <PaperPlaneIcon /> {resending ? "Sending…" : "Resend Notification"}
                      </button>
                    </div>

                    {(!selected.notificationLogs || selected.notificationLogs.length === 0) ? (
                      <div className="text-xs text-kumo-subtle italic bg-kumo-tint/20 p-3 rounded">
                        No delivery attempts logged yet. Click <span className="font-medium text-kumo-strong">Resend Notification</span> to send.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selected.notificationLogs.map((log) => (
                          <div
                            key={log.id}
                            className="rounded-md border border-kumo-line bg-kumo-base p-3 text-xs space-y-1.5 shadow-2xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-kumo-strong">{log.templateName}</span>
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide ${
                                  log.status === "delivered"
                                    ? "bg-green-500/15 text-green-600 dark:text-green-400"
                                    : log.status === "failed"
                                    ? "bg-red-500/15 text-red-600 dark:text-red-400"
                                    : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                }`}
                              >
                                {log.status}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-kumo-subtle text-[11px]">
                              <span>To: <strong className="font-mono text-kumo-default">{log.to}</strong></span>
                              {log.provider && (
                                <span className="font-mono uppercase bg-kumo-tint px-1.5 py-0.5 rounded text-[10px] text-kumo-strong">
                                  {log.provider}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-kumo-subtle">
                              Sent at {formatWhen(log.sentAt)}
                            </div>
                            {log.error && (
                              <div className="text-[11px] text-red-600 dark:text-red-400 bg-red-500/10 p-2 rounded font-mono break-words">
                                {log.error}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Meta / IP / Consent */}
                  <div className="space-y-3 pt-4 border-t border-kumo-line text-xs text-kumo-subtle">
                    {selected.ip && (
                      <div className="flex justify-between">
                        <span className="font-medium">IP Address:</span>
                        <span className="font-mono">{selected.ip}</span>
                      </div>
                    )}
                    {selected.consent && selected.consent.length > 0 && (
                      <div className="space-y-1 pt-2">
                        <span className="font-semibold text-kumo-strong">Consent Log:</span>
                        {selected.consent.map((c) => (
                          <div key={c.fieldHandle} className="bg-kumo-tint/30 p-2 rounded text-xs space-y-0.5">
                            <div className="font-medium text-kumo-default">{c.label}</div>
                            <div>Consented on {formatWhen(c.consentedAt)}</div>
                            {c.privacyPolicyUrl && (
                              <a href={c.privacyPolicyUrl} target="_blank" rel="noreferrer" className="text-kumo-brand hover:underline inline-block">
                                View Policy
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer action buttons */}
                <div className="border-t border-kumo-line px-6 py-4 flex items-center justify-between gap-3 bg-kumo-base">
                  <button
                    type="button"
                    className="ff-btn ff-btn-secondary"
                    disabled={busy}
                    onClick={() => void onExport([selected.id])}
                  >
                    <DownloadIcon /> Export CSV
                  </button>
                  <button
                    type="button"
                    className="ff-btn ff-btn-danger"
                    disabled={busy}
                    onClick={() => setPendingDelete(selected)}
                  >
                    <TrashIcon /> Delete Submission
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Single Submission Modal */}
        {pendingDelete && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
            onClick={() => setPendingDelete(null)}
          >
            <div
              className="ff-modal-card w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-sub-title"
            >
              <h3 id="delete-sub-title" className="text-lg font-semibold text-kumo-strong">
                Delete submission?
              </h3>
              <p className="mt-2 text-sm text-kumo-subtle">
                Are you sure you want to permanently delete this submission from <strong className="text-kumo-strong">{pendingDelete.formName}</strong>? This action cannot be undone.
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  className="ff-btn ff-btn-secondary"
                  onClick={() => setPendingDelete(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="ff-btn ff-btn-danger-solid"
                  disabled={busy}
                  onClick={() => {
                    const s = pendingDelete;
                    setPendingDelete(null);
                    void confirmDeleteSubmission(s);
                  }}
                >
                  <TrashIcon /> Delete Submission
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Bulk Submissions Modal */}
        {pendingBulkDelete && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
            onClick={() => setPendingBulkDelete(false)}
          >
            <div
              className="ff-modal-card w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="bulk-delete-title"
            >
              <h3 id="bulk-delete-title" className="text-lg font-semibold text-kumo-strong">
                Delete {selectedIds.size} submission{selectedIds.size === 1 ? "" : "s"}?
              </h3>
              <p className="mt-2 text-sm text-kumo-subtle">
                Are you sure you want to permanently delete {selectedIds.size} selected submission{selectedIds.size === 1 ? "" : "s"}? This action cannot be undone.
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  className="ff-btn ff-btn-secondary"
                  onClick={() => setPendingBulkDelete(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="ff-btn ff-btn-danger-solid"
                  disabled={busy}
                  onClick={() => void confirmBulkDelete()}
                >
                  <TrashIcon /> Delete {selectedIds.size} Submissions
                </button>
              </div>
            </div>
          </div>
        )}

        {toast && <div className="ff-toast">{toast}</div>}
      </div>
    </FreeformShell>
  );
}
