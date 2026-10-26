import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormField, RecipientType } from "../types";
import {
  attachNotification,
  detachNotification,
  listFormNotifications,
  listTemplates,
  updateFormNotification,
  type AssignmentDocument,
  type TemplateDocument,
} from "./ff-api";
import { goToSection } from "./ff-nav";

type Props = {
  formId: string;
  emailFields: FormField[];
};

export function FormNotificationsPanel({ formId, emailFields }: Props) {
  const [assignments, setAssignments] = useState<AssignmentDocument[]>([]);
  const [templates, setTemplates] = useState<TemplateDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [recipient, setRecipient] = useState("__custom__");
  const [customEmail, setCustomEmail] = useState("");

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

  const onAttach = async () => {
    if (!templateId) {
      setError("Create an email template in Settings first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const recipientType: RecipientType =
        recipient === "__custom__" ? "custom" : "submitter";
      await attachNotification({
        formId,
        templateId,
        recipientType,
        recipientField: recipientType === "submitter" ? recipient : undefined,
        customRecipient: recipientType === "custom" ? customEmail.trim() : undefined,
      });
      setCustomEmail("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="ff-meta">Loading notifications…</p>;

  if (templates.length === 0) {
    return (
      <div className="ff-empty-canvas">
        <p>Create an email template first, then attach it to this form.</p>
        <div className="ff-actions" style={{ justifyContent: "center", marginTop: "0.75rem" }}>
          <button
            type="button"
            className="ff-btn ff-btn-primary"
            onClick={() => goToSection("settings", "notifications")}
          >
            Open Settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ff-notif-panel">
      {error && <p className="ff-error">{error}</p>}

      {assignments.length === 0 ? (
        <p className="ff-meta">No notifications attached yet.</p>
      ) : (
        <div className="ff-table-wrap">
          <table className="ff-table">
            <thead>
              <tr>
                <th>Template</th>
                <th>To</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id}>
                  <td>{templateName(a.templateId)}</td>
                  <td>
                    {a.recipientType === "submitter"
                      ? `Submitter (${a.recipientField ?? "?"})`
                      : a.customRecipient ?? "—"}
                  </td>
                  <td>{a.enabled ? "On" : "Off"}</td>
                  <td className="ff-table-actions">
                    <button
                      type="button"
                      className="ff-btn"
                      disabled={busy}
                      onClick={() => {
                        void updateFormNotification({
                          id: a.id,
                          enabled: !a.enabled,
                        })
                          .then(refresh)
                          .catch((err) => {
                            setError(err instanceof Error ? err.message : String(err));
                          });
                      }}
                    >
                      {a.enabled ? "Turn off" : "Turn on"}
                    </button>
                    <button
                      type="button"
                      className="ff-btn ff-btn-danger"
                      disabled={busy}
                      onClick={() => {
                        if (!confirm("Remove this notification?")) return;
                        void detachNotification(a.id)
                          .then(refresh)
                          .catch((err) => {
                            setError(err instanceof Error ? err.message : String(err));
                          });
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="ff-panel ff-prop" style={{ marginTop: "1rem" }}>
        <h2>Attach notification</h2>
        <label htmlFor="ff-notif-tpl">Email template</label>
        <select
          id="ff-notif-tpl"
          className="ff-select"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.system ? `${t.name} (Built-in)` : t.name}
            </option>
          ))}
        </select>

        <label htmlFor="ff-notif-to">Send to</label>
        <select
          id="ff-notif-to"
          className="ff-select"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
        >
          {emailFields.map((f) => (
            <option key={f.id} value={f.handle}>
              Submitter — {f.label}
            </option>
          ))}
          <option value="__custom__">Custom email address</option>
        </select>

        {recipient === "__custom__" && (
          <>
            <label htmlFor="ff-notif-email">Custom email</label>
            <input
              id="ff-notif-email"
              type="email"
              value={customEmail}
              placeholder="team@example.com"
              onChange={(e) => setCustomEmail(e.target.value)}
            />
          </>
        )}

        <div className="ff-actions" style={{ marginTop: "0.85rem" }}>
          <button
            type="button"
            className="ff-btn ff-btn-primary"
            disabled={busy}
            onClick={() => void onAttach()}
          >
            {busy ? "Attaching…" : "Attach notification"}
          </button>
        </div>
      </div>
    </div>
  );
}
