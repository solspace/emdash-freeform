import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDndContext,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, Collapsible, Switch } from "@cloudflare/kumo";
import { CaretDown, X } from "@phosphor-icons/react";
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { FieldType, FormField, FormRow, StoredForm } from "../types";
import { FormNotificationsPanel } from "./FormNotificationsPanel";
import { FormProtectionPanel } from "./FormProtectionPanel";
import { FormSettingsPanel } from "./FormSettingsPanel";
import { FieldPreview } from "./FieldPreview";
import { FieldOptionsEditor } from "./FieldOptionsEditor";
import { ActionIcon, FieldIcon } from "./field-icons";
import { getForm, saveForm } from "./ff-api";
import { EditorBarListLabel, GhostSquareBackButton } from "./ff-back";
import { FORM_COLOR_PRESETS, resolveFormColor } from "./ff-nav";
import { PALETTE_GROUPS, defaultFieldLabel, needsOptions } from "./field-types";
import {
  appendFieldAsRow,
  duplicateField,
  insertFieldAsNewRow,
  insertFieldInRow,
  moveFieldTo,
  moveFieldToNewRow,
  moveFieldToNewRowAtEnd,
  removeField,
  updateField,
} from "./layout-ops";
import "./styles.css";

type Props = {
  formId: string;
  onBack: () => void;
};

type BuilderTab = "layout" | "notifications" | "protection" | "settings";

type DragData =
  | { kind: "palette"; type: FieldType }
  | { kind: "field"; fieldId: string };

function SortableField({
  field,
  selected,
  onSelect,
  onDuplicate,
  onRemove,
}: {
  field: FormField;
  selected: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: `field:${field.id}`,
      data: { kind: "field", fieldId: field.id } satisfies DragData,
    });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`ff-field${selected ? " is-selected" : ""}${isDragging ? " is-dragging" : ""}`}
      onClick={onSelect}
      {...attributes}
      {...listeners}
    >
      <div className="ff-field-header">
        <div className="ff-field-title">
          <FieldIcon type={field.type} size={14} className="ff-field-type-icon" />
          <span className="ff-field-label">{field.label}</span>
          {field.required && (
            <span className="ff-req" title="Required field">*</span>
          )}
        </div>
        <div className="ff-field-tools">
          <button
            type="button"
            className="ff-tool-btn"
            title="Duplicate field"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
          >
            <ActionIcon name="duplicate" size={13} />
          </button>
          <button
            type="button"
            className="ff-tool-btn ff-tool-danger"
            title="Delete field"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <ActionIcon name="delete" size={13} />
          </button>
        </div>
      </div>

      <div className="ff-field-body">
        <FieldPreview field={field} />
      </div>

      <div className="ff-field-footer">
        <span className="ff-field-handle-pill">{field.handle}</span>
        <span className="ff-field-type-pill">{defaultFieldLabel(field.type)}</span>
      </div>
    </div>
  );
}

