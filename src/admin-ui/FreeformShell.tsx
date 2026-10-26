import type { ReactNode } from "react";
import freeformIconUrl from "./freeform-icon.svg?url";
import { FREEFORM_NAV, goToSection, type FreeformSection } from "./ff-nav";

type Props = {
  section: FreeformSection;
  children: ReactNode;
};

export function FreeformShell({ section, children }: Props) {
  return (
    <div className="ff-root">
      <header className="ff-topbar">
        <div className="ff-topbar-brand">
          <img
            className="ff-brand-mark"
            src={freeformIconUrl}
            alt=""
            width={30}
            height={30}
            decoding="async"
          />
          <button
            type="button"
            className="ff-brand-name"
            onClick={() => goToSection("forms")}
          >
            Freeform
          </button>
        </div>
        <nav className="ff-topnav" aria-label="Freeform sections">
          {FREEFORM_NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`ff-topnav-item${section === item.id ? " is-active" : ""}`}
              aria-current={section === item.id ? "page" : undefined}
              onClick={() => goToSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="ff-topbar-spacer" aria-hidden />
      </header>
      <div className="ff-shell">{children}</div>
    </div>
  );
}
