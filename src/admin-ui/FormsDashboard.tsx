import { Button, Dialog } from "@cloudflare/kumo";
import { Plus } from "@phosphor-icons/react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { FORM_TEMPLATES, formFromTemplate, isFormTemplateId } from "../lib/form-templates";
import {
  aiGenerate,
  deleteForm,
  getAiSettings,
  saveForm,
  type FormListItem,
} from "./ff-api";
import { ConfirmDialog } from "./ConfirmDialog";
import { FfListSearch } from "./ff-list";
import { goToFormSubmissions, goToSection, resolveFormColor } from "./ff-nav";
import "./styles.css";

type Props = {
  forms: FormListItem[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onEdit: (id: string, handle?: string) => void;
  onError: (message: string | null) => void;
};

function cardSurface(accent: string): CSSProperties {
  return {
    "--ff-card-accent": accent,
    background: `color-mix(in srgb, ${accent} 12%, var(--ff-surface))`,
    borderColor: `color-mix(in srgb, ${accent} 32%, var(--ff-line))`,
  } as CSSProperties;
}

/** Phosphor DotsThree — EmDash RowActionsMenu trigger. */
function DotsThreeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      fill="currentColor"
      viewBox="0 0 256 256"
      aria-hidden="true"
    >
      <path d="M140,128a12,12,0,1,1-12-12A12,12,0,0,1,140,128Zm56-12a12,12,0,1,0,12,12A12,12,0,0,0,196,116ZM60,116a12,12,0,1,0,12,12A12,12,0,0,0,60,116Z" />
    </svg>
  );
}