function RowDropZone({
  row,
  rowIndex,
  selectedFieldId,
  onSelectField,
  onDuplicateField,
  onRemoveField,
}: {
  row: FormRow;
  rowIndex: number;
  selectedFieldId: string | null;
  onSelectField: (id: string) => void;
  onDuplicateField: (id: string) => void;
  onRemoveField: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `row:${row.id}`,
    data: { kind: "row", rowId: row.id, rowIndex },
  });

  const { active, over } = useDndContext();
  const activeData = active?.data.current as DragData | undefined;

  // Is an item being dragged into this row from palette or another row?
  const isDraggingIntoThisRow = useMemo(() => {
    if (!active || !over) return false;
    const overId = String(over.id);
    const isOverThisRow = overId === `row:${row.id}`;
    const isOverFieldInRow = row.fields.some((f) => `field:${f.id}` === overId);
    if (!isOverThisRow && !isOverFieldInRow) return false;

    if (activeData?.kind === "palette") return true;
    if (activeData?.kind === "field") {
      return !row.fields.some((f) => f.id === activeData.fieldId);
    }
    return false;
  }, [active, over, activeData, row]);

  // Which index in this row should the placeholder appear at?
  const placeholderIndex = useMemo(() => {
    if (!isDraggingIntoThisRow || !over) return -1;
    const overId = String(over.id);
    if (overId === `row:${row.id}`) {
      return row.fields.length;
    }
    const idx = row.fields.findIndex((f) => `field:${f.id}` === overId);
    return idx >= 0 ? idx + 1 : row.fields.length;
  }, [isDraggingIntoThisRow, over, row]);

  return (
    <div className="ff-row" ref={setNodeRef} data-over={isOver || undefined}>
      <SortableContext
        items={row.fields.map((f) => `field:${f.id}`)}
        strategy={horizontalListSortingStrategy}
      >
        <div className="ff-row-fields">
          {row.fields.map((field, index) => (
            <Fragment key={field.id}>
              {placeholderIndex === index && (
                <div className="ff-field-placeholder" key="incoming-placeholder">
                  <span className="ff-placeholder-text">+ Add here</span>
                </div>
              )}
              <SortableField
                field={field}
                selected={selectedFieldId === field.id}
                onSelect={() => onSelectField(field.id)}
                onDuplicate={() => onDuplicateField(field.id)}
                onRemove={() => onRemoveField(field.id)}
              />
            </Fragment>
          ))}
          {placeholderIndex === row.fields.length && (
            <div className="ff-field-placeholder" key="incoming-placeholder-end">
              <span className="ff-placeholder-text">+ Add here</span>
            </div>
          )}
          {row.fields.length === 0 && !isDraggingIntoThisRow && (
            <div className="ff-row-empty-hint">Drop a field here</div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function BetweenRowDropZone({
  rowIndex,
  active,
}: {
  rowIndex: number;
  active: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `between-row:${rowIndex}`,
    data: { kind: "between-row", rowIndex },
  });

  return (
    <div
      ref={setNodeRef}
      className={`ff-row-separator ${active ? "is-active" : ""} ${isOver ? "is-over" : ""}`}
      data-between-row={rowIndex}
    >
      <div className="ff-row-separator-line">
        {isOver && (
          <span className="ff-row-separator-badge">
            <ActionIcon name="plus" size={12} />
            <span>New Row</span>
          </span>
        )}
      </div>
    </div>
  );
}

function CanvasEndDrop({ active }: { active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: "canvas-end",
    data: { kind: "canvas-end" },
  });
  if (!active && !isOver) {
    return <div ref={setNodeRef} style={{ height: 16 }} />;
  }
  return (
    <div ref={setNodeRef} className="ff-drop-hint">
      <ActionIcon name="plus" size={15} /> Drop here to add a new row
    </div>
  );
}

/** EmDash ContentSettingsPanel-style field chrome (narrow right rail). */
const PROP_INPUT =
  "w-full border-0 bg-kumo-control text-kumo-default ring ring-kumo-line outline-none focus:outline-none disabled:text-kumo-disabled h-9 rounded-lg px-3 text-base focus:ring-kumo-focus/50 focus:ring-[1.5px] placeholder:text-kumo-subtle";

const PROP_TEXTAREA =
  "w-full min-h-24 resize-y border-0 bg-kumo-control text-kumo-default ring ring-kumo-line outline-none focus:outline-none disabled:text-kumo-disabled rounded-lg px-3 py-2 text-base focus:ring-kumo-focus/50 focus:ring-[1.5px] placeholder:text-kumo-subtle";

function PropSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="relative min-w-0 border-t border-kumo-line bg-kumo-base first:border-t-0">
      <div className="p-4">
        <h3 className="mb-4 text-base font-semibold text-kumo-default">{title}</h3>
        <div className="grid gap-4">{children}</div>
      </div>
    </section>
  );
}

function PropField({
  label,
  htmlFor,
  description,
  children,
}: {
  label: string;
  htmlFor: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="m-0 block text-base font-medium text-kumo-default">
        {label}
      </label>
      {children}
      {description ? (
        <p className="text-xs leading-4 text-kumo-subtle">{description}</p>
      ) : null}
    </div>
  );
}

