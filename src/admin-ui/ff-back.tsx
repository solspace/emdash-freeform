import type { ButtonHTMLAttributes, ReactNode } from "react";

type BackSize = "sm" | "base";

/** EmDash `ArrowPrev` — ArrowRight + rotate-180 (same path as Phosphor). */
export function ArrowPrevIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      fill="currentColor"
      viewBox="0 0 256 256"
      className={`rotate-180 rtl:rotate-0${className ? ` ${className}` : ""}`}
      aria-hidden="true"
    >
      <path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z" />
    </svg>
  );
}

/**
 * Kumo `buttonVariants({ variant: "ghost", shape: "square", size })` +
 * EmDash `RouterLinkButton` extras (`flex items-center no-underline!`).
 *
 * - `base` → settings sub-pages (`BackToSettingsLink`, size-9)
 * - `sm` → content editor bar / form builder (`size-6.5`, icon size-4)
 */
export function ghostSquareBackClass(size: BackSize = "base"): string {
  if (size === "sm") {
    return [
      "group flex w-max shrink-0 items-center font-medium select-none",
      "border-0 shadow-xs",
      "focus:outline-none focus:ring-kumo-focus/50 focus-visible:ring-2 focus-visible:ring-kumo-brand",
      "cursor-pointer disabled:cursor-not-allowed disabled:text-kumo-subtle",
      "gap-1 rounded-md text-xs",
      "items-center justify-center p-0 size-6.5",
      "text-kumo-default hover:bg-kumo-tint shadow-none bg-inherit",
      "flex items-center no-underline!",
    ].join(" ");
  }
  return [
    "group flex w-max shrink-0 items-center font-medium select-none",
    "border-0 shadow-xs",
    "focus:outline-none focus:ring-kumo-focus/50 focus-visible:ring-2 focus-visible:ring-kumo-brand",
    "cursor-pointer disabled:cursor-not-allowed disabled:text-kumo-subtle",
    "gap-1.5 rounded-lg text-base",
    "items-center justify-center p-0 size-9",
    "text-kumo-default hover:bg-kumo-tint shadow-none bg-inherit",
    "flex items-center no-underline!",
  ].join(" ");
}

type BackLinkProps = {
  href: string;
  "aria-label": string;
  size?: BackSize;
};

/** EmDash `BackToSettingsLink`-style anchor. */
export function GhostSquareBackLink({
  href,
  "aria-label": ariaLabel,
  size = "base",
}: BackLinkProps) {
  return (
    <a href={href} aria-label={ariaLabel} className={ghostSquareBackClass(size)}>
      <ArrowPrevIcon className={size === "sm" ? "size-4" : undefined} />
    </a>
  );
}

type BackButtonProps = {
  "aria-label": string;
  size?: BackSize;
  onClick: () => void;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "onClick" | "type" | "className">;

/** Same control as a button (form builder stays SPA via `onBack`). */
export function GhostSquareBackButton({
  "aria-label": ariaLabel,
  size = "sm",
  onClick,
  ...rest
}: BackButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={ghostSquareBackClass(size)}
      onClick={onClick}
      {...rest}
    >
      <ArrowPrevIcon className={size === "sm" ? "size-4" : undefined} />
    </button>
  );
}

/** EmDash editor-bar list label (pointer-friendly duplicate of back). */
export function EditorBarListLabel({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      className="ff-editor-bar-list-label"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
