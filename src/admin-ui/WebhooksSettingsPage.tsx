import { FreeformShell } from "./FreeformShell";
import { SettingsFrame } from "./SettingsFrame";
import { WebhooksPanel } from "./WebhooksPanel";

export function WebhooksSettingsPage() {
  return (
    <FreeformShell>
      <SettingsFrame
        title="Webhooks"
        description="Deliver submission payloads in real time to HTTPS endpoints with HMAC signatures."
      >
        <WebhooksPanel />
      </SettingsFrame>
    </FreeformShell>
  );
}
