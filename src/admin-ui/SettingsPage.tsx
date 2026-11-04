import { useEffect, useState } from "react";
import { AiSettingsPanel } from "./AiSettingsPanel";
import { EmailProviderPanel } from "./EmailProviderPanel";
import { EmailTemplatesPanel } from "./EmailTemplatesPanel";
import { FreeformShell } from "./FreeformShell";
import { FF_UNDERLINE_TABLIST, ffUnderlineTabClass } from "./ff-nav";
import { WebhooksPanel } from "./WebhooksPanel";
import "./styles.css";

type SettingsTab = "email" | "templates" | "webhooks" | "ai";

const TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: "email", label: "Email Delivery" },
  { id: "templates", label: "Email Templates" },
  { id: "webhooks", label: "Webhooks" },
  { id: "ai", label: "AI & spam" },
];

function tabFromHash(): SettingsTab {
  const raw = (window.location.hash || "").replace(/^#/, "").toLowerCase();
  if (raw === "email" || raw === "templates" || raw === "webhooks" || raw === "ai") {
    return raw;
  }
  if (raw === "notifications") return "templates";
  return "email";
}

export function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>(() =>
    typeof window !== "undefined" ? tabFromHash() : "email",
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
    window.setTimeout(() => setToast(null), 2500);
  };

  return (
    <FreeformShell>
      <div className="ff-settings-frame">
        <div>
          <h1 className="text-2xl font-semibold leading-tight text-kumo-strong">
            Settings
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-5 text-kumo-subtle">
            Manage email delivery, notification templates, webhooks, and AI spam protection.
          </p>
        </div>

        <nav
          className={FF_UNDERLINE_TABLIST}
          role="tablist"
          aria-label="Settings sections"
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={ffUnderlineTabClass(active)}
                onClick={() => selectTab(t.id)}
              >
                {t.label}
              </button>
            );
          })}
        </nav>

        <div>
          {tab === "email" && <EmailProviderPanel onToast={showToast} />}
          {tab === "templates" && <EmailTemplatesPanel onToast={showToast} />}
          {tab === "webhooks" && <WebhooksPanel />}
          {tab === "ai" && <AiSettingsPanel onToast={showToast} />}
        </div>

        {toast && <div className="ff-toast">{toast}</div>}
      </div>
    </FreeformShell>
  );
}
