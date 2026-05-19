import type { PluginContext } from "emdash";
import { uid } from "./handles";
import type { StoredForm } from "../types";

// Idempotent: writes the demo Contact form and default license tier on the
// first call against a clean install, and no-ops on subsequent calls.
//
// Why this isn't in the `plugin:install` hook: EmDash's trusted-plugin boot
// path (`plugins: [freeformPlugin()]` in astro.config.mjs) does not invoke
// `plugin:install` — only marketplace-installed plugins receive it.
// `hooks/install.ts` is kept for the marketplace path and just delegates here.
export async function ensureDemoSeed(ctx: PluginContext): Promise<void> {
  // Cheap guard: a single KV key marks the seed as already run for this
  // install, so we don't pay the storage query cost on every admin page load.
  const flag = await ctx.kv.get<string>("seed:contact_v1");
  if (flag) return;

  // Belt-and-braces: even if the flag is missing (e.g. KV was wiped but
  // storage wasn't), don't overwrite an existing form at id `"contact"`.
  const existing = await ctx.storage.forms.get("contact");
  if (existing) {
    await ctx.kv.set("seed:contact_v1", "done");
    return;
  }

  const currentTier = await ctx.kv.get<string>("license:tier");
  if (!currentTier) await ctx.kv.set("license:tier", "free");

  const now = new Date().toISOString();
  const contactForm: StoredForm = {
    name: "Start a Program",
    handle: "contact",
    rows: [
      {
        id: uid(),
        fields: [
          {
            id: uid(),
            type: "text",
            label: "First Name",
            handle: "first_name",
            required: true,
            placeholder: "Jane",
          },
          {
            id: uid(),
            type: "text",
            label: "Last Name",
            handle: "last_name",
            required: true,
            placeholder: "Tanaka",
          },
        ],
      },
      {
        id: uid(),
        fields: [
          {
            id: uid(),
            type: "text",
            label: "Company / Organization",
            handle: "company",
            required: true,
            placeholder: "Acme Aerospace",
          },
          {
            id: uid(),
            type: "text",
            label: "Job Title",
            handle: "job_title",
            required: false,
            placeholder: "Director, Mission Engineering",
          },
        ],
      },
      {
        id: uid(),
        fields: [
          {
            id: uid(),
            type: "text",
            label: "Work Email",
            handle: "email",
            required: true,
            placeholder: "jane.tanaka@example.com",
          },
          {
            id: uid(),
            type: "phone",
            label: "Phone",
            handle: "phone",
            required: false,
            placeholder: "+1 555 0100",
          },
        ],
      },
      {
        id: uid(),
        fields: [
          {
            id: uid(),
            type: "select",
            label: "Country / Region",
            handle: "country",
            required: true,
            options: [
              { value: "us", label: "United States" },
              { value: "ca", label: "Canada" },
              { value: "uk", label: "United Kingdom" },
              { value: "de", label: "Germany" },
              { value: "fr", label: "France" },
              { value: "jp", label: "Japan" },
              { value: "au", label: "Australia" },
              { value: "other", label: "Other" },
            ],
          },
          {
            id: uid(),
            type: "select",
            label: "Mission Type",
            handle: "mission_type",
            required: true,
            options: [
              { value: "research", label: "Research / Science" },
              { value: "commercial", label: "Commercial Exploration" },
              { value: "sustainment", label: "Sustainment / Logistics" },
              { value: "defense", label: "Government / Defense" },
              { value: "partner_test", label: "Partner Test Program" },
              { value: "other", label: "Other" },
            ],
          },
        ],
      },
      {
        id: uid(),
        fields: [
          {
            id: uid(),
            type: "select",
            label: "Budget Range",
            handle: "budget",
            required: false,
            options: [
              { value: "lt_1m", label: "Under $1M" },
              { value: "1m_10m", label: "$1M – $10M" },
              { value: "10m_100m", label: "$10M – $100M" },
              { value: "gt_100m", label: "$100M+" },
              { value: "classified", label: "Cannot disclose" },
            ],
          },
          {
            id: uid(),
            type: "select",
            label: "Timeline",
            handle: "timeline",
            required: false,
            options: [
              { value: "immediate", label: "Immediate" },
              { value: "0_6m", label: "0 – 6 months" },
              { value: "6_12m", label: "6 – 12 months" },
              { value: "12m_plus", label: "12+ months" },
              { value: "exploratory", label: "Exploratory" },
            ],
          },
        ],
      },
      {
        id: uid(),
        fields: [
          {
            id: uid(),
            type: "textarea",
            label: "Tell us about your mission",
            handle: "message",
            required: true,
            placeholder:
              "Mission profile, surface conditions, payload constraints, anything that would help a program engineer scope the conversation.",
          },
        ],
      },
    ],
    successMessage:
      "Thank you. A senior program engineer will respond within one business day.",
    createdAt: now,
    updatedAt: now,
  };
  await ctx.storage.forms.put("contact", contactForm);
  await ctx.kv.set("seed:contact_v1", "done");
  ctx.log.info("Freeform: demo Contact form seeded");
}
