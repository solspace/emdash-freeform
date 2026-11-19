import { Button, Switch } from "@cloudflare/kumo";
import { ArrowsClockwise, Copy, ListBullets, Trash } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createWebhook,
  deleteWebhook,
  getWebhookLog,
  listForms,
  listWebhooks,
  rotateWebhookSecret,
  updateWebhook,
  type FormListItem,
  type WebhookDeliveryEntry,
  type WebhookListItem,
} from "./ff-api";
import { ConfirmDialog } from "./ConfirmDialog";
import { FfDataTable } from "./ff-list";
import { DropdownMenu, RowActionsMenu } from "./RowActionsMenu";
import type { SettingsSaveMeta } from "./settings-save";
import "./styles.css";

type CreateDraft = {
  name: string;
  url: string;
  formScope: string;
};

const EMPTY_CREATE: CreateDraft = {
  name: "",
  url: "",
  formScope: "__all__",
};

function createSnapshot(d: CreateDraft) {
  return JSON.stringify(d);
}

type SecretReveal = {
  name: string;
  secret: string;
  action: "created" | "rotated";
};

function WebhookEmptyIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2" />
      <path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06" />
      <path d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8" />
    </svg>
  );
}

type Props = {
  formId: string;
  onSaveMetaChange?: (meta: SettingsSaveMeta) => void;
};

