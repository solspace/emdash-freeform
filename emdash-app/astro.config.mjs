import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import { freeformPlugin } from "@local/freeform-plugin";
import freeformAstro from "@solspace/freeform-astro";

export default defineConfig({
  output: "server",
  adapter: cloudflare(),
  image: {
    layout: "constrained",
    responsiveStyles: true,
  },
  integrations: [
    react(),
    emdash({
      database: d1({ binding: "DB", session: "auto" }),
      storage: r2({ binding: "MEDIA" }),
      // Marketplace plugins always run sandboxed via sandboxRunner.
      // Runner ships as a subpath of @emdash-cms/cloudflare (already installed).
      marketplace: "https://marketplace.emdashcms.com",
      sandboxRunner: "@emdash-cms/cloudflare/sandbox",
      // Use plugins[] for local dev (trusted mode).
      // Switch to sandboxed[] when deploying to Cloudflare.
      plugins: [freeformPlugin()],
    }),
    freeformAstro(),
    {
      // /llms.txt is site-specific (uses getSiteSettings + site identity).
      // Keep it here until it can be made configurable in freeform-astro.
      name: "freeform-llms-txt",
      hooks: {
        "astro:config:setup": ({ injectRoute }) => {
          injectRoute({
            pattern: "/llms.txt",
            entrypoint: new URL("./src/llms-txt.ts", import.meta.url).pathname,
          });
        },
      },
    },
  ],
  devToolbar: { enabled: false },
  vite: {
    server: {
      allowedHosts: [".trycloudflare.com"],
    },
  },
});
