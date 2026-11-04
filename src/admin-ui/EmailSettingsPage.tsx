import { useState } from "react";
import { EmailProviderPanel } from "./EmailProviderPanel";
import { FreeformShell } from "./FreeformShell";
import { SettingsFrame } from "./SettingsFrame";

export function EmailSettingsPage() {
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  };

  return (
    <FreeformShell>
      <SettingsFrame
        title="Email Delivery"
        description="Choose how Freeform sends notification emails. Direct SMTP is the recommended default."
      >
        <EmailProviderPanel onToast={showToast} />
      </SettingsFrame>
      {toast && <div className="ff-toast">{toast}</div>}
    </FreeformShell>
  );
}
