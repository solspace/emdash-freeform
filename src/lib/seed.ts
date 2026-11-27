import type { PluginContext } from "emdash";
import { ensureDefaultTemplates } from "./default-templates";
import { ensureRetentionCronScheduled } from "./retention";
import { uid } from "./handles";
import type { StoredForm } from "../types";

const SEED_FLAG = "seed:contact_v1";
const SKIP_DEMO_KEY = "seed:skip_demo";

export async function getSkipDemoSeed(ctx: PluginContext): Promise<boolean> {
  return (await ctx.kv.get<boolean>(SKIP_DEMO_KEY)) === true;
}

export async function setSkipDemoSeed(
  ctx: PluginContext,
  skip: boolean,
): Promise<boolean> {
  await ctx.kv.set(SKIP_DEMO_KEY, skip);
  return skip;
}

// Idempotent: writes a default Contact form on the
// first call against a clean install, and no-ops on subsequent calls.
//
// Called from:
//   - hooks/install.ts            — marketplace install path
//   - admin/router.ts page_load   — admin first opens the Freeform section
//
// Never call from public/agent routes — unauthenticated traffic must not
// create data. Trusted-plugin boot (`plugins: [freeformPlugin()]`) never
// fires `plugin:install`, so admin page_load remains the lazy seed path.
export async function ensureDemoSeed(ctx: PluginContext): Promise<void> {
  // Built-in email templates (Admin Notify, Submitter Receipt) — always ensure,
  // even on installs that already have the Contact form seed flag.
  await ensureDefaultTemplates(ctx);
  await ensureRetentionCronScheduled(ctx);

  if (await getSkipDemoSeed(ctx)) return;

  // Cheap guard: a single KV key marks the seed as already run for this
  // install, so we don't pay the storage query cost on every admin page load.
  const flag = await ctx.kv.get<string>(SEED_FLAG);
  if (flag) return;

  // Belt-and-braces: even if the flag is missing (e.g. KV was wiped but
  // storage wasn't), don't overwrite an existing form at id `"contact"`.
  const existing = await ctx.storage.forms.get("contact");
  if (existing) {
    await ctx.kv.set(SEED_FLAG, "done");
    return;
  }

  const now = new Date().toISOString();
  const contactForm: StoredForm = {
    name: "Contact",
    handle: "contact",
    cardIcon: "email",
    rows: [
      {
        id: uid(),
        fields: [
          {
            id: uid(),
            type: "text",
            label: "Name",
            handle: "name",
            required: true,
            placeholder: "Your name",
          },
        ],
      },
      {
        id: uid(),
        fields: [
          {
            id: uid(),
            type: "text",
            label: "Email",
            handle: "email",
            required: true,
            placeholder: "you@example.com",
          },
        ],
      },
      {
        id: uid(),
        fields: [
          {
            id: uid(),
            type: "textarea",
            label: "Message",
            handle: "message",
            required: true,
            placeholder: "How can we help?",
          },
        ],
      },
      {
        id: uid(),
        fields: [
          {
            id: uid(),
            type: "consent",
            label: "I agree to the privacy policy",
            handle: "privacy_consent",
            required: true,
          },
        ],
      },
    ],
    successMessage: "Thanks for getting in touch. We'll be in contact shortly.",
    privacy: {
      notice: "We use your details only to respond to this enquiry.",
      retentionDays: 90,
      storeIp: false,
    },
    // AI chat / agent discovery / agent submit stay off (omit access).
    // Enable per form under Protection when needed.
    createdAt: now,
    updatedAt: now,
  };
  await ctx.storage.forms.put("contact", contactForm);
  await ctx.kv.set(SEED_FLAG, "done");
  ctx.log.info("Freeform: default Contact form seeded");
}
