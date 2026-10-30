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
import "./styles.css";

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

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
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
  const [view, setView] = useState<"cards" | "list">("list");
  const [pendingDelete, setPendingDelete] = useState<FormListItem | null>(null);
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
    setPendingDelete(form);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold leading-tight text-kumo-strong">
            Forms
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <select
            className="h-9 rounded-md border border-kumo-line bg-kumo-control px-3 text-sm text-kumo-default focus:outline-none focus:ring-2 focus:ring-kumo-focus"
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
              className="ff-btn ff-btn-secondary"
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
            <PlusIcon /> {creating ? "Creating…" : "New form"}
          </button>
        </div>
      </div>

      {aiConfigured && aiOpen && (
        <div className="ff-card space-y-4">
          <h2 className="text-lg font-semibold text-kumo-strong">Generate with AI</h2>
          <p className="text-sm text-kumo-subtle">
            Describe the form in plain language. Uses your OpenAI key from
            Settings → AI &amp; spam.
          </p>
          <div>
            <label htmlFor="ff-ai-prompt" className="text-xs font-medium uppercase tracking-wider text-kumo-subtle block mb-1">
              Description
            </label>
            <textarea
              id="ff-ai-prompt"
              rows={3}
              className="w-full rounded-md border border-kumo-line bg-kumo-control p-3 text-sm text-kumo-default focus:outline-none focus:ring-2 focus:ring-kumo-focus"
              value={aiPrompt}
              placeholder="Job application with resume upload note, portfolio URL, and start-date preference"
              onChange={(e) => setAiPrompt(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
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
              className="ff-btn ff-btn-secondary"
              disabled={aiBusy}
              onClick={() => setAiOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-64">
          <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-kumo-subtle">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="m21 21-4.3-4.3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <input
            type="search"
            placeholder="Search forms…"
            className="h-9 w-full rounded-md border border-kumo-line bg-kumo-control ps-9 pe-3 text-sm text-kumo-default placeholder:text-kumo-subtle focus:outline-none focus:ring-2 focus:ring-kumo-focus"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search forms"
          />
        </div>
        <div className="flex items-center gap-1 rounded-md border border-kumo-line bg-kumo-control p-0.5">
          <button
            type="button"
            onClick={() => setView("list")}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              view === "list"
                ? "bg-kumo-base text-kumo-strong shadow-xs"
                : "text-kumo-subtle hover:text-kumo-default"
            }`}
          >
            List
          </button>
          <button
            type="button"
            onClick={() => setView("cards")}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              view === "cards"
                ? "bg-kumo-base text-kumo-strong shadow-xs"
                : "text-kumo-subtle hover:text-kumo-default"
            }`}
          >
            Cards
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
          {aiSettingsLink && (
            <>
              {" "}
              <button
                type="button"
                className="font-semibold underline hover:no-underline"
                onClick={() => goToSection("settings", "ai")}
              >
                Open Settings → AI &amp; spam
              </button>
            </>
          )}
        </div>
      )}

      {loading && (
        <p className="text-sm text-kumo-subtle py-4 text-center">Loading forms…</p>
      )}

      {view === "list" ? (
        <div className="rounded-md border border-kumo-line bg-kumo-base overflow-x-auto">
          <table className="w-full text-start">
            <thead>
              <tr className="border-b border-kumo-line bg-kumo-tint/50">
                <th scope="col" className="px-4 py-3 text-start text-sm font-medium text-kumo-subtle">Form</th>
                <th scope="col" className="px-4 py-3 text-start text-sm font-medium text-kumo-subtle">Handle</th>
                <th scope="col" className="px-4 py-3 text-start text-sm font-medium text-kumo-subtle">Fields</th>
                <th scope="col" className="px-4 py-3 text-start text-sm font-medium text-kumo-subtle">Submissions</th>
                <th scope="col" className="px-4 py-3 text-end text-sm font-medium text-kumo-subtle">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-kumo-line">
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-kumo-subtle">
                    {forms.length === 0
                      ? "No forms yet. Pick a starter template and create your first form."
                      : "No forms match your search."}
                  </td>
                </tr>
              ) : (
                filtered.map((form) => {
                  const accent = resolveFormColor(form);
                  return (
                    <tr
                      key={form.id}
                      className="hover:bg-kumo-tint/25 cursor-pointer transition-colors"
                      onClick={() => onEdit(form.id)}
                    >
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ background: accent }}
                            aria-hidden="true"
                          />
                          <span className="font-medium text-kumo-strong hover:text-kumo-brand">
                            {form.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-kumo-subtle">
                        <code className="text-xs bg-kumo-tint px-1.5 py-0.5 rounded font-mono">
                          {form.handle}
                        </code>
                      </td>
                      <td className="px-4 py-3 text-sm text-kumo-subtle">
                        {form.fieldCount}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <button
                          type="button"
                          className="text-kumo-brand hover:underline font-medium"
                          onClick={(e) => {
                            e.stopPropagation();
                            goToFormSubmissions(form.id);
                          }}
                        >
                          {form.subCount} {form.subCount === 1 ? "submission" : "submissions"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-end" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end space-x-1">
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
                            className="ff-icon-btn-danger"
                            title="Delete form"
                            aria-label={`Delete ${form.name}`}
                            onClick={(e) => onDelete(form, e)}
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
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((form) => {
            const accent = resolveFormColor(form);
            return (
              <article
                key={form.id}
                className="relative rounded-lg border border-kumo-line bg-kumo-base p-5 shadow-xs hover:border-kumo-brand/50 transition-all cursor-pointer flex flex-col justify-between min-h-[140px]"
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
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ background: accent }} />
                      <h3 className="font-semibold text-kumo-strong text-base">{form.name}</h3>
                    </div>
                    <div
                      className="flex items-center space-x-1"
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
                        className="ff-icon-btn-danger"
                        title="Delete form"
                        aria-label={`Delete ${form.name}`}
                        onClick={(e) => onDelete(form, e)}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2">
                    <code className="text-xs bg-kumo-tint px-1.5 py-0.5 rounded font-mono text-kumo-subtle">
                      {form.handle}
                    </code>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-kumo-line flex items-center justify-between text-xs text-kumo-subtle">
                  <span>{form.fieldCount} fields</span>
                  <button
                    type="button"
                    className="text-kumo-brand hover:underline font-medium"
                    onClick={(e) => {
                      e.stopPropagation();
                      goToFormSubmissions(form.id);
                    }}
                  >
                    {form.subCount} submissions
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

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
            aria-labelledby="delete-form-title"
          >
            <h3 id="delete-form-title" className="text-lg font-semibold text-kumo-strong">
              Delete form?
            </h3>
            <p className="mt-2 text-sm text-kumo-subtle">
              Are you sure you want to delete <strong className="text-kumo-strong">{pendingDelete.name}</strong>? This will permanently delete the form, its configuration, and all its collected submissions. This cannot be undone.
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
                onClick={() => {
                  const form = pendingDelete;
                  setPendingDelete(null);
                  void deleteForm(form.id)
                    .then(onRefresh)
                    .catch((err) => {
                      onError(err instanceof Error ? err.message : String(err));
                    });
                }}
              >
                <TrashIcon /> Delete Form
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
