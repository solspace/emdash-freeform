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
        title: "HTTP endpoints",
        description: "Manage endpoints, signing secrets, and delivery logs",
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
    // Lucide-style webhook — three linked hooks
    return (
      <svg {...common}>
        <path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2" />
        <path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06" />
        <path d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8" />
      </svg>
    );
  }
  // Sparkles — AI affordance, same stroke weight as sibling hub icons
  return (
    <svg {...common}>
      <path d="M12 3l1.4 4.2L18 8.5l-4.6 1.3L12 14l-1.4-4.2L6 8.5l4.6-1.3L12 3z" />
      <path d="M19 14l.7 2.1L22 16.7l-2.3.6L19 19.5l-.7-2.2L16 16.7l2.3-.6L19 14z" />
      <path d="M5 15l.55 1.65L7.2 17.2l-1.65.55L5 19.4l-.55-1.65L2.8 17.2l1.65-.55L5 15z" />
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
