import { useEffect, useState } from "react";
import { AiSettingsPanel } from "./AiSettingsPanel";
import { EmailTemplatesPanel } from "./EmailTemplatesPanel";
import { FreeformShell } from "./FreeformShell";
import { WebhooksPanel } from "./WebhooksPanel";
import "./styles.css";

type SettingsTab = "notifications" | "webhooks" | "ai";

const TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: "notifications", label: "Notifications" },
  { id: "webhooks", label: "Webhooks" },
  { id: "ai", label: "AI & spam" },
];

function tabFromHash(): SettingsTab {
  const raw = (window.location.hash || "").replace(/^#/, "").toLowerCase();
  if (raw === "webhooks" || raw === "ai" || raw === "notifications") return raw;
  return "notifications";
}

export function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>(() =>
    typeof window !== "undefined" ? tabFromHash() : "notifications",
  );
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const selectTab = (next: SettingsTab) => {
    setTab(next);
    const url = new URL(window.location.href);
    url.hash = next;
    window.history.replaceState(null, "", url.toString());
  };

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2000);
  };

  return (
    <FreeformShell section="settings">
      <div className="ff-header">
        <div>
          <h1>Settings</h1>
          <p>Email templates, webhooks, and plugin defaults.</p>
        </div>
      </div>

      <div className="ff-builder-tabs" style={{ marginBottom: "1rem" }} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`ff-builder-tab${tab === t.id ? " is-active" : ""}`}
            onClick={() => selectTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "notifications" && (
        <EmailTemplatesPanel onToast={showToast} />
      )}

      {tab === "webhooks" && <WebhooksPanel />}

      {tab === "ai" && <AiSettingsPanel onToast={showToast} />}

      {toast && <div className="ff-toast">{toast}</div>}
    </FreeformShell>
  );
}
