/**
 * EmDash ContentList visual recipes (Kumo tokens + class strings).
 * DataTable / ListPaginationFooter aren't exported from @emdash-cms/admin,
 * so we mirror their public class patterns — colors track EmDash as tokens evolve.
 */
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export const FF_LIST_PAGE =
  "ff-page ff-list-page gap-4 [&_tbody_*]:scroll-mb-48";

/** EmDash secondary Button (Add New): borderless ring + subtle hover. */
export const FF_TOOLBAR_BTN =
  "ff-toolbar-btn inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border-0 bg-kumo-base px-3 text-sm font-medium text-kumo-default shadow-xs ring ring-kumo-line transition-colors hover:bg-kumo-tint focus:outline-none focus-visible:ring-2 focus-visible:ring-kumo-brand disabled:cursor-not-allowed disabled:opacity-50";

/** Filter trigger — matches Forms toolbar selects (h-9). */
export const FF_FILTER_TRIGGER =
  "inline-flex h-9 min-w-0 max-w-full shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-kumo-line bg-kumo-control ps-3 pe-8 text-sm font-normal text-kumo-default transition-colors hover:bg-kumo-tint focus:outline-none focus:ring-2 focus:ring-kumo-focus disabled:cursor-not-allowed disabled:opacity-50";

/** Soft chip — Forms handle / tab count badge. */
export const FF_CHIP =
  "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-kumo-tint text-kumo-subtle";

/** Large search — same recipe as Forms list (`h-9` / `w-64`). */
export const FF_LIST_SEARCH_WRAP =
  "relative w-full min-w-0 max-w-64 shrink-0";

export const FF_DATA_TABLE_WRAP =
  "overflow-x-auto rounded-xl bg-kumo-elevated ring ring-kumo-line";

export const FF_DATA_TABLE =
  "w-full border-separate border-spacing-0 text-start text-base text-kumo-default " +
  "[:where(&)_th]:text-start " +
  "[&_th]:border-b-0 [&_th]:bg-transparent [&_th]:px-4 [&_th]:py-3.5 [&_th]:font-normal [&_th]:whitespace-nowrap [&_th]:text-kumo-subtle " +
  "[&_td]:border-kumo-line [&_td]:bg-kumo-base [&_td]:px-4 [&_td]:py-3.5 " +
  "[&_tr[data-selected]_td]:bg-kumo-tint " +
  "[&_tbody_tr:first-child_td]:border-t " +
  "[&_tbody_tr:first-child_td:first-child]:rounded-ss-xl [&_tbody_tr:first-child_td:last-child]:rounded-se-xl " +
  "[&_tbody_tr:not(:first-child)_td]:border-t";

/** Sticky footer recipe from EmDash ListPaginationFooter (Shell p-6 offsets). */
export const FF_LIST_PAGINATION =
  "sticky -bottom-6 z-10 -mx-6 mt-auto -mb-6 flex min-h-12 min-w-0 shrink-0 flex-wrap items-center gap-y-3 border-t border-kumo-line bg-kumo-elevated px-6 py-1 text-sm text-kumo-subtle";

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
  /** Extra classes on the outer wrap (width defaults to `w-full sm:w-64`). */
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div className={`${FF_LIST_SEARCH_WRAP}${className ? ` ${className}` : ""}`}>
      <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-kumo-subtle">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="m21 21-4.3-4.3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <input
        type="search"
        className="h-9 w-full rounded-md border border-kumo-line bg-kumo-control ps-9 pe-3 text-sm text-kumo-default placeholder:text-kumo-subtle focus:outline-none focus:ring-2 focus:ring-kumo-focus"
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

const FILTER_CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")";

export function FfFilterSelect({
  value,
  onChange,
  "aria-label": ariaLabel,
  className = "",
  style,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      value={value}
      onChange={onChange}
      aria-label={ariaLabel}
      className={`ff-filter-trigger ${FF_FILTER_TRIGGER} ${className}`}
      style={{ backgroundImage: FILTER_CHEVRON, ...style }}
    >
      {children}
    </select>
  );
}

/** Kumo Checkbox look — ring hairline, rounded-sm, contrast fill when checked. */
export function FfCheckbox({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={`ff-list-checkbox ${className}`}
      {...props}
    />
  );
}

export function FfDataTable({ children }: { children: ReactNode }) {
  return (
    <div className={FF_DATA_TABLE_WRAP}>
      <table className={FF_DATA_TABLE}>{children}</table>
    </div>
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
  // Phosphor CaretDoubleLeft / CaretLeft / CaretRight / CaretDoubleRight
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

/** EmDash page-size / page-number select text. */
const PAGE_SELECT =
  "ff-page-select appearance-none border-0 bg-transparent text-sm font-normal text-kumo-default outline-none cursor-pointer";

/**
 * EmDash InputGroup nav button sizing (h-9 / ~42px wide).
 * Keep muted icon color; height matches Posts pagination.
 */
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
        {/* EmDash InputGroup height: h-9 (36px) inside min-h-12 (48px) footer */}
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
