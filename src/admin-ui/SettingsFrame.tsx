import type { ReactNode } from "react";
import { EditorHeader } from "@emdash-cms/admin";
import { GhostSquareBackLink } from "./ff-back";
import { SETTINGS_HUB_PATH } from "./ff-nav";
import "./styles.css";

type Props = {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
};

/**
 * Match EmDash `SettingsFrame` + `BackToSettingsLink`:
 * ghost square back control → Freeform settings hub, then page title.
 */
export function SettingsFrame({ title, description, actions, children }: Props) {
  return (
    <div className="ff-settings-frame">
      <EditorHeader
        leading={
          <div className="self-start">
            <GhostSquareBackLink
              href={SETTINGS_HUB_PATH}
              aria-label="Back to settings"
              size="base"
            />
          </div>
        }
        actions={actions}
      >
        <div>
          <h1 className="text-2xl font-semibold leading-tight text-balance text-kumo-strong">
            {title}
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-5 text-pretty text-kumo-subtle">
            {description}
          </p>
        </div>
      </EditorHeader>
      <div className="mt-6">{children}</div>
    </div>
  );
}
