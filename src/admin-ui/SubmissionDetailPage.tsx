import { useCallback, useEffect, useMemo, useState } from "react";
import { SaveButton } from "@emdash-cms/admin";
import type { FormField } from "../types";
import { MULTI_FIELD_TYPES } from "../types";
import {
  deleteSubmission,
  getForm,
  getSubmission,
  prepareExport,
  resendSubmissionNotifications,
  updateSubmission,
  type FormDocument,
  type SubmissionListItem,
} from "./ff-api";
import { EditorBarListLabel, GhostSquareBackButton } from "./ff-back";
import { ConfirmDialog } from "./ConfirmDialog";
import { FfSwitchRow } from "./ff-list";
import "./styles.css";

type Props = {
  submissionId: string;
  onBack: () => void;
};

type EditValue = string | string[];

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

function isMultiField(type: FormField["type"] | undefined): boolean {
  return !!type && (MULTI_FIELD_TYPES as readonly string[]).includes(type);
}

function toEditValue(raw: unknown, field?: FormField): EditValue {
  if (isMultiField(field?.type)) {
    if (Array.isArray(raw)) return raw.map(String);
    if (raw === undefined || raw === null || raw === "") return [];
    return [String(raw)];
  }
  if (Array.isArray(raw)) return raw.map(String).join(", ");
  if (raw === undefined || raw === null) return "";
  if (typeof raw === "boolean") return raw ? "true" : "";
  return String(raw);
}

