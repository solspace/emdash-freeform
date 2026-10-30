import { useCallback, useEffect, useRef, useState } from "react";
import type { NotificationFormat } from "../types";
import {
  deleteTemplate,
  listTemplates,
  saveTemplate,
  sendTestEmail,
  type TemplateDocument,
} from "./ff-api";
import "./styles.css";

const EMPTY_DRAFT = {
  name: "",
  subject: "New submission: {{form_name}}",
  body: "You received a new submission.\n\n{{all_fields}}\n",
  format: "html" as NotificationFormat,
  replyTo: "{{submitter}}",
  fromName: "",
  fromEmail: "",
  cc: "",
  bcc: "",
};

type Draft = typeof EMPTY_DRAFT;

type Props = {
  onToast?: (msg: string) => void;
};

const SAMPLE_VARS: Record<string, string> = {
  form_name: "Contact Request",
  submission_id: "sub_demo_982",
  submitted_at: "Today at 10:45 AM",
  submitter: "alex.smith@example.com",
  name: "Alex Smith",
  email: "alex.smith@example.com",
  message: "Hello! I am inquiring about your services and would love to get a quote.",
  all_fields: `<table style="width: 100%; border-collapse: collapse; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; margin: 16px 0; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
  <tbody>
    <tr style="background-color: #f9fafb; border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 10px 14px; font-weight: 600; color: #374151; width: 35%;">Full Name</td>
      <td style="padding: 10px 14px; color: #111827;">Alex Smith</td>
    </tr>
    <tr style="background-color: #ffffff; border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 10px 14px; font-weight: 600; color: #374151; width: 35%;">Email Address</td>
      <td style="padding: 10px 14px; color: #111827;">alex.smith@example.com</td>
    </tr>
    <tr style="background-color: #f9fafb; border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 10px 14px; font-weight: 600; color: #374151; width: 35%;">Message</td>
      <td style="padding: 10px 14px; color: #111827;">Hello! I am inquiring about your services and would love to get a quote.</td>
    </tr>
  </tbody>
</table>`,
};

function renderSamplePreview(template: string, format: NotificationFormat): string {
  let result = template;
  for (const [key, val] of Object.entries(SAMPLE_VARS)) {
    const rx = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
    if (key === "all_fields" && format === "text") {
      result = result.replace(
        rx,
        "Full Name: Alex Smith\nEmail Address: alex.smith@example.com\nMessage: Hello! I am inquiring about your services.",
      );
    } else {
      result = result.replace(rx, val);
    }
  }
  return result;
}

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

function PaperPlaneIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

