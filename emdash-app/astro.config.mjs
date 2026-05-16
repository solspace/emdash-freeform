import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import { freeformPlugin } from "@local/freeform-plugin";

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
			// Use plugins[] for local dev (trusted mode).
			// Switch to sandboxed[] when deploying to Cloudflare.
			plugins: [freeformPlugin()],
		}),
		{
			// Serve the Freeform MCP resource metadata at the RFC 9728 convention
			// path so mcp-remote's deterministic discovery finds it (rather than
			// falling back to EmDash's site-wide doc).
			name: "freeform-mcp-routes",
			hooks: {
				"astro:config:setup": ({ injectRoute }) => {
					injectRoute({
						pattern: "/.well-known/oauth-protected-resource/freeform/mcp",
						entrypoint: new URL("./src/freeform-resource-metadata.ts", import.meta.url).pathname,
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
