/**
 * EmDash ConfirmDialog — same Kumo `LayerDialog` shell as core admin (1.5+).
 *
 * ConfirmDialog is not exported from `@emdash-cms/admin`, so Freeform mirrors
 * the upstream component 1:1 using the host’s `@cloudflare/kumo`.
 *
 * Handles the common pattern: title, description, optional error banner,
 * cancel/confirm actions with pending state. Dialog stays open on error and
 * can’t be dismissed while the request is in flight.
 */

import { LayerDialog } from "@cloudflare/kumo";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { DialogError, getMutationError } from "./DialogError";

export type ConfirmDialogProps = {
  open: boolean;
  onClose: () => void;
  /** ARIA role; use alertdialog for destructive actions requiring acknowledgment. */
  role?: "dialog" | "alertdialog";
  title: string;
  /** Static description or inline JSX; it renders inside a paragraph. */
  description: ReactNode;
  /** Label for the confirm button (e.g. "Delete", "Disable User") */
  confirmLabel: string;
  /** Optional cancel label; defaults to "Cancel". */
  cancelLabel?: string;
  /** Label shown while the action is pending (e.g. "Deleting...") */
  pendingLabel: string;
  /** Button variant — defaults to "destructive" */
  variant?: "destructive" | "primary";
  /** Disable confirmation until required input in the dialog is complete. */
  confirmDisabled?: boolean;
  isPending: boolean;
  /**
   * Error from a request. An error already there when the dialog opens came
   * from an earlier request and is not shown.
   */
  error: unknown;
  onConfirm: () => void;
  /** Extra content rendered between description and buttons (e.g. a checkbox) */
  children?: ReactNode;
};

/** Both clicks of a double click can land before `isPending` renders. */
const DOUBLE_PRESS_MS = 500;

/**
 * Wraps a dialog's confirm action so that a double press runs it once: a press
 * while `isPending`, or within a moment of the last one, does nothing. A new
 * `error` lets the next press retry at once.
 */
function useConfirmPress(
  onConfirm: () => void,
  isPending: boolean,
  error: unknown,
): () => void {
  const lastPressRef = useRef(Number.NEGATIVE_INFINITY);
  useEffect(() => {
    if (error) lastPressRef.current = Number.NEGATIVE_INFINITY;
  }, [error]);
  return () => {
    const now = performance.now();
    if (isPending || now - lastPressRef.current < DOUBLE_PRESS_MS) return;
    lastPressRef.current = now;
    onConfirm();
  };
}

export function ConfirmDialog({
  open,
  onClose,
  role = "dialog",
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  pendingLabel,
  variant = "destructive",
  confirmDisabled = false,
  isPending,
  error,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const confirm = useConfirmPress(onConfirm, isPending, error);
  // A request shared by several items still holds the last item's failure.
  const [staleError, setStaleError] = useState<unknown>(() => (open ? error : null));
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setStaleError(error);
  }
  // Callers clear the item being confirmed on close, which would blank the copy
  // mid exit-animation. Keep showing what the dialog opened with until it's gone.
  const shownRef = useRef({ title, description });
  if (open) shownRef.current = { title, description };
  const shown = open ? { title, description } : shownRef.current;
  const Root = role === "alertdialog" ? LayerDialog.Alert : LayerDialog.Root;
  return (
    <Root
      open={open}
      onOpenChange={(nextOpen) => !nextOpen && !isPending && onClose()}
      dismissDisabled={isPending}
      disablePointerDismissal
    >
      <LayerDialog.Content size="sm">
        <LayerDialog.Title>
          <span dir="auto" className="block">
            {shown.title}
          </span>
        </LayerDialog.Title>
        <LayerDialog.Description>
          <span dir="auto" className="block">
            {shown.description}
          </span>
        </LayerDialog.Description>
        <LayerDialog.Body>
          <div className="grid gap-3">
            {children}
            <DialogError message={error === staleError ? null : getMutationError(error)} />
          </div>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={cancelLabel}>
          <LayerDialog.Action
            variant={variant}
            disabled={isPending || confirmDisabled}
            onClick={() => confirm()}
          >
            {isPending ? pendingLabel : confirmLabel}
          </LayerDialog.Action>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </Root>
  );
}
