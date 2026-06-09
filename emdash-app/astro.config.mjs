import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import { freeformPlugin } from "@local/freeform";
import freeformAstro from "@solspace/freeform-astro";
import { emdashSsrDeps } from "./vite-emdash-ssr-deps.mjs";

const REACT_OPTIMIZE = [
  "react",
  "react-dom",
  "react-dom/server.edge",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
];

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
      marketplace: "https://marketplace.emdashcms.com",
      sandboxRunner: "@emdash-cms/cloudflare/sandbox",
      plugins: [freeformPlugin()],
    }),
    freeformAstro(),
    {
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
    plugins: [emdashSsrDeps()],
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: { "react-dom/server": "react-dom/server.edge" },
    },
    optimizeDeps: {
      include: REACT_OPTIMIZE,
    },
    server: {
      allowedHosts: [".trycloudflare.com"],
    },
  },
});