function PropertyEditor({
  field,
  onChange,
  onDuplicate,
  onRemove,
  onClose,
}: {
  field: FormField | null;
  onChange: (patch: Partial<FormField>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [validationOpen, setValidationOpen] = useState(false);

  useEffect(() => {
    setValidationOpen(false);
  }, [field?.id]);

  if (!field) {
    return (
      <aside className="ff-prop-rail ff-prop-empty" aria-label="Field settings">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <span className="text-kumo-subtle">
            <ActionIcon name="search" size={24} />
          </span>
          <div className="grid gap-1">
            <h2 className="text-base font-semibold text-kumo-default">Field Settings</h2>
            <p className="text-sm text-kumo-subtle">
              Click any field on the canvas to configure its label, handle, validation rules, and choices.
            </p>
          </div>
        </div>
      </aside>
    );
  }

  const supportsPlaceholder = [
    "text",
    "email",
    "textarea",
    "number",
    "phone",
    "date",
    "datetime",
  ].includes(field.type);

  const placeholderHint: Record<string, string> = {
    text: "e.g. Enter your name...",
    email: "e.g. name@example.com",
    textarea: "e.g. Type your message...",
    number: "e.g. 0",
    phone: "e.g. +1 (555) 000-0000",
    date: "e.g. YYYY-MM-DD",
    datetime: "e.g. YYYY-MM-DD HH:MM",
  };

  const supportsValidation = [
    "text",
    "email",
    "textarea",
    "phone",
    "number",
    "date",
    "datetime",
    "rating",
  ].includes(field.type);

  const showRequired =
    field.type !== "consent" && field.type !== "html" && field.type !== "hidden";

  return (
    <aside className="ff-prop-rail" aria-label="Field settings">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-kumo-line bg-kumo-base px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-kumo-default">Field Settings</h2>
          <div className="mt-1 inline-flex items-center gap-1.5 text-xs text-kumo-subtle">
            <FieldIcon type={field.type} size={13} />
            <span className="capitalize">{field.type.replace(/_/g, " ")}</span>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          shape="square"
          size="sm"
          icon={X}
          aria-label="Close settings"
          title="Close settings (Esc)"
          onClick={onClose}
        />
      </header>

      <div className="ff-prop-rail-body min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-kumo-base [&_input]:text-base [&_input]:font-normal [&_textarea]:text-base [&_textarea]:font-normal">
        <PropSection title="General">
          <PropField label="Label" htmlFor="ff-label">
            <input
              id="ff-label"
              className={PROP_INPUT}
              value={field.label}
              onChange={(e) => onChange({ label: e.target.value })}
            />
          </PropField>

          <PropField
            label="Handle"
            htmlFor="ff-handle"
            description="Used in submissions, notifications, and embeds."
          >
            <input
              id="ff-handle"
              className={`${PROP_INPUT} font-mono text-sm`}
              value={field.handle}
              spellCheck={false}
              onChange={(e) => onChange({ handle: e.target.value })}
            />
          </PropField>

          {showRequired && (
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="ff-required"
                className="m-0 cursor-pointer text-base font-medium text-kumo-default"
              >
                Required field
              </label>
              <Switch
                id="ff-required"
                checked={field.required}
                aria-label="Required field"
                onCheckedChange={(checked) => onChange({ required: checked })}
              />
            </div>
          )}

          {supportsPlaceholder && (
            <PropField label="Placeholder" htmlFor="ff-placeholder">
              <input
                id="ff-placeholder"
                className={PROP_INPUT}
                placeholder={placeholderHint[field.type] ?? "e.g. Hint text…"}
                value={field.placeholder ?? ""}
                onChange={(e) => onChange({ placeholder: e.target.value || undefined })}
              />
            </PropField>
          )}

          {field.type !== "consent" && !needsOptions(field.type) && field.type !== "html" && (
            <PropField label="Default value" htmlFor="ff-default-val">
              <input
                id="ff-default-val"
                className={PROP_INPUT}
                placeholder="Initial prefilled value"
                value={typeof field.defaultValue === "string" ? field.defaultValue : ""}
                onChange={(e) => onChange({ defaultValue: e.target.value || undefined })}
              />
            </PropField>
          )}
        </PropSection>

        {field.type === "file" && (
          <PropSection title="File upload">
            <PropField label="Allowed extensions" htmlFor="ff-file-ext">
              <input
                id="ff-file-ext"
                className={PROP_INPUT}
                placeholder="e.g. pdf, png, jpg, docx"
                value={field.allowedExtensions ?? ""}
                onChange={(e) => onChange({ allowedExtensions: e.target.value || undefined })}
              />
            </PropField>
            <PropField label="Max file size (MB)" htmlFor="ff-file-size">
              <input
                id="ff-file-size"
                type="number"
                min={1}
                max={100}
                className={PROP_INPUT}
                value={field.maxFileSizeMb ?? 10}
                onChange={(e) =>
                  onChange({
                    maxFileSizeMb: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
            </PropField>
          </PropSection>
        )}

        {field.type === "rating" && (
          <PropSection title="Rating">
            <PropField label="Number of stars" htmlFor="ff-max-stars">
              <input
                id="ff-max-stars"
                type="number"
                min={3}
                max={10}
                className={PROP_INPUT}
                value={field.maxStars ?? 5}
                onChange={(e) =>
                  onChange({
                    maxStars: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
            </PropField>
          </PropSection>
        )}

        {field.type === "consent" && (
          <PropSection title="Consent">
            <p className="text-sm text-kumo-subtle">
              Consent fields are always required and never pre-checked (GDPR). Acceptance is stored with a timestamp.
            </p>
            <PropField label="Privacy policy URL" htmlFor="ff-consent-url">
              <input
                id="ff-consent-url"
                type="url"
                className={PROP_INPUT}
                placeholder="https://example.com/privacy"
                value={field.privacyPolicyUrl ?? ""}
                onChange={(e) => onChange({ privacyPolicyUrl: e.target.value })}
              />
            </PropField>
          </PropSection>
        )}

        {field.type === "html" && (
          <PropSection title="HTML content">
            <p className="text-sm text-kumo-subtle">
              Render static HTML markup inside the form layout.
            </p>
            <PropField label="HTML markup" htmlFor="ff-html-content">
              <textarea
                id="ff-html-content"
                rows={4}
                className={`${PROP_TEXTAREA} font-mono text-sm`}
                placeholder="<p>Custom HTML text or heading</p>"
                value={typeof field.defaultValue === "string" ? field.defaultValue : ""}
                onChange={(e) => onChange({ defaultValue: e.target.value })}
              />
            </PropField>
          </PropSection>
        )}

        {needsOptions(field.type) && (
          <PropSection title="Options">
            <FieldOptionsEditor field={field} onChange={onChange} />
          </PropSection>
        )}

        {supportsValidation && (
          <section className="relative min-w-0 border-t border-kumo-line bg-kumo-base">
            <div className="p-4">
              <Collapsible.Root open={validationOpen} onOpenChange={setValidationOpen}>
                <Collapsible.Trigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      className="relative -ms-3 w-[calc(100%+0.75rem)] justify-between"
                    />
                  }
                >
                  <span className="font-semibold text-kumo-default">Validation Rules</span>
                  <CaretDown
                    className={`h-4 w-4 text-kumo-subtle transition-transform duration-150 ease-out motion-reduce:transition-none ${
                      validationOpen ? "rotate-180" : ""
                    }`}
                  />
                </Collapsible.Trigger>
                <Collapsible.Panel
                  className="overflow-hidden duration-150 ease-out [&[hidden]:not([hidden='until-found'])]:hidden motion-reduce:transition-none"
                  style={({ transitionStatus }) => ({
                    height:
                      transitionStatus === "starting" || transitionStatus === "ending"
                        ? 0
                        : "var(--collapsible-panel-height)",
                    transitionProperty: "height",
                  })}
                >
                  <div className="grid gap-4 pt-4">
                    {["text", "email", "textarea", "phone"].includes(field.type) && (
                      <>
                        <div className="flex min-w-0 items-end gap-2">
                          <div className="min-w-0 flex-1">
                            <PropField label="Min length" htmlFor="ff-min-len">
                              <input
                                id="ff-min-len"
                                type="number"
                                min={0}
                                className={PROP_INPUT}
                                value={field.minLength ?? ""}
                                onChange={(e) =>
                                  onChange({
                                    minLength: e.target.value
                                      ? Number(e.target.value)
                                      : undefined,
                                  })
                                }
                              />
                            </PropField>
                          </div>
                          <div className="min-w-0 flex-1">
                            <PropField label="Max length" htmlFor="ff-max-len">
                              <input
                                id="ff-max-len"
                                type="number"
                                min={0}
                                className={PROP_INPUT}
                                value={field.maxLength ?? ""}
                                onChange={(e) =>
                                  onChange({
                                    maxLength: e.target.value
                                      ? Number(e.target.value)
                                      : undefined,
                                  })
                                }
                              />
                            </PropField>
                          </div>
                        </div>
                        <PropField label="Pattern (regex)" htmlFor="ff-pattern">
                          <input
                            id="ff-pattern"
                            className={`${PROP_INPUT} font-mono text-sm`}
                            placeholder="^[a-zA-Z0-9]+$"
                            value={field.pattern ?? ""}
                            onChange={(e) =>
                              onChange({ pattern: e.target.value || undefined })
                            }
                          />
                        </PropField>
                        <PropField label="Pattern error message" htmlFor="ff-pattern-err">
                          <input
                            id="ff-pattern-err"
                            className={PROP_INPUT}
                            placeholder="Must match the required format"
                            value={field.patternError ?? ""}
                            onChange={(e) =>
                              onChange({ patternError: e.target.value || undefined })
                            }
                          />
                        </PropField>
                      </>
                    )}

                    {["number", "date", "datetime", "rating"].includes(field.type) && (
                      <div className="flex min-w-0 items-end gap-2">
                        <div className="min-w-0 flex-1">
                          <PropField label="Min value" htmlFor="ff-min-val">
                            <input
                              id="ff-min-val"
                              type={
                                field.type === "datetime"
                                  ? "datetime-local"
                                  : field.type === "date"
                                    ? "date"
                                    : "number"
                              }
                              className={PROP_INPUT}
                              value={field.min ?? ""}
                              onChange={(e) =>
                                onChange({ min: e.target.value || undefined })
                              }
                            />
                          </PropField>
                        </div>
                        <div className="min-w-0 flex-1">
                          <PropField label="Max value" htmlFor="ff-max-val">
                            <input
                              id="ff-max-val"
                              type={
                                field.type === "datetime"
                                  ? "datetime-local"
                                  : field.type === "date"
                                    ? "date"
                                    : "number"
                              }
                              className={PROP_INPUT}
                              value={field.max ?? ""}
                              onChange={(e) =>
                                onChange({ max: e.target.value || undefined })
                              }
                            />
                          </PropField>
                        </div>
                      </div>
                    )}
                  </div>
                </Collapsible.Panel>
              </Collapsible.Root>
            </div>
          </section>
        )}
      </div>

      <footer className="sticky bottom-0 flex shrink-0 gap-2 border-t border-kumo-line bg-kumo-base px-4 py-3">
        <Button type="button" variant="secondary" className="flex-1" onClick={onDuplicate}>
          <ActionIcon name="duplicate" size={13} /> Duplicate
        </Button>
        <Button
          type="button"
          variant="secondary-destructive"
          className="flex-1"
          onClick={onRemove}
        >
          <ActionIcon name="delete" size={13} /> Remove
        </Button>
      </footer>
    </aside>
  );
}

function PaletteItem({
  type,
  label,
  onAdd,
}: {
  type: FieldType;
  label: string;
  onAdd: (type: FieldType) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${type}`,
    data: { kind: "palette", type } satisfies DragData,
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`ff-palette-item${isDragging ? " is-dragging" : ""}`}
      onClick={() => onAdd(type)}
      title={`Click to add, or drag to layout (${label})`}
      {...attributes}
      {...listeners}
    >
      <span className="ff-palette-icon">
        <FieldIcon type={type} size={14} />
      </span>
      <span className="ff-palette-label">{label}</span>
    </button>
  );
}

export function FormBuilder({ formId, onBack }: Props) {
  const [form, setForm] = useState<(StoredForm & { id: string }) | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [activeDrag, setActiveDrag] = useState<DragData | null>(null);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<BuilderTab>("layout");
  const [paletteSearch, setPaletteSearch] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const doc = await getForm(formId);
      setForm(doc);
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [formId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keyboard shortcut to close selected field settings
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedFieldId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const selectedField = useMemo(() => {
    if (!form || !selectedFieldId) return null;
    return form.rows.flatMap((r) => r.fields).find((f) => f.id === selectedFieldId) ?? null;
  }, [form, selectedFieldId]);

  const emailFields = useMemo(() => {
    if (!form) return [];
    return form.rows.flatMap((r) => r.fields).filter((f) => {
      if (f.type === "email") return true;
      // Contact-style text fields labeled/handled as email still count as submitter targets
      const key = `${f.handle} ${f.label}`.toLowerCase();
      return f.type === "text" && key.includes("email");
    });
  }, [form]);

  const setRows = (rows: FormRow[], selectId?: string | null) => {
    setForm((prev) => (prev ? { ...prev, rows } : prev));
    setDirty(true);
    if (selectId !== undefined) setSelectedFieldId(selectId);
  };

  const persist = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await saveForm({
        id: form.id,
        name: form.name,
        handle: form.handle,
        rows: form.rows,
        successMessage: form.successMessage,
        cardColor: form.cardColor,
        honeypotEnabled: form.honeypotEnabled,
        captcha: form.captcha,
        privacy: form.privacy,
      });
      setForm((prev) => (prev ? { ...prev, ...saved } : prev));
      setDirty(false);
      setToast("Form saved");
      setTimeout(() => setToast(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as DragData | undefined;
    if (data) setActiveDrag(data);
  };

  const collisionDetectionStrategy: CollisionDetection = useCallback((args) => {
    // 1. Direct pointer within check
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) {
      // Prioritize between-row drop zone if pointer is over it
      const betweenRowHit = pointerCollisions.find((c) =>
        String(c.id).startsWith("between-row:")
      );
      if (betweenRowHit) return [betweenRowHit];
      return pointerCollisions;
    }
    // 2. Fall back to closestCenter for fields within rows
    return closestCenter(args);
  }, []);

  const onDragEnd = (e: DragEndEvent) => {
    const activeData = e.active.data.current as DragData | undefined;
    const over = e.over;
    setActiveDrag(null);
    if (!over || !form) return;

    const overId = String(over.id);

    // 1. Dropping between two rows (creates a new row at targetRowIndex)
    if (overId.startsWith("between-row:")) {
      const targetRowIndex = Number(overId.slice("between-row:".length));
      if (activeData?.kind === "palette") {
        const { rows, fieldId } = insertFieldAsNewRow(
          form.rows,
          activeData.type,
          targetRowIndex,
        );
        setRows(rows, fieldId);
        return;
      }
      if (activeData?.kind === "field") {
        setRows(
          moveFieldToNewRow(form.rows, activeData.fieldId, targetRowIndex),
          activeData.fieldId,
        );
        return;
      }
    }

    // 2. Dropping at the end of canvas
    if (overId === "canvas-end") {
      if (activeData?.kind === "palette") {
        const { rows, fieldId } = appendFieldAsRow(form.rows, activeData.type);
        setRows(rows, fieldId);
        return;
      }
      if (activeData?.kind === "field") {
        setRows(moveFieldToNewRowAtEnd(form.rows, activeData.fieldId), activeData.fieldId);
        return;
      }
    }

    // 3. Dropping palette item into an existing field or row
    if (activeData?.kind === "palette") {
      const type = activeData.type;
      if (overId.startsWith("field:")) {
        const targetFieldId = overId.slice("field:".length);
        const flat = form.rows.flatMap((r, rowIndex) =>
          r.fields.map((f, fieldIndex) => ({ f, rowIndex, fieldIndex })),
        );
        const hit = flat.find((x) => x.f.id === targetFieldId);
        if (hit) {
          const { rows, fieldId } = insertFieldInRow(
            form.rows,
            type,
            hit.rowIndex,
            hit.fieldIndex + 1,
          );
          setRows(rows, fieldId);
        }
        return;
      }
      if (overId.startsWith("row:")) {
        const rowId = overId.slice("row:".length);
        const rowIndex = form.rows.findIndex((r) => r.id === rowId);
        if (rowIndex >= 0) {
          const { rows, fieldId } = insertFieldInRow(
            form.rows,
            type,
            rowIndex,
            form.rows[rowIndex].fields.length,
          );
          setRows(rows, fieldId);
        }
        return;
      }
      // fallback
      const { rows, fieldId } = appendFieldAsRow(form.rows, type);
      setRows(rows, fieldId);
      return;
    }

    // 4. Moving an existing field into another field or row
    if (activeData?.kind === "field") {
      const fieldId = activeData.fieldId;
      if (overId.startsWith("field:")) {
        const targetFieldId = overId.slice("field:".length);
        if (targetFieldId === fieldId) return;
        const flat = form.rows.flatMap((r, rowIndex) =>
          r.fields.map((f, fieldIndex) => ({ f, rowIndex, fieldIndex })),
        );
        const hit = flat.find((x) => x.f.id === targetFieldId);
        if (hit) {
          setRows(moveFieldTo(form.rows, fieldId, hit.rowIndex, hit.fieldIndex), fieldId);
        }
        return;
      }
      if (overId.startsWith("row:")) {
        const rowId = overId.slice("row:".length);
        const rowIndex = form.rows.findIndex((r) => r.id === rowId);
        if (rowIndex >= 0) {
          setRows(
            moveFieldTo(form.rows, fieldId, rowIndex, form.rows[rowIndex].fields.length),
            fieldId,
          );
        }
      }
    }
  };

  const handleAddField = (type: FieldType) => {
    if (!form) return;
    const { rows, fieldId } = appendFieldAsRow(form.rows, type);
    setRows(rows, fieldId);
  };

  const handleDuplicateField = (fieldId: string) => {
    if (!form) return;
    setRows(duplicateField(form.rows, fieldId));
  };

  const handleRemoveField = (fieldId: string) => {
    if (!form) return;
    setRows(removeField(form.rows, fieldId), null);
  };

  const filteredGroups = useMemo(() => {
    if (!paletteSearch.trim()) return PALETTE_GROUPS;
    const q = paletteSearch.toLowerCase();
    return PALETTE_GROUPS.map((g) => ({
      group: g.group,
      types: g.types.filter(
        (t) =>
          t.label.toLowerCase().includes(q) ||
          t.type.toLowerCase().includes(q),
      ),
    })).filter((g) => g.types.length > 0);
  }, [paletteSearch]);

  if (error && !form) {
    return (
      <div className="ff-shell ff-form-editor">
        <p className="ff-error" style={{ padding: "1rem" }}>
          {error}
        </p>
        <button type="button" className="ff-btn" onClick={onBack}>
          Back
        </button>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="ff-shell ff-form-editor">
        <p className="ff-meta" style={{ padding: "1rem" }}>
          Loading form…
        </p>
      </div>
    );
  }

  return (
    <div className="ff-shell ff-form-editor">
      <div className="ff-header ff-header-builder">
        {/* Left: title + tabs stacked (flex-col). Middle: theme. Right: Save */}
        <div className="ff-builder-nav-col">
          <div className="ff-header-title">
            <div className="ff-builder-crumb" data-ff-editor-bar="">
              <GhostSquareBackButton
                aria-label="Back to Forms list"
                size="sm"
                onClick={onBack}
              />
              <div className="ff-builder-crumb-trail">
                <EditorBarListLabel onClick={onBack}>Forms</EditorBarListLabel>
                <span className="ff-builder-crumb-sep" aria-hidden="true">
                  /
                </span>
                <div className="ff-builder-crumb-name">
                  <h1 className="ff-builder-crumb-heading">
                    <button
                      type="button"
                      className="ff-title-display"
                      title="Edit in Settings"
                      onClick={() => setTab("settings")}
                    >
                      {form.name.trim() || "Untitled form"}
                    </button>
                  </h1>
                </div>
              </div>
            </div>
          </div>

          <nav className="ff-builder-tabs" aria-label="Form sections" role="tablist">
            {(
              [
                ["layout", "Layout"],
                ["notifications", "Notifications"],
                ["protection", "Protection"],
                ["settings", "Settings"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                className={`ff-builder-tab${tab === id ? " is-active" : ""}`}
                aria-selected={tab === id}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>

        <div className="ff-builder-theme-row">
          <div className="ff-color-picker" role="group" aria-label="Form card color">
            {FORM_COLOR_PRESETS.map((hex) => {
              const active = resolveFormColor(form) === hex;
              return (
                <button
                  key={hex}
                  type="button"
                  className={`ff-color-swatch${active ? " is-active" : ""}`}
                  style={{ background: hex }}
                  title={hex}
                  aria-label={`Card color ${hex}`}
                  aria-pressed={active}
                  onClick={() => {
                    setForm({ ...form, cardColor: hex });
                    setDirty(true);
                  }}
                />
              );
            })}
          </div>
        </div>

        <div className="ff-actions">
          {dirty ? <span className="ff-builder-unsaved">Unsaved</span> : null}
          <Button
            variant="primary"
            onClick={() => void persist()}
            disabled={saving || !dirty}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {error && <p className="ff-error ff-form-editor-error">{error}</p>}

      <div className="ff-form-editor-body">
      {tab === "layout" && (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetectionStrategy}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div className="ff-builder">
            <aside className="ff-panel ff-palette-panel">
              <div className="ff-palette-header">
                <h2>Field Types</h2>
                <div className="ff-palette-search">
                  <ActionIcon name="search" size={13} className="ff-search-icon" />
                  <input
                    type="text"
                    placeholder="Search fields…"
                    value={paletteSearch}
                    onChange={(e) => setPaletteSearch(e.target.value)}
                  />
                  {paletteSearch && (
                    <button
                      type="button"
                      className="ff-search-clear"
                      onClick={() => setPaletteSearch("")}
                      title="Clear search"
                    >
                      <ActionIcon name="close" size={11} />
                    </button>
                  )}
                </div>
              </div>

              <div className="ff-palette-content">
                {filteredGroups.length === 0 ? (
                  <div className="ff-palette-empty">No fields match &quot;{paletteSearch}&quot;</div>
                ) : (
                  filteredGroups.map((group) => (
                    <div key={group.group} className="ff-palette-group">
                      <strong className="ff-palette-group-title">{group.group}</strong>
                      <div className="ff-palette-grid">
                        {group.types.map(({ type, label }) => (
                          <PaletteItem
                            key={type}
                            type={type}
                            label={label}
                            onAdd={handleAddField}
                          />
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </aside>

            <main className="ff-panel ff-canvas">
              <div className="ff-canvas-header">
                <h2>Form Canvas</h2>
                <span className="ff-meta">
                  {form.rows.length} {form.rows.length === 1 ? "row" : "rows"} ·{" "}
                  {form.rows.reduce((acc, r) => acc + r.fields.length, 0)} fields
                </span>
              </div>
              {form.rows.length === 0 ? (
                <div className="ff-empty-canvas">
                  <div className="ff-empty-canvas-icon">
                    <ActionIcon name="plus" size={32} />
                  </div>
                  <h3>Your form is empty</h3>
                  <p>Click any field on the left palette or drag it here to start building.</p>
                </div>
              ) : (
                <>
                  {form.rows.map((row, rowIndex) => (
                    <Fragment key={row.id}>
                      <BetweenRowDropZone rowIndex={rowIndex} active={!!activeDrag} />
                      <RowDropZone
                        row={row}
                        rowIndex={rowIndex}
                        selectedFieldId={selectedFieldId}
                        onSelectField={setSelectedFieldId}
                        onDuplicateField={handleDuplicateField}
                        onRemoveField={handleRemoveField}
                      />
                    </Fragment>
                  ))}
                  <BetweenRowDropZone rowIndex={form.rows.length} active={!!activeDrag} />
                </>
              )}
              <CanvasEndDrop active={!!activeDrag && form.rows.length > 0} />
            </main>

            <PropertyEditor
              field={selectedField}
              onChange={(patch) => {
                if (!selectedFieldId) return;
                setRows(updateField(form.rows, selectedFieldId, patch), selectedFieldId);
              }}
              onDuplicate={() => {
                if (!selectedFieldId) return;
                setRows(duplicateField(form.rows, selectedFieldId));
              }}
              onRemove={() => {
                if (!selectedFieldId) return;
                setRows(removeField(form.rows, selectedFieldId), null);
              }}
              onClose={() => setSelectedFieldId(null)}
            />
          </div>

          <DragOverlay>
            {activeDrag?.kind === "palette" ? (
              <div className="ff-palette-item ff-drag-overlay-palette">
                <span className="ff-palette-icon">
                  <FieldIcon type={activeDrag.type} size={15} />
                </span>
                <span className="ff-palette-label">
                  {defaultFieldLabel(activeDrag.type)}
                </span>
              </div>
            ) : activeDrag?.kind === "field" ? (
              (() => {
                const draggedField = form.rows
                  .flatMap((r) => r.fields)
                  .find((f) => f.id === activeDrag.fieldId);
                if (!draggedField) return <div className="ff-field">Moving field…</div>;
                return (
                  <div className="ff-field is-selected ff-drag-overlay-field">
                    <div className="ff-field-header">
                      <div className="ff-field-title">
                        <FieldIcon type={draggedField.type} size={14} className="ff-field-type-icon" />
                        <span className="ff-field-label">{draggedField.label}</span>
                        {draggedField.required && <span className="ff-req">*</span>}
                      </div>
                    </div>
                    <div className="ff-field-body">
                      <FieldPreview field={draggedField} />
                    </div>
                  </div>
                );
              })()
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {tab === "notifications" && (
        <FormNotificationsPanel formId={form.id} emailFields={emailFields} />
      )}

      {tab === "protection" && (
        <FormProtectionPanel
          honeypotEnabled={form.honeypotEnabled !== false}
          captcha={form.captcha}
          privacy={form.privacy}
          onHoneypotChange={(enabled) => {
            setForm({ ...form, honeypotEnabled: enabled });
            setDirty(true);
          }}
          onCaptchaChange={(next) => {
            setForm({
              ...form,
              captcha: next ?? undefined,
            });
            setDirty(true);
          }}
          onPrivacyChange={(next) => {
            setForm({ ...form, privacy: next });
            setDirty(true);
          }}
        />
      )}

      {tab === "settings" && (
        <FormSettingsPanel
          form={form}
          onChange={(patch) => {
            setForm({ ...form, ...patch });
            setDirty(true);
          }}
        />
      )}
      </div>

      {toast && <div className="ff-toast">{toast}</div>}
    </div>
  );
}
