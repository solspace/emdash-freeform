import { apiFetch, parseApiResponse } from "@emdash-cms/admin";
import type {
  EmailProviderSettings,
  EmailProviderType,
  FormCaptchaSettings,
  FormRow,
  NotificationFormat,
  NotificationLogEntry,
  RecipientType,
  StoredAssignment,
  StoredForm,
  StoredTemplate,
  SubmissionBrief,
} from "../types";

const BASE = "/_emdash/api/plugins/freeform";

export type FormListItem = {
  id: string;
  name: string;
  handle: string;
  fieldCount: number;
  subCount: number;
  createdAt: string;
  updatedAt: string;
  cardIcon?: string;
  cardColor?: string;
};

export type FormDocument = StoredForm & { id: string };

export type SubmissionListItem = {
  id: string;
  formId: string;
  formName: string;
  data: Record<string, unknown>;
  createdAt: string;
  spamScore: number | null;
  spamReason: string | null;
  archived: boolean;
  brief: SubmissionBrief | null;
  journey: unknown;
  ip?: string | null;
  consent?: Array<{
    fieldHandle: string;
    label: string;
    consentedAt: string;
    privacyPolicyUrl?: string;
  }> | null;
  notificationLogs?: NotificationLogEntry[];
};

export type TemplateDocument = StoredTemplate & { id: string };
export type AssignmentDocument = StoredAssignment & { id: string };

export async function listForms(): Promise<FormListItem[]> {
  const res = await apiFetch(`${BASE}/list-forms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const data = await parseApiResponse<{ forms: FormListItem[] }>(res);
  return data.forms;
}

export async function getForm(id: string): Promise<FormDocument> {
  const res = await apiFetch(`${BASE}/admin-get-form`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  return parseApiResponse<FormDocument>(res);
}

export async function saveForm(input: {
  id?: string;
  name?: string;
  handle?: string;
  rows?: FormRow[];
  successMessage?: string;
  captcha?: FormCaptchaSettings | null;
  honeypotEnabled?: boolean;
  privacy?: import("../types").FormPrivacySettings | null;
  cardColor?: string | null;
}): Promise<FormDocument> {
  const res = await apiFetch(`${BASE}/save-form`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseApiResponse<FormDocument>(res);
}

export async function deleteForm(id: string): Promise<void> {
  const res = await apiFetch(`${BASE}/delete-form`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  await parseApiResponse(res);
}

export async function listSubmissions(formId?: string): Promise<SubmissionListItem[]> {
  const url = new URL(`${BASE}/list-submissions`, window.location.origin);
  if (formId) url.searchParams.set("formId", formId);
  const res = await apiFetch(url.pathname + url.search);
  const data = await parseApiResponse<{ submissions: SubmissionListItem[] }>(res);
  return data.submissions;
}

export async function deleteSubmission(id: string): Promise<void> {
  const res = await apiFetch(`${BASE}/delete-submission`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  await parseApiResponse(res);
}

export async function prepareExport(input: {
  formId?: string;
  submissionIds?: string[];
  origin?: string;
}): Promise<{ url: string | null; filename: string | null; rowCount: number }> {
  const res = await apiFetch(`${BASE}/prepare-export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...input,
      origin: input.origin ?? window.location.origin,
    }),
  });
  return parseApiResponse(res);
}

export type AiSettings = {
  provider: "openai";
  configured: boolean;
  hint: string | null;
  spam: { enabled: boolean; threshold: number };
};

