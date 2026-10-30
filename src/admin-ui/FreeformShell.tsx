import type { ReactNode } from "react";
import { FREEFORM_NAV, goToSection, type FreeformSection } from "./ff-nav";
import "./styles.css";

type Props = {
  section: FreeformSection;
  children: ReactNode;
  hideNav?: boolean;
};

export function FreeformShell({ section, children, hideNav }: Props) {
  return (
    <div className="ff-root space-y-6">
      {!hideNav && (
        <div className="border-b border-kumo-line">
          <nav className="flex space-x-6 -mb-px" aria-label="Freeform sections">
            {FREEFORM_NAV.map((item) => {
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => goToSection(item.id)}
                  className={`inline-flex items-center gap-2 border-b-2 py-2.5 px-1 text-sm font-medium transition-colors ${
                    active
                      ? "border-kumo-brand text-kumo-strong"
                      : "border-transparent text-kumo-subtle hover:text-kumo-default hover:border-kumo-line"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      )}
      <div className="space-y-6">{children}</div>
    </div>
  );
}
