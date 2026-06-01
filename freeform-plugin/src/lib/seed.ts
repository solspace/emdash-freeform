import type { PluginContext } from "emdash";
import { uid } from "./handles";
import type { StoredForm } from "../types";

// Idempotent: writes a default Contact form and default license tier on the
// first call against a clean install, and no-ops on subsequent calls.
//
// Called from three places:
//   - hooks/install.ts            — marketplace install path
//   - admin/router.ts page_load   — admin first opens the Freeform section
//   - public/agent routes         — visitor or AI hits the form before admin
//
// The trusted-plugin boot path (`plugins: [freeformPlugin()]` in
// astro.config.mjs) never fires `plugin:install`, and customers can embed
// <FreeformForm formId="contact" /> on their site before opening the admin,
// so the public routes need to seed lazily too. The KV-flag guard makes
// every call after the first one effectively free (one KV read).
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
    ],
    successMessage: "Thanks for getting in touch. We'll be in contact shortly.",
    createdAt: now,
    updatedAt: now,
  };
  await ctx.storage.forms.put("contact", contactForm);
  await ctx.kv.set("seed:contact_v1", "done");
  ctx.log.info("Freeform: default Contact form seeded");
}