export async function getAiSettings(): Promise<AiSettings> {
  const res = await apiFetch(`${BASE}/get-ai-settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  return parseApiResponse<AiSettings>(res);
}

export async function saveAiSettings(input: {
  apiKey?: string;
  clearKey?: boolean;
  spamEnabled?: boolean;
  spamThreshold?: number;
}): Promise<AiSettings> {
  const res = await apiFetch(`${BASE}/save-ai-settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseApiResponse<AiSettings>(res);
}

export async function aiGenerate(input: {
  description: string;
  formId?: string;
  apply?: boolean;
}): Promise<{
  ok: boolean;
  applied: boolean;
  rows: FormRow[];
  summary: { added: number; updated: number; removed: number };
}> {
  const res = await apiFetch(`${BASE}/ai-generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseApiResponse(res);
}

export async function listTemplates(): Promise<TemplateDocument[]> {
  const res = await apiFetch(`${BASE}/list-templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const data = await parseApiResponse<{ templates: TemplateDocument[] }>(res);
  return data.templates;
}

export async function saveTemplate(input: {
  id?: string;
  name: string;
  subject: string;
  body: string;
  format?: NotificationFormat;
  replyTo?: string;
  fromName?: string;
  fromEmail?: string;
  cc?: string;
  bcc?: string;
}): Promise<TemplateDocument> {
  const res = await apiFetch(`${BASE}/save-template`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseApiResponse<TemplateDocument>(res);
}

export async function sendTestEmail(input: {
  toEmail: string;
  templateId?: string;
  subject?: string;
  body?: string;
  format?: NotificationFormat;
  replyTo?: string;
  fromName?: string;
  fromEmail?: string;
  cc?: string;
  bcc?: string;
}): Promise<{ ok: boolean; provider: string; messageId: string; to: string }> {
  const res = await apiFetch(`${BASE}/send-test-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseApiResponse<{ ok: boolean; provider: string; messageId: string; to: string }>(res);
}

export type EmailSettingsResponse = {
  provider: EmailProviderType;
  resendApiKey: string;
  hasResendApiKey: boolean;
  resendFrom: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  hasSmtpPass: boolean;
  smtpFrom: string;
  smtpSecure: boolean;
};

export async function getEmailSettings(): Promise<EmailSettingsResponse> {
  const res = await apiFetch(`${BASE}/get-email-settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  return parseApiResponse<EmailSettingsResponse>(res);
}

export async function saveEmailSettings(input: Partial<EmailProviderSettings> & {
  clearResendKey?: boolean;
  clearSmtpPass?: boolean;
}): Promise<EmailSettingsResponse> {
  const res = await apiFetch(`${BASE}/save-email-settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseApiResponse<EmailSettingsResponse>(res);
}

export async function testEmailSettings(toEmail: string): Promise<{ ok: boolean; provider: string; messageId: string }> {
  const res = await apiFetch(`${BASE}/test-email-settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toEmail }),
  });
  return parseApiResponse<{ ok: boolean; provider: string; messageId: string }>(res);
}

export async function resendSubmissionNotifications(id: string): Promise<{ ok: boolean; logs: NotificationLogEntry[] }> {
  const res = await apiFetch(`${BASE}/resend-submission-notifications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  return parseApiResponse<{ ok: boolean; logs: NotificationLogEntry[] }>(res);
}

export async function deleteTemplate(id: string): Promise<void> {
  const res = await apiFetch(`${BASE}/delete-template`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  await parseApiResponse(res);
}

export async function listFormNotifications(formId: string): Promise<AssignmentDocument[]> {
  const url = new URL(`${BASE}/list-form-notifications`, window.location.origin);
  url.searchParams.set("formId", formId);
  const res = await apiFetch(url.pathname + url.search);
  const data = await parseApiResponse<{ assignments: AssignmentDocument[] }>(res);
  return data.assignments;
}

export async function attachNotification(input: {
  formId: string;
  templateId: string;
  recipientType: RecipientType;
  recipientField?: string;
  customRecipient?: string;
}): Promise<AssignmentDocument> {
  const res = await apiFetch(`${BASE}/attach-notification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseApiResponse<AssignmentDocument>(res);
}

export async function detachNotification(id: string): Promise<void> {
  const res = await apiFetch(`${BASE}/detach-notification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  await parseApiResponse(res);
}

export async function updateFormNotification(input: {
  id: string;
  enabled?: boolean;
}): Promise<AssignmentDocument> {
  const res = await apiFetch(`${BASE}/update-form-notification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseApiResponse<AssignmentDocument>(res);
}

export type WebhookListItem = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  formId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WebhookDeliveryEntry = {
  id: string;
  submissionId: string;
  formId: string;
  status: "success" | "failed";
  attempts: number;
  statusCode?: number;
  error?: string;
  deliveredAt: string;
};

export async function listWebhooks(): Promise<WebhookListItem[]> {
  const res = await apiFetch(`${BASE}/list-webhooks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const data = await parseApiResponse<{ webhooks: WebhookListItem[] }>(res);
  return data.webhooks;
}

export async function createWebhook(input: {
  name: string;
  url: string;
  formId?: string;
}): Promise<WebhookListItem & { secret: string }> {
  const res = await apiFetch(`${BASE}/create-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseApiResponse<WebhookListItem & { secret: string }>(res);
}

export async function updateWebhook(input: {
  id: string;
  name?: string;
  url?: string;
  enabled?: boolean;
  formId?: string | null;
}): Promise<WebhookListItem> {
  const res = await apiFetch(`${BASE}/update-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseApiResponse<WebhookListItem>(res);
}

export async function rotateWebhookSecret(
  id: string,
): Promise<{ id: string; secret: string }> {
  const res = await apiFetch(`${BASE}/rotate-webhook-secret`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  return parseApiResponse<{ id: string; secret: string }>(res);
}

export async function deleteWebhook(id: string): Promise<void> {
  const res = await apiFetch(`${BASE}/delete-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  await parseApiResponse(res);
}

export async function getWebhookLog(id: string): Promise<WebhookDeliveryEntry[]> {
  const url = new URL(`${BASE}/get-webhook-log`, window.location.origin);
  url.searchParams.set("id", id);
  const res = await apiFetch(url.pathname + url.search);
  const data = await parseApiResponse<{
    webhookId: string;
    entries: WebhookDeliveryEntry[];
  }>(res);
  return data.entries;
}