/** Sparkles — same AI affordance as Settings hub. */
function SparklesIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l1.4 4.2L18 8.5l-4.6 1.3L12 14l-1.4-4.2L6 8.5l4.6-1.3L12 3z" />
      <path d="M19 14l.7 2.1L22 16.7l-2.3.6L19 19.5l-.7-2.2L16 16.7l2.3-.6L19 14z" />
      <path d="M5 15l.55 1.65L7.2 17.2l-1.65.55L5 19.4l-.55-1.65L2.8 17.2l1.65-.55L5 15z" />
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
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<unknown>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const rowMenuRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    if (!openMenuId) return;
    function onDoc(e: Event) {
      if (rowMenuRef.current && !rowMenuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenMenuId(null);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenuId]);

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
      onEdit(saved.id, saved.handle);
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
      onEdit(saved.id, saved.handle);
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
    <div className="ff-page">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold leading-tight text-kumo-strong">
            Forms
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {aiConfigured && (
            <button
              type="button"
              className="ff-btn ff-btn-ai"
              disabled={creating || aiBusy}
              onClick={() => setAiOpen(true)}
            >
              <SparklesIcon /> Generate with AI
            </button>
          )}
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
          <Button
            variant="primary"
            icon={Plus}
            disabled={creating || aiBusy}
            onClick={() => void onCreate()}
          >
            {creating ? "Creating…" : "New form"}
          </Button>
        </div>
      </div>

      <Dialog.Root
        open={aiConfigured && aiOpen}
        onOpenChange={(next) => {
          if (!next && !aiBusy) {
            setAiOpen(false);
          }
        }}
        disablePointerDismissal={aiBusy}
      >
        <Dialog className="p-6" size="base">
          <Dialog.Title className="text-lg font-semibold">
            Generate with AI
          </Dialog.Title>
          <Dialog.Description className="text-kumo-subtle">
            Describe the form in plain language. Uses your OpenAI key from
            Settings → AI &amp; spam.
          </Dialog.Description>
          <div className="mt-4">
            <label
              htmlFor="ff-ai-prompt"
              className="mb-1.5 block text-sm font-medium text-kumo-default"
            >
              Description
            </label>
            <textarea
              id="ff-ai-prompt"
              rows={4}
              className="w-full rounded-lg border-0 bg-kumo-control p-3 text-sm text-kumo-default shadow-xs ring ring-kumo-line placeholder:text-kumo-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-kumo-brand"
              value={aiPrompt}
              placeholder="Job application with resume upload note, portfolio URL, and start-date preference"
              disabled={aiBusy}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !aiBusy) {
                  e.preventDefault();
                  void onAiCreate();
                }
              }}
            />
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button
              variant="secondary"
              disabled={aiBusy}
              onClick={() => setAiOpen(false)}
            >
              Cancel
            </Button>
            <button
              type="button"
              className="ff-btn ff-btn-ai"
              disabled={aiBusy || !aiPrompt.trim()}
              onClick={() => void onAiCreate()}
            >
              <SparklesIcon />
              {aiBusy ? "Generating…" : "Generate form"}
            </button>
          </div>
        </Dialog>
      </Dialog.Root>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FfListSearch
          placeholder="Search forms…"
          aria-label="Search forms"
          value={query}
          onChange={setQuery}
        />
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
                      onClick={() => onEdit(form.id, form.handle)}
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
                        <div
                          className="relative inline-flex justify-end"
                          ref={openMenuId === form.id ? rowMenuRef : undefined}
                        >
                          <button
                            type="button"
                            className="ff-row-actions-trigger"
                            aria-label={`Actions for ${form.name}`}
                            aria-haspopup="menu"
                            aria-expanded={openMenuId === form.id}
                            onClick={() =>
                              setOpenMenuId((id) => (id === form.id ? null : form.id))
                            }
                          >
                            <DotsThreeIcon />
                          </button>
                          {openMenuId === form.id && (
                            <div
                              className="ff-row-actions-menu"
                              role="menu"
                              aria-label="Form actions"
                            >
                              <button
                                type="button"
                                role="menuitem"
                                className="ff-row-actions-item"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  onEdit(form.id, form.handle);
                                }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className="ff-row-actions-item"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  goToFormSubmissions(form.id);
                                }}
                              >
                                Submissions
                              </button>
                              <div className="ff-row-actions-sep" role="separator" />
                              <button
                                type="button"
                                role="menuitem"
                                className="ff-row-actions-item is-danger"
                                onClick={(e) => {
                                  setOpenMenuId(null);
                                  onDelete(form, e);
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          )}
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
                onClick={() => onEdit(form.id, form.handle)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onEdit(form.id, form.handle);
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
                      className="relative inline-flex"
                      ref={openMenuId === form.id ? rowMenuRef : undefined}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="ff-row-actions-trigger"
                        aria-label={`Actions for ${form.name}`}
                        aria-haspopup="menu"
                        aria-expanded={openMenuId === form.id}
                        onClick={() =>
                          setOpenMenuId((id) => (id === form.id ? null : form.id))
                        }
                      >
                        <DotsThreeIcon />
                      </button>
                      {openMenuId === form.id && (
                        <div
                          className="ff-row-actions-menu"
                          role="menu"
                          aria-label="Form actions"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            className="ff-row-actions-item"
                            onClick={() => {
                              setOpenMenuId(null);
                              onEdit(form.id, form.handle);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="ff-row-actions-item"
                            onClick={() => {
                              setOpenMenuId(null);
                              goToFormSubmissions(form.id);
                            }}
                          >
                            Submissions
                          </button>
                          <div className="ff-row-actions-sep" role="separator" />
                          <button
                            type="button"
                            role="menuitem"
                            className="ff-row-actions-item is-danger"
                            onClick={(e) => {
                              setOpenMenuId(null);
                              onDelete(form, e);
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
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

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => {
          if (deleting) return;
          setPendingDelete(null);
          setDeleteError(null);
        }}
        role="alertdialog"
        title="Delete form?"
        description={
          <>
            Permanently delete <strong>{pendingDelete?.name}</strong>, its
            configuration, and all collected submissions? This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        pendingLabel="Deleting..."
        isPending={deleting}
        error={deleteError}
        preventCloseWhilePending
        onConfirm={() => {
          if (!pendingDelete) return;
          const form = pendingDelete;
          setDeleting(true);
          setDeleteError(null);
          void deleteForm(form.id)
            .then(() => {
              setPendingDelete(null);
              onRefresh();
            })
            .catch((err) => {
              const message = err instanceof Error ? err.message : String(err);
              setDeleteError(message);
              onError(message);
            })
            .finally(() => setDeleting(false));
        }}
      />
    </div>
  );
}
