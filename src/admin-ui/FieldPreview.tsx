import type React from "react";
import type { FormField } from "../types";
import { FieldIcon } from "./field-icons";

export function FieldPreview({ field }: { field: FormField }) {
  const options =
    field.options && field.options.length > 0
      ? field.options.map((opt, i) => {
          if (typeof opt === "string") return { label: opt, value: opt };
          if (opt && typeof opt === "object") {
            return {
              label: String((opt as any).label ?? (opt as any).value ?? `Option ${i + 1}`),
              value: String((opt as any).value ?? (opt as any).label ?? `opt_${i + 1}`),
            };
          }
          return { label: `Option ${i + 1}`, value: `opt_${i + 1}` };
        })
      : [
          { value: "opt_1", label: "Option 1" },
          { value: "opt_2", label: "Option 2" },
        ];

  const defaultSet = new Set(
    Array.isArray(field.defaultValue)
      ? field.defaultValue.map(String)
      : field.defaultValue !== undefined && field.defaultValue !== null && field.defaultValue !== ""
        ? [String(field.defaultValue)]
        : []
  );

  switch (field.type) {
    case "text":
      return (
        <div className="ff-preview-box">
          <div className="ff-preview-input">
            <span className="ff-preview-placeholder">
              {field.placeholder || "Enter text..."}
            </span>
          </div>
        </div>
      );

    case "email":
      return (
        <div className="ff-preview-box">
          <div className="ff-preview-input ff-preview-with-icon">
            <FieldIcon type="email" size={13} className="ff-preview-icon" />
            <span className="ff-preview-placeholder">
              {field.placeholder || "name@example.com"}
            </span>
          </div>
        </div>
      );

    case "textarea":
      return (
        <div className="ff-preview-box">
          <div className="ff-preview-textarea">
            <span className="ff-preview-placeholder">
              {field.placeholder || "Type your message..."}
            </span>
          </div>
        </div>
      );

    case "number":
      return (
        <div className="ff-preview-box">
          <div className="ff-preview-input ff-preview-number">
            <span className="ff-preview-placeholder">
              {field.placeholder || (field.min !== undefined ? `Min: ${field.min}` : "0")}
            </span>
            <span className="ff-preview-steppers" aria-hidden="true">
              <span className="ff-stepper-up">▴</span>
              <span className="ff-stepper-down">▾</span>
            </span>
          </div>
        </div>
      );

    case "phone":
      return (
        <div className="ff-preview-box">
          <div className="ff-preview-input ff-preview-with-icon">
            <FieldIcon type="phone" size={13} className="ff-preview-icon" />
            <span className="ff-preview-placeholder">
              {field.placeholder || "+1 (555) 000-0000"}
            </span>
          </div>
        </div>
      );

    case "date":
      return (
        <div className="ff-preview-box">
          <div className="ff-preview-input ff-preview-with-icon">
            <FieldIcon type="date" size={13} className="ff-preview-icon" />
            <span className="ff-preview-placeholder">
              {field.placeholder || "YYYY-MM-DD"}
            </span>
          </div>
        </div>
      );

    case "datetime":
      return (
        <div className="ff-preview-box">
          <div className="ff-preview-input ff-preview-with-icon">
            <FieldIcon type="datetime" size={13} className="ff-preview-icon" />
            <span className="ff-preview-placeholder">
              {field.placeholder || "YYYY-MM-DD HH:MM"}
            </span>
          </div>
        </div>
      );

    case "file":
      return (
        <div className="ff-preview-file">
          <FieldIcon type="file" size={18} className="ff-preview-file-icon" />
          <div className="ff-preview-file-text">
            <span className="ff-preview-file-title">Choose file or drag here</span>
            <span className="ff-preview-file-hint">
              {field.allowedExtensions ? `Accepted: ${field.allowedExtensions}` : "Any file"} · Max {field.maxFileSizeMb ?? 10}MB
            </span>
          </div>
        </div>
      );

    case "rating": {
      const stars = field.maxStars ?? 5;
      return (
        <div className="ff-preview-rating">
          {Array.from({ length: Math.min(stars, 10) }).map((_, i) => (
            <span key={i} className={`ff-preview-star${i < 3 ? " is-filled" : ""}`}>
              ★
            </span>
          ))}
          <span className="ff-preview-rating-label">({stars} stars)</span>
        </div>
      );
    }

    case "checkbox":
      return (
        <div className="ff-preview-check-item">
          <span className="ff-preview-checkbox" />
          <span className="ff-preview-check-label">{field.label}</span>
        </div>
      );

    case "checkbox_group":
      return (
        <div className="ff-preview-choices">
          {options.slice(0, 4).map((opt) => {
            const isChecked = defaultSet.has(opt.value);
            return (
              <div key={opt.value} className="ff-preview-check-item">
                <span className={`ff-preview-checkbox${isChecked ? " is-checked" : ""}`} />
                <span className={`ff-preview-check-label${isChecked ? " font-medium text-kumo-strong" : ""}`}>
                  {opt.label}
                </span>
              </div>
            );
          })}
          {options.length > 4 && (
            <span className="ff-preview-more">+{options.length - 4} more options</span>
          )}
        </div>
      );

    case "radio":
      return (
        <div className="ff-preview-choices">
          {options.slice(0, 4).map((opt) => {
            const isChecked = defaultSet.has(opt.value);
            return (
              <div key={opt.value} className="ff-preview-radio-item">
                <span className={`ff-preview-radio${isChecked ? " is-checked" : ""}`} />
                <span className={`ff-preview-check-label${isChecked ? " font-medium text-kumo-strong" : ""}`}>
                  {opt.label}
                </span>
              </div>
            );
          })}
          {options.length > 4 && (
            <span className="ff-preview-more">+{options.length - 4} more options</span>
          )}
        </div>
      );

    case "select": {
      const defaultOpt = options.find((o) => defaultSet.has(o.value));
      return (
        <div className="ff-preview-box">
          <div className="ff-preview-select">
            <span className={defaultOpt ? "ff-preview-value" : "ff-preview-placeholder"}>
              {defaultOpt?.label || field.placeholder || (options[0] ? options[0].label : "Select an option...")}
            </span>
            <span className="ff-preview-chevron">▾</span>
          </div>
        </div>
      );
    }

    case "multi_select": {
      const selectedOpts = options.filter((o) => defaultSet.has(o.value));
      const displayTags = selectedOpts.length > 0 ? selectedOpts : options.slice(0, 2);
      return (
        <div className="ff-preview-box">
          <div className="ff-preview-multiselect">
            {displayTags.map((opt) => (
              <span key={opt.value} className="ff-preview-tag">
                {opt.label}
              </span>
            ))}
            {options.length > displayTags.length && (
              <span className="text-xs text-kumo-subtle ps-1">
                +{options.length - displayTags.length}
              </span>
            )}
            <span className="ff-preview-chevron">▾</span>
          </div>
        </div>
      );
    }

    case "consent":
      return (
        <div className="ff-preview-consent">
          <span className="ff-preview-checkbox" />
          <span className="ff-preview-consent-text">
            I agree to the{" "}
            <span className="ff-preview-link">
              {field.privacyPolicyUrl ? "privacy policy" : "terms and privacy notice"}
            </span>
          </span>
        </div>
      );

    case "hidden":
      return (
        <div className="ff-preview-hidden">
          <FieldIcon type="hidden" size={12} />
          <span>
            Hidden: <code>{field.handle}</code>
            {field.defaultValue ? ` = "${String(field.defaultValue)}"` : ""}
          </span>
        </div>
      );

    case "html":
      return (
        <div className="ff-preview-html">
          {field.defaultValue ? (
            <div
              className="ff-preview-html-content"
              dangerouslySetInnerHTML={{ __html: String(field.defaultValue) }}
            />
          ) : (
            <div className="ff-preview-html-empty">
              <code>&lt;HTML block&gt;</code> Click to configure content
            </div>
          )}
        </div>
      );

    default:
      return (
        <div className="ff-preview-box">
          <div className="ff-preview-input">
            <span className="ff-preview-placeholder">{field.label}</span>
          </div>
        </div>
      );
  }
}

