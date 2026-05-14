import type { PluginDescriptor } from "emdash";

export function freeformPlugin(): PluginDescriptor {
  return {
    id: "freeform",
    version: "1.0.0",
    format: "standard",
    entrypoint: "@local/freeform-plugin/sandbox",
    options: {},
    capabilities: ["network:request"],
    allowedHosts: ["api.anthropic.com"],
    storage: {
      forms: {
        indexes: ["createdAt"],
      },
      submissions: {
        indexes: ["formId", "createdAt", ["formId", "createdAt"]],
      },
    },
    adminPages: [
      { path: "/forms", label: "Forms", icon: "edit" },
      { path: "/submissions", label: "Submissions", icon: "list" },
      { path: "/settings", label: "Settings", icon: "settings" },
    ],
    adminWidgets: [
      { id: "stats", title: "Freeform", size: "third" },
    ],
  };
}
