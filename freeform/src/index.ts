import type { PluginDescriptor } from "emdash";

export function freeformPlugin(): PluginDescriptor {
  return {
    id: "freeform",
    version: "0.1.3",
    format: "standard",
    entrypoint: "@local/freeform/sandbox",
    // network:request:unrestricted is required for webhook delivery to
    // arbitrary customer-supplied URLs. It implies network:request, so
    // allowedHosts is removed — the Anthropic API is reachable under the
    // broader capability.
    capabilities: ["network:request:unrestricted", "email:send"],
    storage: {
      forms: { indexes: ["createdAt"] },
      submissions: { indexes: ["formId", "createdAt"] },
      templates: { indexes: ["createdAt"] },
      notification_assignments: { indexes: ["formId"] },
      webhooks: { indexes: ["createdAt"] },
    },
    // One sidebar entry — section nav is inside the plugin (see freeformNavBlocks).
    adminPages: [{ path: "/forms", label: "Freeform", icon: "form-input" }],
    adminWidgets: [
      { id: "stats", title: "Freeform", size: "third" },
    ],
  };
}
