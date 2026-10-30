export type FieldType =
  | "text"
  | "email"
  | "textarea"
  | "number"
  | "phone"
  | "checkbox"
  | "checkbox_group"
  | "radio"
  | "select"
  | "multi_select"
  | "date"
  | "datetime"
  | "file"
  | "rating"
  | "hidden"
  | "html"
  | "consent";

// Field types that present a fixed list of choices to the user.
// These fields require `options` on FormField; submissions store the option
// value (not the label).
export const OPTION_FIELD_TYPES = [
  "checkbox_group",
  "radio",
  "select",
  "multi_select",
] as const satisfies readonly FieldType[];

// Field types that produce array-valued submission data.
export const MULTI_FIELD_TYPES = [
  "checkbox_group",
  "multi_select",
] as const satisfies readonly FieldType[];

export interface FieldOption {
  value: string;
  label: string;
}

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  handle: string;
  required: boolean;
  placeholder?: string;
  options?: FieldOption[];
  // Pre-filled value. String for single-value types; array for multi-value
  // types (checkbox_group, multi_select). For `checkbox` (single), "true"
  // means default-checked. For option-bearing types, must match an option
  // value or it is ignored at render time.
  // For `html` type this holds the raw HTML content to render.
  // For `hidden` type this holds the fixed submitted value.
  defaultValue?: string | string[];

  /** For `consent` fields: optional privacy policy URL shown next to the label. */
  privacyPolicyUrl?: string;

  // ── Per-field validation (rendered as HTML5 attributes) ─────────
  // Applies to: text, email, textarea, phone
  minLength?: number;
  maxLength?: number;
  pattern?: string;       // regex string; applied as the HTML `pattern` attribute
  patternError?: string;  // shown via the `title` attribute on pattern mismatch

  // Applies to: number, date, datetime, rating
  // For number/rating: numeric value. For date/datetime: string.
  min?: number | string;
  max?: number | string;

  /** For `rating` fields: maximum rating value (default 5). */
  maxStars?: number;

  /** For `file` fields: comma-separated extensions (e.g. "pdf, png, jpg"). */
  allowedExtensions?: string;
  /** For `file` fields: max size per file in MB (default 10). */
  maxFileSizeMb?: number;
}

/** Per-form privacy / retention controls (EU-friendly defaults). */
export interface FormPrivacySettings {
  /** Short notice shown under the form (Article 13-style). */
  notice?: string;
  /** Link used in the notice and as default for consent fields without their own URL. */
  privacyPolicyUrl?: string;
  /**
   * Days to keep submissions before hard-delete. `null` / omit = keep forever.
   * Typical contact-form values: 30, 90, 180, 365.
   */
  retentionDays?: number | null;
  /** When true, store submitter IP on the submission. Default false. */
  storeIp?: boolean;
}

/** Evidence that a consent checkbox was accepted (accountability). */
export interface SubmissionConsentRecord {
  fieldHandle: string;
  label: string;
  consentedAt: string;
  privacyPolicyUrl?: string;
}

export interface FormRow {
  id: string;
  fields: FormField[];
}

export interface StoredForm {
  name: string;
  // Stable reference key used by templates (`<FreeformForm formId="..." />`)
  // and by MCP tools. Changing this is a deliberate, breaking operation —
  // any page referencing the old handle stops resolving.
  handle: string;
  rows: FormRow[];
  successMessage: string;
  createdAt: string;
  updatedAt: string;
  // Per-form override of the global spam scoring settings. When absent, the
  // form inherits the global defaults from KV (`spam:enabled` / `spam:threshold`).
  spam?: SpamSettings;
  /** Card icon on the forms list (`auto` = infer from name and fields). */
  cardIcon?: string;
  /** Accent / card background color (CSS hex, e.g. `#006ff7`). */
  cardColor?: string;
  /**
   * When `false`, honeypot field is not rendered and not checked on submit.
   * Default / omitted = enabled.
   */
  honeypotEnabled?: boolean;
  /**
   * Captcha / bot protection for public submit.
   * `none` (default) relies on honeypot + CSRF only.
   */
  captcha?: FormCaptchaSettings;
  /** Privacy notice, retention, and IP storage. */
  privacy?: FormPrivacySettings;
}

