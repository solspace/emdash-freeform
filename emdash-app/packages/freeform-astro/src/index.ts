import type { AstroIntegration } from "astro";
import { fileURLToPath } from "node:url";

// This file is the integration entry point — it is loaded by astro.config.mjs
// at config-parse time, before Astro's Vite plugin or Cloudflare adapter shims
// are active. It must only contain static imports that work in plain Node.js.
//
// - Components  → import from "@local/freeform-astro/components"
// - Client utils → import from "@local/freeform-astro/client"

/**
 * Astro integration that injects all Freeform site-side routes automatically.
 *
 * Add to your astro.config.mjs integrations array:
 * ```ts
 * import freeformAstro from "@solspace/freeform-astro"
 * // integrations: [emdash({ plugins: [freeformPlugin()] }), freeformAstro()]
 * ```
 *
 * Injected routes:
 *   /api/freeform/submit                                — public form submit proxy
 *   /api/freeform/chat                                  — AI chat proxy
 *   /freeform/export/[token]                            — signed CSV download
 *   /.well-known/freeform.json                          — agent form catalog
 *   /.well-known/freeform/[handle]                      — per-form agent manifest
 *   /.well-known/oauth-protected-resource/freeform/mcp  — MCP OAuth metadata
 */
export default function freeformAstro(): AstroIntegration {
  return {
    name: "freeform-astro",
    hooks: {
      "astro:config:setup": ({ injectRoute }) => {
        const r = (file: string) =>
          fileURLToPath(new URL(`./routes/${file}`, import.meta.url));

        injectRoute({
          pattern: "/api/freeform/submit",
          entrypoint: r("submit.ts"),
        });
        injectRoute({
          pattern: "/api/freeform/chat",
          entrypoint: r("chat.ts"),
        });
        injectRoute({
          pattern: "/freeform/export/[token]",
          entrypoint: r("export-token.ts"),
        });
        injectRoute({
          pattern: "/.well-known/freeform.json",
          entrypoint: r("actions-index.ts"),
        });
        injectRoute({
          pattern: "/.well-known/freeform/[handle]",
          entrypoint: r("action-manifest.ts"),
        });
        injectRoute({
          pattern:
            "/.well-known/oauth-protected-resource/freeform/mcp",
          entrypoint: r("resource-metadata.ts"),
        });
      },
    },
  };
}
