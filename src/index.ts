import type { PluginDescriptor } from "emdash";

/**
 * Trusted / self-hosted descriptor — React DnD admin via `adminEntry`.
 * Registry publishes still use `emdash-plugin.jsonc` + `./sandbox` (Block Kit).
 */
export function freeformPlugin(): PluginDescriptor {
  return {
    id: "freeform",
    version: "1.0.0",
    format: "native",
    entrypoint: "@local/freeform/native",
    adminEntry: "@local/freeform/admin",
    capabilities: ["network:request:unrestricted", "email:send"],
    storage: {
      forms: { indexes: ["createdAt"] },
      submissions: { indexes: ["formId", "createdAt"] },
      templates: { indexes: ["createdAt"] },
      notification_assignments: { indexes: ["formId"] },
      webhooks: { indexes: ["createdAt"] },
    },
    adminPages: [
      { path: "/forms", label: "Forms", icon: "form-input" },
      { path: "/submissions", label: "Submissions", icon: "inbox" },
      { path: "/settings", label: "Settings", icon: "settings" },
    ],
    adminWidgets: [{ id: "stats", title: "Freeform", size: "third" }],
  };
}
