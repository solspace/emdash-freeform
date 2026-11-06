import { Switch } from "@cloudflare/kumo";
import type { ReactNode } from "react";
import type { FormCaptchaSettings, FormPrivacySettings } from "../types";
import { goToSettingsSection } from "./ff-nav";

type Props = {
  honeypotEnabled: boolean;
  captcha: FormCaptchaSettings | undefined;
  privacy: FormPrivacySettings | undefined;
  onHoneypotChange: (enabled: boolean) => void;
  onCaptchaChange: (next: FormCaptchaSettings | null) => void;
  onPrivacyChange: (next: FormPrivacySettings) => void;
};

const RETENTION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Keep forever" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "180 days" },
  { value: "365", label: "365 days" },
];

/** EmDash SEO settings field shell. */
const PANEL =
  "mt-3 divide-y divide-kumo-line overflow-hidden rounded-xl border border-kumo-line bg-kumo-base";

const INPUT =
  "w-full border-0 bg-kumo-control text-kumo-default ring ring-kumo-line outline-none focus:outline-none disabled:text-kumo-disabled h-9 rounded-lg px-3 text-base focus:ring-kumo-focus/50 focus:ring-[1.5px] placeholder:text-kumo-subtle";

const TEXTAREA =
  "w-full min-h-24 resize-y border-0 bg-kumo-control text-kumo-default ring ring-kumo-line outline-none focus:outline-none disabled:text-kumo-disabled rounded-lg px-3 py-2 text-base focus:ring-kumo-focus/50 focus:ring-[1.5px] placeholder:text-kumo-subtle";

const SELECT =
  "w-full appearance-none border-0 bg-kumo-control text-kumo-default ring ring-kumo-line outline-none focus:outline-none disabled:text-kumo-disabled h-9 rounded-lg px-3 pe-9 text-base focus:ring-kumo-focus/50 focus:ring-[1.5px]";

function SettingsSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-1">
          <h2 id={id} className="text-lg font-semibold leading-6 text-balance text-kumo-strong">
            {title}
          </h2>
        </div>
      </div>
      <div className={PANEL}>{children}</div>
    </section>
  );
}

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
  htmlFor: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <label htmlFor={htmlFor} className="m-0 select-none text-base font-medium text-kumo-default">
        {label}
      </label>
      {children}
      {description ? (
        <p className="text-sm leading-snug text-kumo-subtle">{description}</p>
      ) : null}
    </div>
  );
}

function SwitchRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const descId = `${id}-description`;
  return (
    <div className="flex items-start justify-between gap-6 px-4 py-4">
      <div className="grid gap-1 min-w-0">
        <label htmlFor={id} className="m-0 inline-flex items-center gap-1 text-base font-medium text-kumo-default">
          {label}
        </label>
        <p id={descId} className="text-sm text-kumo-subtle">
          {description}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        aria-label={label}
        aria-describedby={descId}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

export function FormProtectionPanel({
  honeypotEnabled,
  captcha,
  privacy,
  onHoneypotChange,
  onCaptchaChange,
  onPrivacyChange,
}: Props) {
  const provider = captcha?.provider ?? "none";
  const retentionValue =
    typeof privacy?.retentionDays === "number" && privacy.retentionDays > 0
      ? String(privacy.retentionDays)
      : "";

  return (
    <div className="ff-page grid max-w-3xl gap-8">
      <div>
        <h2 className="text-2xl font-semibold leading-tight text-kumo-strong">
          Protection
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-5 text-pretty text-kumo-subtle">
          Spam filters, captcha, and privacy defaults for this form.
        </p>
      </div>

      <SettingsSection id="ff-protection-builtin" title="Built-in">
        <SwitchRow
          id="ff-honeypot-enabled"
          label="Enable honeypot"
          description="Adds a hidden field bots often fill. When tripped, the submission is silently dropped. CSRF always runs on public submit."
          checked={honeypotEnabled}
          onCheckedChange={onHoneypotChange}
        />
      </SettingsSection>

      <SettingsSection id="ff-protection-privacy" title="Privacy">
        <FieldRow>
          <FieldBlock
            label="Privacy notice"
            htmlFor="ff-privacy-notice"
            description="Shown near the form so visitors know how you use their details. Use a Consent field on the Layout tab for opt-in checkboxes."
          >
            <textarea
              id="ff-privacy-notice"
              className={TEXTAREA}
              rows={3}
              placeholder="We use your details only to respond to this enquiry."
              value={privacy?.notice ?? ""}
              onChange={(e) =>
                onPrivacyChange({ ...privacy, notice: e.target.value })
              }
            />
          </FieldBlock>
        </FieldRow>

        <FieldRow>
          <FieldBlock
            label="Privacy policy URL"
            htmlFor="ff-privacy-url"
            description="Optional link to your full privacy policy."
          >
            <input
              id="ff-privacy-url"
              type="url"
              className={INPUT}
              placeholder="https://example.com/privacy"
              value={privacy?.privacyPolicyUrl ?? ""}
              onChange={(e) =>
                onPrivacyChange({ ...privacy, privacyPolicyUrl: e.target.value })
              }
            />
          </FieldBlock>
        </FieldRow>

        <FieldRow>
          <FieldBlock
            label="Auto-delete submissions after"
            htmlFor="ff-retention"
            description="Only keep submission data as long as you need it."
          >
            <select
              id="ff-retention"
              className={SELECT}
              value={retentionValue}
              onChange={(e) => {
                const v = e.target.value;
                onPrivacyChange({
                  ...privacy,
                  retentionDays: v ? Number(v) : null,
                });
              }}
            >
              {RETENTION_OPTIONS.map((o) => (
                <option key={o.value || "forever"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </FieldBlock>
        </FieldRow>

        <SwitchRow
          id="ff-store-ip"
          label="Store submitter IP address"
          description="Off by default. Only enable if you have a clear reason to keep IPs."
          checked={privacy?.storeIp === true}
          onCheckedChange={(checked) =>
            onPrivacyChange({ ...privacy, storeIp: checked })
          }
        />
      </SettingsSection>

      <SettingsSection id="ff-protection-captcha" title="Captcha">
        <FieldRow>
          <FieldBlock
            label="Provider"
            htmlFor="ff-captcha-provider"
            description="Cloudflare Turnstile is verified on every public submit when configured."
          >
            <select
              id="ff-captcha-provider"
              className={SELECT}
              value={provider}
              onChange={(e) => {
                const value = e.target.value;
                if (value === "none") onCaptchaChange(null);
                else
                  onCaptchaChange({
                    provider: "turnstile",
                    siteKey: captcha?.siteKey,
                    secretKey: captcha?.secretKey,
                  });
              }}
            >
              <option value="none">None</option>
              <option value="turnstile">Cloudflare Turnstile</option>
            </select>
          </FieldBlock>
        </FieldRow>

        {provider === "turnstile" && (
          <>
            <FieldRow>
              <FieldBlock label="Site key" htmlFor="ff-turnstile-site">
                <input
                  id="ff-turnstile-site"
                  className={`${INPUT} font-mono text-sm`}
                  value={captcha?.siteKey ?? ""}
                  placeholder="0x4AAAAA…"
                  onChange={(e) =>
                    onCaptchaChange({
                      provider: "turnstile",
                      siteKey: e.target.value,
                      secretKey: captcha?.secretKey,
                    })
                  }
                />
              </FieldBlock>
            </FieldRow>
            <FieldRow>
              <FieldBlock label="Secret key" htmlFor="ff-turnstile-secret">
                <input
                  id="ff-turnstile-secret"
                  type="password"
                  className={`${INPUT} font-mono text-sm`}
                  value={captcha?.secretKey ?? ""}
                  placeholder="0x4AAAAA…"
                  onChange={(e) =>
                    onCaptchaChange({
                      provider: "turnstile",
                      siteKey: captcha?.siteKey,
                      secretKey: e.target.value,
                    })
                  }
                />
              </FieldBlock>
            </FieldRow>
          </>
        )}
      </SettingsSection>

      <SettingsSection id="ff-protection-ai" title="AI spam scoring">
        <FieldRow>
          <div className="grid gap-2">
            <p className="text-sm leading-snug text-kumo-subtle">
              Global OpenAI key and spam threshold live under Settings → AI &amp; spam.
              When scoring is on, flagged submissions skip notification emails.
            </p>
            <button
              type="button"
              className="w-max text-sm font-medium text-kumo-brand hover:underline"
              onClick={() => goToSettingsSection("ai")}
            >
              Open AI &amp; spam settings
            </button>
          </div>
        </FieldRow>
      </SettingsSection>
    </div>
  );
}
