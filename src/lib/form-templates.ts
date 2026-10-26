import type { FieldType, FormField, FormRow, StoredForm } from "../types";
import { uid } from "./handles";

export type FormTemplateId =
  | "blank"
  | "contact"
  | "job_application"
  | "event_rsvp"
  | "survey"
  | "support_ticket"
  | "newsletter";

export interface FormTemplateMeta {
  id: FormTemplateId;
  name: string;
  description: string;
}

export const FORM_TEMPLATES: FormTemplateMeta[] = [
  { id: "blank", name: "Blank form", description: "Start from scratch" },
  {
    id: "contact",
    name: "Contact",
    description: "Name, email, and message",
  },
  {
    id: "job_application",
    name: "Job application",
    description: "Applicant details, role, and cover note",
  },
  {
    id: "event_rsvp",
    name: "Event RSVP",
    description: "Name, email, attendance, and guests",
  },
  {
    id: "survey",
    name: "Survey",
    description: "Rating and open feedback",
  },
  {
    id: "support_ticket",
    name: "Support ticket",
    description: "Contact, topic, priority, and details",
  },
  {
    id: "newsletter",
    name: "Newsletter signup",
    description: "Email and optional name",
  },
];

function field(
  type: FieldType,
  label: string,
  handle: string,
  opts: Partial<Omit<FormField, "id" | "type" | "label" | "handle">> = {},
): FormField {
  return {
    id: uid(),
    type,
    label,
    handle,
    required: opts.required ?? false,
    ...opts,
  };
}

function row(...fields: FormField[]): FormRow {
  return { id: uid(), fields };
}

function buildRows(id: Exclude<FormTemplateId, "blank">): FormRow[] {
  switch (id) {
    case "contact":
      return [
        row(field("text", "Name", "name", { required: true, placeholder: "Your name" })),
        row(
          field("email", "Email", "email", {
            required: true,
            placeholder: "you@example.com",
          }),
        ),
        row(
          field("textarea", "Message", "message", {
            required: true,
            placeholder: "How can we help?",
          }),
        ),
      ];
    case "job_application":
      return [
        row(
          field("text", "Full name", "full_name", { required: true }),
          field("email", "Email", "email", { required: true }),
        ),
        row(field("phone", "Phone", "phone", { required: false })),
        row(
          field("text", "Position", "position", {
            required: true,
            placeholder: "Role you're applying for",
          }),
        ),
        row(
          field("select", "Years of experience", "experience", {
            required: true,
            options: [
              { value: "0_1", label: "0–1 years" },
              { value: "2_4", label: "2–4 years" },
              { value: "5_9", label: "5–9 years" },
              { value: "10_plus", label: "10+ years" },
            ],
          }),
        ),
        row(
          field("textarea", "Cover letter", "cover_letter", {
            required: true,
            placeholder: "Tell us why you're a great fit",
          }),
        ),
      ];
    case "event_rsvp":
      return [
        row(
          field("text", "Name", "name", { required: true }),
          field("email", "Email", "email", { required: true }),
        ),
        row(
          field("radio", "Will you attend?", "attendance", {
            required: true,
            options: [
              { value: "yes", label: "Yes, I'll be there" },
              { value: "no", label: "Can't make it" },
              { value: "maybe", label: "Maybe" },
            ],
          }),
        ),
        row(
          field("number", "Number of guests", "guests", {
            required: false,
            min: 0,
            max: 10,
            defaultValue: "0",
          }),
        ),
        row(
          field("textarea", "Dietary notes", "dietary_notes", {
            required: false,
            placeholder: "Allergies or preferences",
          }),
        ),
      ];
    case "survey":
      return [
        row(
          field("radio", "Overall satisfaction", "satisfaction", {
            required: true,
            options: [
              { value: "5", label: "Very satisfied" },
              { value: "4", label: "Satisfied" },
              { value: "3", label: "Neutral" },
              { value: "2", label: "Dissatisfied" },
              { value: "1", label: "Very dissatisfied" },
            ],
          }),
        ),
        row(
          field("checkbox_group", "What did you like?", "liked", {
            required: false,
            options: [
              { value: "product", label: "Product" },
              { value: "support", label: "Support" },
              { value: "pricing", label: "Pricing" },
              { value: "docs", label: "Documentation" },
            ],
          }),
        ),
        row(
          field("textarea", "Anything else?", "comments", {
            required: false,
            placeholder: "Optional feedback",
          }),
        ),
      ];
    case "support_ticket":
      return [
        row(
          field("text", "Name", "name", { required: true }),
          field("email", "Email", "email", { required: true }),
        ),
        row(
          field("select", "Topic", "topic", {
            required: true,
            options: [
              { value: "billing", label: "Billing" },
              { value: "technical", label: "Technical issue" },
              { value: "account", label: "Account" },
              { value: "other", label: "Other" },
            ],
          }),
        ),
        row(
          field("radio", "Priority", "priority", {
            required: true,
            options: [
              { value: "low", label: "Low" },
              { value: "normal", label: "Normal" },
              { value: "high", label: "High" },
            ],
            defaultValue: "normal",
          }),
        ),
        row(
          field("textarea", "Description", "description", {
            required: true,
            placeholder: "What happened?",
          }),
        ),
      ];
    case "newsletter":
      return [
        row(
          field("email", "Email", "email", {
            required: true,
            placeholder: "you@example.com",
          }),
        ),
        row(field("text", "First name", "first_name", { required: false })),
      ];
  }
}

export function isFormTemplateId(value: string): value is FormTemplateId {
  return FORM_TEMPLATES.some((t) => t.id === value);
}

/** Build a new StoredForm skeleton from a starter template (fresh ids). */
export function formFromTemplate(
  templateId: FormTemplateId,
  opts: { name: string; handle: string; now?: string },
): StoredForm {
  const now = opts.now ?? new Date().toISOString();
  const meta = FORM_TEMPLATES.find((t) => t.id === templateId) ?? FORM_TEMPLATES[0];
  const rows = templateId === "blank" ? [] : buildRows(templateId);

  const cardIconByTemplate: Partial<Record<FormTemplateId, string>> = {
    contact: "email",
    job_application: "briefcase",
    event_rsvp: "ticket",
    survey: "survey",
    support_ticket: "support",
    newsletter: "newsletter",
  };

  return {
    name: opts.name || meta.name,
    handle: opts.handle,
    rows,
    successMessage: "Thank you for your submission!",
    createdAt: now,
    updatedAt: now,
    ...(cardIconByTemplate[templateId]
      ? { cardIcon: cardIconByTemplate[templateId] }
      : {}),
  };
}
