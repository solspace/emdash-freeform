/**
 * EmDash ContentList visual recipes via shared Kumo primitives.
 * DataTable / ListPaginationFooter / TableToolbar aren't exported from
 * `@emdash-cms/admin`, so we mirror their public class patterns + Kumo usage
 * so Freeform tracks EmDash as tokens/components evolve.
 */
import {
  Button,
  Checkbox,
  InputGroup,
  Select,
  Switch,
  type CheckboxProps,
} from "@cloudflare/kumo";
import { CaretUpDown, MagnifyingGlass, X } from "@phosphor-icons/react";
import type {
  ChangeEvent,
  InputHTMLAttributes,
  ReactNode,
} from "react";

export const FF_LIST_PAGE =
  "ff-page ff-list-page flex min-h-full flex-col gap-4 [&_tbody_*]:scroll-mb-48";

/** EmDash secondary Button (Add New): borderless ring + subtle hover. */
export const FF_TOOLBAR_BTN =
  "ff-toolbar-btn inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border-0 bg-kumo-base px-3 text-sm font-medium text-kumo-default shadow-xs ring ring-kumo-line transition-colors hover:bg-kumo-tint focus:outline-none focus-visible:ring-2 focus-visible:ring-kumo-brand disabled:cursor-not-allowed disabled:opacity-50";

/**
 * EmDash ContentList filter trigger (Kumo Select size="sm"):
 * h-6.5 / text-xs / ring / bg-kumo-control — not the taller h-9 inputs.
 */
export const FF_FILTER_TRIGGER =
  "emdash-status-filter-trigger group inline-flex h-6.5 w-max min-w-32 max-w-full shrink-0 cursor-pointer items-center justify-between gap-1 rounded-md border-0 bg-kumo-control ps-3.5 pe-2 text-xs font-normal text-kumo-default shadow-xs ring ring-kumo-line transition-colors hover:bg-kumo-tint focus:outline-none focus-visible:ring-2 focus-visible:ring-kumo-brand disabled:cursor-not-allowed disabled:opacity-50";

/** Soft chip — Forms handle / tab count badge. */
export const FF_CHIP =
  "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-kumo-tint text-kumo-subtle";

/** EmDash ContentList row title (`rowTitleClassName`). */
export const FF_ROW_TITLE =
  "font-medium @max-2xl:wrap-anywhere hover:text-kumo-link cursor-pointer text-start";

/** EmDash TableToolbar layout. */
export const FF_TABLE_TOOLBAR =
  "flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between";

export const FF_TABLE_TOOLBAR_START =
  "flex min-w-0 flex-1 flex-wrap items-center gap-2";

/** Exact EmDash DataTable wrap + table class strings from `@emdash-cms/admin`. */
export const FF_DATA_TABLE_WRAP =
  "@container overflow-x-auto rounded-xl bg-kumo-elevated ring ring-kumo-line";

export const FF_DATA_TABLE =
  "w-full border-separate border-spacing-0 text-start text-base text-kumo-default " +
  "[:where(&)_th]:text-start " +
  "[&_th]:border-b-0 [&_th]:bg-transparent [&_th]:px-4 [&_th]:py-3.5 [&_th]:font-normal [&_th]:whitespace-nowrap [&_th]:text-kumo-subtle " +
  "[&_td]:border-b [&_td]:border-kumo-line [&_td]:bg-kumo-base [&_td]:px-4 [&_td]:py-3.5 " +
  "[&_tbody_tr:last-child_td]:border-b-0 " +
  "[&_tr[data-selected]_td]:bg-kumo-tint " +
  "[@media(hover:hover)]:[&_tr[data-clickable]:not([data-selected],[data-drop-active]):hover_td]:bg-[color-mix(in_srgb,var(--color-kumo-tint)_25%,var(--color-kumo-base))] " +
  "[&_tbody_tr:first-child_td]:border-t " +
  "[&_tbody_tr:first-child_td:first-child]:rounded-ss-xl [&_tbody_tr:first-child_td:last-child]:rounded-se-xl " +
  "@max-md:[&_th]:px-3 @max-md:[&_td]:px-3";

/** Sticky footer recipe from EmDash ListPaginationFooter (Shell p-6 offsets). */
export const FF_LIST_PAGINATION =
  "sticky -bottom-6 z-10 -mx-6 mt-auto -mb-6 flex min-h-12 min-w-0 shrink-0 flex-wrap items-center gap-y-3 border-t border-kumo-line bg-kumo-elevated px-6 py-1 text-sm text-kumo-subtle";

/** EmDash TableToolbarSearch — Kumo InputGroup + MagnifyingGlass. */
export function FfListSearch({
  value,
  onChange,
  placeholder,
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <InputGroup
      size="sm"
      className={`ff-list-search${className ? ` ${className}` : ""}`}
    >
      <InputGroup.Addon>
        <MagnifyingGlass className="h-4 w-4" aria-hidden="true" />
      </InputGroup.Addon>
      <InputGroup.Input
        type="search"
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      />
    </InputGroup>
  );
}