export type CaptchaProvider = "none" | "turnstile";

export interface FormCaptchaSettings {
  provider: CaptchaProvider;
  /** Public site key (safe to expose to the browser). */
  siteKey?: string;
  /** Secret key (server-side verify only — never render on the public form). */
  secretKey?: string;
}

export interface VisitorPageView {
  url: string;
  title?: string | null;
  description?: string | null;
  visitedAt: string;
}

export interface SubmissionBrief {
  intent: string;
  urgency: "low" | "medium" | "high";
  summary: string;
  keyFacts: string[];
  suggestedAction: string;
  generatedAt: string;
}

export interface StoredSubmission {
  formId: string;
  formName: string;
  // Multi-value fields (checkbox_group, multi_select) store arrays; everything
  // else stores a single string. Single-checkbox / consent fields store "true"
  // or are absent.
  data: Record<string, string | string[]>;
  createdAt: string;
  spamScore?: number;
  spamReason?: string;
  archived?: boolean;
  // Pages the visitor browsed before submitting. Captured client-side by the
  // tracker in Base.astro and shipped with the submission.
  journey?: VisitorPageView[];
  // AI-generated summary of the submission + journey. Populated synchronously
  // by the brief generator after the submission is stored.
  brief?: SubmissionBrief;
  /** Present only when the form’s privacy.storeIp is enabled. */
  ip?: string;
  /** Opt-in consent checkboxes accepted on this submission. */
  consent?: SubmissionConsentRecord[];
  /** Notification delivery logs captured during submission handling. */
  notificationLogs?: NotificationLogEntry[];
}

export interface SpamSettings {
  enabled: boolean;
  threshold: number;
}

// ── Webhooks ─────────────────────────────────────────────────────

export interface StoredWebhook {
  name: string;
  url: string;
  // HMAC-SHA256 signing secret, auto-generated on creation.
  // Shown once in the admin on creation; can be rotated via admin action.
  secret: string;
  enabled: boolean;
  // When set, only deliveries for this formId are sent to the webhook.
  // When absent, deliveries are sent for all form submissions.
  formId?: string;
  createdAt: string;
  updatedAt: string;
}

// One entry in the per-webhook delivery log (KV ring buffer).
export interface WebhookDeliveryRecord {
  id: string;
  submissionId: string;
  formId: string;
  status: "success" | "failed";
  attempts: number;
  statusCode?: number;
  error?: string;
  deliveredAt: string;
}

// An item in the KV retry queue (`webhooks:retry:queue`).
// Written on delivery failure; consumed and updated by the cron handler.
export interface RetryItem {
  id: string;           // delivery ID (webhookId:submissionId:timestamp)
  webhookId: string;
  url: string;
  secret: string;
  submissionId: string;
  formId: string;
  payload: string;      // pre-serialized JSON webhook body
  attempts: number;     // total attempts so far (1 = failed on first try)
  nextRetryAt: string;  // ISO 8601
}

export type NotificationFormat = "text" | "html";

export interface NotificationLogEntry {
  id: string;
  templateId?: string;
  templateName: string;
  to: string;
  status: "delivered" | "failed" | "skipped";
  error?: string;
  sentAt: string;
  provider?: string;
}

export type EmailProviderType = "emdash" | "resend" | "smtp" | "log";

export interface EmailProviderSettings {
  provider: EmailProviderType;
  resendApiKey?: string;
  resendFrom?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
  smtpSecure?: boolean;
}

export interface StoredTemplate {
  name: string;
  subject: string;
  body: string;
  format: NotificationFormat;
  replyTo?: string;
  fromName?: string;
  fromEmail?: string;
  cc?: string;
  bcc?: string;
  /**
   * Built-in templates shipped with Freeform. Present by default; cannot be
   * edited or deleted — duplicate them to customize.
   */
  system?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type RecipientType = "submitter" | "custom";

export interface StoredAssignment {
  formId: string;
  templateId: string;
  recipientType: RecipientType;
  recipientField?: string;
  customRecipient?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
