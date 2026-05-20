import type { PluginContext } from "emdash";
import { uid } from "./handles";
import type { StoredForm } from "../types";

// Idempotent: writes a default Contact form and default license tier on the
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
    name: "Contact",
    handle: "contact",
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
