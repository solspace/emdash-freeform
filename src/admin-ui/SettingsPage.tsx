import { useEffect, type ReactNode } from "react";
import { FreeformShell } from "./FreeformShell";
import {
  SETTINGS_HUB_PATH,
  settingsSectionPath,
  type FreeformSettingsSection,
} from "./ff-nav";
import "./styles.css";

type HubItem = {
  id: FreeformSettingsSection;
  title: string;
  description: string;
  icon: "email" | "templates" | "webhooks" | "ai";
};

type HubSection = {
  id: string;
  title: string;
  description?: string;
  items: HubItem[];
};

/** EmDash Settings hub pattern: titled sections, each with a nav-row panel. */
const SECTIONS: HubSection[] = [
  {
    id: "email",
    title: "Email",
    description: "How Freeform sends mail and which templates it uses.",
    items: [
      {
        id: "email",
        title: "Email Delivery",
        description: "SMTP credentials, EmDash host mail, and delivery tests",
        icon: "email",
      },
      {
        id: "templates",
        title: "Email Templates",
        description: "Notification templates, headers, variables, and live preview",
        icon: "templates",
      },
    ],
  },
  {
    id: "webhooks",
    title: "Webhooks",
    description: "Push submission payloads to external HTTPS endpoints.",
    items: [
      {
        id: "webhooks",
        title: "Webhooks",
        description: "Endpoints, signing secrets, and delivery logs",
        icon: "webhooks",
      },
    ],
  },
  {
    id: "ai",
    title: "AI",
    description: "OpenAI features and spam scoring for submissions.",
    items: [
      {
        id: "ai",
        title: "AI & spam",
        description: "API key and AI spam scoring threshold",
        icon: "ai",
      },
    ],
  },
];

function HubIcon({ name }: { name: HubItem["icon"] }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  if (name === "email") {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
    );
  }
  if (name === "templates") {
    return (
      <svg {...common}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M8 13h8" />
        <path d="M8 17h6" />
      </svg>
    );
  }
  if (name === "webhooks") {
    return (
      <svg {...common}>
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 3v3" />
      <path d="M12 18v3" />
      <path d="M3 12h3" />
      <path d="M18 12h3" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

function CaretNext() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      fill="currentColor"
      viewBox="0 0 256 256"
      className="h-4 w-4 shrink-0 text-kumo-subtle rtl:rotate-180"
      aria-hidden="true"
    >
      <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z" />
    </svg>
  );
}

function SettingsHubSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const headingId = `ff-settings-section-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <section className="ff-settings-section" aria-labelledby={headingId}>
      <div className="ff-settings-section-copy">
        <h2 id={headingId} className="ff-settings-section-title">
          {title}
        </h2>
        {description ? (
          <p className="ff-settings-section-desc">{description}</p>
        ) : null}
      </div>
      <div className="ff-settings-panel">{children}</div>
    </section>
  );
}

/** Legacy `#email` / `#templates` hashes → dedicated settings pages. */
function redirectLegacyHash() {
  const raw = (window.location.hash || "").replace(/^#/, "").toLowerCase();
  if (!raw) return;
  const mapped: Record<string, FreeformSettingsSection> = {
    email: "email",
    templates: "templates",
    notifications: "templates",
    webhooks: "webhooks",
    ai: "ai",
  };
  const section = mapped[raw];
  if (!section) return;
  window.location.replace(settingsSectionPath(section));
}

/**
 * Freeform Settings hub — EmDash Settings style (categorized sections + nav rows).
 * Detail pages live at `/settings/{email|templates|webhooks|ai}`.
 */
export function SettingsPage() {
  useEffect(() => {
    redirectLegacyHash();
  }, []);

  return (
    <FreeformShell>
      <div className="ff-settings-frame ff-page">
        <header>
          <h1 className="text-2xl font-semibold leading-tight text-balance text-kumo-strong">
            Settings
          </h1>
        </header>

        <div className="grid gap-8">
          {SECTIONS.map((section) => (
            <SettingsHubSection
              key={section.id}
              title={section.title}
              description={section.description}
            >
              {section.items.map((item) => (
                <a
                  key={item.id}
                  href={settingsSectionPath(item.id)}
                  className="ff-settings-nav-row"
                >
                  <span className="ff-settings-nav-icon" aria-hidden="true">
                    <HubIcon name={item.icon} />
                  </span>
                  <span className="ff-settings-nav-copy">
                    <span className="ff-settings-nav-title">{item.title}</span>
                    <span className="ff-settings-nav-desc">{item.description}</span>
                  </span>
                  <CaretNext />
                </a>
              ))}
            </SettingsHubSection>
          ))}
        </div>
      </div>
    </FreeformShell>
  );
}

/** Re-export hub path for callers that need a stable constant. */
export { SETTINGS_HUB_PATH };
