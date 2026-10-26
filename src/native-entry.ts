/**
 * Native (trusted) plugin entry — required for React admin + DnD builder.
 * EmDash loads: `import { createPlugin } from entrypoint` then `createPlugin(options)`.
 *
 * Imports the emdash-plugin build output (`dist/plugin.mjs`) so Cloudflare/Vite
 * SSR does not have to resolve TypeScript relatives inside the linked package.
 *
 * Registry / sandboxed installs keep using `sandbox-entry.ts` (Block Kit).
 */
import { definePlugin } from "emdash";
import type { PluginContext, RouteContext } from "emdash";
// Built by `emdash-plugin build` before this module is loaded in cms.
import sandbox from "../dist/plugin.mjs";

type SandboxHandler = (routeCtx: any, ctx: PluginContext) => Promise<unknown>;

function wrapRoutes(
  routes: Record<string, { handler: SandboxHandler; public?: boolean; [k: string]: unknown }>,
): Record<string, { handler: (ctx: RouteContext) => Promise<unknown>; public?: boolean }> {
  const out: Record<
    string,
    { handler: (ctx: RouteContext) => Promise<unknown>; public?: boolean }
  > = {};
  for (const [name, route] of Object.entries(routes)) {
    const { handler, public: isPublic, ...rest } = route;
    out[name] = {
      ...rest,
      public: isPublic,
      handler: async (ctx) =>
        handler({ input: ctx.input, request: ctx.request }, ctx),
    };
  }
  return out;
}

function wrapHooks(
  hooks: Record<string, { handler: (...args: any[]) => Promise<unknown>; [k: string]: unknown }>,
): Record<string, { handler: (...args: any[]) => Promise<unknown> }> {
  const out: Record<string, { handler: (...args: any[]) => Promise<unknown> }> = {};
  for (const [name, hook] of Object.entries(hooks)) {
    out[name] = {
      ...hook,
      handler: async (...args: any[]) => {
        if (args.length >= 2) return hook.handler(args[0], args[1]);
        const only = args[0];
        if (only && typeof only === "object" && "storage" in only) {
          return hook.handler(only, only);
        }
        return hook.handler(only, only);
      },
    };
  }
  return out;
}

export function createPlugin(_options: Record<string, unknown> = {}) {
  return definePlugin({
    id: "freeform",
    version: "0.1.4",
    capabilities: ["network:request:unrestricted", "email:send"],
    storage: {
      forms: { indexes: ["createdAt"] },
      submissions: { indexes: ["formId", "createdAt"] },
      templates: { indexes: ["createdAt"] },
      notification_assignments: { indexes: ["formId"] },
      webhooks: { indexes: ["createdAt"] },
    },
    admin: {
      entry: "@local/freeform/admin",
      pages: [
        { path: "/forms", label: "Forms", icon: "form-input", group: "Freeform" },
        { path: "/submissions", label: "Submissions", icon: "inbox", group: "Freeform" },
        { path: "/settings", label: "Settings", icon: "settings", group: "Freeform" },
      ],
      widgets: [{ id: "stats", title: "Freeform", size: "third" }],
    },
    hooks: wrapHooks((sandbox as any).hooks ?? {}) as any,
    routes: wrapRoutes((sandbox as any).routes ?? {}) as any,
  });
}
