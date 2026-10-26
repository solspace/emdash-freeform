import { useCallback, useEffect, useState } from "react";
import { getAiSettings, saveAiSettings, type AiSettings } from "./ff-api";

type Props = {
  onToast?: (msg: string) => void;
};

export function AiSettingsPanel({ onToast }: Props) {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [spamEnabled, setSpamEnabled] = useState(false);
  const [spamThreshold, setSpamThreshold] = useState(5);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getAiSettings();
      setSettings(next);
      setSpamEnabled(next.spam.enabled);
      setSpamThreshold(next.spam.threshold);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const next = await saveAiSettings({
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        spamEnabled,
        spamThreshold,
      });
      setSettings(next);
      setApiKey("");
      onToast?.("AI settings saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const onClearKey = async () => {
    if (!confirm("Remove the saved OpenAI API key?")) return;
    setSaving(true);
    setError(null);
    try {
      const next = await saveAiSettings({ clearKey: true });
      setSettings(next);
      setApiKey("");
      onToast?.("API key removed");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="ff-meta">Loading AI settings…</p>;

  return (
    <div className="ff-settings-section">
      {error && <p className="ff-error">{error}</p>}

      <div className="ff-panel ff-prop">
        <h2>OpenAI</h2>
        <p className="ff-meta" style={{ marginBottom: "0.75rem" }}>
          Freeform 1.0 uses OpenAI for form generation, submission briefs, and
          spam scoring. Paste a key from{" "}
          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noreferrer"
          >
            platform.openai.com
          </a>
          . The key is stored in your EmDash install — never sent to Solspace.
        </p>

        <label htmlFor="ff-openai-key">
          API key
          {settings?.configured && settings.hint
            ? ` (saved ${settings.hint})`
            : ""}
        </label>
        <input
          id="ff-openai-key"
          type="password"
          autoComplete="off"
          placeholder={
            settings?.configured ? "••••••••  (leave blank to keep)" : "sk-…"
          }
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />

        <div className="ff-actions" style={{ marginTop: "0.75rem" }}>
          {settings?.configured && (
            <button
              type="button"
              className="ff-btn ff-btn-danger"
              disabled={saving}
              onClick={() => void onClearKey()}
            >
              Remove key
            </button>
          )}
        </div>
      </div>

      <div className="ff-panel ff-prop" style={{ marginTop: "0.85rem" }}>
        <h2>AI spam scoring</h2>
        <p className="ff-meta" style={{ marginBottom: "0.75rem" }}>
          When enabled, each submission is scored 0–10. At or above the
          threshold, email notifications are skipped (submission is still saved).
          Needs an OpenAI key above.
        </p>

        <label htmlFor="ff-spam-enabled" className="ff-check-row">
          <input
            id="ff-spam-enabled"
            type="checkbox"
            checked={spamEnabled}
            onChange={(e) => setSpamEnabled(e.target.checked)}
          />
          Enable AI spam scoring
        </label>

        <label htmlFor="ff-spam-threshold">
          Spam threshold ({spamThreshold})
        </label>
        <input
          id="ff-spam-threshold"
          type="range"
          min={0}
          max={10}
          step={1}
          value={spamThreshold}
          disabled={!spamEnabled}
          onChange={(e) => setSpamThreshold(Number(e.target.value))}
        />
        <p className="ff-meta">
          Lower = stricter (more submissions treated as spam). Typical: 5–7.
        </p>
      </div>

      <div className="ff-actions" style={{ marginTop: "0.85rem" }}>
        <button
          type="button"
          className="ff-btn ff-btn-primary"
          disabled={saving}
          onClick={() => void onSave()}
        >
          {saving ? "Saving…" : "Save AI settings"}
        </button>
      </div>

      <div className="ff-panel" style={{ marginTop: "0.85rem" }}>
        <h2>What this unlocks</h2>
        <p className="ff-meta">
          On the Forms page, use <strong>Generate with AI</strong> to draft a
          form from a short description. Submissions get optional AI briefs when
          a key is present. Spam scoring runs on public submit when enabled
          above.
        </p>
      </div>
    </div>
  );
}
