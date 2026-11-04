import { useState } from "react";
import { EmailTemplatesPanel } from "./EmailTemplatesPanel";
import { FreeformShell } from "./FreeformShell";
import { SettingsFrame } from "./SettingsFrame";

export function TemplatesSettingsPage() {
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  };

  return (
    <FreeformShell>
      <SettingsFrame
        title="Email Templates"
        description="Reusable notification templates with headers, HTML, variables, and live preview."
      >
        <EmailTemplatesPanel onToast={showToast} />
      </SettingsFrame>
      {toast && <div className="ff-toast">{toast}</div>}
    </FreeformShell>
  );
}
