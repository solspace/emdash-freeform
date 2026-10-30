import { useId, useMemo, useRef, useState } from "react";
import type { FieldOption, FormField } from "../types";

export interface FieldOptionsEditorProps {
  field: FormField;
  onChange: (patch: Partial<FormField>) => void;
}

// Predefined option presets directly modeled after Craft Freeform's Predefined Sources
export const PREDEFINED_PRESETS: Array<{
  name: string;
  category: string;
  options: FieldOption[];
}> = [
  {
    name: "Yes / No",
    category: "Basic",
    options: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ],
  },
  {
    name: "Satisfaction Rating (1–5)",
    category: "Surveys",
    options: [
      { label: "5 - Outstanding", value: "5" },
      { label: "4 - Very Good", value: "4" },
      { label: "3 - Average", value: "3" },
      { label: "2 - Poor", value: "2" },
      { label: "1 - Terrible", value: "1" },
    ],
  },
  {
    name: "Likelihood / NPS (0–10)",
    category: "Surveys",
    options: [
      { label: "0 - Not at all likely", value: "0" },
      { label: "1", value: "1" },
      { label: "2", value: "2" },
      { label: "3", value: "3" },
      { label: "4", value: "4" },
      { label: "5 - Neutral", value: "5" },
      { label: "6", value: "6" },
      { label: "7", value: "7" },
      { label: "8", value: "8" },
      { label: "9", value: "9" },
      { label: "10 - Extremely likely", value: "10" },
    ],
  },
  {
    name: "Age Ranges",
    category: "Demographics",
    options: [
      { label: "Under 18", value: "under_18" },
      { label: "18–24", value: "18-24" },
      { label: "25–34", value: "25-34" },
      { label: "35–44", value: "35-44" },
      { label: "45–54", value: "45-54" },
      { label: "55–64", value: "55-64" },
      { label: "65+", value: "65_plus" },
    ],
  },
  {
    name: "Days of Week",
    category: "Date & Time",
    options: [
      { label: "Monday", value: "monday" },
      { label: "Tuesday", value: "tuesday" },
      { label: "Wednesday", value: "wednesday" },
      { label: "Thursday", value: "thursday" },
      { label: "Friday", value: "friday" },
      { label: "Saturday", value: "saturday" },
      { label: "Sunday", value: "sunday" },
    ],
  },
  {
    name: "Months of Year",
    category: "Date & Time",
    options: [
      { label: "January", value: "january" },
      { label: "February", value: "february" },
      { label: "March", value: "march" },
      { label: "April", value: "april" },
      { label: "May", value: "may" },
      { label: "June", value: "june" },
      { label: "July", value: "july" },
      { label: "August", value: "august" },
      { label: "September", value: "september" },
      { label: "October", value: "october" },
      { label: "November", value: "november" },
      { label: "December", value: "december" },
    ],
  },
  {
    name: "Countries (Common)",
    category: "Geography",
    options: [
      { label: "United States", value: "US" },
      { label: "Canada", value: "CA" },
      { label: "United Kingdom", value: "GB" },
      { label: "Australia", value: "AU" },
      { label: "Germany", value: "DE" },
      { label: "France", value: "FR" },
      { label: "Japan", value: "JP" },
      { label: "Netherlands", value: "NL" },
      { label: "New Zealand", value: "NZ" },
      { label: "Ireland", value: "IE" },
      { label: "Spain", value: "ES" },
      { label: "Italy", value: "IT" },
      { label: "Brazil", value: "BR" },
      { label: "India", value: "IN" },
      { label: "Mexico", value: "MX" },
    ],
  },
  {
    name: "US States",
    category: "Geography",
    options: [
      { label: "Alabama", value: "AL" },
      { label: "Alaska", value: "AK" },
      { label: "Arizona", value: "AZ" },
      { label: "Arkansas", value: "AR" },
      { label: "California", value: "CA" },
      { label: "Colorado", value: "CO" },
      { label: "Connecticut", value: "CT" },
      { label: "Delaware", value: "DE" },
      { label: "Florida", value: "FL" },
      { label: "Georgia", value: "GA" },
      { label: "Hawaii", value: "HI" },
      { label: "Idaho", value: "ID" },
      { label: "Illinois", value: "IL" },
      { label: "Indiana", value: "IN" },
      { label: "Iowa", value: "IA" },
      { label: "Kansas", value: "KS" },
      { label: "Kentucky", value: "KY" },
      { label: "Louisiana", value: "LA" },
      { label: "Maine", value: "ME" },
      { label: "Maryland", value: "MD" },
      { label: "Massachusetts", value: "MA" },
      { label: "Michigan", value: "MI" },
      { label: "Minnesota", value: "MN" },
      { label: "Mississippi", value: "MS" },
      { label: "Missouri", value: "MO" },
      { label: "Montana", value: "MT" },
      { label: "Nebraska", value: "NE" },
      { label: "Nevada", value: "NV" },
      { label: "New Hampshire", value: "NH" },
      { label: "New Jersey", value: "NJ" },
      { label: "New Mexico", value: "NM" },
      { label: "New York", value: "NY" },
      { label: "North Carolina", value: "NC" },
      { label: "North Dakota", value: "ND" },
      { label: "Ohio", value: "OH" },
      { label: "Oklahoma", value: "OK" },
      { label: "Oregon", value: "OR" },
      { label: "Pennsylvania", value: "PA" },
      { label: "Rhode Island", value: "RI" },
      { label: "South Carolina", value: "SC" },
      { label: "South Dakota", value: "SD" },
      { label: "Tennessee", value: "TN" },
      { label: "Texas", value: "TX" },
      { label: "Utah", value: "UT" },
      { label: "Vermont", value: "VT" },
      { label: "Virginia", value: "VA" },
      { label: "Washington", value: "WA" },
      { label: "West Virginia", value: "WV" },
      { label: "Wisconsin", value: "WI" },
      { label: "Wyoming", value: "WY" },
    ],
  },
  {
    name: "Canadian Provinces",
    category: "Geography",
    options: [
      { label: "Alberta", value: "AB" },
      { label: "British Columbia", value: "BC" },
      { label: "Manitoba", value: "MB" },
      { label: "New Brunswick", value: "NB" },
      { label: "Newfoundland and Labrador", value: "NL" },
      { label: "Northwest Territories", value: "NT" },
      { label: "Nova Scotia", value: "NS" },
      { label: "Nunavut", value: "NU" },
      { label: "Ontario", value: "ON" },
      { label: "Prince Edward Island", value: "PE" },
      { label: "Quebec", value: "QC" },
      { label: "Saskatchewan", value: "SK" },
      { label: "Yukon", value: "YT" },
    ],
  },
  {
    name: "Numbers (1–10)",
    category: "Basic",
    options: [
      { label: "1", value: "1" },
      { label: "2", value: "2" },
      { label: "3", value: "3" },
      { label: "4", value: "4" },
      { label: "5", value: "5" },
      { label: "6", value: "6" },
      { label: "7", value: "7" },
      { label: "8", value: "8" },
      { label: "9", value: "9" },
      { label: "10", value: "10" },
    ],
  },
];

