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

type SecretReveal = {
  name: string;
  secret: string;
  action: "created" | "rotated";
};

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
    <div className="ff-settings-section">
      {error && <p className="ff-error">{error}</p>}

      {reveal && (
        <div className="ff-panel ff-prop" style={{ marginBottom: "0.85rem" }}>
          <h2>
            {reveal.action === "created"
              ? `Webhook “${reveal.name}” created`
              : `Secret rotated — ${reveal.name}`}
          </h2>
          <p className="ff-meta" style={{ marginBottom: "0.65rem" }}>
            Copy the signing secret now. It won’t be shown again.
          </p>
          <label htmlFor="ff-wh-secret">Signing secret</label>
          <input id="ff-wh-secret" readOnly value={reveal.secret} />
          <div className="ff-actions" style={{ marginTop: "0.75rem" }}>
            <button
              type="button"
              className="ff-btn ff-btn-primary"
              onClick={() => {
                void navigator.clipboard?.writeText(reveal.secret);
              }}
            >
              Copy secret
            </button>
            <button type="button" className="ff-btn" onClick={() => setReveal(null)}>
              I’ve copied it
            </button>
          </div>
        </div>
      )}

      {logFor && (
        <div className="ff-panel" style={{ marginBottom: "0.85rem" }}>
          <div className="ff-header" style={{ marginBottom: "0.65rem" }}>
            <div>
              <h2 style={{ margin: 0 }}>Delivery log — {logFor.name}</h2>
            </div>
            <button type="button" className="ff-btn" onClick={() => setLogFor(null)}>
              Close log
            </button>
          </div>
          {logFor.entries.length === 0 ? (
            <p className="ff-meta">No deliveries yet.</p>
          ) : (
            <div className="ff-table-wrap">
              <table className="ff-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Attempts</th>
                    <th>HTTP</th>
                    <th>Time</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {logFor.entries.map((e) => (
                    <tr key={e.id}>
                      <td>{e.status}</td>
                      <td>{e.attempts}</td>
                      <td>{e.statusCode ?? "—"}</td>
                      <td>{new Date(e.deliveredAt).toLocaleString()}</td>
                      <td className="ff-preview">{e.error ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <p className="ff-meta">Loading webhooks…</p>
      ) : webhooks.length === 0 ? (
        <div className="ff-empty-canvas" style={{ marginBottom: "0.85rem" }}>
          No webhooks yet. Add one here and it fires for every form by default —
          Slack, Zapier, or your own endpoint.
        </div>
      ) : (
        <div className="ff-table-wrap" style={{ marginBottom: "0.85rem" }}>
          <table className="ff-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>URL</th>
                <th>Scope</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {webhooks.map((wh) => (
                <tr key={wh.id}>
                  <td>{wh.name}</td>
                  <td className="ff-preview">{wh.url}</td>
                  <td>{formLabel(wh.formId)}</td>
                  <td>{wh.enabled ? "On" : "Paused"}</td>
                  <td className="ff-table-actions">
                    <button
                      type="button"
                      className="ff-btn"
                      disabled={busy}
                      onClick={() => {
                        void updateWebhook({ id: wh.id, enabled: !wh.enabled })
                          .then(refresh)
                          .catch((err) => {
                            setError(
                              err instanceof Error ? err.message : String(err),
                            );
                          });
                      }}
                    >
                      {wh.enabled ? "Pause" : "Enable"}
                    </button>
                    <button
                      type="button"
                      className="ff-btn"
                      disabled={busy}
                      onClick={() => void openLog(wh)}
                    >
                      Log
                    </button>
                    <button
                      type="button"
                      className="ff-btn"
                      disabled={busy}
                      onClick={() => {
                        if (
                          !confirm(
                            `Rotate signing secret for “${wh.name}”? Old secret stops working immediately.`,
                          )
                        ) {
                          return;
                        }
                        void rotateWebhookSecret(wh.id)
                          .then((r) => {
                            setReveal({
                              name: wh.name,
                              secret: r.secret,
                              action: "rotated",
                            });
                          })
                          .catch((err) => {
                            setError(
                              err instanceof Error ? err.message : String(err),
                            );
                          });
                      }}
                    >
                      Rotate secret
                    </button>
                    <button
                      type="button"
                      className="ff-btn ff-btn-danger"
                      disabled={busy}
                      onClick={() => {
                        if (!confirm(`Delete webhook “${wh.name}”?`)) return;
                        void deleteWebhook(wh.id)
                          .then(refresh)
                          .catch((err) => {
                            setError(
                              err instanceof Error ? err.message : String(err),
                            );
                          });
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="ff-panel ff-prop">
        <h2>Add webhook</h2>
        <p className="ff-meta" style={{ marginBottom: "0.75rem" }}>
          Webhooks live in Settings (site-wide). Default is every form; narrow
          to one form only if you need it. Deliveries are signed with HMAC-SHA256.
          URL must be HTTPS.
        </p>
        <label htmlFor="ff-wh-name">Name</label>
        <input
          id="ff-wh-name"
          value={name}
          placeholder="e.g. Slack alerts"
          onChange={(e) => setName(e.target.value)}
        />
        <label htmlFor="ff-wh-url">URL</label>
        <input
          id="ff-wh-url"
          type="url"
          value={url}
          placeholder="https://hooks.example.com/freeform"
          onChange={(e) => setUrl(e.target.value)}
        />
        <label htmlFor="ff-wh-scope">Which forms</label>
        <select
          id="ff-wh-scope"
          className="ff-select"
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
        <div className="ff-actions" style={{ marginTop: "0.85rem" }}>
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
    </div>
  );
}