/**
 * EmDash FilterBar status/date select — Kumo Select size="sm"
 * (same chrome as Posts “All statuses”, including icon labels).
 */
export function FfFilterSelect<T extends string>({
  value,
  onValueChange,
  items,
  renderValue,
  "aria-label": ariaLabel,
  className = "",
  disabled,
}: {
  value: T;
  onValueChange: (value: T) => void;
  /** Map of option value → label (ReactNode). */
  items: Record<string, ReactNode>;
  /** Optional closed-trigger label (EmDash uses this for status icons). */
  renderValue?: (value: T) => ReactNode;
  "aria-label": string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Select
      size="sm"
      className={`emdash-status-filter-trigger min-w-32 max-w-56 shrink-0 whitespace-nowrap ps-3.5 text-xs ${className}`}
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      items={items}
      renderValue={
        renderValue
          ? (v) => renderValue((typeof v === "string" ? v : value) as T)
          : undefined
      }
      onValueChange={(next) => {
        if (typeof next === "string") onValueChange(next as T);
      }}
    >
      {Object.entries(items).map(([optionValue, label]) => (
        <Select.Option
          key={optionValue}
          value={optionValue}
          className="emdash-compact-select-option text-xs"
        >
          {label}
        </Select.Option>
      ))}
    </Select>
  );
}

/** Caret for custom filter triggers that aren't Kumo Select (e.g. form picker). */
export function FfFilterCaret() {
  return (
    <CaretUpDown
      className="size-3 shrink-0 text-kumo-subtle"
      weight="bold"
      aria-hidden="true"
    />
  );
}

/** EmDash ContentList checkbox — Kumo Checkbox. */
export function FfCheckbox({
  className,
  onChange,
  checked,
  ...props
}: Omit<CheckboxProps, "onCheckedChange"> & {
  onChange?: InputHTMLAttributes<HTMLInputElement>["onChange"];
}) {
  return (
    <Checkbox
      {...props}
      className={className}
      checked={checked}
      onCheckedChange={(next) => {
        if (!onChange) return;
        onChange({
          target: { checked: next },
          currentTarget: { checked: next },
        } as ChangeEvent<HTMLInputElement>);
      }}
    />
  );
}

/**
 * EmDash DataTableBulkBar — selected count, actions, Clear.
 */
export function FfDataTableBulkBar({
  selectedCount,
  busy = false,
  onClear,
  children,
}: {
  selectedCount: number;
  busy?: boolean;
  onClear: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-kumo-elevated px-4 py-2 ring ring-kumo-line">
      <span className="text-sm font-medium">
        {busy
          ? `Working on ${selectedCount} items…`
          : `${selectedCount} selected`}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <Button
          size="sm"
          variant="ghost"
          icon={<X />}
          disabled={busy}
          onClick={onClear}
        >
          Clear
        </Button>
      </div>
    </div>
  );
}

/**
 * EmDash settings Switch row — label/description left, toggle right
 * (`justify-between`, same as BackupSettings / inferred-byline filter).
 */
export function FfSwitchRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  className = "",
}: {
  id?: string;
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const descId = id && description ? `${id}-description` : undefined;
  return (
    <div
      className={`flex items-start justify-between gap-3 ${className}`.trim()}
    >
      <div className="grid min-w-0 flex-1 gap-1">
        {typeof label === "string" ? (
          <label
            htmlFor={id}
            className="m-0 cursor-pointer text-base font-medium text-kumo-default"
          >
            {label}
          </label>
        ) : (
          label
        )}
        {description ? (
          <p id={descId} className="text-sm text-kumo-subtle">
            {description}
          </p>
        ) : null}
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        aria-label={typeof label === "string" ? label : undefined}
        aria-describedby={descId}
        className="mt-0.5 shrink-0"
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

export function FfDataTable({ children }: { children: ReactNode }) {
  return (
    <div className={FF_DATA_TABLE_WRAP}>
      <table className={FF_DATA_TABLE}>{children}</table>
    </div>
  );
}

/** EmDash DataTableMessage cell. */
export function FfDataTableMessage({
  colSpan,
  children,
}: {
  colSpan: number;
  children: ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="text-center text-kumo-subtle">
        <div className="py-4.5">{children}</div>
      </td>
    </tr>
  );
}

type PaginationProps = {
  page: number;
  perPage: number;
  totalCount: number;
  pageSizes?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (perPage: number) => void;
  label?: string;
};

/** Phosphor CaretUpDown — same 16px glyph EmDash Pagination uses. */
function CaretUpDownIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      fill="currentColor"
      viewBox="0 0 256 256"
      className="fill-current"
      aria-hidden="true"
    >
      <path d="M181.66,170.34a8,8,0,0,1,0,11.32l-48,48a8,8,0,0,1-11.32,0l-48-48a8,8,0,0,1,11.32-11.32L128,212.69l42.34-42.35A8,8,0,0,1,181.66,170.34Zm-96-84.68L128,43.31l42.34,42.35a8,8,0,0,0,11.32-11.32l-48-48a8,8,0,0,0-11.32,0l-48,48A8,8,0,0,0,85.66,85.66Z" />
    </svg>
  );
}