export function EmailTemplatesPanel({ onToast }: Props) {
  const [templates, setTemplates] = useState<TemplateDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);
  const [viewOnly, setViewOnly] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<TemplateDocument | null>(null);

  // Editor sub-state
  const [editorTab, setEditorTab] = useState<"code" | "preview">("code");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testEmailRecipient, setTestEmailRecipient] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);

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
    setEditorTab("code");
    setShowAdvanced(false);
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
      replyTo: tpl.replyTo ?? "{{submitter}}",
      fromName: tpl.fromName ?? "",
      fromEmail: tpl.fromEmail ?? "",
      cc: tpl.cc ?? "",
      bcc: tpl.bcc ?? "",
    });
    setEditorTab("code");
    setShowAdvanced(Boolean(tpl.replyTo || tpl.fromEmail || tpl.fromName || tpl.cc || tpl.bcc));
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
      replyTo: tpl.replyTo ?? "{{submitter}}",
      fromName: tpl.fromName ?? "",
      fromEmail: tpl.fromEmail ?? "",
      cc: tpl.cc ?? "",
      bcc: tpl.bcc ?? "",
    });
    setEditorTab("code");
    setShowAdvanced(Boolean(tpl.replyTo || tpl.fromEmail || tpl.fromName || tpl.cc || tpl.bcc));
  };

  const cancelEdit = () => {
    setCreating(false);
    setEditingId(null);
    setViewOnly(false);
    setDraft(EMPTY_DRAFT);
    setEditorTab("code");
    setTestResult(null);
  };

  const insertVariable = (token: string) => {
    const el = bodyTextareaRef.current;
    if (!el) {
      setDraft({ ...draft, body: draft.body + token });
      return;
    }
    const start = el.selectionStart ?? draft.body.length;
    const end = el.selectionEnd ?? draft.body.length;
    const newBody = draft.body.slice(0, start) + token + draft.body.slice(end);
    setDraft({ ...draft, body: newBody });
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    }, 0);
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
        replyTo: draft.replyTo,
        fromName: draft.fromName,
        fromEmail: draft.fromEmail,
        cc: draft.cc,
        bcc: draft.bcc,
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

  const handleSendTest = async () => {
    if (!testEmailRecipient || !/\S+@\S+\.\S+/.test(testEmailRecipient)) {
      setTestResult("Please enter a valid email address.");
      return;
    }
    setSendingTest(true);
    setTestResult(null);
    try {
      const res = await sendTestEmail({
        toEmail: testEmailRecipient.trim(),
        templateId: editingId ?? undefined,
        subject: draft.subject,
        body: draft.body,
        format: draft.format,
        replyTo: draft.replyTo,
        fromName: draft.fromName,
        fromEmail: draft.fromEmail,
        cc: draft.cc,
        bcc: draft.bcc,
      });
      setTestResult(`✓ Test email delivered via ${res.provider}!`);
      onToast?.(`Test email sent to ${res.to}`);
    } catch (err: any) {
      setTestResult(`Error: ${err.message || String(err)}`);
    } finally {
      setSendingTest(false);
    }
  };

  const editing = creating || editingId !== null;
  const viewingSystem = templates.find((t) => t.id === editingId);

  const previewSubject = renderSamplePreview(draft.subject, draft.format);
  const previewBody = renderSamplePreview(draft.body, draft.format);

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-base font-medium text-kumo-strong">Notification Templates</h2>
          <p className="text-sm text-kumo-subtle max-w-2xl mt-0.5">
            Configure reusable email templates with custom headers, HTML formatting, variable tokens, and live previews. Dispatched via your configured SMTP provider.
          </p>
        </div>
        {!editing && (
          <button
            type="button"
            className="ff-btn-submit cursor-pointer shrink-0"
            onClick={startCreate}
          >
            New template
          </button>
        )}
      </div>

      {loading && <p className="text-sm text-kumo-subtle py-4 text-center">Loading templates…</p>}

      {editing ? (
        <div className="ff-settings-card" style={{ maxWidth: "900px" }}>
          <div className="ff-card-header">
            <div>
              <h3 className="ff-card-title">
                {creating ? "New Template" : viewingSystem ? "Built-in Template" : "Edit Template"}
              </h3>
              <p className="ff-card-subtitle">
                {viewOnly
                  ? "Built-in template is read-only. Duplicate it to customize."
                  : "Customize content, formatting, and header fields."}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <button
                type="button"
                className="ff-btn-outline"
                style={{ height: "2rem", padding: "0 0.75rem", fontSize: "0.75rem" }}
                onClick={() => {
                  setTestModalOpen(true);
                  setTestResult(null);
                }}
              >
                <PaperPlaneIcon /> Send test
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
            <div className="ff-field-group" style={{ flex: 2 }}>
              <label htmlFor="ff-tpl-name" className="ff-field-label">
                Template Name
              </label>
              <input
                id="ff-tpl-name"
                className="ff-field-input"
                value={draft.name}
                disabled={viewOnly}
                placeholder="e.g. Submitter Confirmation"
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div className="ff-field-group" style={{ flex: 1 }}>
              <label htmlFor="ff-tpl-format" className="ff-field-label">
                Format
              </label>
              <select
                id="ff-tpl-format"
                className="ff-field-input"
                value={draft.format}
                disabled={viewOnly}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    format: e.target.value === "html" ? "html" : "text",
                  })
                }
              >
                <option value="html">HTML Email (Rich)</option>
                <option value="text">Plain Text</option>
              </select>
            </div>
          </div>

          <div className="ff-field-group">
            <label htmlFor="ff-tpl-subject" className="ff-field-label">
              Subject Line
            </label>
            <input
              id="ff-tpl-subject"
              className="ff-field-input"
              value={draft.subject}
              disabled={viewOnly}
              placeholder="e.g. New submission: {{form_name}}"
              onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
            />
          </div>

          {/* Collapsible Headers Section */}
          <div className="rounded-md border border-kumo-line bg-kumo-tint/20 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-kumo-strong uppercase tracking-wider">
                Email Headers (Sender & Reply-To)
              </span>
              <button
                type="button"
                className="text-xs text-kumo-brand hover:underline font-medium"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                {showAdvanced ? "Hide headers ▲" : "Configure headers ▼"}
              </button>
            </div>

            {showAdvanced && (
              <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                <div>
                  <label htmlFor="ff-from-name" className="text-kumo-subtle block mb-1 font-medium">
                    From Name
                  </label>
                  <input
                    id="ff-from-name"
                    className="h-8 w-full rounded border border-kumo-line bg-kumo-base px-2.5 text-xs text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-focus disabled:opacity-60"
                    placeholder="e.g. Acme Notifications"
                    value={draft.fromName}
                    disabled={viewOnly}
                    onChange={(e) => setDraft({ ...draft, fromName: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="ff-from-email" className="text-kumo-subtle block mb-1 font-medium">
                    From Email
                  </label>
                  <input
                    id="ff-from-email"
                    className="h-8 w-full rounded border border-kumo-line bg-kumo-base px-2.5 text-xs text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-focus disabled:opacity-60"
                    placeholder="e.g. notifications@yourdomain.com"
                    value={draft.fromEmail}
                    disabled={viewOnly}
                    onChange={(e) => setDraft({ ...draft, fromEmail: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="ff-reply-to" className="text-kumo-subtle block mb-1 font-medium">
                    Reply-To Address
                  </label>
                  <input
                    id="ff-reply-to"
                    className="h-8 w-full rounded border border-kumo-line bg-kumo-base px-2.5 text-xs text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-focus disabled:opacity-60"
                    placeholder="e.g. {{submitter}} or support@yourdomain.com"
                    value={draft.replyTo}
                    disabled={viewOnly}
                    onChange={(e) => setDraft({ ...draft, replyTo: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="ff-cc" className="text-kumo-subtle block mb-1 font-medium">
                    CC / Carbon Copy
                  </label>
                  <input
                    id="ff-cc"
                    className="h-8 w-full rounded border border-kumo-line bg-kumo-base px-2.5 text-xs text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-focus disabled:opacity-60"
                    placeholder="comma-separated email addresses"
                    value={draft.cc}
                    disabled={viewOnly}
                    onChange={(e) => setDraft({ ...draft, cc: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="ff-bcc" className="text-kumo-subtle block mb-1 font-medium">
                    BCC / Blind Carbon Copy
                  </label>
                  <input
                    id="ff-bcc"
                    className="h-8 w-full rounded border border-kumo-line bg-kumo-base px-2.5 text-xs text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-focus disabled:opacity-60"
                    placeholder="comma-separated secret recipient addresses"
                    value={draft.bcc}
                    disabled={viewOnly}
                    onChange={(e) => setDraft({ ...draft, bcc: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Tokens / Variables Bar */}
          {!viewOnly && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-kumo-subtle">
                  Click to Insert Variable
                </span>
                <span className="text-xs text-kumo-subtle">Inserts at cursor</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "{{form_name}}",
                  "{{all_fields}}",
                  "{{submission_id}}",
                  "{{submitted_at}}",
                  "{{submitter}}",
                  "{{name}}",
                  "{{email}}",
                  "{{message}}",
                ].map((token) => (
                  <button
                    key={token}
                    type="button"
                    className="px-2 py-0.5 rounded bg-kumo-tint hover:bg-kumo-tint/80 border border-kumo-line text-xs font-mono text-kumo-strong transition-colors cursor-pointer"
                    title={`Insert ${token}`}
                    onClick={() => insertVariable(token)}
                  >
                    {token}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Body Editor with Tabs (Code vs Live Preview) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between border-b border-kumo-line pb-1.5">
              <label htmlFor="ff-tpl-body" className="text-xs font-medium uppercase tracking-wider text-kumo-subtle">
                Email Content
              </label>
              <div className="inline-flex rounded-md border border-kumo-line bg-kumo-control p-0.5">
                <button
                  type="button"
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    editorTab === "code"
                      ? "bg-kumo-base text-kumo-strong shadow-xs"
                      : "text-kumo-subtle hover:text-kumo-default"
                  }`}
                  onClick={() => setEditorTab("code")}
                >
                  Editor
                </button>
                <button
                  type="button"
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    editorTab === "preview"
                      ? "bg-kumo-base text-kumo-strong shadow-xs"
                      : "text-kumo-subtle hover:text-kumo-default"
                  }`}
                  onClick={() => setEditorTab("preview")}
                >
                  Live Preview
                </button>
              </div>
            </div>

            {editorTab === "code" ? (
              <textarea
                ref={bodyTextareaRef}
                id="ff-tpl-body"
                className="w-full font-mono text-xs rounded-md border border-kumo-line bg-kumo-control p-3 text-kumo-default focus:outline-none focus:ring-2 focus:ring-kumo-focus disabled:opacity-60"
                value={draft.body}
                disabled={viewOnly}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                rows={12}
                placeholder={
                  draft.format === "html"
                    ? "<h2>New Submission</h2>\n<p>You received a new submission from {{form_name}}.</p>\n\n{{all_fields}}"
                    : "You received a new submission.\n\n{{all_fields}}\n"
                }
              />
            ) : (
              <div className="rounded-lg border border-kumo-line bg-white text-gray-900 overflow-hidden shadow-xs">
                {/* Simulated Email Client Header */}
                <div className="bg-gray-100 border-b border-gray-200 px-4 py-3 text-xs text-gray-600 space-y-1">
                  <div>
                    <strong className="text-gray-800">Subject:</strong> {previewSubject}
                  </div>
                  <div>
                    <strong className="text-gray-800">From:</strong>{" "}
                    {draft.fromEmail
                      ? draft.fromName
                        ? `"${draft.fromName}" <${draft.fromEmail}>`
                        : draft.fromEmail
                      : "Notifications <notifications@example.com>"}
                  </div>
                  <div>
                    <strong className="text-gray-800">Reply-To:</strong>{" "}
                    {draft.replyTo ? renderSamplePreview(draft.replyTo, "text") : "submitter@example.com"}
                  </div>
                </div>

                {/* Email Body Rendering */}
                <div className="p-6">
                  {draft.format === "html" ? (
                    <div
                      className="email-preview-content prose max-w-none text-sm"
                      dangerouslySetInnerHTML={{ __html: previewBody }}
                    />
                  ) : (
                    <pre className="font-sans text-sm whitespace-pre-wrap text-gray-800">
                      {previewBody}
                    </pre>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="ff-card-actions">
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              {!viewOnly && (
                <button
                  type="button"
                  className="ff-btn-submit cursor-pointer"
                  disabled={saving}
                  onClick={() => void save()}
                >
                  {saving ? "Saving template…" : "Save template"}
                </button>
              )}
              {viewOnly && viewingSystem && (
                <button
                  type="button"
                  className="ff-btn-submit cursor-pointer"
                  onClick={() => startDuplicate(viewingSystem)}
                >
                  Duplicate
                </button>
              )}
              <button
                type="button"
                className="ff-btn-outline cursor-pointer"
                onClick={cancelEdit}
              >
                {viewOnly ? "Back" : "Cancel"}
              </button>
            </div>

            <button
              type="button"
              className="ff-btn-outline cursor-pointer"
              style={{ fontSize: "0.8125rem" }}
              onClick={() => setTestModalOpen(true)}
            >
              <PaperPlaneIcon /> Test with sample data
            </button>
          </div>
        </div>
      ) : (
        <>
          {!loading && templates.length === 0 && (
            <div className="rounded-md border border-kumo-line bg-kumo-base p-12 text-center text-sm text-kumo-subtle">
              No templates yet. Create one to start sending email notifications.
            </div>
          )}
          {templates.length > 0 && (
            <div className="rounded-md border border-kumo-line bg-kumo-base overflow-x-auto shadow-xs">
              <table className="w-full text-start">
                <thead>
                  <tr className="border-b border-kumo-line bg-kumo-tint/50">
                    <th scope="col" className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-kumo-subtle">Name</th>
                    <th scope="col" className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-kumo-subtle">Subject</th>
                    <th scope="col" className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-kumo-subtle">Format</th>
                    <th scope="col" className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-kumo-subtle">Reply-To</th>
                    <th scope="col" className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-kumo-subtle">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-kumo-line">
                  {templates.map((tpl) => (
                    <tr key={tpl.id} className="hover:bg-kumo-tint/25 transition-colors">
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="font-medium text-kumo-strong hover:text-kumo-brand"
                            onClick={() => startEdit(tpl)}
                          >
                            {tpl.name}
                          </button>
                          {tpl.system && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-kumo-tint text-kumo-subtle">
                              Built-in
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-kumo-subtle max-w-xs truncate">{tpl.subject}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono uppercase ${
                          tpl.format === "html" ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : "bg-kumo-tint text-kumo-subtle"
                        }`}>
                          {tpl.format}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-kumo-subtle font-mono truncate max-w-[120px]">
                        {tpl.replyTo || "—"}
                      </td>
                      <td className="px-4 py-3 text-end">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            type="button"
                            className="ff-btn ff-btn-secondary ff-btn-sm"
                            onClick={() => startEdit(tpl)}
                          >
                            {tpl.system ? "View" : "Edit"}
                          </button>
                          {tpl.system ? (
                            <button
                              type="button"
                              className="ff-btn ff-btn-secondary ff-btn-sm"
                              onClick={() => startDuplicate(tpl)}
                            >
                              Duplicate
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="ff-icon-btn-danger"
                              title="Delete template"
                              aria-label={`Delete ${tpl.name}`}
                              onClick={() => setPendingDelete(tpl)}
                            >
                              <TrashIcon />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Send Test Email Modal */}
      {testModalOpen && (
        <div
          className="ff-modal-overlay"
          onClick={() => setTestModalOpen(false)}
        >
          <div
            className="ff-modal"
            style={{ maxWidth: "460px" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="test-email-modal-title"
          >
            <h3 id="test-email-modal-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <PaperPlaneIcon /> Send Test Email
            </h3>
            <p className="ff-modal-desc">
              Freeform will render this template with sample submission data and dispatch it through your active email provider.
            </p>

            <div className="ff-field-group" style={{ marginBottom: "1rem" }}>
              <label htmlFor="ff-test-recipient" className="ff-field-label">
                Recipient Email Address
              </label>
              <input
                id="ff-test-recipient"
                type="email"
                className="ff-field-input"
                placeholder="your.email@example.com"
                value={testEmailRecipient}
                onChange={(e) => setTestEmailRecipient(e.target.value)}
              />
            </div>

            {testResult && (
              <div
                className={`ff-alert-box ${testResult.startsWith("✓") ? "ff-alert-success" : "ff-alert-error"}`}
                style={{ marginBottom: "1rem" }}
              >
                {testResult}
              </div>
            )}

            <div className="ff-modal-actions">
              <button
                type="button"
                className="ff-btn-outline cursor-pointer"
                onClick={() => setTestModalOpen(false)}
              >
                Close
              </button>
              <button
                type="button"
                className="ff-btn-submit cursor-pointer"
                disabled={sendingTest}
                onClick={() => void handleSendTest()}
              >
                {sendingTest ? "Sending…" : "Send Test Email"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {pendingDelete && (
        <div
          className="ff-modal-overlay"
          onClick={() => setPendingDelete(null)}
        >
          <div
            className="ff-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-tpl-title"
          >
            <h3 id="delete-tpl-title">
              Delete template?
            </h3>
            <p className="ff-modal-desc">
              Are you sure you want to delete <strong style={{ color: "var(--text-color-kumo-strong)" }}>{pendingDelete.name}</strong>? Forms using this template will fall back to default notifications.
            </p>
            <div className="ff-modal-actions">
              <button
                type="button"
                className="ff-btn-outline cursor-pointer"
                onClick={() => setPendingDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ff-btn-danger-solid cursor-pointer"
                onClick={() => {
                  const tpl = pendingDelete;
                  setPendingDelete(null);
                  void deleteTemplate(tpl.id)
                    .then(refresh)
                    .then(() => onToast?.("Template deleted"))
                    .catch((err) => {
                      setError(err instanceof Error ? err.message : String(err));
                    });
                }}
              >
                <TrashIcon /> Delete Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
