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
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { FieldType, FormField, FormRow, StoredForm } from "../types";
import { FormNotificationsPanel } from "./FormNotificationsPanel";
import { FormProtectionPanel } from "./FormProtectionPanel";
import { FieldPreview } from "./FieldPreview";
import { FieldOptionsEditor } from "./FieldOptionsEditor";
import { ActionIcon, FieldIcon } from "./field-icons";
import { getForm, saveForm } from "./ff-api";
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

type BuilderTab = "layout" | "notifications" | "protection";

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
  if (!field) {
    return (
      <div className="ff-panel ff-prop-empty">
        <div className="ff-prop-empty-icon">
          <ActionIcon name="search" size={24} />
        </div>
        <h2>Field Settings</h2>
        <p className="ff-meta">
          Click any field on the canvas to configure its label, handle, validation rules, and choices.
        </p>
      </div>
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

  return (
    <div className="ff-panel ff-prop">
      <div className="ff-prop-header">
        <div>
          <h2>Field Settings</h2>
          <div className="ff-prop-type-badge">
            <FieldIcon type={field.type} size={13} />
            <span>{field.type}</span>
          </div>
        </div>
        <button
          type="button"
          className="ff-prop-close"
          title="Close settings (Esc)"
          onClick={onClose}
        >
          <ActionIcon name="close" size={14} />
        </button>
      </div>

      <div className="ff-prop-group">
        <label htmlFor="ff-label">Label</label>
        <input
          id="ff-label"
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </div>

      <div className="ff-prop-group">
        <label htmlFor="ff-handle">Handle</label>
        <input
          id="ff-handle"
          value={field.handle}
          onChange={(e) => onChange({ handle: e.target.value })}
        />
      </div>

      {field.type !== "consent" && field.type !== "html" && field.type !== "hidden" && (
        <div className="ff-prop-group ff-prop-checkbox-row">
          <label htmlFor="ff-required">
            <input
              id="ff-required"
              type="checkbox"
              checked={field.required}
              onChange={(e) => onChange({ required: e.target.checked })}
            />{" "}
            Required field
          </label>
        </div>
      )}

      {supportsPlaceholder && (
        <div className="ff-prop-group">
          <label htmlFor="ff-placeholder">Placeholder</label>
          <input
            id="ff-placeholder"
            placeholder="e.g. Enter your name..."
            value={field.placeholder ?? ""}
            onChange={(e) => onChange({ placeholder: e.target.value || undefined })}
          />
        </div>
      )}

      {field.type !== "consent" && !needsOptions(field.type) && (
        <div className="ff-prop-group">
          <label htmlFor="ff-default-val">Default value</label>
          <input
            id="ff-default-val"
            placeholder="Initial prefilled value"
            value={typeof field.defaultValue === "string" ? field.defaultValue : ""}
            onChange={(e) => onChange({ defaultValue: e.target.value || undefined })}
          />
        </div>
      )}

      {field.type === "file" && (
        <div className="ff-prop-section">
          <h3>File Upload Settings</h3>
          <div className="ff-prop-group">
            <label htmlFor="ff-file-ext">Allowed file extensions</label>
            <input
              id="ff-file-ext"
              placeholder="e.g. pdf, png, jpg, docx"
              value={field.allowedExtensions ?? ""}
              onChange={(e) => onChange({ allowedExtensions: e.target.value || undefined })}
            />
          </div>
          <div className="ff-prop-group">
            <label htmlFor="ff-file-size">Max file size (MB)</label>
            <input
              id="ff-file-size"
              type="number"
              min={1}
              max={100}
              value={field.maxFileSizeMb ?? 10}
              onChange={(e) =>
                onChange({
                  maxFileSizeMb: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            />
          </div>
        </div>
      )}

      {field.type === "rating" && (
        <div className="ff-prop-section">
          <h3>Rating Settings</h3>
          <div className="ff-prop-group">
            <label htmlFor="ff-max-stars">Number of stars (max rating)</label>
            <input
              id="ff-max-stars"
              type="number"
              min={3}
              max={10}
              value={field.maxStars ?? 5}
              onChange={(e) =>
                onChange({
                  maxStars: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            />
          </div>
        </div>
      )}

      {field.type === "consent" && (
        <div className="ff-prop-section">
          <h3>Consent Settings</h3>
          <p className="ff-meta">
            Consent fields are always required and never pre-checked (GDPR compliant). Acceptance is stored with a timestamp.
          </p>
          <div className="ff-prop-group">
            <label htmlFor="ff-consent-url">Privacy policy URL</label>
            <input
              id="ff-consent-url"
              type="url"
              placeholder="https://example.com/privacy"
              value={field.privacyPolicyUrl ?? ""}
              onChange={(e) => onChange({ privacyPolicyUrl: e.target.value })}
            />
          </div>
        </div>
      )}

      {field.type === "html" && (
        <div className="ff-prop-section">
          <h3>HTML Content</h3>
          <p className="ff-meta">Render static HTML markup inside the form layout.</p>
          <div className="ff-prop-group">
            <label htmlFor="ff-html-content">HTML markup</label>
            <textarea
              id="ff-html-content"
              rows={4}
              placeholder="<p>Custom HTML text or heading</p>"
              value={typeof field.defaultValue === "string" ? field.defaultValue : ""}
              onChange={(e) => onChange({ defaultValue: e.target.value })}
            />
          </div>
        </div>
      )}

      {needsOptions(field.type) && (
        <div className="ff-prop-section">
          <h3>Options</h3>
          <FieldOptionsEditor field={field} onChange={onChange} />
        </div>
      )}

      {supportsValidation && (
        <details className="ff-prop-details">
          <summary>Validation Rules</summary>
          <div className="ff-prop-details-body">
            {["text", "email", "textarea", "phone"].includes(field.type) && (
              <>
                <div className="ff-prop-row">
                  <div className="ff-prop-col">
                    <label htmlFor="ff-min-len">Min length</label>
                    <input
                      id="ff-min-len"
                      type="number"
                      min={0}
                      value={field.minLength ?? ""}
                      onChange={(e) =>
                        onChange({
                          minLength: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                    />
                  </div>
                  <div className="ff-prop-col">
                    <label htmlFor="ff-max-len">Max length</label>
                    <input
                      id="ff-max-len"
                      type="number"
                      min={0}
                      value={field.maxLength ?? ""}
                      onChange={(e) =>
                        onChange({
                          maxLength: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                    />
                  </div>
                </div>
                <div className="ff-prop-group">
                  <label htmlFor="ff-pattern">Pattern (regex)</label>
                  <input
                    id="ff-pattern"
                    placeholder="^[a-zA-Z0-9]+$"
                    value={field.pattern ?? ""}
                    onChange={(e) => onChange({ pattern: e.target.value || undefined })}
                  />
                </div>
                <div className="ff-prop-group">
                  <label htmlFor="ff-pattern-err">Pattern error message</label>
                  <input
                    id="ff-pattern-err"
                    placeholder="Must match the required format"
                    value={field.patternError ?? ""}
                    onChange={(e) =>
                      onChange({ patternError: e.target.value || undefined })
                    }
                  />
                </div>
              </>
            )}

            {["number", "date", "datetime", "rating"].includes(field.type) && (
              <div className="ff-prop-row">
                <div className="ff-prop-col">
                  <label htmlFor="ff-min-val">Min value</label>
                  <input
                    id="ff-min-val"
                    type={field.type === "datetime" ? "datetime-local" : field.type === "date" ? "date" : "number"}
                    value={field.min ?? ""}
                    onChange={(e) => onChange({ min: e.target.value || undefined })}
                  />
                </div>
                <div className="ff-prop-col">
                  <label htmlFor="ff-max-val">Max value</label>
                  <input
                    id="ff-max-val"
                    type={field.type === "datetime" ? "datetime-local" : field.type === "date" ? "date" : "number"}
                    value={field.max ?? ""}
                    onChange={(e) => onChange({ max: e.target.value || undefined })}
                  />
                </div>
              </div>
            )}
          </div>
        </details>
      )}

      <div className="ff-actions ff-prop-actions">
        <button type="button" className="ff-btn" onClick={onDuplicate}>
          <ActionIcon name="duplicate" size={13} /> Duplicate
        </button>
        <button type="button" className="ff-btn ff-btn-danger" onClick={onRemove}>
          <ActionIcon name="delete" size={13} /> Remove
        </button>
      </div>
    </div>
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
    return form.rows.flatMap((r) => r.fields).filter((f) => f.type === "email");
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
      <div className="ff-shell">
        <p className="ff-error">{error}</p>
        <button type="button" className="ff-btn" onClick={onBack}>
          Back
        </button>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="ff-shell">
        <p className="ff-meta">Loading form…</p>
      </div>
    );
  }

  return (
    <div className="ff-shell">
      <div className="ff-header ff-header-builder">
        <div className="ff-header-title">
          <h1>
            <input
              className="ff-title-input"
              value={form.name}
              onChange={(e) => {
                setForm({ ...form, name: e.target.value });
                setDirty(true);
              }}
            />
          </h1>
          <p>
            Handle <code>{form.handle}</code>
            {dirty ? " · unsaved changes" : ""}
          </p>
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

        <nav className="ff-builder-tabs" aria-label="Form sections">
          {(
            [
              ["layout", "Layout"],
              ["notifications", "Notifications"],
              ["protection", "Protection"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`ff-builder-tab${tab === id ? " is-active" : ""}`}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="ff-actions">
          <button type="button" className="ff-btn ff-btn-secondary" onClick={onBack}>
            All forms
          </button>
          <button
            type="button"
            className="ff-btn ff-btn-primary"
            onClick={() => void persist()}
            disabled={saving || !dirty}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {error && <p className="ff-error">{error}</p>}

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

      {toast && <div className="ff-toast">{toast}</div>}
    </div>
  );
}
