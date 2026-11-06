import type { CSSProperties, ReactNode } from "react";
import type { StoredForm } from "../types";
import {
  FORM_COLOR_PRESETS,
  resolveFormAccent,
} from "./ff-nav";

type Props = {
  form: StoredForm & { id: string };
  onChange: (patch: Partial<StoredForm>) => void;
};

/** Same shell as EmDash SEO settings. */
const PANEL =
  "mt-3 divide-y divide-kumo-line overflow-hidden rounded-xl border border-kumo-line bg-kumo-base";

const INPUT =
  "w-full border-0 bg-kumo-control text-kumo-default ring ring-kumo-line outline-none focus:outline-none disabled:text-kumo-disabled h-9 rounded-lg px-3 text-base focus:ring-kumo-focus/50 focus:ring-[1.5px] placeholder:text-kumo-subtle";

const TEXTAREA =
  "w-full min-h-24 resize-y border-0 bg-kumo-control text-kumo-default ring ring-kumo-line outline-none focus:outline-none disabled:text-kumo-disabled rounded-lg px-3 py-2 text-base focus:ring-kumo-focus/50 focus:ring-[1.5px] placeholder:text-kumo-subtle";

function FieldRow({ children }: { children: ReactNode }) {
  return <div className="px-4 py-4">{children}</div>;
}

function FieldBlock({
  label,
  htmlFor,
  description,
  children,
}: {
  label: string;
  htmlFor?: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <label
        htmlFor={htmlFor}
        className="m-0 select-none text-base font-medium text-kumo-default"
      >
        {label}
      </label>
      {children}
      {description ? (
        <p className="text-sm leading-snug text-kumo-subtle">{description}</p>
      ) : null}
    </div>
  );
}

export function FormSettingsPanel({ form, onChange }: Props) {
  const accent = resolveFormAccent(form);

  return (
    <div className="ff-page ff-form-settings grid max-w-3xl gap-8">
      <div>
        <h2 className="text-2xl font-semibold leading-tight text-kumo-strong">Settings</h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-5 text-pretty text-kumo-subtle">
          Form identity, success message, and public form accent.
        </p>
      </div>

      <section aria-labelledby="ff-settings-general">
        <h3
          id="ff-settings-general"
          className="text-lg font-semibold leading-6 text-balance text-kumo-strong"
        >
          General
        </h3>
        <div className={PANEL}>
          <FieldRow>
            <FieldBlock label="Name" htmlFor="ff-form-name">
              <input
                id="ff-form-name"
                className={INPUT}
                value={form.name}
                placeholder="Untitled form"
                onChange={(e) => onChange({ name: e.target.value })}
              />
            </FieldBlock>
          </FieldRow>

          <FieldRow>
            <FieldBlock
              label="Handle"
              htmlFor="ff-form-handle"
              description={
                <>
                  Used in embeds and routes like <code>/forms/{form.handle || "…"}</code>.
                </>
              }
            >
              <input
                id="ff-form-handle"
                className={INPUT}
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
            </FieldBlock>
          </FieldRow>

          <FieldRow>
            <FieldBlock
              label="Success message"
              htmlFor="ff-success-message"
              description="Shown to the visitor after a successful submit."
            >
              <textarea
                id="ff-success-message"
                className={TEXTAREA}
                rows={3}
                placeholder="Thanks! We’ll be in touch soon."
                value={form.successMessage ?? ""}
                onChange={(e) => onChange({ successMessage: e.target.value })}
              />
            </FieldBlock>
          </FieldRow>
        </div>
      </section>

      <section aria-labelledby="ff-settings-theme">
        <h3
          id="ff-settings-theme"
          className="text-lg font-semibold leading-6 text-balance text-kumo-strong"
        >
          Theme
        </h3>
        <div className={PANEL}>
          <FieldRow>
            <FieldBlock
              label="Accent color"
              description="Used on the public form submit button and focused input rings. Defaults to the header card color when unset."
            >
              <div
                className="ff-color-picker ff-color-picker-bare"
                role="group"
                aria-label="Accent color"
              >
                {FORM_COLOR_PRESETS.map((hex) => {
                  const active = accent === hex;
                  return (
                    <button
                      key={hex}
                      type="button"
                      className={`ff-color-swatch${active ? " is-active" : ""}`}
                      style={{ background: hex }}
                      title={hex}
                      aria-label={`Accent color ${hex}`}
                      aria-pressed={active}
                      onClick={() => onChange({ accentColor: hex })}
                    />
                  );
                })}
              </div>
            </FieldBlock>
          </FieldRow>
        </div>

        <div
          className="ff-theme-preview mt-3 rounded-xl border border-kumo-line bg-kumo-base p-5"
          style={{ "--ff-accent": accent } as CSSProperties}
        >
          <label className="ff-theme-preview-label" htmlFor="ff-theme-preview-input">
            Sample field
          </label>
          <input
            id="ff-theme-preview-input"
            className="ff-theme-preview-input"
            type="text"
            placeholder="Focus me to see the accent ring"
            readOnly
          />
          <button type="button" className="ff-theme-preview-submit">
            Submit
          </button>
        </div>
      </section>
    </div>
  );
}
