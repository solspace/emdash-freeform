import { SaveButton } from "@emdash-cms/admin";
import { useCallback, useState } from "react";
import { AiSettingsPanel } from "./AiSettingsPanel";
import { FreeformShell } from "./FreeformShell";
import { SettingsFrame } from "./SettingsFrame";
import type { SettingsSaveMeta } from "./settings-save";

const AI_SETTINGS_FORM_ID = "ff-ai-settings-form";

export function AiSettingsPage() {
  const [toast, setToast] = useState<string | null>(null);
  const [saveMeta, setSaveMeta] = useState<SettingsSaveMeta>({
    isDirty: false,
    isSaving: false,
  });

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  };

  const onSaveMetaChange = useCallback((meta: SettingsSaveMeta) => {
    setSaveMeta(meta);
  }, []);

  return (
    <FreeformShell>
      <SettingsFrame
        title="AI & spam"
        description="OpenAI integration for form generation, summaries, and AI spam scoring."
        actions={
          <SaveButton
            type="submit"
            form={AI_SETTINGS_FORM_ID}
            isDirty={saveMeta.isDirty}
            isSaving={saveMeta.isSaving}
          />
        }
      >
        <AiSettingsPanel
          formId={AI_SETTINGS_FORM_ID}
          onToast={showToast}
          onSaveMetaChange={onSaveMetaChange}
        />
      </SettingsFrame>
      {toast && <div className="ff-toast">{toast}</div>}
    </FreeformShell>
  );
}
