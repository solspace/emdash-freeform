import type { ReactNode } from "react";
import { EditorHeader } from "@emdash-cms/admin";
import { SETTINGS_HUB_PATH } from "./ff-nav";
import "./styles.css";

type Props = {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
};

/** EmDash ArrowPrev (caret) — same path as core BackToSettingsLink. */
function ArrowPrevIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      fill="currentColor"
      viewBox="0 0 256 256"
      className="rotate-180 rtl:rotate-0"
      aria-hidden="true"
    >
      <path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z" />
    </svg>
  );
}

/**
 * Match EmDash `BackToSettingsLink` + `SettingsFrame`:
 * ghost square back control → Freeform settings hub, then page title.
 */
function BackToFreeformSettingsLink() {
  return (
    <a
      href={SETTINGS_HUB_PATH}
      aria-label="Back to settings"
      className="group shrink-0 font-medium select-none border-0 focus:outline-none focus:ring-kumo-focus/50 focus-visible:ring-2 focus-visible:ring-kumo-brand cursor-pointer disabled:cursor-not-allowed disabled:text-kumo-subtle gap-1.5 rounded-lg text-base justify-center p-0 size-9 text-kumo-default hover:bg-kumo-tint shadow-none bg-inherit flex items-center no-underline!"
    >
      <ArrowPrevIcon />
    </a>
  );
}

export function SettingsFrame({ title, description, actions, children }: Props) {
  return (
    <div className="ff-settings-frame">
      <EditorHeader
        leading={
          <div className="self-start">
            <BackToFreeformSettingsLink />
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
