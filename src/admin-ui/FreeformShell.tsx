import type { ReactNode } from "react";
import "./styles.css";

type Props = {
  children: ReactNode;
};

/** Shared Freeform admin wrapper (styles only — section nav lives in EmDash sidebar). */
export function FreeformShell({ children }: Props) {
  return (
    <div className="ff-root space-y-6">
      <div className="space-y-6">{children}</div>
    </div>
  );
}
