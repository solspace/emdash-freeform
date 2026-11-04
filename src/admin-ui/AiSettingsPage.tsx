import { useState } from "react";
import { AiSettingsPanel } from "./AiSettingsPanel";
import { FreeformShell } from "./FreeformShell";
import { SettingsFrame } from "./SettingsFrame";

export function AiSettingsPage() {
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  };

  return (
    <FreeformShell>
      <SettingsFrame
        title="AI & spam"
        description="OpenAI integration for form generation, summaries, and AI spam scoring."
      >
        <AiSettingsPanel onToast={showToast} />
      </SettingsFrame>
      {toast && <div className="ff-toast">{toast}</div>}
    </FreeformShell>
  );
}
