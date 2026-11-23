import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { getAiSettings, saveAiSettings, type AiSettings } from "./ff-api";
import { FfSwitchRow } from "./ff-list";
import type { SettingsSaveMeta } from "./settings-save";
import "./styles.css";

type Props = {
  formId: string;
  onToast?: (msg: string) => void;
  onSaveMetaChange?: (meta: SettingsSaveMeta) => void;
};

function settingsSnapshot(
  enabled: boolean,
  threshold: number,
  skipDemoSeed: boolean,
) {
  return JSON.stringify({ enabled, threshold, skipDemoSeed });
}

export function AiSettingsPanel({ formId, onToast, onSaveMetaChange }: Props) {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [spamEnabled, setSpamEnabled] = useState(false);
  const [spamThreshold, setSpamThreshold] = useState(5);
  const [skipDemoSeed, setSkipDemoSeed] = useState(false);
  const [savedSpamEnabled, setSavedSpamEnabled] = useState(false);
  const [savedSpamThreshold, setSavedSpamThreshold] = useState(5);
  const [savedSkipDemoSeed, setSavedSkipDemoSeed] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const applyLoaded = useCallback((next: AiSettings) => {
    setSettings(next);
    setSpamEnabled(next.spam.enabled);
    setSpamThreshold(next.spam.threshold);
    setSavedSpamEnabled(next.spam.enabled);
    setSavedSpamThreshold(next.spam.threshold);
    setSkipDemoSeed(next.skipDemoSeed === true);
    setSavedSkipDemoSeed(next.skipDemoSeed === true);
    setApiKey("");
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getAiSettings();
      applyLoaded(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [applyLoaded]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isDirty = useMemo(() => {
    const keyDraft = Boolean(apiKey.trim());
    const restDirty =
      settingsSnapshot(spamEnabled, spamThreshold, skipDemoSeed) !==
      settingsSnapshot(savedSpamEnabled, savedSpamThreshold, savedSkipDemoSeed);
    return keyDraft || restDirty;
  }, [
    apiKey,
    spamEnabled,
    spamThreshold,
    skipDemoSeed,
    savedSpamEnabled,
    savedSpamThreshold,
    savedSkipDemoSeed,
  ]);

  useEffect(() => {
    onSaveMetaChange?.({ isDirty, isSaving: saving });
  }, [isDirty, saving, onSaveMetaChange]);

  const onSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!isDirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      const next = await saveAiSettings({
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        spamEnabled,
        spamThreshold,
        skipDemoSeed,
      });
      applyLoaded(next);
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
      applyLoaded(next);
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
    <form id={formId} className="grid gap-8" onSubmit={(e) => void onSave(e)} noValidate>
      {error && !showClearConfirm && (
        <div className="ff-alert-box ff-alert-error">{error}</div>
      )}

      <section className="ff-settings-section" aria-labelledby="ff-openai-heading">
        <div className="ff-settings-section-copy">
          <h2 id="ff-openai-heading" className="ff-settings-section-title">
            OpenAI integration
          </h2>
          <p className="ff-settings-section-desc">
            Used for natural-language form generation, automatic submission summaries, and AI spam
            scoring. The key is stored securely in your database.
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
                autoComplete="off"
              />
            </div>

            {settings?.configured && (
              <div className="ff-card-actions">
                <button
                  type="button"
                  className="ff-btn ff-btn-danger"
                  disabled={saving}
                  onClick={() => setShowClearConfirm(true)}
                >
                  Remove key
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="ff-settings-section" aria-labelledby="ff-spam-heading">
        <div className="ff-settings-section-copy">
          <h2 id="ff-spam-heading" className="ff-settings-section-title">
            AI spam protection
          </h2>
          <p className="ff-settings-section-desc">
            When enabled, submissions are scored by AI (0–10). Scores at or above the threshold are
            flagged in the submissions list.
          </p>
        </div>

        <div className="ff-settings-panel">
          <div className="ff-settings-row-stack">
            <FfSwitchRow
              id="ff-spam-enabled"
              label="Enable AI spam scoring"
              checked={spamEnabled}
              onCheckedChange={setSpamEnabled}
            />

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
          </div>
        </div>
      </section>

      <section className="ff-settings-section" aria-labelledby="ff-seed-heading">
        <div className="ff-settings-section-copy">
          <h2 id="ff-seed-heading" className="ff-settings-section-title">
            Starter Contact form
          </h2>
          <p className="ff-settings-section-desc">
            On first install (or first Freeform admin visit for native plugins), Freeform can create
            a demo Contact form. Turn this on to skip that seed going forward.
          </p>
        </div>

        <div className="ff-settings-panel">
          <div className="ff-settings-row-stack">
            <FfSwitchRow
              id="ff-skip-demo-seed"
              label="Skip creating the default Contact form"
              checked={skipDemoSeed}
              onCheckedChange={setSkipDemoSeed}
            />
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
        onConfirm={() => void onClearKey()}
      />
    </form>
  );
}
