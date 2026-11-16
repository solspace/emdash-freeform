import { SaveButton } from "@emdash-cms/admin";
import { useCallback, useState } from "react";
import { EmailTemplatesPanel } from "./EmailTemplatesPanel";
import { FreeformShell } from "./FreeformShell";
import { SettingsFrame } from "./SettingsFrame";
import type { SettingsSaveMeta } from "./settings-save";

const TEMPLATES_FORM_ID = "ff-templates-settings-form";

export function TemplatesSettingsPage() {
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
        title="Email Templates"
        description="Reusable notification templates with headers, HTML, variables, and live preview."
        actions={
          <SaveButton
            type="submit"
            form={TEMPLATES_FORM_ID}
            isDirty={saveMeta.isDirty}
            isSaving={saveMeta.isSaving}
          />
        }
      >
        <EmailTemplatesPanel
          formId={TEMPLATES_FORM_ID}
          onToast={showToast}
          onSaveMetaChange={onSaveMetaChange}
        />
      </SettingsFrame>
      {toast && <div className="ff-toast">{toast}</div>}
    </FreeformShell>
  );
}