export function WebhooksPanel({ formId, onSaveMetaChange }: Props) {
  const [webhooks, setWebhooks] = useState<WebhookListItem[]>([]);
  const [forms, setForms] = useState<FormListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<SecretReveal | null>(null);
  const [logFor, setLogFor] = useState<{
    id: string;
    name: string;
    entries: WebhookDeliveryEntry[];
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<WebhookListItem | null>(null);
  const [pendingRotate, setPendingRotate] = useState<WebhookListItem | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<unknown>(null);

  const [name, setName] = useState(EMPTY_CREATE.name);
  const [url, setUrl] = useState(EMPTY_CREATE.url);
  const [formScope, setFormScope] = useState(EMPTY_CREATE.formScope);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [w, f] = await Promise.all([listWebhooks(), listForms()]);
      setWebhooks(w);
      setForms(f);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const formLabel = (formId: string | null) => {
    if (!formId) return "All forms";
    return forms.find((f) => f.id === formId)?.name ?? "One form";
  };

  const draft: CreateDraft = useMemo(
    () => ({ name, url, formScope }),
    [name, url, formScope],
  );

  const isDirty = useMemo(
    () => createSnapshot(draft) !== createSnapshot(EMPTY_CREATE),
    [draft],
  );

  useEffect(() => {
    onSaveMetaChange?.({ isDirty, isSaving: busy });
  }, [isDirty, busy, onSaveMetaChange]);

  const onCreate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!isDirty || busy) return;
    if (!name.trim() || !url.trim()) {
      setError("Name and HTTPS URL are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createWebhook({
        name: name.trim(),
        url: url.trim(),
        formId: formScope === "__all__" ? undefined : formScope,
      });
      setReveal({
        name: created.name,
        secret: created.secret,
        action: "created",
      });
      setName(EMPTY_CREATE.name);
      setUrl(EMPTY_CREATE.url);
      setFormScope(EMPTY_CREATE.formScope);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const openLog = async (wh: WebhookListItem) => {
    setBusy(true);
    setError(null);
    try {
      const entries = await getWebhookLog(wh.id);
      setLogFor({ id: wh.id, name: wh.name, entries });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-8">
      {error && <div className="ff-alert-box ff-alert-error">{error}</div>}

      {reveal && (
        <div className="rounded-xl bg-kumo-elevated p-4 ring ring-kumo-line">
          <div className="flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-semibold text-kumo-strong">
                {reveal.action === "created" ? "Webhook created" : "Signing secret rotated"}
              </h3>
              <p className="mt-1 text-sm text-kumo-subtle">
                Copy the secret for <strong>{reveal.name}</strong> now. It will not be shown again.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 select-all rounded-md bg-kumo-control px-3 py-2 font-mono text-xs text-kumo-default ring ring-kumo-line">
                {reveal.secret}
              </code>
              <Button
                variant="primary"
                size="sm"
                icon={<Copy className="size-4" aria-hidden="true" />}
                onClick={() => {
                  void navigator.clipboard.writeText(reveal.secret);
                  setReveal(null);
                }}
              >
                Copy &amp; dismiss
              </Button>
            </div>
          </div>
        </div>
      )}

      <section className="ff-settings-section" aria-labelledby="ff-webhooks-heading">
        <div className="ff-settings-section-copy">
          <h2 id="ff-webhooks-heading" className="ff-settings-section-title">
            Configured endpoints
          </h2>
          <p className="ff-settings-section-desc">
            Requests include an HMAC-SHA256 signature in the{" "}
            <code className="font-mono text-xs">x-freeform-signature</code> header.
          </p>
        </div>

        {loading ? (
          <div className="rounded-xl bg-kumo-elevated px-4 py-6 text-sm text-kumo-subtle ring ring-kumo-line">
            Loading webhooks…
          </div>
        ) : webhooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-kumo-elevated px-6 py-16 text-center ring ring-kumo-line">
            <span className="text-kumo-subtle">
              <WebhookEmptyIcon />
            </span>
            <div>
              <p className="text-sm font-medium text-kumo-default">No webhooks yet</p>
              <p className="mt-1 text-sm text-kumo-subtle">
                Add an HTTPS endpoint below to receive JSON payloads on each submission.
              </p>
            </div>
          </div>
        ) : (
          <FfDataTable>
            <thead>
              <tr>
                <th>Name</th>
                <th>Endpoint</th>
                <th>Scope</th>
                <th>Enabled</th>
                <th className="w-12">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {webhooks.map((wh) => (
                <tr key={wh.id}>
                  <td className="font-medium text-kumo-default">{wh.name}</td>
                  <td
                    className="max-w-[18rem] truncate font-mono text-xs text-kumo-subtle"
                    title={wh.url}
                  >
                    {wh.url}
                  </td>
                  <td className="text-kumo-subtle">{formLabel(wh.formId)}</td>
                  <td>
                    <Switch
                      checked={wh.enabled}
                      disabled={busy}
                      aria-label={wh.enabled ? `Pause ${wh.name}` : `Enable ${wh.name}`}
                      onCheckedChange={(checked) => {
                        void updateWebhook({ id: wh.id, enabled: checked })
                          .then(refresh)
                          .catch((err) => {
                            setError(err instanceof Error ? err.message : String(err));
                          });
                      }}
                    />
                  </td>
                  <td className="text-end" onClick={(e) => e.stopPropagation()}>
                    <RowActionsMenu label={`Actions for ${wh.name}`}>
                      <DropdownMenu.Item
                        icon={<ListBullets className="size-4" aria-hidden="true" />}
                        disabled={busy}
                        onClick={() => void openLog(wh)}
                      >
                        View log
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        icon={<ArrowsClockwise className="size-4" aria-hidden="true" />}
                        disabled={busy}
                        onClick={() => setPendingRotate(wh)}
                      >
                        Rotate secret
                      </DropdownMenu.Item>
                      <DropdownMenu.Separator />
                      <DropdownMenu.Item
                        variant="danger"
                        icon={<Trash className="size-4" aria-hidden="true" />}
                        disabled={busy}
                        onClick={() => setPendingDelete(wh)}
                      >
                        Delete
                      </DropdownMenu.Item>
                    </RowActionsMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </FfDataTable>
        )}
      </section>

      {logFor && (
        <section className="ff-settings-section" aria-labelledby="ff-webhook-log-heading">
          <div className="ff-settings-section-head">
            <div className="ff-settings-section-copy">
              <h2 id="ff-webhook-log-heading" className="ff-settings-section-title">
                Delivery log · {logFor.name}
              </h2>
              <p className="ff-settings-section-desc">Recent delivery attempts for this endpoint.</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setLogFor(null)}>
              Close
            </Button>
          </div>
          {logFor.entries.length === 0 ? (
            <div className="rounded-xl bg-kumo-elevated px-4 py-6 text-sm text-kumo-subtle ring ring-kumo-line">
              No deliveries logged yet.
            </div>
          ) : (
            <FfDataTable>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Status</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {logFor.entries.map((entry, idx) => (
                  <tr key={idx}>
                    <td className="whitespace-nowrap font-mono text-xs text-kumo-subtle">
                      {new Date(entry.deliveredAt).toLocaleString()}
                    </td>
                    <td>
                      <span
                        className={
                          entry.status === "success"
                            ? "text-xs font-semibold text-green-600 dark:text-green-400"
                            : "text-xs font-semibold text-kumo-danger"
                        }
                      >
                        {entry.statusCode ? `HTTP ${entry.statusCode}` : entry.status}
                      </span>
                    </td>
                    <td className="text-kumo-subtle">
                      {entry.error ?? `${entry.attempts} attempt(s)`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </FfDataTable>
          )}
        </section>
      )}

      <section className="ff-settings-section" aria-labelledby="ff-add-webhook-heading">
        <div className="ff-settings-section-copy">
          <h2 id="ff-add-webhook-heading" className="ff-settings-section-title">
            Add endpoint
          </h2>
          <p className="ff-settings-section-desc">
            HTTPS only. You’ll get a signing secret once after creating the webhook.
          </p>
        </div>

        <form
          id={formId}
          className="ff-settings-panel"
          onSubmit={(e) => void onCreate(e)}
          noValidate
        >
          <div className="ff-settings-row-stack">
            <div className="ff-form-grid-2">
              <div className="ff-field-group">
                <label htmlFor="ff-wh-name" className="ff-field-label">Name</label>
                <input
                  id="ff-wh-name"
                  className="ff-field-input"
                  value={name}
                  placeholder="e.g. Slack alerts"
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="ff-field-group">
                <label htmlFor="ff-wh-scope" className="ff-field-label">Scope</label>
                <select
                  id="ff-wh-scope"
                  className="ff-field-input"
                  value={formScope}
                  onChange={(e) => setFormScope(e.target.value)}
                >
                  <option value="__all__">All forms (recommended)</option>
                  {forms.map((f) => (
                    <option key={f.id} value={f.id}>
                      Only: {f.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="ff-field-group">
              <label htmlFor="ff-wh-url" className="ff-field-label">Endpoint URL (HTTPS)</label>
              <input
                id="ff-wh-url"
                type="url"
                className="ff-field-input ff-field-input-mono"
                value={url}
                placeholder="https://hooks.example.com/freeform"
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>

            <p className="ff-card-subtitle">
              Secrets are shown once after save — store them in your receiver securely.
            </p>
          </div>
        </form>
      </section>

      <ConfirmDialog
        open={Boolean(pendingRotate)}
        onClose={() => {
          if (confirmBusy) return;
          setPendingRotate(null);
          setConfirmError(null);
        }}
        role="alertdialog"
        title="Rotate signing secret?"
        description={
          <>
            Rotate signing secret for <strong>{pendingRotate?.name}</strong>? The
            previous secret will stop working immediately.
          </>
        }
        confirmLabel="Rotate secret"
        pendingLabel="Rotating..."
        variant="primary"
        isPending={confirmBusy}
        error={confirmError}
        onConfirm={() => {
          if (!pendingRotate) return;
          const wh = pendingRotate;
          setConfirmBusy(true);
          setConfirmError(null);
          void rotateWebhookSecret(wh.id)
            .then((r) => {
              setPendingRotate(null);
              setReveal({ name: wh.name, secret: r.secret, action: "rotated" });
            })
            .catch((err) => {
              const message = err instanceof Error ? err.message : String(err);
              setConfirmError(message);
              setError(message);
            })
            .finally(() => setConfirmBusy(false));
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => {
          if (confirmBusy) return;
          setPendingDelete(null);
          setConfirmError(null);
        }}
        role="alertdialog"
        title="Delete webhook?"
        description={
          <>
            Delete <strong>{pendingDelete?.name}</strong>? Deliveries to this
            endpoint will stop immediately.
          </>
        }
        confirmLabel="Delete"
        pendingLabel="Deleting..."
        isPending={confirmBusy}
        error={confirmError}
        onConfirm={() => {
          if (!pendingDelete) return;
          const wh = pendingDelete;
          setConfirmBusy(true);
          setConfirmError(null);
          void deleteWebhook(wh.id)
            .then(() => {
              setPendingDelete(null);
              return refresh();
            })
            .catch((err) => {
              const message = err instanceof Error ? err.message : String(err);
              setConfirmError(message);
              setError(message);
            })
            .finally(() => setConfirmBusy(false));
        }}
      />
    </div>
  );
}
