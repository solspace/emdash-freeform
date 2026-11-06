import type { StoredForm } from "../types";
import { FORM_COLOR_PRESETS, resolveFormColor } from "./ff-nav";

type Props = {
  form: StoredForm & { id: string };
  onChange: (patch: Partial<StoredForm>) => void;
};

export function FormSettingsPanel({ form, onChange }: Props) {
  return (
    <div className="ff-form-settings">
      <div className="ff-panel ff-prop">
        <h2>General</h2>
        <p className="ff-meta" style={{ marginBottom: "0.75rem" }}>
          Form identity used in the admin, embeds, and public URLs.
        </p>

        <div className="ff-prop-group">
          <label htmlFor="ff-form-name">Name</label>
          <input
            id="ff-form-name"
            value={form.name}
            placeholder="Untitled form"
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </div>

        <div className="ff-prop-group">
          <label htmlFor="ff-form-handle">Handle</label>
          <input
            id="ff-form-handle"
            value={form.handle}
            placeholder="contact"
            spellCheck={false}
            onChange={(e) =>
              onChange({
                handle: e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9_-]+/g, "-")
                  .replace(/^-+|-+$/g, ""),
              })
            }
          />
          <p className="ff-meta" style={{ marginTop: "0.35rem" }}>
            Used in embeds and routes like <code>/forms/{form.handle || "…"}</code>.
          </p>
        </div>
      </div>

      <div className="ff-panel ff-prop" style={{ marginTop: "0.85rem" }}>
        <h2>After submit</h2>
        <p className="ff-meta" style={{ marginBottom: "0.75rem" }}>
          Message shown to the visitor when the form submits successfully.
        </p>
        <div className="ff-prop-group">
          <label htmlFor="ff-success-message">Success message</label>
          <textarea
            id="ff-success-message"
            rows={3}
            placeholder="Thanks! We’ll be in touch soon."
            value={form.successMessage ?? ""}
            onChange={(e) => onChange({ successMessage: e.target.value })}
          />
        </div>
      </div>

      <div className="ff-panel ff-prop" style={{ marginTop: "0.85rem" }}>
        <h2>Card color</h2>
        <p className="ff-meta" style={{ marginBottom: "0.75rem" }}>
          Accent used on the Forms dashboard card for this form.
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
                onClick={() => onChange({ cardColor: hex })}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
