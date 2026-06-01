import type { PluginDescriptor } from "emdash";

export function freeformPlugin(): PluginDescriptor {
  return {
    id: "freeform",
    version: "1.0.0",
    format: "standard",
    entrypoint: "@local/freeform-plugin/sandbox",
    // network:request:unrestricted is required for webhook delivery to
    // arbitrary customer-supplied URLs. It implies network:request, so
    // allowedHosts is removed — the Anthropic API is reachable under the
    // broader capability.
    capabilities: ["network:request:unrestricted", "email:send"],
    storage: {
      forms: { indexes: ["createdAt"] },
      submissions: { indexes: ["formId", "createdAt"] },
      templates: { indexes: ["createdAt"] },
      notificationAssignments: { indexes: ["formId"] },
      webhooks: { indexes: ["createdAt"] },
    },
    adminPages: [
      { path: "/forms", label: "Forms", icon: "edit" },
      { path: "/submissions", label: "Submissions", icon: "list" },
      { path: "/templates", label: "Templates", icon: "mail" },
      { path: "/settings", label: "Settings", icon: "settings" },
    ],
    adminWidgets: [
      { id: "stats", title: "Freeform", size: "third" },
    ],
  };
}