function normalizeOptions(raw: unknown): FieldOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, idx) => {
    if (typeof item === "string") {
      return { label: item, value: item };
    }
    if (item && typeof item === "object") {
      const opt = item as Record<string, unknown>;
      const label = String(opt.label ?? opt.value ?? `Option ${idx + 1}`);
      const value = String(opt.value ?? opt.label ?? `option_${idx + 1}`);
      return { label, value };
    }
    return { label: `Option ${idx + 1}`, value: `option_${idx + 1}` };
  });
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "_")
    .replace(/^-+|-+$/g, "");
}

export function FieldOptionsEditor({ field, onChange }: FieldOptionsEditorProps) {
  const isMultiple = field.type === "multi_select" || field.type === "checkbox_group";
  const rawOptions = useMemo(() => normalizeOptions(field.options), [field.options]);

  // Determine if custom values are currently in use
  const hasDistinctValues = useMemo(() => {
    return rawOptions.some(
      (opt) => opt.value !== opt.label && opt.value !== slugify(opt.label)
    );
  }, [rawOptions]);

  const [useCustomValues, setUseCustomValues] = useState<boolean>(() => hasDistinctValues);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkMode, setBulkMode] = useState<"replace" | "append">("replace");
  const [presetOpen, setPresetOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const presetRef = useRef<HTMLDivElement>(null);

  const options = rawOptions.length > 0 ? rawOptions : [{ label: "Option 1", value: "option_1" }];

  const currentDefaults = useMemo<Set<string>>(() => {
    if (isMultiple) {
      if (Array.isArray(field.defaultValue)) {
        return new Set(field.defaultValue.map(String));
      }
      return new Set();
    }
    if (typeof field.defaultValue === "string" && field.defaultValue !== "") {
      return new Set([field.defaultValue]);
    }
    return new Set();
  }, [field.defaultValue, isMultiple]);

  const updateOptions = (nextOptions: FieldOption[]) => {
    onChange({ options: nextOptions });
  };

  const handleLabelChange = (index: number, newLabel: string) => {
    const next = [...options];
    const prev = next[index];
    const autoVal = !useCustomValues ? (slugify(newLabel) || newLabel) : prev.value;
    next[index] = { ...prev, label: newLabel, value: autoVal };
    updateOptions(next);
  };

  const handleValueChange = (index: number, newValue: string) => {
    const next = [...options];
    next[index] = { ...next[index], value: newValue };
    updateOptions(next);
  };

  const handleAddOption = (atIndex?: number) => {
    const next = [...options];
    const num = next.length + 1;
    const newOpt: FieldOption = {
      label: `Option ${num}`,
      value: `option_${num}`,
    };
    if (typeof atIndex === "number") {
      next.splice(atIndex + 1, 0, newOpt);
    } else {
      next.push(newOpt);
    }
    updateOptions(next);
  };

  const handleDeleteOption = (index: number) => {
    if (options.length <= 1) {
      updateOptions([{ label: "", value: "" }]);
      return;
    }
    const removedValue = options[index].value;
    const next = options.filter((_, i) => i !== index);
    updateOptions(next);

    // Clean up default value if the deleted option was selected
    if (currentDefaults.has(removedValue)) {
      if (isMultiple) {
        const nextDefaults = Array.from(currentDefaults).filter((v) => v !== removedValue);
        onChange({ defaultValue: nextDefaults.length ? nextDefaults : undefined });
      } else {
        onChange({ defaultValue: undefined });
      }
    }
  };

  const handleMove = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= options.length) return;
    const next = [...options];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    updateOptions(next);
  };

  const toggleDefault = (optValue: string) => {
    if (isMultiple) {
      const nextSet = new Set(currentDefaults);
      if (nextSet.has(optValue)) {
        nextSet.delete(optValue);
      } else {
        nextSet.add(optValue);
      }
      onChange({ defaultValue: Array.from(nextSet) });
    } else {
      if (currentDefaults.has(optValue)) {
        onChange({ defaultValue: undefined });
      } else {
        onChange({ defaultValue: optValue });
      }
    }
  };

  const handleApplyPreset = (preset: typeof PREDEFINED_PRESETS[0]) => {
    updateOptions(preset.options);
    setUseCustomValues(true);
    setPresetOpen(false);
  };

  const handleApplyBulk = () => {
    const lines = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
    const parsed: FieldOption[] = lines.map((line) => {
      // Support Craft Freeform formats: "Label;value", "value: Label", "Label, value", "Label | value"
      let label = line;
      let value = line;

      if (line.includes(";")) {
        const [l, v] = line.split(";");
        label = l.trim();
        value = v?.trim() || slugify(label);
      } else if (line.includes(":")) {
        const [v, ...rest] = line.split(":");
        value = v.trim();
        label = rest.join(":").trim() || value;
      } else if (line.includes("|")) {
        const [l, v] = line.split("|");
        label = l.trim();
        value = v?.trim() || slugify(label);
      } else if (line.includes("\t")) {
        const [l, v] = line.split("\t");
        label = l.trim();
        value = v?.trim() || slugify(label);
      } else {
        value = slugify(line) || line;
      }

      return { label, value };
    });

    if (parsed.length > 0) {
      const next = bulkMode === "append" ? [...options, ...parsed] : parsed;
      updateOptions(next);
      setBulkOpen(false);
      setBulkText("");
    }
  };

  const handleCopyClipboard = () => {
    const text = options.map((o) => (useCustomValues ? `${o.label};${o.value}` : o.label)).join("\n");
    void navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="ff-options-manager">
      {/* Options Header & Toolbar */}
      <div className="ff-options-toolbar">
        <div className="ff-options-toolbar-left">
          <label className="ff-options-switch" title="Toggle independent value editing">
            <input
              type="checkbox"
              checked={useCustomValues}
              onChange={(e) => setUseCustomValues(e.target.checked)}
            />
            <span className="ff-options-switch-slider" />
            <span className="ff-options-switch-label">Custom values</span>
          </label>
        </div>

        <div className="ff-options-toolbar-right">
          {/* Preset Picker Dropdown */}
          <div className="relative inline-block" ref={presetRef}>
            <button
              type="button"
              className="ff-opt-btn"
              onClick={() => setPresetOpen((o) => !o)}
              title="Load predefined options (Countries, States, Days, etc.)"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
              </svg>
              <span>Presets</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {presetOpen && (
              <div className="ff-preset-popover" role="menu">
                <div className="ff-preset-header">Select Predefined List</div>
                <div className="ff-preset-list">
                  {PREDEFINED_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      className="ff-preset-item"
                      onClick={() => handleApplyPreset(preset)}
                    >
                      <span className="ff-preset-item-name">{preset.name}</span>
                      <span className="ff-preset-item-count">{preset.options.length}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bulk Editor Trigger */}
          <button
            type="button"
            className="ff-opt-btn"
            onClick={() => {
              setBulkText(options.map((o) => (useCustomValues ? `${o.label};${o.value}` : o.label)).join("\n"));
              setBulkOpen(true);
            }}
            title="Add or paste options in bulk"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
            <span>Bulk</span>
          </button>

          {/* Copy to Clipboard */}
          <button
            type="button"
            className="ff-opt-btn"
            onClick={handleCopyClipboard}
            title="Copy all options to clipboard"
          >
            {copied ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Copied</span>
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect width="13" height="13" x="9" y="9" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Options Table */}
      <div className="ff-options-table-wrap">
        <table className="ff-options-table">
          <thead>
            <tr>
              <th className="ff-col-move" title="Reorder"></th>
              <th className="ff-col-label">Label</th>
              {useCustomValues && <th className="ff-col-value">Value</th>}
              <th className="ff-col-default" title="Default selected option">
                {isMultiple ? "Default (Multi)" : "Default"}
              </th>
              <th className="ff-col-action"></th>
            </tr>
          </thead>
          <tbody>
            {options.map((opt, idx) => {
              const isDefault = currentDefaults.has(opt.value);
              return (
                <tr key={idx} className="ff-option-row">
                  {/* Reorder Buttons */}
                  <td className="ff-cell-move">
                    <div className="ff-move-buttons">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMove(idx, "up")}
                        className="ff-move-btn"
                        title="Move up"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        disabled={idx === options.length - 1}
                        onClick={() => handleMove(idx, "down")}
                        className="ff-move-btn"
                        title="Move down"
                      >
                        ▼
                      </button>
                    </div>
                  </td>

                  {/* Label Input */}
                  <td className="ff-cell-label">
                    <input
                      type="text"
                      className="ff-opt-input"
                      value={opt.label}
                      placeholder={`Option ${idx + 1}`}
                      onChange={(e) => handleLabelChange(idx, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleAddOption(idx);
                        }
                      }}
                    />
                  </td>

                  {/* Value Input (Custom Values) */}
                  {useCustomValues && (
                    <td className="ff-cell-value">
                      <input
                        type="text"
                        className="ff-opt-input ff-opt-val-input"
                        value={opt.value}
                        placeholder="value"
                        onChange={(e) => handleValueChange(idx, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleAddOption(idx);
                          }
                        }}
                      />
                    </td>
                  )}

                  {/* Default / Selected Toggle */}
                  <td className="ff-cell-default">
                    {isMultiple ? (
                      <input
                        type="checkbox"
                        checked={isDefault}
                        onChange={() => toggleDefault(opt.value)}
                        className="ff-opt-check"
                        title={`Toggle default for "${opt.label}"`}
                        aria-label={`Default selection for ${opt.label}`}
                      />
                    ) : (
                      <input
                        type="radio"
                        name={`ff-def-${field.id}`}
                        checked={isDefault}
                        onClick={() => toggleDefault(opt.value)}
                        onChange={() => {}} // handled by onClick to allow unselecting
                        className="ff-opt-radio"
                        title={`Set "${opt.label}" as default`}
                        aria-label={`Default selection for ${opt.label}`}
                      />
                    )}
                  </td>

                  {/* Delete Action */}
                  <td className="ff-cell-action">
                    <button
                      type="button"
                      className="ff-opt-delete-btn"
                      onClick={() => handleDeleteOption(idx)}
                      title="Remove option"
                      aria-label="Remove option"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      </svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add Option Button */}
      <div className="ff-options-footer">
        <button
          type="button"
          className="ff-add-option-btn"
          onClick={() => handleAddOption()}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>Add Option</span>
        </button>
      </div>

      {/* Bulk Editor Modal / Slide-out */}
      {bulkOpen && (
        <div className="ff-modal-overlay" onClick={() => setBulkOpen(false)}>
          <div className="ff-bulk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ff-bulk-modal-header">
              <h3>Bulk Option Editor</h3>
              <button
                type="button"
                className="ff-bulk-close-btn"
                onClick={() => setBulkOpen(false)}
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className="ff-bulk-modal-body">
              <p className="ff-meta">
                Paste one option per line. Formats supported: <code>Label;value</code> or <code>value: Label</code> or simply <code>Label</code>.
              </p>

              <div className="ff-bulk-mode-group">
                <label className="ff-bulk-mode-label">
                  <input
                    type="radio"
                    name="bulk-mode"
                    value="replace"
                    checked={bulkMode === "replace"}
                    onChange={() => setBulkMode("replace")}
                  />
                  <span>Replace all existing options</span>
                </label>
                <label className="ff-bulk-mode-label">
                  <input
                    type="radio"
                    name="bulk-mode"
                    value="append"
                    checked={bulkMode === "append"}
                    onChange={() => setBulkMode("append")}
                  />
                  <span>Append to existing options</span>
                </label>
              </div>

              <textarea
                className="ff-bulk-textarea font-mono"
                rows={8}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder="Option 1&#10;Option 2;opt2&#10;Option 3;opt3"
              />
            </div>

            <div className="ff-bulk-modal-footer">
              <button
                type="button"
                className="ff-btn ff-btn-secondary"
                onClick={() => setBulkOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ff-btn ff-btn-primary"
                onClick={handleApplyBulk}
              >
                Import Options
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

