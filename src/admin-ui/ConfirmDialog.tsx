/**
 * EmDash ConfirmDialog — same Kumo Dialog/Button shell as core admin.
 *
 * ConfirmDialog is not exported from `@emdash-cms/admin`, so Freeform mirrors
 * the upstream component 1:1 using the host’s `@cloudflare/kumo`.
 */

import { Button, Dialog } from "@cloudflare/kumo";
import type { ReactNode } from "react";

export type ConfirmDialogProps = {
  open: boolean;
  onClose: () => void;
  /** ARIA role; use alertdialog for destructive actions requiring acknowledgment. */
  role?: "dialog" | "alertdialog";
  title: string;
  titleClassName?: string;
  description: ReactNode;
  descriptionClassName?: string;
  confirmLabel: string;
  cancelLabel?: string;
  pendingLabel: string;
  variant?: "destructive" | "primary";
  compact?: boolean;
  preventCloseWhilePending?: boolean;
  confirmDisabled?: boolean;
  isPending: boolean;
  error: unknown;
  onConfirm: () => void;
  children?: ReactNode;
};

function getMutationError(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "An error occurred";
}

function DialogError({
  message,
  className,
}: {
  message?: string | null;
  className?: string;
}) {
  if (!message) return null;
  const lines = message.split("\n");
  return (
    <div
      role="alert"
      className={["rounded-md bg-kumo-danger/10 p-3 text-sm text-kumo-danger", className]
        .filter(Boolean)
        .join(" ")}
    >
      {lines.map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  role = "dialog",
  title,
  titleClassName,
  description,
  descriptionClassName,
  confirmLabel,
  cancelLabel = "Cancel",
  pendingLabel,
  variant = "destructive",
  compact = false,
  preventCloseWhilePending = false,
  confirmDisabled = false,
  isPending,
  error,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const closeLocked = preventCloseWhilePending && isPending;
  return (
    <Dialog.Root
      role={role}
      open={open}
      onOpenChange={(nextOpen) => !nextOpen && !closeLocked && onClose()}
      disablePointerDismissal
    >
      <Dialog
        container={typeof document !== "undefined" ? document.body : undefined}
        className={
          compact
            ? "ff-kumo-dialog max-w-md px-5 pt-6 pb-4"
            : "ff-kumo-dialog p-6"
        }
        size="sm"
      >
        <div className={compact ? "grid gap-1" : undefined}>
          <Dialog.Title
            dir="auto"
            className={
              titleClassName ??
              (compact ? "text-lg font-semibold leading-6" : "text-lg font-semibold")
            }
          >
            {title}
          </Dialog.Title>
          <Dialog.Description
            dir="auto"
            className={
              descriptionClassName ??
              (compact
                ? "text-sm leading-5 text-pretty text-kumo-subtle"
                : "text-kumo-subtle")
            }
          >
            {description}
          </Dialog.Description>
        </div>
        {children}
        <DialogError message={getMutationError(error)} className="mt-3" />
        <div className={`${compact ? "mt-5" : "mt-6"} flex justify-end gap-2`}>
          <Button variant="secondary" disabled={closeLocked} onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant}
            disabled={isPending || confirmDisabled}
            onClick={onConfirm}
          >
            {isPending ? pendingLabel : confirmLabel}
          </Button>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