function NavIcon({ dir }: { dir: "first" | "prev" | "next" | "last" }) {
  const d: Record<typeof dir, string> = {
    first:
      "M205.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L131.31,128ZM51.31,128l74.35-74.34a8,8,0,0,0-11.32-11.32l-80,80a8,8,0,0,0,0,11.32l80,80a8,8,0,0,0,11.32-11.32Z",
    prev: "M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z",
    next: "M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z",
    last: "M141.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L124.69,128,50.34,53.66A8,8,0,0,1,61.66,42.34l80,80A8,8,0,0,1,141.66,133.66Zm80-11.32-80-80a8,8,0,0,0-11.32,11.32L204.69,128l-74.35,74.34a8,8,0,0,0,11.32,11.32l80-80A8,8,0,0,0,221.66,122.34Z",
  };
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true">
      <path d={d[dir]} />
    </svg>
  );
}

const PAGE_SELECT =
  "ff-page-select appearance-none border-0 bg-transparent text-sm font-normal text-kumo-default outline-none cursor-pointer";

const PAGE_BTN =
  "ff-page-nav-btn relative inline-flex h-full min-w-[2.625rem] shrink-0 items-center justify-center gap-1.5 border-0 bg-transparent px-3 text-kumo-subtle transition-colors hover:bg-kumo-tint hover:text-kumo-default focus:outline-none focus-visible:bg-kumo-tint disabled:cursor-not-allowed";

function PageSelect({
  value,
  onChange,
  "aria-label": ariaLabel,
  children,
  className = "",
}: {
  value: number;
  onChange: (value: number) => void;
  "aria-label": string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative inline-flex h-9 items-center rounded-lg bg-kumo-base ring ring-kumo-line ${className}`}
    >
      <select
        className={PAGE_SELECT}
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {children}
      </select>
      <span
        className="pointer-events-none absolute end-2 flex shrink-0 items-center text-kumo-subtle"
        aria-hidden="true"
      >
        <CaretUpDownIcon />
      </span>
    </div>
  );
}

export function FfListPagination({
  page,
  perPage,
  totalCount,
  pageSizes = [10, 20, 50, 100],
  onPageChange,
  onPageSizeChange,
  label = "Pagination",
}: PaginationProps) {
  if (totalCount <= 0) return null;

  const pageCount = Math.max(1, Math.ceil(totalCount / perPage));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * perPage + 1;
  const end = Math.min(safePage * perPage, totalCount);
  const pageOptions = Array.from({ length: pageCount }, (_, i) => i + 1);

  return (
    <footer className={FF_LIST_PAGINATION} aria-label={label}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
        <span role="status" className="min-w-fit whitespace-nowrap text-sm text-kumo-subtle">
          Showing {start}–{end} of {totalCount}
        </span>
        <span className="hidden h-4 w-px bg-kumo-line sm:block" aria-hidden="true" />
        <div className="flex items-center gap-2" data-slot="pagination-page-size">
          <span className="text-sm text-kumo-subtle">Per page</span>
          <PageSelect
            value={perPage}
            aria-label="Page size"
            onChange={onPageSizeChange}
          >
            {pageSizes.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </PageSelect>
        </div>
      </div>

      <nav
        className="ms-auto flex items-center"
        aria-label={label}
        data-slot="pagination-controls"
      >
        <div className="ff-page-nav-group isolate flex h-9 items-center overflow-hidden rounded-lg bg-kumo-control">
          <button
            type="button"
            className={`${PAGE_BTN} rounded-s-[inherit]`}
            disabled={safePage <= 1}
            aria-label="First page"
            onClick={() => onPageChange(1)}
          >
            <NavIcon dir="first" />
          </button>
          <button
            type="button"
            className={`${PAGE_BTN} border-s border-kumo-line`}
            disabled={safePage <= 1}
            aria-label="Previous page"
            onClick={() => onPageChange(safePage - 1)}
          >
            <NavIcon dir="prev" />
          </button>
          <div className="relative flex h-full min-w-14 items-center border-s border-e border-kumo-line bg-kumo-base">
            <select
              className={`${PAGE_SELECT} h-full w-full min-w-14 text-center tabular-nums`}
              value={safePage}
              aria-label="Page number"
              onChange={(e) => onPageChange(Number(e.target.value))}
            >
              {pageOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span
              className="pointer-events-none absolute end-2 flex shrink-0 items-center text-kumo-subtle"
              aria-hidden="true"
            >
              <CaretUpDownIcon />
            </span>
          </div>
          <button
            type="button"
            className={`${PAGE_BTN} border-s border-kumo-line`}
            disabled={safePage >= pageCount}
            aria-label="Next page"
            onClick={() => onPageChange(safePage + 1)}
          >
            <NavIcon dir="next" />
          </button>
          <button
            type="button"
            className={`${PAGE_BTN} border-s border-kumo-line rounded-e-[inherit]`}
            disabled={safePage >= pageCount}
            aria-label="Last page"
            onClick={() => onPageChange(pageCount)}
          >
            <NavIcon dir="last" />
          </button>
        </div>
      </nav>
    </footer>
  );
}
