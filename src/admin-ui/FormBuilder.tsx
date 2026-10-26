import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FieldType, FormField, FormRow, StoredForm } from "../types";
import { FormNotificationsPanel } from "./FormNotificationsPanel";
import { FormProtectionPanel } from "./FormProtectionPanel";
import { getForm, saveForm } from "./ff-api";
import { FORM_COLOR_PRESETS, resolveFormColor } from "./ff-nav";
import { PALETTE_GROUPS, needsOptions } from "./field-types";
import {
  appendFieldAsRow,
  duplicateField,
  insertFieldInRow,
  moveFieldTo,
  moveFieldToNewRowAtEnd,
  removeField,
  removeRow,
  updateField,
} from "./layout-ops";

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
}: {
  field: FormField;
  selected: boolean;
  onSelect: () => void;
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
      <div className="ff-field-label">{field.label}</div>
      <div className="ff-field-meta">
        {field.type}
        {field.required ? " · required" : ""}
        {" · "}
        {field.handle}
      </div>
    </div>
  );
}

function RowDropZone({
  row,
  rowIndex,
  selectedFieldId,
  onSelectField,
  onDeleteRow,
}: {
  row: FormRow;
  rowIndex: number;
  selectedFieldId: string | null;
  onSelectField: (id: string) => void;
  onDeleteRow: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `row:${row.id}`,
    data: { kind: "row", rowId: row.id, rowIndex },
  });

  return (
    <div className="ff-row" ref={setNodeRef} data-over={isOver || undefined}>
      <div className="ff-row-header">
        <span>Row {rowIndex + 1}</span>
        <button type="button" className="ff-btn ff-btn-danger" onClick={onDeleteRow}>
          Delete row
        </button>
      </div>
      <SortableContext
        items={row.fields.map((f) => `field:${f.id}`)}
        strategy={horizontalListSortingStrategy}
      >
        <div className="ff-row-fields">
          {row.fields.map((field) => (
            <SortableField
              key={field.id}
              field={field}
              selected={selectedFieldId === field.id}
              onSelect={() => onSelectField(field.id)}
            />
          ))}
          {row.fields.length === 0 && (
            <div className="ff-meta">Drop a field here</div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function CanvasEndDrop({ active }: { active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: "canvas-end",
    data: { kind: "canvas-end" },
  });
  if (!active && !isOver) {
    return <div ref={setNodeRef} style={{ height: 12 }} />;
  }
  return (
    <div ref={setNodeRef} className="ff-drop-hint">
      Drop to add a new row
    </div>
  );
}

function PropertyEditor({
  field,
  onChange,
  onDuplicate,
  onRemove,
}: {
  field: FormField | null;
  onChange: (patch: Partial<FormField>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  if (!field) {
    return (
      <div className="ff-panel">
        <h2>Field settings</h2>
        <p className="ff-meta">Select a field on the canvas to edit its properties.</p>
      </div>
    );
  }

  const optionsText = (field.options ?? [])
    .map((o) => `${o.value}: ${o.label}`)
    .join(", ");

  return (
    <div className="ff-panel ff-prop">
      <h2>Field settings</h2>
      <label htmlFor="ff-label">Label</label>
      <input
        id="ff-label"
        value={field.label}
        onChange={(e) => onChange({ label: e.target.value })}
      />
      <label htmlFor="ff-handle">Handle</label>
      <input
        id="ff-handle"
        value={field.handle}
        onChange={(e) => onChange({ handle: e.target.value })}
      />
      {field.type !== "consent" && (
        <label htmlFor="ff-required">
          <input
            id="ff-required"
            type="checkbox"
            checked={field.required}
            onChange={(e) => onChange({ required: e.target.checked })}
          />{" "}
          Required
        </label>
      )}
      {field.type === "consent" && (
        <>
          <p className="ff-meta">
            Consent fields are always required and never pre-checked. Acceptance
            is stored with a timestamp for accountability.
          </p>
          <label htmlFor="ff-consent-url">Privacy policy URL (optional)</label>
          <input
            id="ff-consent-url"
            type="url"
            placeholder="https://example.com/privacy"
            value={field.privacyPolicyUrl ?? ""}
            onChange={(e) => onChange({ privacyPolicyUrl: e.target.value })}
          />
        </>
      )}
      {needsOptions(field.type) && (
        <>
          <label htmlFor="ff-options">Options (`value: Label`, comma-separated)</label>
          <textarea
            id="ff-options"
            value={optionsText}
            onChange={(e) => {
              const options = e.target.value
                .split(",")
                .map((part) => part.trim())
                .filter(Boolean)
                .map((part) => {
                  const [value, ...rest] = part.split(":");
                  const label = rest.join(":").trim() || value.trim();
                  return { value: value.trim(), label };
                });
              onChange({ options });
            }}
          />
        </>
      )}
      <div className="ff-actions" style={{ marginTop: "0.85rem" }}>
        <button type="button" className="ff-btn" onClick={onDuplicate}>
          Duplicate
        </button>
        <button type="button" className="ff-btn ff-btn-danger" onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
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
        captcha: form.captcha ?? null,
        honeypotEnabled: form.honeypotEnabled !== false,
        privacy: form.privacy ?? null,
        cardColor: form.cardColor ?? null,
      });
      setForm(saved);
      setDirty(false);
      setToast("Form saved");
      setTimeout(() => setToast(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const onDragStart = (event: DragStartEvent) => {
    setActiveDrag((event.active.data.current as DragData) ?? null);
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null);
    if (!form) return;
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current as DragData | undefined;
    const overId = String(over.id);

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
      // canvas-end or empty canvas
      const { rows, fieldId } = appendFieldAsRow(form.rows, type);
      setRows(rows, fieldId);
      return;
    }

    if (activeData?.kind === "field") {
      const fieldId = activeData.fieldId;
      if (overId === "canvas-end") {
        setRows(moveFieldToNewRowAtEnd(form.rows, fieldId), fieldId);
        return;
      }
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
          <button type="button" className="ff-btn" onClick={onBack}>
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
          collisionDetection={closestCenter}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div className="ff-builder">
            <aside className="ff-panel">
              <h2>Fields</h2>
              {PALETTE_GROUPS.map((group) => (
                <div key={group.group} className="ff-palette-group">
                  <strong>{group.group}</strong>
                  {group.types.map(({ type, label }) => (
                    <PaletteItem key={type} type={type} label={label} />
                  ))}
                </div>
              ))}
            </aside>

            <main className="ff-panel ff-canvas">
              <h2>Layout</h2>
              {form.rows.length === 0 ? (
                <div className="ff-empty-canvas">
                  Drag a field from the left palette to start building.
                </div>
              ) : (
                form.rows.map((row, rowIndex) => (
                  <RowDropZone
                    key={row.id}
                    row={row}
                    rowIndex={rowIndex}
                    selectedFieldId={selectedFieldId}
                    onSelectField={setSelectedFieldId}
                    onDeleteRow={() => {
                      setRows(removeRow(form.rows, row.id), null);
                    }}
                  />
                ))
              )}
              <CanvasEndDrop active={!!activeDrag} />
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
            />
          </div>

          <DragOverlay>
            {activeDrag?.kind === "palette" ? (
              <div className="ff-palette-item">{activeDrag.type}</div>
            ) : activeDrag?.kind === "field" ? (
              <div className="ff-field">Moving field…</div>
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

function PaletteItem({ type, label }: { type: FieldType; label: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${type}`,
    data: { kind: "palette", type } satisfies DragData,
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`ff-palette-item${isDragging ? " is-dragging" : ""}`}
      {...attributes}
      {...listeners}
    >
      {label}
    </button>
  );
}
