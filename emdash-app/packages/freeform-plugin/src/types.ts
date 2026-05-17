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
  | "multi_select";

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
  defaultValue?: string | string[];
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
}

export interface StoredSubmission {
  formId: string;
  formName: string;
  // Multi-value fields (checkbox_group, multi_select) store arrays; everything
  // else stores a single string. Single-checkbox fields store "true" or are absent.
  data: Record<string, string | string[]>;
  createdAt: string;
  spamScore?: number;
  spamReason?: string;
  archived?: boolean;
}

export interface SpamSettings {
  enabled: boolean;
  threshold: number;
}

export type NotificationFormat = "text" | "html";

export interface StoredTemplate {
  name: string;
  subject: string;
  body: string;
  format: NotificationFormat;
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
