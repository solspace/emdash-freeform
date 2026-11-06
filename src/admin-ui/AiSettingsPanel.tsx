import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { getAiSettings, saveAiSettings, type AiSettings } from "./ff-api";
import "./styles.css";

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
  const [showClearConfirm, setShowClearConfirm] = useState(false);

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
    setSaving(true);
    setError(null);
    try {
      const next = await saveAiSettings({ clearKey: true });
      setSettings(next);
      setApiKey("");
      setShowClearConfirm(false);
      onToast?.("API key removed");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="ff-settings-panel">
        <div className="ff-settings-row">
          <p className="ff-card-subtitle">Loading AI settings…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      {error && <div className="ff-alert-box ff-alert-error">{error}</div>}

      <section className="ff-settings-section" aria-labelledby="ff-openai-heading">
        <div className="ff-settings-section-copy">
          <h2 id="ff-openai-heading" className="ff-settings-section-title">
            OpenAI integration
          </h2>
          <p className="ff-settings-section-desc">
            Used for natural-language form generation, automatic submission summaries, and AI spam scoring. The key is stored securely in your database.
          </p>
        </div>

        <div className="ff-settings-panel">
          <div className="ff-settings-row-stack">
            <div className="ff-field-group">
              <label htmlFor="ff-openai-key" className="ff-field-label">
                API key
                {settings?.configured && settings.hint ? ` (currently saved ${settings.hint})` : ""}
              </label>
              <input
                id="ff-openai-key"
                type="password"
                className="ff-field-input ff-field-input-mono"
                placeholder={settings?.configured ? "••••••••••••••••" : "sk-..."}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>

            <div className="ff-card-actions">
              <button
                type="button"
                className="ff-btn-submit"
                disabled={saving || (!apiKey.trim() && !settings?.configured)}
                onClick={() => void onSave()}
              >
                {saving ? "Saving…" : "Save settings"}
              </button>
              {settings?.configured && (
                <button
                  type="button"
                  className="ff-btn ff-btn-danger"
                  disabled={saving}
                  onClick={() => setShowClearConfirm(true)}
                >
                  Remove key
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="ff-settings-section" aria-labelledby="ff-spam-heading">
        <div className="ff-settings-section-copy">
          <h2 id="ff-spam-heading" className="ff-settings-section-title">
            AI spam protection
          </h2>
          <p className="ff-settings-section-desc">
            When enabled, submissions are scored by AI (0–10). Scores at or above the threshold are flagged in the submissions list.
          </p>
        </div>

        <div className="ff-settings-panel">
          <div className="ff-settings-row-stack">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-kumo-line text-kumo-brand focus:ring-kumo-focus"
                checked={spamEnabled}
                onChange={(e) => setSpamEnabled(e.target.checked)}
              />
              <span className="text-sm font-medium text-kumo-strong">Enable AI spam scoring</span>
            </label>

            {spamEnabled && (
              <div className="ff-field-group">
                <label htmlFor="ff-spam-threshold" className="ff-field-label">
                  Spam threshold (1–10)
                </label>
                <input
                  id="ff-spam-threshold"
                  type="number"
                  min={1}
                  max={10}
                  className="ff-field-input"
                  style={{ maxWidth: "8rem" }}
                  value={spamThreshold}
                  onChange={(e) => setSpamThreshold(Number(e.target.value))}
                />
                <p className="ff-card-subtitle">
                  Submissions scoring at or above this value are flagged as spam. Default: 5.
                </p>
              </div>
            )}

            <div className="ff-card-actions">
              <button
                type="button"
                className="ff-btn-submit"
                disabled={saving}
                onClick={() => void onSave()}
              >
                {saving ? "Saving…" : "Save spam settings"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={showClearConfirm}
        onClose={() => {
          if (saving) return;
          setShowClearConfirm(false);
          setError(null);
        }}
        role="alertdialog"
        title="Remove OpenAI key?"
        description="Removing the saved key will disable AI form generation, automatic summaries, and AI spam scoring until a new key is added."
        confirmLabel="Remove key"
        pendingLabel="Removing..."
        isPending={saving}
        error={showClearConfirm ? error : null}
        preventCloseWhilePending
        onConfirm={() => void onClearKey()}
      />
    </div>
  );
}
