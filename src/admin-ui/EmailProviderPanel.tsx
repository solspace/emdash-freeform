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

  const [provider, setProvider] = useState<EmailProviderType>("smtp");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpSecure, setSmtpSecure] = useState(false);

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

  const handleApplyPreset = (preset: (typeof PRESETS)[number]) => {
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
      setTestSuccess(`Test email delivered via ${res.provider}. Check ${testEmail}.`);
      onToast?.(`Test email sent to ${testEmail}`);
    } catch (err: any) {
      setTestError(err.message || String(err));
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="ff-settings-panel">
        <div className="ff-settings-row">
          <p className="ff-card-subtitle">Loading email delivery settings…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      {error && <div className="ff-alert-box ff-alert-error">{error}</div>}

      <section className="ff-settings-section" aria-labelledby="ff-email-delivery-heading">
        <div className="ff-settings-section-head">
          <div className="ff-settings-section-copy">
            <h2 id="ff-email-delivery-heading" className="ff-settings-section-title">
              Delivery configuration
            </h2>
            <p className="ff-settings-section-desc">
              Pick a dispatch method and configure credentials when using SMTP.
            </p>
          </div>
          <div className="ff-status-badge">
            <span className="ff-status-dot" />
            <span>{provider.toUpperCase()} ACTIVE</span>
          </div>
        </div>

        <form onSubmit={handleSave} className="ff-settings-panel">
          <div className="ff-settings-row-stack">
            <div className="ff-field-group">
              <span className="ff-field-label">Dispatch method</span>
              <div className="ff-transport-selector">
                {[
                  {
                    id: "smtp",
                    title: "SMTP Server",
                    badge: "Default",
                    desc: "Standard direct delivery with STARTTLS or SSL/TLS",
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
                    desc: "Simulate dispatch without sending real mail",
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
          </div>

          {provider === "smtp" && (
            <div className="ff-settings-row-stack">
              <div className="ff-preset-row">
                <span style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-color-kumo-subtle)" }}>
                  Quick presets
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

              <div className="ff-form-grid-2">
                <div className="ff-field-group">
                  <label htmlFor="ff-smtp-host" className="ff-field-label">SMTP host</label>
                  <input
                    id="ff-smtp-host"
                    type="text"
                    className="ff-field-input ff-field-input-mono"
                    placeholder="smtp.mailgun.org or smtp.postmarkapp.com"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                  />
                </div>
                <div className="ff-field-group">
                  <label htmlFor="ff-smtp-port" className="ff-field-label">Port</label>
                  <input
                    id="ff-smtp-port"
                    type="number"
                    className="ff-field-input ff-field-input-mono"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(parseInt(e.target.value, 10) || 587)}
                  />
                </div>
              </div>

              <div className="ff-form-grid-2">
                <div className="ff-field-group">
                  <label htmlFor="ff-smtp-user" className="ff-field-label">Username</label>
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
                    placeholder={settings?.hasSmtpPass ? "••••••••••••" : "SMTP password"}
                    value={smtpPass}
                    onChange={(e) => setSmtpPass(e.target.value)}
                  />
                </div>
              </div>

              <div className="ff-field-group">
                <label htmlFor="ff-smtp-from" className="ff-field-label">Default sender (From)</label>
                <input
                  id="ff-smtp-from"
                  type="text"
                  className="ff-field-input"
                  placeholder="notifications@yourdomain.com"
                  value={smtpFrom}
                  onChange={(e) => setSmtpFrom(e.target.value)}
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-sm text-kumo-default">
                <input
                  type="checkbox"
                  checked={smtpSecure}
                  onChange={(e) => setSmtpSecure(e.target.checked)}
                  className="h-4 w-4 rounded border-kumo-line"
                />
                <span>Use direct SSL/TLS (port 465). Leave unchecked for STARTTLS (port 587).</span>
              </label>
            </div>
          )}

          {provider === "emdash" && (
            <div className="ff-settings-row">
              <p className="ff-card-subtitle">
                Emails route through the host CMS email provider (<code className="ff-field-input-mono">ctx.email.send</code>).
              </p>
            </div>
          )}

          {provider === "log" && (
            <div className="ff-settings-row">
              <div className="ff-alert-box ff-alert-success" style={{ background: "rgba(245, 158, 11, 0.12)", borderColor: "rgba(245, 158, 11, 0.3)", color: "#b45309" }}>
                Dev Mailbox is active — notifications are simulated and stored in delivery logs without sending real email.
              </div>
            </div>
          )}

          <div className="ff-settings-row">
            <div className="ff-card-actions">
              <button type="submit" className="ff-btn-submit" disabled={saving}>
                {saving ? (
                  "Saving…"
                ) : saveSuccess ? (
                  <>
                    <CheckIcon /> Saved
                  </>
                ) : (
                  "Save delivery settings"
                )}
              </button>
              <span className="ff-card-subtitle">Changes apply immediately to form notifications.</span>
            </div>
          </div>
        </form>
      </section>

      <section className="ff-settings-section" aria-labelledby="ff-test-email-heading">
        <div className="ff-settings-section-copy">
          <h2 id="ff-test-email-heading" className="ff-settings-section-title">
            Send test email
          </h2>
          <p className="ff-settings-section-desc">
            Verify your delivery settings before going live.
          </p>
        </div>

        <form onSubmit={handleSendTest} className="ff-settings-panel">
          <div className="ff-settings-row-inline">
            <div className="ff-field-group" style={{ flex: "1 1 240px", minWidth: 0 }}>
              <label htmlFor="ff-test-email" className="ff-field-label">Recipient email</label>
              <input
                id="ff-test-email"
                type="email"
                className="ff-field-input"
                placeholder="recipient@example.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
              />
            </div>
            <button type="submit" className="ff-btn-outline" disabled={testing}>
              <PaperPlaneIcon /> {testing ? "Sending…" : "Send test"}
            </button>
          </div>

          {testSuccess && (
            <div className="ff-settings-row">
              <div className="ff-alert-box ff-alert-success">
                <CheckIcon />
                <span>{testSuccess}</span>
              </div>
            </div>
          )}

          {testError && (
            <div className="ff-settings-row">
              <div className="ff-alert-box ff-alert-error">
                <span><strong>Connection failed:</strong> {testError}</span>
              </div>
            </div>
          )}
        </form>
      </section>
    </div>
  );
}
