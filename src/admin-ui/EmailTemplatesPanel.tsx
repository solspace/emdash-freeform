import { useCallback, useEffect, useState } from "react";
import type { NotificationFormat } from "../types";
import {
  deleteTemplate,
  listTemplates,
  saveTemplate,
  type TemplateDocument,
} from "./ff-api";

const EMPTY_DRAFT = {
  name: "",
  subject: "New submission: {{form_name}}",
  body: "You received a new submission.\n\n{{all_fields}}\n",
  format: "text" as NotificationFormat,
};

type Draft = typeof EMPTY_DRAFT;

type Props = {
  onToast?: (msg: string) => void;
};

export function EmailTemplatesPanel({ onToast }: Props) {
  const [templates, setTemplates] = useState<TemplateDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);
  const [viewOnly, setViewOnly] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTemplates(await listTemplates());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startCreate = () => {
    setCreating(true);
    setEditingId(null);
    setViewOnly(false);
    setDraft(EMPTY_DRAFT);
  };

  const startEdit = (tpl: TemplateDocument) => {
    setCreating(false);
    setEditingId(tpl.id);
    setViewOnly(Boolean(tpl.system));
    setDraft({
      name: tpl.name,
      subject: tpl.subject,
      body: tpl.body,
      format: tpl.format,
    });
  };

  const startDuplicate = (tpl: TemplateDocument) => {
    setCreating(true);
    setEditingId(null);
    setViewOnly(false);
    setDraft({
      name: `${tpl.name} (copy)`,
      subject: tpl.subject,
      body: tpl.body,
      format: tpl.format,
    });
  };

  const cancelEdit = () => {
    setCreating(false);
    setEditingId(null);
    setViewOnly(false);
    setDraft(EMPTY_DRAFT);
  };

  const save = async () => {
    if (viewOnly) return;
    if (!draft.name.trim()) {
      setError("Template name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveTemplate({
        id: editingId ?? undefined,
        name: draft.name,
        subject: draft.subject,
        body: draft.body,
        format: draft.format,
      });
      cancelEdit();
      await refresh();
      onToast?.("Template saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const editing = creating || editingId !== null;
  const viewingSystem = templates.find((t) => t.id === editingId);

  return (
    <div className="ff-settings-section">
      {error && <p className="ff-error">{error}</p>}

      <div className="ff-header" style={{ marginBottom: "0.85rem" }}>
        <div>
          <p className="ff-meta" style={{ margin: 0 }}>
            Reusable notification emails. Delivery uses EmDash → Settings →
            Email (SMTP/Resend/etc. live there — not IMAP/POP inside Freeform).
            Built-in templates can’t be edited or deleted — duplicate them to
            customize. Attach under a form’s Notifications tab. Variables:{" "}
            <code>{"{{form_name}}"}</code>, <code>{"{{all_fields}}"}</code>,{" "}
            <code>{"{{submission_id}}"}</code>, field handles like{" "}
            <code>{"{{email}}"}</code>.
          </p>
        </div>
        {!editing && (
          <div className="ff-actions">
            <button type="button" className="ff-btn ff-btn-primary" onClick={startCreate}>
              New template
            </button>
          </div>
        )}
      </div>

      {loading && <p className="ff-meta">Loading templates…</p>}

      {editing ? (
        <div className="ff-panel ff-prop ff-template-editor">
          {viewOnly && (
            <p className="ff-meta" style={{ marginBottom: "0.75rem" }}>
              Built-in template (read-only). Use Duplicate to make an editable copy.
            </p>
          )}
          <label htmlFor="ff-tpl-name">Name</label>
          <input
            id="ff-tpl-name"
            value={draft.name}
            disabled={viewOnly}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <label htmlFor="ff-tpl-subject">Subject</label>
          <input
            id="ff-tpl-subject"
            value={draft.subject}
            disabled={viewOnly}
            onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
          />
          <label htmlFor="ff-tpl-format">Format</label>
          <select
            id="ff-tpl-format"
            className="ff-select"
            value={draft.format}
            disabled={viewOnly}
            onChange={(e) =>
              setDraft({
                ...draft,
                format: e.target.value === "html" ? "html" : "text",
              })
            }
          >
            <option value="text">Plain text</option>
            <option value="html">HTML</option>
          </select>
          <label htmlFor="ff-tpl-body">Body</label>
          <textarea
            id="ff-tpl-body"
            value={draft.body}
            disabled={viewOnly}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            rows={12}
          />
          <div className="ff-actions" style={{ marginTop: "0.85rem" }}>
            {!viewOnly && (
              <button
                type="button"
                className="ff-btn ff-btn-primary"
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? "Saving…" : "Save template"}
              </button>
            )}
            {viewOnly && viewingSystem && (
              <button
                type="button"
                className="ff-btn ff-btn-primary"
                onClick={() => startDuplicate(viewingSystem)}
              >
                Duplicate
              </button>
            )}
            <button type="button" className="ff-btn" onClick={cancelEdit}>
              {viewOnly ? "Back" : "Cancel"}
            </button>
          </div>
        </div>
      ) : (
        <>
          {!loading && templates.length === 0 && (
            <div className="ff-empty-canvas">
              No templates yet. Create one to start sending email notifications.
            </div>
          )}
          {templates.length > 0 && (
            <div className="ff-table-wrap">
              <table className="ff-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Subject</th>
                    <th>Format</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {templates.map((tpl) => (
                    <tr key={tpl.id}>
                      <td>
                        <button
                          type="button"
                          className="ff-linkish"
                          onClick={() => startEdit(tpl)}
                        >
                          {tpl.name}
                        </button>
                        {tpl.system && (
                          <span className="ff-badge" style={{ marginLeft: "0.5rem" }}>
                            Built-in
                          </span>
                        )}
                      </td>
                      <td className="ff-preview">{tpl.subject}</td>
                      <td>{tpl.format}</td>
                      <td className="ff-table-actions">
                        <button
                          type="button"
                          className="ff-btn"
                          onClick={() => startEdit(tpl)}
                        >
                          {tpl.system ? "View" : "Edit"}
                        </button>
                        {tpl.system ? (
                          <button
                            type="button"
                            className="ff-btn"
                            onClick={() => startDuplicate(tpl)}
                          >
                            Duplicate
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="ff-btn ff-btn-danger"
                            onClick={() => {
                              if (!confirm(`Delete “${tpl.name}”?`)) return;
                              void deleteTemplate(tpl.id)
                                .then(refresh)
                                .then(() => onToast?.("Template deleted"))
                                .catch((err) => {
                                  setError(
                                    err instanceof Error ? err.message : String(err),
                                  );
                                });
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
