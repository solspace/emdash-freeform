import type { FormCaptchaSettings, FormPrivacySettings } from "../types";

type Props = {
  honeypotEnabled: boolean;
  captcha: FormCaptchaSettings | undefined;
  privacy: FormPrivacySettings | undefined;
  onHoneypotChange: (enabled: boolean) => void;
  onCaptchaChange: (next: FormCaptchaSettings | null) => void;
  onPrivacyChange: (next: FormPrivacySettings) => void;
};

const RETENTION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Keep forever" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "180 days" },
  { value: "365", label: "365 days" },
];

export function FormProtectionPanel({
  honeypotEnabled,
  captcha,
  privacy,
  onHoneypotChange,
  onCaptchaChange,
  onPrivacyChange,
}: Props) {
  const provider = captcha?.provider ?? "none";
  const retentionValue =
    typeof privacy?.retentionDays === "number" && privacy.retentionDays > 0
      ? String(privacy.retentionDays)
      : "";

  return (
    <div className="ff-protection-panel">
      <div className="ff-panel ff-prop">
        <h2>Built-in</h2>
        <p className="ff-meta" style={{ marginBottom: "0.75rem" }}>
          CSRF always runs on public submit. Honeypot is a hidden field bots
          often fill — when tripped, the submission is silently dropped.
        </p>
        <label htmlFor="ff-honeypot-enabled" className="ff-check-row">
          <input
            id="ff-honeypot-enabled"
            type="checkbox"
            checked={honeypotEnabled}
            onChange={(e) => onHoneypotChange(e.target.checked)}
          />
          Enable honeypot
        </label>
      </div>

      <div className="ff-panel ff-prop" style={{ marginTop: "0.85rem" }}>
        <h2>Privacy</h2>
        <p className="ff-meta" style={{ marginBottom: "0.75rem" }}>
          EU-friendly defaults: no IP stored unless you opt in. Add a notice and
          retention period so you only keep data as long as you need it. Use a{" "}
          <strong>Consent</strong> field on the Layout tab for opt-in checkboxes.
        </p>

        <label htmlFor="ff-privacy-notice">Privacy notice</label>
        <textarea
          id="ff-privacy-notice"
          rows={3}
          placeholder="We use your details only to respond to this enquiry."
          value={privacy?.notice ?? ""}
          onChange={(e) =>
            onPrivacyChange({ ...privacy, notice: e.target.value })
          }
        />

        <label htmlFor="ff-privacy-url">Privacy policy URL</label>
        <input
          id="ff-privacy-url"
          type="url"
          placeholder="https://example.com/privacy"
          value={privacy?.privacyPolicyUrl ?? ""}
          onChange={(e) =>
            onPrivacyChange({ ...privacy, privacyPolicyUrl: e.target.value })
          }
        />

        <label htmlFor="ff-retention">Auto-delete submissions after</label>
        <select
          id="ff-retention"
          className="ff-select"
          value={retentionValue}
          onChange={(e) => {
            const v = e.target.value;
            onPrivacyChange({
              ...privacy,
              retentionDays: v ? Number(v) : null,
            });
          }}
        >
          {RETENTION_OPTIONS.map((o) => (
            <option key={o.value || "forever"} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <label htmlFor="ff-store-ip" className="ff-check-row">
          <input
            id="ff-store-ip"
            type="checkbox"
            checked={privacy?.storeIp === true}
            onChange={(e) =>
              onPrivacyChange({ ...privacy, storeIp: e.target.checked })
            }
          />
          Store submitter IP address
        </label>
        <p className="ff-meta">Off by default — only enable if you have a reason.</p>
      </div>

      <div className="ff-panel ff-prop" style={{ marginTop: "0.85rem" }}>
        <h2>Captcha</h2>
        <p className="ff-meta" style={{ marginBottom: "0.75rem" }}>
          Cloudflare Turnstile is verified on every public submit when configured.
        </p>

        <label htmlFor="ff-captcha-provider">Provider</label>
        <select
          id="ff-captcha-provider"
          className="ff-select"
          value={provider}
          onChange={(e) => {
            const value = e.target.value;
            if (value === "none") onCaptchaChange(null);
            else
              onCaptchaChange({
                provider: "turnstile",
                siteKey: captcha?.siteKey,
                secretKey: captcha?.secretKey,
              });
          }}
        >
          <option value="none">None</option>
          <option value="turnstile">Cloudflare Turnstile</option>
        </select>

        {provider === "turnstile" && (
          <>
            <label htmlFor="ff-turnstile-site">Site key</label>
            <input
              id="ff-turnstile-site"
              value={captcha?.siteKey ?? ""}
              placeholder="0x4AAAAA…"
              onChange={(e) =>
                onCaptchaChange({
                  provider: "turnstile",
                  siteKey: e.target.value,
                  secretKey: captcha?.secretKey,
                })
              }
            />
            <label htmlFor="ff-turnstile-secret">Secret key</label>
            <input
              id="ff-turnstile-secret"
              type="password"
              value={captcha?.secretKey ?? ""}
              placeholder="0x4AAAAA…"
              onChange={(e) =>
                onCaptchaChange({
                  provider: "turnstile",
                  siteKey: captcha?.siteKey,
                  secretKey: e.target.value,
                })
              }
            />
          </>
        )}
      </div>

      <div className="ff-panel" style={{ marginTop: "0.85rem" }}>
        <h2>AI spam scoring</h2>
        <p className="ff-meta">
          Global OpenAI key and spam threshold live under Settings →{" "}
          <strong>AI &amp; spam</strong>. When scoring is on, flagged
          submissions skip notification emails.
        </p>
      </div>
    </div>
  );
}
