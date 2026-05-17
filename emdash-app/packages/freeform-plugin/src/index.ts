import type { PluginDescriptor } from "emdash";

export function freeformPlugin(): PluginDescriptor {
  return {
    id: "freeform",
    version: "1.0.0",
    format: "standard",
    entrypoint: "@local/freeform-plugin/sandbox",
    capabilities: ["network:request", "email:send"],
    allowedHosts: ["api.anthropic.com"],
    storage: {
      forms: { indexes: ["createdAt"] },
      submissions: { indexes: ["formId", "createdAt"] },
      templates: { indexes: ["createdAt"] },
      notificationAssignments: { indexes: ["formId"] },
    },
    adminPages: [
      { path: "/forms", label: "Forms", icon: "edit" },
      { path: "/templates", label: "Templates", icon: "mail" },
      { path: "/settings", label: "Settings", icon: "settings" },
    ],
    adminWidgets: [
      { id: "stats", title: "Freeform", size: "third" },
    ],
  };
}
