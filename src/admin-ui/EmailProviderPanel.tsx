import { useEffect, useState } from "react";
import type { EmailProviderType } from "../types";
import {
  getEmailSettings,
  saveEmailSettings,
  testEmailSettings,
  type EmailSettingsResponse,
} from "./ff-api";
import "./styles.css";

type Props = {
  onToast?: (msg: string) => void;
};

const PRESETS = [
  { name: "Mailgun", host: "smtp.mailgun.org", port: 587, secure: false },
  { name: "Postmark", host: "smtp.postmarkapp.com", port: 587, secure: false },
  { name: "Gmail", host: "smtp.gmail.com", port: 587, secure: false },
  { name: "AWS SES", host: "email-smtp.us-east-1.amazonaws.com", port: 587, secure: false },
];

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
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

export function EmailProviderPanel({ onToast }: Props) {
  const [settings, setSettings] = useState<EmailSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [provider, setProvider] = useState<EmailProviderType>("smtp");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpSecure, setSmtpSecure] = useState(false);

  // Test email state
  const [testEmail, setTestEmail] = useState("");
  const [testing, setTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getEmailSettings();
      setSettings(data);
      setProvider(data.provider || "smtp");
      setSmtpHost(data.smtpHost || "");
      setSmtpPort(data.smtpPort || 587);
      setSmtpUser(data.smtpUser || "");
      setSmtpPass(data.smtpPass || "");
      setSmtpFrom(data.smtpFrom || "");
      setSmtpSecure(Boolean(data.smtpSecure));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    setError(null);
    setSaveSuccess(false);
    try {
      const updated = await saveEmailSettings({
        provider,
        smtpHost,
        smtpPort: Number(smtpPort) || 587,
        smtpUser,
        smtpPass,
        smtpFrom,
        smtpSecure,
      });
      setSettings(updated);
      setSaveSuccess(true);
      onToast?.("Email settings saved successfully");
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleApplyPreset = (preset: typeof PRESETS[number]) => {
    setSmtpHost(preset.host);
    setSmtpPort(preset.port);
    setSmtpSecure(preset.secure);
    onToast?.(`Applied ${preset.name} preset`);
  };

  const handleSendTest = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!testEmail || !/\S+@\S+\.\S+/.test(testEmail)) {
      setTestError("Please enter a valid recipient email address.");
      setTestSuccess(null);
      return;
    }
    setTesting(true);
    setTestSuccess(null);
    setTestError(null);
    try {
      const res = await testEmailSettings(testEmail.trim());
      setTestSuccess(`✓ Test email delivered successfully via ${res.provider}! Check your inbox at ${testEmail}.`);
      onToast?.(`Test email sent to ${testEmail}`);
    } catch (err: any) {
      setTestError(err.message || String(err));
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="ff-settings-card" style={{ textAlign: "center", color: "var(--text-color-kumo-subtle)" }}>
        Loading email delivery settings…
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", maxWidth: "800px" }}>
      {/* Main Settings Card */}
      <form onSubmit={handleSave} className="ff-settings-card">
        {/* Card Header */}
        <div className="ff-card-header">
          <div>
            <h2 className="ff-card-title">Email Delivery Configuration</h2>
            <p className="ff-card-subtitle">
              Choose how Freeform sends notification emails. Standard direct SMTP is the recommended default.
            </p>
          </div>
          <div className="ff-status-badge">
            <span className="ff-status-dot" />
            <span>{provider.toUpperCase()} ACTIVE</span>
          </div>
        </div>

        {error && (
          <div className="ff-alert-box ff-alert-error">
            {error}
          </div>
        )}

        {/* Dispatch Transport Selector */}
        <div className="ff-field-group">
          <label className="ff-field-label">Dispatch Method</label>
          <div className="ff-transport-selector">
            {[
              {
                id: "smtp",
                title: "SMTP Server",
                badge: "Default",
                desc: "Standard direct delivery with STARTTLS or SSL/TLS encryption",
              },
              {
                id: "emdash",
                title: "EmDash Host",
                badge: null,
                desc: "Delegate to host EmDash ctx.email transport",
              },
              {
                id: "log",
                title: "Dev Mailbox",
                badge: null,
                desc: "Simulate dispatch & record logs without sending real mail",
              },
            ].map((item) => {
              const active = provider === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`ff-transport-option ${active ? "is-active" : ""}`}
                  onClick={() => setProvider(item.id as EmailProviderType)}
                >
                  <div className="ff-transport-top">
                    <span className="ff-transport-title">{item.title}</span>
                    {item.badge && <span className="ff-transport-badge">{item.badge}</span>}
                  </div>
                  <p className="ff-transport-desc">{item.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* SMTP Form Fields */}
        {provider === "smtp" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Presets Row */}
            <div className="ff-preset-row">
              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-color-kumo-subtle)" }}>
                Quick Presets:
              </span>
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  className="ff-preset-chip"
                  onClick={() => handleApplyPreset(p)}
                >
                  {p.name}
                </button>
              ))}
            </div>

            {/* Host & Port */}
            <div className="ff-form-grid-2">
              <div className="ff-field-group" style={{ flex: 3 }}>
                <label htmlFor="ff-smtp-host" className="ff-field-label">
                  SMTP Host Server
                </label>
                <input
                  id="ff-smtp-host"
                  type="text"
                  className="ff-field-input ff-field-input-mono"
                  placeholder="smtp.mailgun.org or smtp.postmarkapp.com"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                />
              </div>

              <div className="ff-field-group" style={{ flex: 1 }}>
                <label htmlFor="ff-smtp-port" className="ff-field-label">
                  Port
                </label>
                <input
                  id="ff-smtp-port"
                  type="number"
                  className="ff-field-input ff-field-input-mono"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(parseInt(e.target.value, 10) || 587)}
                />
              </div>
            </div>

            {/* User & Password */}
            <div className="ff-form-grid-2">
              <div className="ff-field-group">
                <label htmlFor="ff-smtp-user" className="ff-field-label">
                  Username
                </label>
                <input
                  id="ff-smtp-user"
                  type="text"
                  className="ff-field-input"
                  placeholder="postmaster@yourdomain.com"
                  value={smtpUser}
                  onChange={(e) => setSmtpUser(e.target.value)}
                />
              </div>

              <div className="ff-field-group">
                <label htmlFor="ff-smtp-pass" className="ff-field-label">
                  Password {settings?.hasSmtpPass ? "(saved)" : ""}
                </label>
                <input
                  id="ff-smtp-pass"
                  type="password"
                  className="ff-field-input"
                  placeholder={settings?.hasSmtpPass ? "••••••••••••" : "SMTP Password"}
                  value={smtpPass}
                  onChange={(e) => setSmtpPass(e.target.value)}
                />
              </div>
            </div>

            {/* From Address */}
            <div className="ff-field-group">
              <label htmlFor="ff-smtp-from" className="ff-field-label">
                Default Sender (From Address)
              </label>
              <input
                id="ff-smtp-from"
                type="text"
                className="ff-field-input"
                placeholder="notifications@yourdomain.com or Freeform <notifications@yourdomain.com>"
                value={smtpFrom}
                onChange={(e) => setSmtpFrom(e.target.value)}
              />
            </div>

            {/* SSL/TLS Checkbox */}
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.8125rem", color: "var(--text-color-kumo-default)" }}>
              <input
                type="checkbox"
                checked={smtpSecure}
                onChange={(e) => setSmtpSecure(e.target.checked)}
                style={{ width: "16px", height: "16px", cursor: "pointer" }}
              />
              <span>Use direct SSL/TLS encryption (port 465). Leave unchecked for standard STARTTLS (port 587).</span>
            </label>
          </div>
        )}

        {/* EmDash Mode Note */}
        {provider === "emdash" && (
          <div className="ff-preset-row">
            <span style={{ fontSize: "0.8125rem", color: "var(--text-color-kumo-default)" }}>
              Emails will be routed through the host CMS's default email provider (<code style={{ fontFamily: "monospace" }}>ctx.email.send</code>).
            </span>
          </div>
        )}

        {/* Dev Mailbox Note */}
        {provider === "log" && (
          <div className="ff-alert-box ff-alert-success" style={{ background: "rgba(245, 158, 11, 0.12)", borderColor: "rgba(245, 158, 11, 0.3)", color: "#b45309" }}>
            <span>Dev Mailbox active: notifications are simulated and stored in delivery logs without dispatching real emails.</span>
          </div>
        )}

        {/* Save Bar */}
        <div className="ff-card-actions">
          <button
            type="submit"
            className="ff-btn-submit"
            disabled={saving}
          >
            {saving ? (
              "Saving changes…"
            ) : saveSuccess ? (
              <>
                <CheckIcon /> Settings Saved!
              </>
            ) : (
              "Save Delivery Settings"
            )}
          </button>

          <span style={{ fontSize: "0.75rem", color: "var(--text-color-kumo-subtle)" }}>
            Changes apply immediately across all form submissions.
          </span>
        </div>
      </form>

      {/* Test Email Delivery Card */}
      <div className="ff-settings-card">
        <div className="ff-card-header">
          <div>
            <h3 className="ff-card-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <PaperPlaneIcon /> Test Email Delivery
            </h3>
            <p className="ff-card-subtitle">
              Send a test email to verify your SMTP connection credentials before going live.
            </p>
          </div>
        </div>

        <form onSubmit={handleSendTest} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
            <input
              type="email"
              className="ff-field-input"
              style={{ flex: "1 1 240px", maxWidth: "380px" }}
              placeholder="recipient@example.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
            />
            <button
              type="submit"
              className="ff-btn-outline"
              disabled={testing}
            >
              <PaperPlaneIcon /> {testing ? "Sending Test…" : "Send Test Email"}
            </button>
          </div>

          {testSuccess && (
            <div className="ff-alert-box ff-alert-success">
              <CheckIcon />
              <span>{testSuccess}</span>
            </div>
          )}

          {testError && (
            <div className="ff-alert-box ff-alert-error">
              <span><strong>Connection Failed:</strong> {testError}</span>
            </div>
          )}
        </form>
      </div>

      {/* Webhooks Hint Callout */}
      <div className="ff-preset-row" style={{ padding: "1rem 1.25rem", alignItems: "flex-start", gap: "0.75rem" }}>
        <span style={{ fontSize: "1.25rem", lineHeight: 1 }}>🔗</span>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <strong style={{ fontSize: "0.8125rem", color: "var(--text-color-kumo-strong)" }}>
            Need third-party webhook automation?
          </strong>
          <span style={{ fontSize: "0.75rem", color: "var(--text-color-kumo-subtle)" }}>
            You can deliver submission payloads in real time to Zapier, Make, Slack, or any HTTP endpoint under the <strong>Webhooks</strong> tab.
          </span>
        </div>
      </div>
    </div>
  );
}
