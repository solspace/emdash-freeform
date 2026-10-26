import { useCallback, useEffect, useMemo, useState } from "react";
import type { SubmissionBrief } from "../types";
import {
  deleteSubmission,
  listForms,
  listSubmissions,
  prepareExport,
  type FormListItem,
  type SubmissionListItem,
} from "./ff-api";
import { FreeformShell } from "./FreeformShell";
import "./styles.css";

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
  const [selected, setSelected] = useState<SubmissionListItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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
    window.setTimeout(() => setToast(null), 2200);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subs;
    return subs.filter((s) => {
      const hay = `${s.formName} ${briefSearchHay(s.brief)} ${JSON.stringify(s.data)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [subs, query]);

  const onExport = async (ids?: string[]) => {
    setBusy(true);
    setError(null);
    try {
      const result = await prepareExport({
        formId: formId || undefined,
        submissionIds: ids,
      });
      if (!result.url || result.rowCount === 0) {
        setError("Nothing to export.");
        return;
      }
      window.open(result.url, "_blank", "noopener,noreferrer");
      showToast(`Export ready (${result.rowCount})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (s: SubmissionListItem) => {
    if (
      !confirm(
        `Permanently delete this submission from “${s.formName}”? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteSubmission(s.id);
      if (selected?.id === s.id) setSelected(null);
      await refresh();
      showToast("Submission deleted");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FreeformShell section="submissions">
      <div className="ff-header">
        <div>
          <h1>Submissions</h1>
          <p>Review, export, or erase entries — including for access requests.</p>
        </div>
        <div className="ff-actions">
          <select
            className="ff-select"
            value={formId}
            onChange={(e) => {
              const next = e.target.value;
              setFormId(next);
              const url = new URL(window.location.href);
              if (next) url.searchParams.set("formId", next);
              else url.searchParams.delete("formId");
              window.history.replaceState({}, "", url.pathname + url.search);
            }}
            aria-label="Filter by form"
          >
            <option value="">All forms</option>
            {forms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="ff-btn"
            disabled={busy || filtered.length === 0}
            onClick={() => void onExport(filtered.map((s) => s.id))}
          >
            Export CSV
          </button>
          <button type="button" className="ff-btn" onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
      </div>

      <div className="ff-toolbar">
        <input
          className="ff-search"
          type="search"
          placeholder="Search submissions…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search submissions"
        />
        <span className="ff-meta">
          {filtered.length} shown
          {!loading && subs.length !== filtered.length ? ` of ${subs.length}` : ""}
        </span>
      </div>

      {error && <p className="ff-error">{error}</p>}
      {loading && <p className="ff-meta">Loading submissions…</p>}

      {!loading && filtered.length === 0 && (
        <div className="ff-empty-canvas">No submissions yet.</div>
      )}

      <div
        className="ff-subs-layout"
        style={
          selected
            ? {
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 360px)",
                gap: "0.85rem",
                alignItems: "start",
              }
            : undefined
        }
      >
        {!loading && filtered.length > 0 && (
          <div className="ff-table-wrap">
            <table className="ff-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Form</th>
                  <th>Preview</th>
                  <th>Spam</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr
                    key={s.id}
                    className={selected?.id === s.id ? "is-selected" : undefined}
                    style={{ cursor: "pointer" }}
                    onClick={() => setSelected(s)}
                  >
                    <td>{formatWhen(s.createdAt)}</td>
                    <td>{s.formName || "—"}</td>
                    <td className="ff-preview">{briefText(s.brief, s.data)}</td>
                    <td>
                      {typeof s.spamScore === "number" ? (
                        <span
                          className={`ff-badge${s.spamScore >= 5 ? " is-warn" : ""}`}
                          title={s.spamReason ?? undefined}
                        >
                          {s.spamScore.toFixed(1)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selected && (
          <aside className="ff-panel ff-prop" style={{ position: "sticky", top: "1rem" }}>
            <div className="ff-header" style={{ marginBottom: "0.65rem" }}>
              <div>
                <h2 style={{ margin: 0 }}>{selected.formName}</h2>
                <p className="ff-meta" style={{ margin: "0.25rem 0 0" }}>
                  {formatWhen(selected.createdAt)}
                </p>
              </div>
              <button type="button" className="ff-btn" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>

            {Object.entries(selected.data).map(([key, value]) => (
              <div key={key} style={{ marginBottom: "0.65rem" }}>
                <div className="ff-meta">{key}</div>
                <div>
                  {Array.isArray(value) ? value.join(", ") : String(value ?? "—")}
                </div>
              </div>
            ))}

            {selected.ip && (
              <div style={{ marginBottom: "0.65rem" }}>
                <div className="ff-meta">IP</div>
                <div>{selected.ip}</div>
              </div>
            )}

            {selected.consent && selected.consent.length > 0 && (
              <div style={{ marginBottom: "0.65rem" }}>
                <div className="ff-meta">Consent</div>
                {selected.consent.map((c) => (
                  <div key={c.fieldHandle} style={{ marginTop: "0.35rem" }}>
                    {c.label}
                    <div className="ff-meta">{formatWhen(c.consentedAt)}</div>
                    {c.privacyPolicyUrl && (
                      <a href={c.privacyPolicyUrl} target="_blank" rel="noreferrer">
                        Policy
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="ff-actions" style={{ marginTop: "0.85rem" }}>
              <button
                type="button"
                className="ff-btn"
                disabled={busy}
                onClick={() => void onExport([selected.id])}
              >
                Export CSV
              </button>
              <button
                type="button"
                className="ff-btn ff-btn-danger"
                disabled={busy}
                onClick={() => void onDelete(selected)}
              >
                Delete
              </button>
            </div>
          </aside>
        )}
      </div>

      {toast && <div className="ff-toast">{toast}</div>}
    </FreeformShell>
  );
}
