import type { PluginContext } from "emdash";
import { uid } from "../lib/handles";
import type { StoredForm } from "../types";

export const installHook = {
  handler: async (_event: unknown, ctx: PluginContext) => {
    await ctx.kv.set("license:tier", "free");

    const now = new Date().toISOString();
    const contactForm: StoredForm = {
      name: "Contact Us",
      handle: "contact_us",
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
              required: false,
              placeholder: "Smith",
            },
          ],
        },
        {
          id: uid(),
          fields: [
            {
              id: uid(),
              type: "text",
              label: "Subject",
              handle: "subject",
              required: true,
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
              placeholder: "How can we help you?",
            },
          ],
        },
      ],
      successMessage: "Thank you! We'll be in touch shortly.",
      createdAt: now,
      updatedAt: now,
    };
    await ctx.storage.forms.put("contact", contactForm);
    ctx.log.info("Freeform installed with demo contact form");
  },
};