function fieldsFromForm(doc: FormDocument | null): FormField[] {
  if (!doc?.rows) return [];
  return doc.rows.flatMap((r) => r.fields).filter((f) => f.type !== "html");
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

/**
 * Single-submission editor — mirrors EmDash ContentEditor:
 * EditorHeader + main field column + right meta rail.
 * Always editable (like posts); Save when dirty.
 */
export function SubmissionDetailPage({ submissionId, onBack }: Props) {
  const [submission, setSubmission] = useState<SubmissionListItem | null>(null);
  const [form, setForm] = useState<FormDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, EditValue>>({});
  const [baseline, setBaseline] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  };

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      showToast(`Couldn’t copy ${label}`);
    }
  };

  const hydrateDraft = useCallback(
    (sub: SubmissionListItem, doc: FormDocument | null) => {
      const schema = fieldsFromForm(doc);
      const map = new Map(schema.map((f) => [f.handle, f]));
      const handles = [
        ...schema.map((f) => f.handle),
        ...Object.keys(sub.data).filter((k) => !schema.some((f) => f.handle === k)),
      ];
      const next: Record<string, EditValue> = {};
      for (const handle of handles) {
        next[handle] = toEditValue(sub.data[handle], map.get(handle));
      }
      setDraft(next);
      setBaseline(JSON.stringify(next));
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sub = await getSubmission(submissionId);
      setSubmission(sub);
      let doc: FormDocument | null = null;
      try {
        doc = await getForm(sub.formId);
        setForm(doc);
      } catch {
        setForm(null);
      }
      hydrateDraft(sub, doc);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmission(null);
    } finally {
      setLoading(false);
    }
  }, [submissionId, hydrateDraft]);

  useEffect(() => {
    void load();
  }, [load]);

  const schemaFields = useMemo(() => fieldsFromForm(form), [form]);

  const fieldMap = useMemo(() => {
    const map = new Map<string, FormField>();
    for (const f of schemaFields) map.set(f.handle, f);
    return map;
  }, [schemaFields]);

  const valueHandles = useMemo(() => {
    if (!submission) return [] as string[];
    const fromSchema = schemaFields.map((f) => f.handle);
    const extras = Object.keys(draft).filter((k) => !fromSchema.includes(k));
    // Prefer schema order; fall back to draft keys for orphans
    const base = fromSchema.length ? fromSchema : Object.keys(draft);
    return [...base, ...extras.filter((k) => !base.includes(k))];
  }, [submission, schemaFields, draft]);

  const dirty = JSON.stringify(draft) !== baseline;

  const setDraftValue = (handle: string, value: EditValue) => {
    setDraft((prev) => ({ ...prev, [handle]: value }));
  };

  const toggleMulti = (handle: string, option: string, checked: boolean) => {
    setDraft((prev) => {
      const current = Array.isArray(prev[handle]) ? [...(prev[handle] as string[])] : [];
      const next = checked
        ? current.includes(option)
          ? current
          : [...current, option]
        : current.filter((v) => v !== option);
      return { ...prev, [handle]: next };
    });
  };

  const save = async () => {
    if (!submission || !dirty) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateSubmission({ id: submission.id, data: { ...draft } });
      setSubmission(updated);
      hydrateDraft(updated, form);
      showToast("Submission updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onExport = async () => {
    if (!submission) return;
    setBusy(true);
    try {
      const { url } = await prepareExport({ submissionIds: [submission.id] });
      if (url) window.location.href = url;
      showToast("Exported 1 submission");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onResend = async () => {
    if (!submission) return;
    setResending(true);
    try {
      const res = await resendSubmissionNotifications(submission.id);
      setSubmission((prev) =>
        prev ? { ...prev, notificationLogs: res.logs } : prev,
      );
      showToast("Notification resent successfully");
    } catch (err: any) {
      showToast(`Resend failed: ${err.message || String(err)}`);
    } finally {
      setResending(false);
    }
  };

  const confirmDelete = async () => {
    if (!submission) return;
    setBusy(true);
    setError(null);
    try {
      await deleteSubmission(submission.id);
      setPendingDelete(false);
      showToast("Submission deleted");
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="ff-shell">
        <p className="ff-meta">Loading submission…</p>
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="ff-shell">
        <p className="ff-error">{error || "Submission not found."}</p>
        <button type="button" className="ff-btn" onClick={onBack}>
          Back to Submissions
        </button>
      </div>
    );
  }

  const flagged = submissionIsSpam(submission);

  return (
    <div className="ff-shell ff-sub-editor">
      {/* Match EmDash ContentEditor bar: [←] Submissions / Form name */}
      <header className="ff-sub-editor-bar" data-ff-editor-bar="">
        <div className="ff-builder-crumb">
          <GhostSquareBackButton
            aria-label="Back to Submissions list"
            size="sm"
            onClick={onBack}
          />
          <div className="ff-builder-crumb-trail">
            <EditorBarListLabel onClick={onBack}>Submissions</EditorBarListLabel>
            <span className="ff-builder-crumb-sep" aria-hidden="true">
              /
            </span>
            <div className="ff-builder-crumb-name">
              <h1 className="ff-builder-crumb-heading">
                <span className="ff-sub-editor-title">
                  {submission.formName || "Submission"}
                </span>
              </h1>
            </div>
          </div>
        </div>
        <div className="ff-sub-editor-actions">
          <button
            type="button"
            className="ff-editor-bar-btn"
            disabled={busy}
            onClick={() => void onExport()}
          >
            <DownloadIcon /> Export
          </button>
          <SaveButton
            size="sm"
            variant={!dirty && !busy ? "ghost" : "secondary"}
            isDirty={dirty}
            isSaving={busy}
            disabled={!dirty || busy}
            onClick={() => void save()}
          />
        </div>
      </header>

      {error && <p className="ff-error">{error}</p>}

      <div className="ff-sub-editor-body">
        <div className="ff-sub-editor-main">
          {/* Match EmDash `.emdash-editor-page mx-auto max-w-[52rem] space-y-6 pt-8 sm:pt-12 pb-16` */}
          <div className="ff-sub-editor-page">
            <div className="ff-sub-editor-fields">
              {valueHandles.length === 0 ? (
                <p className="text-sm text-kumo-subtle">No field values on this submission.</p>
              ) : (
                valueHandles.map((handle) => {
                  const field = fieldMap.get(handle);
                  const label = field?.label || handle;
                  return (
                    <div key={handle} className="ff-sub-editor-field">
                      <label className="ff-sub-field-label" htmlFor={`ff-sub-${handle}`}>
                        {label}
                        {field?.required ? (
                          <span className="ff-req" title="Required">
                            {" "}
                            *
                          </span>
                        ) : null}
                      </label>
                      <FieldEditor
                        id={`ff-sub-${handle}`}
                        field={field}
                        value={draft[handle] ?? ""}
                        onChange={(next) => setDraftValue(handle, next)}
                        onToggleMulti={(opt, checked) => toggleMulti(handle, opt, checked)}
                      />
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <aside className="ff-sub-editor-rail" aria-label="Submission details">
          <section className="ff-sub-rail-panel">
            <h2 className="ff-sub-rail-title">Status</h2>
            <div className="flex items-center justify-between gap-2">
              {flagged ? (
                <span
                  className="ff-badge is-warn"
                  title={submission.spamReason ?? undefined}
                >
                  Spam
                  {typeof submission.spamScore === "number"
                    ? ` (${submission.spamScore.toFixed(1)})`
                    : ""}
                </span>
              ) : (
                <span className="ff-badge is-success">
                  Open
                  {typeof submission.spamScore === "number"
                    ? ` (${submission.spamScore.toFixed(1)})`
                    : ""}
                </span>
              )}
            </div>
            <div className="ff-sub-rail-row">
              <span className="ff-sub-rail-label">Submitted</span>
              <span className="ff-sub-rail-value">{formatWhen(submission.createdAt)}</span>
            </div>
            {submission.spamReason && (
              <p className="text-xs text-kumo-subtle mt-3">{submission.spamReason}</p>
            )}
          </section>

          <section className="ff-sub-rail-panel">
            <h2 className="ff-sub-rail-title">Details</h2>
            <div className="ff-sub-rail-row">
              <span className="ff-sub-rail-label">Submission ID</span>
              <code className="ff-sub-rail-mono">{submission.id}</code>
              <button
                type="button"
                className="ff-sub-copy-btn"
                onClick={() => void copyText("id", submission.id)}
              >
                {copied === "id" ? "Copied" : "Copy ID"}
              </button>
            </div>
            <div className="ff-sub-rail-row">
              <span className="ff-sub-rail-label">Form</span>
              <span className="ff-sub-rail-value">{submission.formName}</span>
            </div>
            {form?.handle && (
              <div className="ff-sub-rail-row">
                <span className="ff-sub-rail-label">Form handle</span>
                <code className="ff-sub-rail-mono">{form.handle}</code>
              </div>
            )}
            <div className="ff-sub-rail-row">
              <span className="ff-sub-rail-label">Form ID</span>
              <code className="ff-sub-rail-mono">{submission.formId}</code>
            </div>
            {typeof submission.spamScore === "number" && (
              <div className="ff-sub-rail-row">
                <span className="ff-sub-rail-label">Spam score</span>
                <span className="ff-sub-rail-value">
                  {submission.spamScore.toFixed(1)} / 10
                </span>
              </div>
            )}
            {submission.archived && (
              <div className="ff-sub-rail-row">
                <span className="ff-sub-rail-label">Archive</span>
                <span className="ff-badge is-warn">Archived</span>
              </div>
            )}
          </section>

          {submission.brief && (
            <section className="ff-sub-rail-panel">
              <h2 className="ff-sub-rail-title">AI Summary</h2>
              {submission.brief.summary && (
                <p className="text-sm text-kumo-default">{submission.brief.summary}</p>
              )}
              {submission.brief.intent && (
                <div className="ff-sub-rail-row">
                  <span className="ff-sub-rail-label">Intent</span>
                  <span className="ff-sub-rail-value">{submission.brief.intent}</span>
                </div>
              )}
              {submission.brief.suggestedAction && (
                <div className="ff-sub-rail-row">
                  <span className="ff-sub-rail-label">Suggested</span>
                  <span className="ff-sub-rail-value">{submission.brief.suggestedAction}</span>
                </div>
              )}
              <p className="text-xs text-kumo-subtle mt-3 italic">
                Not regenerated when you save edits.
              </p>
            </section>
          )}

          <section className="ff-sub-rail-panel">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h2 className="ff-sub-rail-title" style={{ marginBottom: 0 }}>
                Notifications
              </h2>
              <button
                type="button"
                className="ff-btn ff-btn-secondary ff-btn-sm"
                disabled={resending}
                onClick={() => void onResend()}
              >
                <PaperPlaneIcon /> {resending ? "…" : "Resend"}
              </button>
            </div>
            {!submission.notificationLogs?.length ? (
              <p className="text-xs text-kumo-subtle italic">No delivery attempts yet.</p>
            ) : (
              <div className="space-y-2">
                {submission.notificationLogs.map((log) => (
                  <div key={log.id} className="ff-sub-log">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-kumo-strong">
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
                    <div className="text-[11px] text-kumo-subtle mt-1">
                      {log.to} · {formatWhen(log.sentAt)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {(submission.ip || (submission.consent && submission.consent.length > 0)) && (
            <section className="ff-sub-rail-panel">
              <h2 className="ff-sub-rail-title">Meta</h2>
              {submission.ip && (
                <div className="ff-sub-rail-row">
                  <span className="ff-sub-rail-label">IP address</span>
                  <code className="ff-sub-rail-mono">{submission.ip}</code>
                </div>
              )}
              {submission.consent?.map((c) => (
                <div key={c.fieldHandle} className="ff-sub-log mt-2">
                  <div className="text-xs font-medium text-kumo-default">{c.label}</div>
                  <div className="text-[11px] text-kumo-subtle">
                    {formatWhen(c.consentedAt)}
                  </div>
                </div>
              ))}
            </section>
          )}

          <section className="ff-sub-rail-panel">
            <button
              type="button"
              className="ff-btn ff-btn-danger w-full"
              disabled={busy}
              onClick={() => setPendingDelete(true)}
            >
              <TrashIcon /> Delete submission
            </button>
          </section>
        </aside>
      </div>

      <ConfirmDialog
        open={pendingDelete}
        onClose={() => {
          if (busy) return;
          setPendingDelete(false);
          setError(null);
        }}
        role="alertdialog"
        title="Delete submission?"
        description="This permanently removes the submission and cannot be undone."
        confirmLabel="Delete"
        pendingLabel="Deleting..."
        isPending={busy}
        error={pendingDelete ? error : null}
        preventCloseWhilePending
        onConfirm={() => void confirmDelete()}
      />

      {toast && <div className="ff-toast">{toast}</div>}
    </div>
  );
}

function FieldEditor({
  id,
  field,
  value,
  onChange,
  onToggleMulti,
}: {
  id: string;
  field?: FormField;
  value: EditValue;
  onChange: (next: EditValue) => void;
  onToggleMulti: (option: string, checked: boolean) => void;
}) {
  const type = field?.type;

  if (type === "checkbox" || type === "consent") {
    const checked = String(value) === "true";
    return (
      <FfSwitchRow
        id={id}
        label={checked ? "Yes" : "No"}
        checked={checked}
        onCheckedChange={(next) => onChange(next ? "true" : "")}
      />
    );
  }

  if (type === "checkbox_group" || type === "multi_select") {
    const selected = Array.isArray(value) ? value : [];
    const options = field?.options || [];
    if (options.length === 0) {
      return (
        <input
          id={id}
          className="ff-field-input"
          value={selected.join(", ")}
          onChange={(e) =>
            onChange(
              e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
          placeholder="Comma-separated values"
        />
      );
    }
    return (
      <div className="ff-sub-multi" role="group">
        {options.map((opt) => {
          const optValue = typeof opt === "string" ? opt : opt.value;
          const optLabel = typeof opt === "string" ? opt : opt.label;
          return (
            <label key={optValue} className="ff-check-row">
              <input
                type="checkbox"
                checked={selected.includes(optValue)}
                onChange={(e) => onToggleMulti(optValue, e.target.checked)}
              />
              <span>{optLabel}</span>
            </label>
          );
        })}
      </div>
    );
  }

  if (type === "select" || type === "radio") {
    const options = field?.options || [];
    const current = typeof value === "string" ? value : "";
    return (
      <select
        id={id}
        className="ff-select"
        value={current}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">—</option>
        {options.map((opt) => {
          const optValue = typeof opt === "string" ? opt : opt.value;
          const optLabel = typeof opt === "string" ? opt : opt.label;
          return (
            <option key={optValue} value={optValue}>
              {optLabel}
            </option>
          );
        })}
      </select>
    );
  }

  if (type === "textarea") {
    return (
      <textarea
        id={id}
        className="ff-field-input ff-sub-textarea"
        rows={5}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (type === "rating") {
    const max = field?.maxStars ?? 5;
    return (
      <input
        id={id}
        className="ff-field-input"
        type="number"
        min={1}
        max={max}
        step={1}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  const inputType =
    type === "email"
      ? "email"
      : type === "number"
        ? "number"
        : type === "date"
          ? "date"
          : type === "datetime"
            ? "datetime-local"
            : type === "phone"
              ? "tel"
              : "text";

  return (
    <input
      id={id}
      className="ff-field-input"
      type={inputType}
      value={typeof value === "string" ? value : Array.isArray(value) ? value.join(", ") : ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
