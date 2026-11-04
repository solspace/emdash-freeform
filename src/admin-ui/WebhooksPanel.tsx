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

function WebhookEmptyIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2" />
      <path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06" />
      <path d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8" />
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
    <div className="grid gap-8">
      {error && <div className="ff-alert-box ff-alert-error">{error}</div>}

      {reveal && (
        <div className="ff-settings-panel">
          <div className="ff-settings-row-stack">
            <div className="ff-settings-card-intro">
              <h3 className="ff-card-title" style={{ fontSize: "1rem" }}>
                {reveal.action === "created" ? "Webhook created" : "Signing secret rotated"}
              </h3>
              <p className="ff-card-subtitle">
                Copy the secret for <strong>{reveal.name}</strong> now. It will not be shown again.
              </p>
            </div>
            <div className="ff-settings-row-inline" style={{ padding: 0 }}>
              <code
                className="ff-field-input ff-field-input-mono"
                style={{ height: "auto", padding: "0.5rem 0.75rem", flex: 1, userSelect: "all" }}
              >
                {reveal.secret}
              </code>
              <button
                type="button"
                className="ff-btn-submit"
                style={{ height: "2.25rem", padding: "0 0.9rem" }}
                onClick={() => {
                  void navigator.clipboard.writeText(reveal.secret);
                  setReveal(null);
                }}
              >
                Copy &amp; dismiss
              </button>
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
            <code className="ff-field-input-mono">x-freeform-signature</code> header.
          </p>
        </div>

        <div className="ff-settings-panel">
          {loading ? (
            <div className="ff-settings-row">
              <p className="ff-card-subtitle">Loading webhooks…</p>
            </div>
          ) : webhooks.length === 0 ? (
            <div className="ff-settings-row" style={{ alignItems: "center", textAlign: "center", gap: "0.75rem", padding: "1.75rem 1rem" }}>
              <span className="text-kumo-subtle" style={{ display: "flex", justifyContent: "center" }}>
                <WebhookEmptyIcon />
              </span>
              <div className="ff-settings-card-intro" style={{ alignItems: "center" }}>
                <p className="ff-card-title" style={{ fontSize: "0.95rem" }}>
                  No webhooks yet
                </p>
                <p className="ff-card-subtitle">
                  Add an HTTPS endpoint below to receive JSON payloads on each submission.
                </p>
              </div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="ff-settings-table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Endpoint</th>
                    <th scope="col">Scope</th>
                    <th scope="col">Status</th>
                    <th scope="col" style={{ textAlign: "end" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {webhooks.map((wh) => (
                    <tr key={wh.id}>
                      <td style={{ fontWeight: 500, color: "var(--text-color-kumo-strong)" }}>
                        {wh.name}
                      </td>
                      <td
                        className="ff-field-input-mono"
                        title={wh.url}
                        style={{
                          maxWidth: "18rem",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          color: "var(--text-color-kumo-subtle)",
                        }}
                      >
                        {wh.url}
                      </td>
                      <td style={{ color: "var(--text-color-kumo-subtle)" }}>
                        {formLabel(wh.formId)}
                      </td>
                      <td>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${
                            wh.enabled
                              ? "bg-green-500/15 text-green-600 dark:text-green-400"
                              : "bg-kumo-tint text-kumo-subtle"
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: wh.enabled ? "currentColor" : "var(--text-color-kumo-subtle)",
                            }}
                          />
                          {wh.enabled ? "Active" : "Paused"}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
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
        </div>
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
            <button
              type="button"
              className="ff-btn ff-btn-secondary ff-btn-sm"
              onClick={() => setLogFor(null)}
            >
              Close
            </button>
          </div>
          <div className="ff-settings-panel">
            {logFor.entries.length === 0 ? (
              <div className="ff-settings-row">
                <p className="ff-card-subtitle">No deliveries logged yet.</p>
              </div>
            ) : (
              logFor.entries.map((entry, idx) => (
                <div key={idx} className="ff-settings-row-inline">
                  <span className="ff-field-input-mono text-xs">
                    {new Date(entry.deliveredAt).toLocaleString()}
                  </span>
                  <span
                    className={
                      entry.status === "success"
                        ? "text-green-600 font-semibold text-xs"
                        : "text-red-500 font-semibold text-xs"
                    }
                  >
                    {entry.statusCode ? `HTTP ${entry.statusCode}` : entry.status}
                  </span>
                  <span className="ff-card-subtitle" style={{ flex: 1 }}>
                    {entry.error ?? `${entry.attempts} attempt(s)`}
                  </span>
                </div>
              ))
            )}
          </div>
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

        <div className="ff-settings-panel">
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

            <div className="ff-card-actions">
              <button
                type="button"
                className="ff-btn-submit"
                disabled={busy}
                onClick={() => void onCreate()}
              >
                {busy ? "Adding…" : "Add webhook"}
              </button>
              <span className="ff-card-subtitle">
                Secrets are shown once — store them in your receiver securely.
              </span>
            </div>
          </div>
        </div>
      </section>

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
              <button type="button" className="ff-btn ff-btn-secondary" onClick={() => setPendingRotate(null)}>
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
                      setReveal({ name: wh.name, secret: r.secret, action: "rotated" });
                    })
                    .catch((err) => {
                      setError(err instanceof Error ? err.message : String(err));
                    });
                }}
              >
                Rotate secret
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
              Delete <strong className="text-kumo-strong">{pendingDelete.name}</strong>? Deliveries to this endpoint will stop immediately.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" className="ff-btn ff-btn-secondary" onClick={() => setPendingDelete(null)}>
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
                <TrashIcon /> Delete webhook
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
