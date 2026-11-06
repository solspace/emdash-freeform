import { Button, Dialog, Switch } from "@cloudflare/kumo";
import { Plus } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormField, RecipientType } from "../types";
import { ConfirmDialog } from "./ConfirmDialog";
import { ActionIcon } from "./field-icons";
import {
  attachNotification,
  detachNotification,
  listFormNotifications,
  listTemplates,
  updateFormNotification,
  type AssignmentDocument,
  type TemplateDocument,
} from "./ff-api";
import {
  FfDataTable,
  FfFilterSelect,
  FfListSearch,
  FF_CHIP,
  FF_LIST_PAGE,
  FF_TOOLBAR_BTN,
} from "./ff-list";
import { goToSettingsSection } from "./ff-nav";

type Props = {
  formId: string;
  emailFields: FormField[];
};

type StatusFilter = "all" | "on" | "off";

function EmptyBellIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function recipientLabel(a: AssignmentDocument, emailFields: FormField[]): string {
  if (a.recipientType === "submitter") {
    const field = emailFields.find((f) => f.handle === a.recipientField);
    return field ? `Submitter — ${field.label}` : `Submitter (${a.recipientField ?? "?"})`;
  }
  return a.customRecipient?.trim() || "—";
}

export function FormNotificationsPanel({ formId, emailFields }: Props) {
  const [assignments, setAssignments] = useState<AssignmentDocument[]>([]);
  const [templates, setTemplates] = useState<TemplateDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AssignmentDocument | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [recipient, setRecipient] = useState("__custom__");
  const [customEmail, setCustomEmail] = useState("");
  const [modalError, setModalError] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<AssignmentDocument | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<unknown>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, t] = await Promise.all([
        listFormNotifications(formId),
        listTemplates(),
      ]);
      setAssignments(a);
      setTemplates(t);
      setTemplateId((prev) => prev || t[0]?.id || "");
      setRecipient((prev) =>
        prev !== "__custom__" ? prev : emailFields[0]?.handle ?? "__custom__",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [formId, emailFields]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const templateName = useMemo(() => {
    const map = new Map(
      templates.map((t) => [
        t.id,
        t.system ? `${t.name} (Built-in)` : t.name,
      ] as const),
    );
    return (id: string) => map.get(id) ?? "Missing template";
  }, [templates]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assignments.filter((a) => {
      if (statusFilter === "on" && !a.enabled) return false;
      if (statusFilter === "off" && a.enabled) return false;
      if (!q) return true;
      const hay = [
        templateName(a.templateId),
        recipientLabel(a, emailFields),
        a.enabled ? "on" : "off",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [assignments, query, statusFilter, templateName, emailFields]);

  const closeModal = (force = false) => {
    if (busy && !force) return;
    setModalOpen(false);
    setEditing(null);
    setModalError(null);
  };

  const openCreateModal = () => {
    setEditing(null);
    setModalError(null);
    setCustomEmail("");
    setTemplateId(templates[0]?.id || "");
    setRecipient(emailFields[0]?.handle ?? "__custom__");
    setModalOpen(true);
  };

  const openEditModal = (a: AssignmentDocument) => {
    setEditing(a);
    setModalError(null);
    setTemplateId(a.templateId);
    if (a.recipientType === "submitter" && a.recipientField) {
      setRecipient(a.recipientField);
      setCustomEmail("");
    } else {
      setRecipient("__custom__");
      setCustomEmail(a.customRecipient ?? "");
    }
    setModalOpen(true);
  };

  const onSaveModal = async () => {
    if (!templateId) {
      setModalError("Create an email template in Settings first.");
      return;
    }
    if (recipient === "__custom__" && !customEmail.trim()) {
      setModalError("Enter a custom email address.");
      return;
    }
    setBusy(true);
    setModalError(null);
    try {
      const recipientType: RecipientType =
        recipient === "__custom__" ? "custom" : "submitter";
      const recipientField = recipientType === "submitter" ? recipient : undefined;
      const customRecipient = recipientType === "custom" ? customEmail.trim() : undefined;

      if (editing) {
        await updateFormNotification({
          id: editing.id,
          templateId,
          recipientType,
          recipientField,
          customRecipient,
        });
      } else {
        await attachNotification({
          formId,
          templateId,
          recipientType,
          recipientField,
          customRecipient,
        });
      }
      setBusy(false);
      closeModal(true);
      await refresh();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const setEnabled = async (a: AssignmentDocument, enabled: boolean) => {
    if (a.enabled === enabled) return;
    setBusy(true);
    setError(null);
    try {
      await updateFormNotification({ id: a.id, enabled });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${FF_LIST_PAGE} ff-form-notif-page`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold leading-tight text-kumo-strong">
            Notifications
          </h2>
          <p className="mt-1 text-sm text-kumo-subtle">
            Email alerts sent when this form receives a submission.{" "}
            <button
              type="button"
              className="font-medium text-kumo-brand hover:underline"
              onClick={() => goToSettingsSection("templates")}
            >
              Add email template
            </button>
          </p>
        </div>
        <Button
          variant="primary"
          icon={Plus}
          disabled={loading}
          onClick={openCreateModal}
        >
          New notification
        </Button>
      </div>

      {error && <p className="ff-error">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <FfListSearch
          placeholder="Search notifications…"
          aria-label="Search notifications"
          value={query}
          onChange={setQuery}
        />
        <FfFilterSelect
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
        >
          <option value="all">All statuses</option>
          <option value="on">On</option>
          <option value="off">Off</option>
        </FfFilterSelect>
        <span className={`${FF_CHIP} ms-auto`}>
          {filtered.length} of {assignments.length}
        </span>
      </div>

      {loading ? (
        <p className="ff-meta py-8">Loading notifications…</p>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-kumo-elevated px-6 py-16 text-center ring ring-kumo-line">
          <span className="text-kumo-subtle">
            <EmptyBellIcon />
          </span>
          <div>
            <p className="text-sm font-medium text-kumo-default">No email templates yet</p>
            <p className="mt-1 text-sm text-kumo-subtle">
              Create a template first, then attach it to this form.
            </p>
          </div>
          <button
            type="button"
            className={FF_TOOLBAR_BTN}
            onClick={() => goToSettingsSection("templates")}
          >
            Open email templates
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-kumo-elevated px-6 py-16 text-center ring ring-kumo-line">
          <span className="text-kumo-subtle">
            <EmptyBellIcon />
          </span>
          <div>
            <p className="text-sm font-medium text-kumo-default">
              {assignments.length === 0 ? "No notifications yet" : "No matching notifications"}
            </p>
            <p className="mt-1 text-sm text-kumo-subtle">
              {assignments.length === 0
                ? "Attach an email template to notify your team or the submitter."
                : "Try a different search or status filter."}
            </p>
          </div>
          {assignments.length === 0 && (
            <Button variant="primary" icon={Plus} onClick={openCreateModal}>
              New notification
            </Button>
          )}
        </div>
      ) : (
        <FfDataTable>
          <thead>
            <tr>
              <th>Template</th>
              <th>To</th>
              <th>Status</th>
              <th className="w-28">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => {
              const tpl = templates.find((t) => t.id === a.templateId);
              return (
              <tr key={a.id}>
                <td>
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <span className="font-medium text-kumo-default">
                      {tpl?.name ?? "Missing template"}
                    </span>
                    {tpl?.system && <span className={FF_CHIP}>Built-in</span>}
                  </span>
                </td>
                <td className="text-kumo-subtle">{recipientLabel(a, emailFields)}</td>
                <td>
                  <Switch
                    checked={a.enabled}
                    disabled={busy}
                    aria-label={a.enabled ? "Disable notification" : "Enable notification"}
                    onCheckedChange={(checked) => void setEnabled(a, checked)}
                  />
                </td>
                <td>
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      className="inline-flex size-8 items-center justify-center rounded-md text-kumo-subtle transition-colors hover:bg-kumo-tint hover:text-kumo-default"
                      title="Edit notification"
                      disabled={busy}
                      onClick={() => openEditModal(a)}
                    >
                      <ActionIcon name="edit" size={14} />
                    </button>
                    <button
                      type="button"
                      className="inline-flex size-8 items-center justify-center rounded-md text-kumo-subtle transition-colors hover:bg-kumo-tint hover:text-kumo-danger"
                      title="Remove notification"
                      disabled={busy}
                      onClick={() => {
                        setConfirmError(null);
                        setPendingDelete(a);
                      }}
                    >
                      <ActionIcon name="delete" size={14} />
                    </button>
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </FfDataTable>
      )}

      <Dialog.Root
        open={modalOpen}
        onOpenChange={(next) => {
          if (!next) closeModal();
        }}
        disablePointerDismissal={busy}
      >
        <Dialog className="w-full max-w-md p-6" size="base">
          <Dialog.Title className="text-lg font-semibold">
            {editing ? "Edit notification" : "New notification"}
          </Dialog.Title>
          <Dialog.Description className="text-kumo-subtle">
            {editing
              ? "Update the template or recipient for this notification."
              : "Choose an email template and who should receive it when this form is submitted."}
          </Dialog.Description>

          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="ff-notif-tpl" className="mb-1.5 block text-sm font-medium text-kumo-default">
                Email template
              </label>
              <select
                id="ff-notif-tpl"
                className="h-9 w-full rounded-lg border-0 bg-kumo-control px-3 text-sm text-kumo-default shadow-xs ring ring-kumo-line focus:outline-none focus-visible:ring-2 focus-visible:ring-kumo-brand"
                value={templateId}
                disabled={busy || templates.length === 0}
                onChange={(e) => setTemplateId(e.target.value)}
              >
                {templates.length === 0 ? (
                  <option value="">No templates available</option>
                ) : (
                  templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.system ? `${t.name} (Built-in)` : t.name}
                    </option>
                  ))
                )}
              </select>
              <p className="mt-1.5 text-xs text-kumo-subtle">
                Need a different email?{" "}
                <button
                  type="button"
                  className="font-medium text-kumo-brand hover:underline"
                  onClick={() => goToSettingsSection("templates")}
                >
                  Create a new template
                </button>
              </p>
            </div>

            <div>
              <label htmlFor="ff-notif-to" className="mb-1.5 block text-sm font-medium text-kumo-default">
                Send to
              </label>
              <select
                id="ff-notif-to"
                className="h-9 w-full rounded-lg border-0 bg-kumo-control px-3 text-sm text-kumo-default shadow-xs ring ring-kumo-line focus:outline-none focus-visible:ring-2 focus-visible:ring-kumo-brand"
                value={recipient}
                disabled={busy}
                onChange={(e) => setRecipient(e.target.value)}
              >
                {emailFields.map((f) => (
                  <option key={f.id} value={f.handle}>
                    Submitter — {f.label}
                  </option>
                ))}
                <option value="__custom__">Custom email address</option>
              </select>
            </div>

            {recipient === "__custom__" && (
              <div>
                <label htmlFor="ff-notif-email" className="mb-1.5 block text-sm font-medium text-kumo-default">
                  Custom email
                </label>
                <input
                  id="ff-notif-email"
                  type="email"
                  value={customEmail}
                  placeholder="team@example.com"
                  disabled={busy}
                  className="h-9 w-full rounded-lg border-0 bg-kumo-control px-3 text-sm text-kumo-default shadow-xs ring ring-kumo-line placeholder:text-kumo-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-kumo-brand"
                  onChange={(e) => setCustomEmail(e.target.value)}
                />
              </div>
            )}

            {modalError && <p className="text-sm text-kumo-danger">{modalError}</p>}
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => closeModal()}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={busy || templates.length === 0}
              onClick={() => void onSaveModal()}
            >
              {busy ? "Saving…" : editing ? "Save changes" : "Attach notification"}
            </Button>
          </div>
        </Dialog>
      </Dialog.Root>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !confirmBusy) {
            setPendingDelete(null);
            setConfirmError(null);
          }
        }}
        title="Remove notification?"
        description={
          pendingDelete
            ? `Remove “${templateName(pendingDelete.templateId)}” from this form? Emails will stop for new submissions.`
            : ""
        }
        confirmLabel="Remove"
        confirmVariant="danger"
        isPending={confirmBusy}
        error={confirmError}
        onConfirm={() => {
          if (!pendingDelete) return;
          setConfirmBusy(true);
          setConfirmError(null);
          void detachNotification(pendingDelete.id)
            .then(async () => {
              setPendingDelete(null);
              await refresh();
            })
            .catch((err) => setConfirmError(err))
            .finally(() => setConfirmBusy(false));
        }}
      />
    </div>
  );
}
