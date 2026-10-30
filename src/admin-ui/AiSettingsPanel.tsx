import { useCallback, useEffect, useState } from "react";
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
    setShowClearConfirm(false);
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

  if (loading) return <p className="text-sm text-kumo-subtle py-4 text-center">Loading AI settings…</p>;

  return (
    <div className="space-y-6 max-w-2xl">
      {error && (
        <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="ff-settings-card space-y-4">
        <h2 className="text-base font-semibold text-kumo-strong">OpenAI Integration</h2>
        <p className="text-sm text-kumo-subtle">
          Used for natural-language form generation, automatic submission summaries, and AI spam scoring. The key is stored securely in your database.
        </p>

        <div>
          <label htmlFor="ff-openai-key" className="text-xs font-medium uppercase tracking-wider text-kumo-subtle block mb-1">
            API Key {settings?.configured && settings.hint ? `(currently saved ${settings.hint})` : ""}
          </label>
          <input
            id="ff-openai-key"
            type="password"
            className="h-9 w-full rounded-md border border-kumo-line bg-kumo-control px-3 text-sm text-kumo-default font-mono placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-kumo-focus"
            placeholder={settings?.configured ? "••••••••••••••••" : "sk-..."}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            className="ff-btn ff-btn-primary"
            disabled={saving || (!apiKey.trim() && !settings?.configured)}
            onClick={() => void onSave()}
          >
            {saving ? "Saving…" : "Save Settings"}
          </button>
          {settings?.configured && (
            <button
              type="button"
              className="ff-btn ff-btn-danger"
              disabled={saving}
              onClick={() => setShowClearConfirm(true)}
            >
              Remove Key
            </button>
          )}
        </div>
      </div>

      <div className="ff-settings-card space-y-4">
        <h2 className="text-base font-semibold text-kumo-strong">AI Spam Protection</h2>
        <p className="text-sm text-kumo-subtle">
          When enabled, submissions are scored by AI (0–10). Submissions that score above the threshold are flagged in the submissions list.
        </p>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-kumo-line text-kumo-brand focus:ring-kumo-focus"
            checked={spamEnabled}
            onChange={(e) => setSpamEnabled(e.target.checked)}
          />
          <span className="text-sm font-medium text-kumo-strong">Enable AI Spam Scoring</span>
        </label>

        {spamEnabled && (
          <div>
            <label htmlFor="ff-spam-threshold" className="text-xs font-medium uppercase tracking-wider text-kumo-subtle block mb-1">
              Spam Threshold (Score 1-10)
            </label>
            <input
              id="ff-spam-threshold"
              type="number"
              min={1}
              max={10}
              className="h-9 w-32 rounded-md border border-kumo-line bg-kumo-control px-3 text-sm text-kumo-default focus:outline-none focus:ring-2 focus:ring-kumo-focus"
              value={spamThreshold}
              onChange={(e) => setSpamThreshold(Number(e.target.value))}
            />
            <p className="text-xs text-kumo-subtle mt-1">
              Submissions scoring at or above this value will be flagged as spam. (Default: 5)
            </p>
          </div>
        )}

        <div className="pt-2">
          <button
            type="button"
            className="ff-btn ff-btn-primary"
            disabled={saving}
            onClick={() => void onSave()}
          >
            {saving ? "Saving…" : "Save Spam Settings"}
          </button>
        </div>
      </div>

      {showClearConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          onClick={() => setShowClearConfirm(false)}
        >
          <div
            className="ff-modal-card w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-key-title"
          >
            <h3 id="clear-key-title" className="text-lg font-semibold text-kumo-strong">
              Remove OpenAI Key?
            </h3>
            <p className="mt-2 text-sm text-kumo-subtle">
              Removing the saved key will disable AI form generation, automatic summaries, and AI spam scoring until a new key is added.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="ff-btn ff-btn-secondary"
                onClick={() => setShowClearConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ff-btn ff-btn-danger-solid"
                onClick={() => void onClearKey()}
              >
                Remove Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
