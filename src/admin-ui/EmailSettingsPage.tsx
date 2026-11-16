import { SaveButton } from "@emdash-cms/admin";
import { useCallback, useState } from "react";
import { EmailProviderPanel } from "./EmailProviderPanel";
import { FreeformShell } from "./FreeformShell";
import { SettingsFrame } from "./SettingsFrame";
import type { SettingsSaveMeta } from "./settings-save";

const EMAIL_SETTINGS_FORM_ID = "ff-email-settings-form";

export function EmailSettingsPage() {
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
        title="Email Delivery"
        description="Choose how Freeform sends notification emails. Direct SMTP is the recommended default."
        actions={
          <SaveButton
            type="submit"
            form={EMAIL_SETTINGS_FORM_ID}
            isDirty={saveMeta.isDirty}
            isSaving={saveMeta.isSaving}
          />
        }
      >
        <EmailProviderPanel
          formId={EMAIL_SETTINGS_FORM_ID}
          onToast={showToast}
          onSaveMetaChange={onSaveMetaChange}
        />
      </SettingsFrame>
      {toast && <div className="ff-toast">{toast}</div>}
    </FreeformShell>
  );
}
