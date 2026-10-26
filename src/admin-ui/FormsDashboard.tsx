import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent } from "react";
import { FORM_TEMPLATES, formFromTemplate, isFormTemplateId } from "../lib/form-templates";
import {
  aiGenerate,
  deleteForm,
  getAiSettings,
  saveForm,
  type FormListItem,
} from "./ff-api";
import { goToFormSubmissions, goToSection, resolveFormColor } from "./ff-nav";

type Props = {
  forms: FormListItem[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onEdit: (id: string) => void;
  onError: (message: string | null) => void;
};

function cardSurface(accent: string): CSSProperties {
  return {
    "--ff-card-accent": accent,
    background: `color-mix(in srgb, ${accent} 12%, var(--ff-surface))`,
    borderColor: `color-mix(in srgb, ${accent} 32%, var(--ff-line))`,
  } as CSSProperties;
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 20h9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M18 6L6 18M6 6l12 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function FormsDashboard({
  forms,
  loading,
  error,
  onRefresh,
  onEdit,
  onError,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [templateId, setTemplateId] = useState("contact");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"cards" | "list">("cards");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [aiSettingsLink, setAiSettingsLink] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getAiSettings()
      .then((s) => {
        if (!cancelled) setAiConfigured(Boolean(s.configured));
      })
      .catch(() => {
        if (!cancelled) setAiConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return forms;
    return forms.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.handle.toLowerCase().includes(q),
    );
  }, [forms, query]);

  const onCreate = async () => {
    setCreating(true);
    onError(null);
    try {
      const tid = isFormTemplateId(templateId) ? templateId : "blank";
      const draft = formFromTemplate(tid, {
        name: tid === "blank" ? "New Form" : "",
        handle: "tmp",
      });
      const saved = await saveForm({
        name: draft.name,
        rows: draft.rows,
        successMessage: draft.successMessage,
      });
      onEdit(saved.id);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const onAiCreate = async () => {
    if (!aiPrompt.trim()) {
      onError("Describe the form you want (e.g. “event RSVP with dietary needs”).");
      return;
    }
    setAiBusy(true);
    onError(null);
    setAiSettingsLink(false);
    try {
      const draft = formFromTemplate("blank", {
        name: "New Form",
        handle: "tmp",
      });
      const saved = await saveForm({
        name: draft.name,
        rows: draft.rows,
        successMessage: draft.successMessage,
      });
      try {
        await aiGenerate({
          description: aiPrompt.trim(),
          formId: saved.id,
          apply: true,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        try {
          await deleteForm(saved.id);
        } catch {
          /* orphan blank form if delete fails */
        }
        if (/API key not configured|rejected the API key|Incorrect API key/i.test(msg)) {
          setAiSettingsLink(true);
          onError(
            /rejected|Incorrect/i.test(msg)
              ? "OpenAI rejected that API key."
              : "OpenAI API key isn’t configured yet.",
          );
          return;
        }
        throw err;
      }
      setAiOpen(false);
      setAiPrompt("");
      onEdit(saved.id);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiBusy(false);
    }
  };

  const onDelete = (form: FormListItem, e?: MouseEvent) => {
    e?.stopPropagation();
    if (!confirm(`Delete “${form.name}”?`)) return;
    void deleteForm(form.id)
      .then(onRefresh)
      .catch((err) => {
        onError(err instanceof Error ? err.message : String(err));
      });
  };

  return (
    <>
      <div className="ff-header">
        <div>
          <h1>Forms</h1>
          <p>Build, organize, and monitor your forms.</p>
        </div>
        <div className="ff-actions">
          <select
            className="ff-select"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            aria-label="Starter template"
          >
            {FORM_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {aiConfigured && (
            <button
              type="button"
              className="ff-btn"
              disabled={creating || aiBusy}
              onClick={() => setAiOpen((v) => !v)}
            >
              Generate with AI
            </button>
          )}
          <button
            type="button"
            className="ff-btn ff-btn-primary"
            disabled={creating || aiBusy}
            onClick={() => void onCreate()}
          >
            {creating ? "Creating…" : "New form"}
          </button>
        </div>
      </div>

      {aiConfigured && aiOpen && (
        <div className="ff-panel ff-prop" style={{ marginBottom: "1rem" }}>
          <h2>Generate with AI</h2>
          <p className="ff-meta" style={{ marginBottom: "0.65rem" }}>
            Describe the form in plain language. Uses your OpenAI key from
            Settings → AI &amp; spam.
          </p>
          <label htmlFor="ff-ai-prompt">Description</label>
          <textarea
            id="ff-ai-prompt"
            rows={3}
            value={aiPrompt}
            placeholder="Job application with resume upload note, portfolio URL, and start-date preference"
            onChange={(e) => setAiPrompt(e.target.value)}
          />
          <div className="ff-actions" style={{ marginTop: "0.75rem" }}>
            <button
              type="button"
              className="ff-btn ff-btn-primary"
              disabled={aiBusy}
              onClick={() => void onAiCreate()}
            >
              {aiBusy ? "Generating…" : "Generate form"}
            </button>
            <button
              type="button"
              className="ff-btn"
              disabled={aiBusy}
              onClick={() => setAiOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="ff-toolbar">
        <input
          className="ff-search"
          type="search"
          placeholder="Search forms…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search forms"
        />
        <div className="ff-view-toggle" role="group" aria-label="View mode">
          <button
            type="button"
            className={`ff-view-btn${view === "cards" ? " is-active" : ""}`}
            onClick={() => setView("cards")}
          >
            Cards
          </button>
          <button
            type="button"
            className={`ff-view-btn${view === "list" ? " is-active" : ""}`}
            onClick={() => setView("list")}
          >
            List
          </button>
        </div>
      </div>

      {error && (
        <p className="ff-error">
          {error}
          {aiSettingsLink && (
            <>
              {" "}
              <button
                type="button"
                className="ff-linkish"
                onClick={() => goToSection("settings", "ai")}
              >
                Open Settings → AI &amp; spam
              </button>
            </>
          )}
        </p>
      )}
      {loading && <p className="ff-meta">Loading forms…</p>}

      {!loading && filtered.length === 0 && (
        <div className="ff-empty-canvas">
          {forms.length === 0
            ? "No forms yet. Pick a starter template and create your first form."
            : "No forms match your search."}
        </div>
      )}

      {view === "cards" ? (
        <div className="ff-grid">
          {filtered.map((form) => {
            const accent = resolveFormColor(form);
            return (
              <article
                key={form.id}
                className="ff-form-card ff-form-card-clickable"
                style={cardSurface(accent)}
                role="button"
                tabIndex={0}
                onClick={() => onEdit(form.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onEdit(form.id);
                  }
                }}
              >
                <div className="ff-form-card-accent" aria-hidden />
                <div
                  className="ff-form-card-chrome"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="ff-icon-btn"
                    title="Edit form"
                    aria-label={`Edit ${form.name}`}
                    onClick={() => onEdit(form.id)}
                  >
                    <EditIcon />
                  </button>
                  <button
                    type="button"
                    className="ff-icon-btn ff-icon-btn-danger"
                    title="Delete form"
                    aria-label={`Delete ${form.name}`}
                    onClick={(e) => onDelete(form, e)}
                  >
                    <CloseIcon />
                  </button>
                </div>
                <div className="ff-form-card-body">
                  <div className="ff-form-card-top">
                    <h3>{form.name}</h3>
                    <code className="ff-handle">{form.handle}</code>
                  </div>
                  <div className="ff-form-stats">
                    <button
                      type="button"
                      className="ff-form-stat-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        goToFormSubmissions(form.id);
                      }}
                    >
                      <strong>{form.subCount}</strong>
                      <span>Submissions</span>
                    </button>
                    <div>
                      <strong>{form.fieldCount}</strong>
                      <span>Fields</span>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="ff-table-wrap">
          <table className="ff-table">
            <thead>
              <tr>
                <th>Form</th>
                <th>Handle</th>
                <th>Fields</th>
                <th>Submissions</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((form) => {
                const accent = resolveFormColor(form);
                return (
                  <tr
                    key={form.id}
                    className="ff-table-row-clickable"
                    style={
                      {
                        "--ff-card-accent": accent,
                        background: `color-mix(in srgb, ${accent} 6%, transparent)`,
                      } as CSSProperties
                    }
                    onClick={() => onEdit(form.id)}
                  >
                    <td>
                      <span className="ff-list-swatch" style={{ background: accent }} aria-hidden />
                      <button type="button" className="ff-linkish" onClick={() => onEdit(form.id)}>
                        {form.name}
                      </button>
                    </td>
                    <td>
                      <code className="ff-handle">{form.handle}</code>
                    </td>
                    <td>{form.fieldCount}</td>
                    <td>
                      <button
                        type="button"
                        className="ff-linkish"
                        onClick={(e) => {
                          e.stopPropagation();
                          goToFormSubmissions(form.id);
                        }}
                      >
                        {form.subCount}
                      </button>
                    </td>
                    <td className="ff-table-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="ff-icon-btn"
                        title="Edit form"
                        aria-label={`Edit ${form.name}`}
                        onClick={() => onEdit(form.id)}
                      >
                        <EditIcon />
                      </button>
                      <button
                        type="button"
                        className="ff-icon-btn ff-icon-btn-danger"
                        title="Delete form"
                        aria-label={`Delete ${form.name}`}
                        onClick={(e) => onDelete(form, e)}
                      >
                        <CloseIcon />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
