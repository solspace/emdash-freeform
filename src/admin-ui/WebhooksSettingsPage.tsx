import { SaveButton } from "@emdash-cms/admin";
import { useCallback, useState } from "react";
import { FreeformShell } from "./FreeformShell";
import { SettingsFrame } from "./SettingsFrame";
import type { SettingsSaveMeta } from "./settings-save";
import { WebhooksPanel } from "./WebhooksPanel";

const WEBHOOKS_FORM_ID = "ff-webhooks-settings-form";

export function WebhooksSettingsPage() {
  const [saveMeta, setSaveMeta] = useState<SettingsSaveMeta>({
    isDirty: false,
    isSaving: false,
  });

  const onSaveMetaChange = useCallback((meta: SettingsSaveMeta) => {
    setSaveMeta(meta);
  }, []);

  return (
    <FreeformShell>
      <SettingsFrame
        title="Webhooks"
        description="Deliver submission payloads in real time to HTTPS endpoints with HMAC signatures."
        actions={
          <SaveButton
            type="submit"
            form={WEBHOOKS_FORM_ID}
            isDirty={saveMeta.isDirty}
            isSaving={saveMeta.isSaving}
          />
        }
      >
        <WebhooksPanel formId={WEBHOOKS_FORM_ID} onSaveMetaChange={onSaveMetaChange} />
      </SettingsFrame>
    </FreeformShell>
  );
}
