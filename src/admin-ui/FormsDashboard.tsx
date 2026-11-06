import { Button, Dialog } from "@cloudflare/kumo";
import { CaretDown, Plus, X } from "@phosphor-icons/react";
import {
  useEffect,
  useMemo,
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
import { DropdownMenu, RowActionsMenu } from "./RowActionsMenu";
import "./styles.css";

type Props = {
  forms: FormListItem[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onEdit: (id: string, handle?: string) => void;
  onError: (message: string | null) => void;
};

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
  const [view, setView] = useState<"cards" | "list">(() => {
    try {
      const saved = localStorage.getItem("ff.forms.view");
      return saved === "cards" || saved === "list" ? saved : "list";
    } catch {
      return "list";
    }
  });
  const [pendingDelete, setPendingDelete] = useState<FormListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<unknown>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [aiSettingsLink, setAiSettingsLink] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem("ff.forms.view", view);
    } catch {
      /* ignore quota / private mode */
    }
  }, [view]);

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
          <div className="relative inline-flex min-w-0 items-center">
            <select
              className="h-9 cursor-pointer appearance-none rounded-lg border border-kumo-line bg-kumo-control ps-3 pe-9 text-sm font-medium text-kumo-default transition-colors hover:bg-kumo-tint focus:outline-none focus:ring-2 focus:ring-kumo-focus"
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
            <CaretDown
              className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-kumo-subtle"
              aria-hidden="true"
            />
          </div>
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
        disablePointerDismissal
      >
        <Dialog
          className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] flex-col overflow-hidden p-0 sm:w-[32rem]"
          size="base"
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-kumo-line px-6 py-5">
              <div className="min-w-0">
                <Dialog.Title className="text-lg font-semibold">
                  Generate with AI
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-kumo-subtle">
                  Describe the form in plain language. Uses your OpenAI key from
                  Settings → AI &amp; spam.
                </Dialog.Description>
              </div>
              <Dialog.Close
                aria-label="Close"
                render={(props) => (
                  <Button
                    {...props}
                    type="button"
                    variant="ghost"
                    shape="square"
                    icon={<X className="size-4" aria-hidden="true" />}
                    aria-label="Close"
                    disabled={aiBusy}
                  />
                )}
              />
            </div>

            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-6 py-6">
              <label
                htmlFor="ff-ai-prompt"
                className="mb-1.5 block text-sm font-medium text-kumo-default"
              >
                Description
              </label>
              <textarea
                id="ff-ai-prompt"
                rows={5}
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

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-kumo-line px-6 py-4">
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
                        <RowActionsMenu label={`Actions for ${form.name}`}>
                          <DropdownMenu.Item
                            onClick={() => onEdit(form.id, form.handle)}
                          >
                            Edit
                          </DropdownMenu.Item>
                          <DropdownMenu.Item
                            onClick={() => goToFormSubmissions(form.id)}
                          >
                            Submissions
                          </DropdownMenu.Item>
                          <DropdownMenu.Separator />
                          <DropdownMenu.Item
                            variant="danger"
                            onClick={() => onDelete(form)}
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
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((form) => {
            const accent = resolveFormColor(form);
            return (
              <article
                key={form.id}
                className="ff-dash-card relative flex min-h-[168px] cursor-pointer flex-col justify-between rounded-lg border p-6 shadow-xs"
                style={{ "--ff-card-accent": accent } as CSSProperties}
                role="button"
                tabIndex={0}
                onClick={() => onEdit(form.id, form.handle)}
                onMouseMove={(e) => {
                  const el = e.currentTarget;
                  const r = el.getBoundingClientRect();
                  el.style.setProperty("--mx", `${e.clientX - r.left}px`);
                  el.style.setProperty("--my", `${e.clientY - r.top}px`);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onEdit(form.id, form.handle);
                  }
                }}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: accent }} />
                      <h3 className="ff-dash-card-title truncate">{form.name}</h3>
                    </div>
                    <div
                      className="inline-flex"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <RowActionsMenu label={`Actions for ${form.name}`}>
                        <DropdownMenu.Item
                          onClick={() => onEdit(form.id, form.handle)}
                        >
                          Edit
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          onClick={() => goToFormSubmissions(form.id)}
                        >
                          Submissions
                        </DropdownMenu.Item>
                        <DropdownMenu.Separator />
                        <DropdownMenu.Item
                          variant="danger"
                          onClick={() => onDelete(form)}
                        >
                          Delete
                        </DropdownMenu.Item>
                      </RowActionsMenu>
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
