import { useCallback, useEffect, useState } from "react";
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
import "./styles.css";

type SecretReveal = {
  name: string;
  secret: string;
  action: "created" | "rotated";
};

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

export function WebhooksPanel() {
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

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [formScope, setFormScope] = useState("__all__");

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

  const onCreate = async () => {
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
      setName("");
      setUrl("");
      setFormScope("__all__");
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
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {reveal && (
        <div className="rounded-lg border border-kumo-brand/40 bg-kumo-brand/5 p-4 space-y-2">
          <h3 className="text-sm font-semibold text-kumo-strong">
            {reveal.action === "created" ? "Webhook Created" : "Signing Secret Rotated"}
          </h3>
          <p className="text-xs text-kumo-subtle">
            Copy the secret for <strong>{reveal.name}</strong> now. It will not be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="text-xs font-mono bg-kumo-tint px-2 py-1 rounded select-all flex-1 break-all">
              {reveal.secret}
            </code>
            <button
              type="button"
              className="ff-btn ff-btn-primary ff-btn-sm shrink-0"
              onClick={() => {
                void navigator.clipboard.writeText(reveal.secret);
                setReveal(null);
              }}
            >
              Copy &amp; Dismiss
            </button>
          </div>
        </div>
      )}

      <div>
        <p className="text-sm text-kumo-subtle">
          HTTP webhooks deliver submission payloads in real time. Each request includes an HMAC-SHA256 signature in the <code>x-freeform-signature</code> header.
        </p>
      </div>

      {loading && <p className="text-sm text-kumo-subtle py-4 text-center">Loading webhooks…</p>}

      {!loading && webhooks.length > 0 && (
        <div className="rounded-md border border-kumo-line bg-kumo-base overflow-x-auto">
          <table className="w-full text-start">
            <thead>
              <tr className="border-b border-kumo-line bg-kumo-tint/50">
                <th scope="col" className="px-4 py-3 text-start text-sm font-medium text-kumo-subtle">Name</th>
                <th scope="col" className="px-4 py-3 text-start text-sm font-medium text-kumo-subtle">Endpoint URL</th>
                <th scope="col" className="px-4 py-3 text-start text-sm font-medium text-kumo-subtle">Scope</th>
                <th scope="col" className="px-4 py-3 text-start text-sm font-medium text-kumo-subtle">Status</th>
                <th scope="col" className="px-4 py-3 text-end text-sm font-medium text-kumo-subtle">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-kumo-line">
              {webhooks.map((wh) => (
                <tr key={wh.id} className="hover:bg-kumo-tint/25 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-kumo-strong">{wh.name}</td>
                  <td className="px-4 py-3 text-sm text-kumo-subtle max-w-xs truncate font-mono text-xs">{wh.url}</td>
                  <td className="px-4 py-3 text-sm text-kumo-subtle">{formLabel(wh.formId)}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${wh.enabled ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-kumo-tint text-kumo-subtle"}`}>
                      {wh.enabled ? "Active" : "Paused"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-end">
                    <div className="flex items-center justify-end space-x-1">
                      <button
                        type="button"
                        className="ff-btn ff-btn-secondary ff-btn-sm"
                        disabled={busy}
                        onClick={() => {
                          void updateWebhook({ id: wh.id, enabled: !wh.enabled })
                            .then(refresh)
                            .catch((err) => {
                              setError(err instanceof Error ? err.message : String(err));
                            });
                        }}
                      >
                        {wh.enabled ? "Pause" : "Enable"}
                      </button>
                      <button
                        type="button"
                        className="ff-btn ff-btn-secondary ff-btn-sm"
                        disabled={busy}
                        onClick={() => void openLog(wh)}
                      >
                        Log
                      </button>
                      <button
                        type="button"
                        className="ff-btn ff-btn-secondary ff-btn-sm"
                        disabled={busy}
                        onClick={() => setPendingRotate(wh)}
                      >
                        Rotate
                      </button>
                      <button
                        type="button"
                        className="ff-icon-btn-danger"
                        title="Delete webhook"
                        aria-label={`Delete ${wh.name}`}
                        disabled={busy}
                        onClick={() => setPendingDelete(wh)}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {logFor && (
        <div className="ff-settings-card space-y-4">
          <div className="flex items-center justify-between border-b border-kumo-line pb-3">
            <h3 className="text-base font-semibold text-kumo-strong">
              Delivery Log: {logFor.name}
            </h3>
            <button
              type="button"
              className="ff-btn ff-btn-secondary ff-btn-sm"
              onClick={() => setLogFor(null)}
            >
              Close Log
            </button>
          </div>
          {logFor.entries.length === 0 ? (
            <p className="text-sm text-kumo-subtle">No deliveries logged yet.</p>
          ) : (
            <div className="space-y-2">
              {logFor.entries.map((entry, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs p-2 rounded bg-kumo-tint/30">
                  <span className="font-mono">{new Date(entry.deliveredAt).toLocaleTimeString()}</span>
                  <span className={entry.status === "success" ? "text-green-600 font-semibold" : "text-red-500 font-semibold"}>
                    {entry.statusCode ? `HTTP ${entry.statusCode}` : entry.status}
                  </span>
                  <span className="text-kumo-subtle">{entry.error ?? `${entry.attempts} attempt(s)`}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="ff-settings-card space-y-4 max-w-2xl">
        <h2 className="text-base font-semibold text-kumo-strong">Add Webhook</h2>
        <p className="text-sm text-kumo-subtle">
          Configure an endpoint to receive JSON payloads whenever a form is submitted.
        </p>

        <div>
          <label htmlFor="ff-wh-name" className="text-xs font-medium uppercase tracking-wider text-kumo-subtle block mb-1">
            Name
          </label>
          <input
            id="ff-wh-name"
            className="h-9 w-full rounded-md border border-kumo-line bg-kumo-control px-3 text-sm text-kumo-default focus:outline-none focus:ring-2 focus:ring-kumo-focus"
            value={name}
            placeholder="e.g. Slack alerts"
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="ff-wh-url" className="text-xs font-medium uppercase tracking-wider text-kumo-subtle block mb-1">
            Endpoint URL (HTTPS)
          </label>
          <input
            id="ff-wh-url"
            type="url"
            className="h-9 w-full rounded-md border border-kumo-line bg-kumo-control px-3 text-sm text-kumo-default focus:outline-none focus:ring-2 focus:ring-kumo-focus"
            value={url}
            placeholder="https://hooks.example.com/freeform"
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="ff-wh-scope" className="text-xs font-medium uppercase tracking-wider text-kumo-subtle block mb-1">
            Scope
          </label>
          <select
            id="ff-wh-scope"
            className="h-9 rounded-md border border-kumo-line bg-kumo-control px-3 text-sm text-kumo-default focus:outline-none focus:ring-2 focus:ring-kumo-focus"
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

        <div className="pt-2">
          <button
            type="button"
            className="ff-btn ff-btn-primary"
            disabled={busy}
            onClick={() => void onCreate()}
          >
            {busy ? "Adding…" : "Add webhook"}
          </button>
        </div>
      </div>

      {pendingRotate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          onClick={() => setPendingRotate(null)}
        >
          <div
            className="ff-modal-card w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rotate-wh-title"
          >
            <h3 id="rotate-wh-title" className="text-lg font-semibold text-kumo-strong">
              Rotate signing secret?
            </h3>
            <p className="mt-2 text-sm text-kumo-subtle">
              Rotate signing secret for <strong className="text-kumo-strong">{pendingRotate.name}</strong>? The previous secret will stop working immediately.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="ff-btn ff-btn-secondary"
                onClick={() => setPendingRotate(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ff-btn ff-btn-primary"
                onClick={() => {
                  const wh = pendingRotate;
                  setPendingRotate(null);
                  void rotateWebhookSecret(wh.id)
                    .then((r) => {
                      setReveal({
                        name: wh.name,
                        secret: r.secret,
                        action: "rotated",
                      });
                    })
                    .catch((err) => {
                      setError(err instanceof Error ? err.message : String(err));
                    });
                }}
              >
                Rotate Secret
              </button>
            </div>
          </div>
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
            aria-labelledby="delete-wh-title"
          >
            <h3 id="delete-wh-title" className="text-lg font-semibold text-kumo-strong">
              Delete webhook?
            </h3>
            <p className="mt-2 text-sm text-kumo-subtle">
              Are you sure you want to delete <strong className="text-kumo-strong">{pendingDelete.name}</strong>? Deliveries to this endpoint will cease immediately.
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
                  const wh = pendingDelete;
                  setPendingDelete(null);
                  void deleteWebhook(wh.id)
                    .then(refresh)
                    .catch((err) => {
                      setError(err instanceof Error ? err.message : String(err));
                    });
                }}
              >
                <TrashIcon /> Delete Webhook
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
