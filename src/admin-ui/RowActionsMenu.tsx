/**
 * EmDash RowActionsMenu — Kumo DropdownMenu (portaled) with a ⋯ trigger.
 * Same pattern as `@emdash-cms/admin` DataTable so menus aren’t clipped by
 * table/card overflow.
 */

import { Button, DropdownMenu } from "@cloudflare/kumo";
import { DotsThree } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export function RowActionsMenu({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <Button variant="ghost" size="sm" shape="square" aria-label={label}>
            <DotsThree weight="bold" size={18} aria-hidden="true" />
          </Button>
        }
      />
      <DropdownMenu.Content align="end">{children}</DropdownMenu.Content>
    </DropdownMenu>
  );
}

export { DropdownMenu };
