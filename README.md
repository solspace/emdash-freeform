# Freeform for EmDash

Form builder plugin for [EmDash CMS](https://emdashcms.com) — monorepo.

---

## Repository layout

```
emdash-freeform/
  freeform-plugin/        EmDash marketplace plugin
  freeform-astro/         Astro integration + component library
  emdash-freeform-mcp/    Standalone Cloudflare Worker MCP server
  emdash-app/             Mars Rover Supply demo site (EmDash + Freeform consumer)
  PLAN.md                 Phased product plan with progress tracking
  LIMITATIONS.md          Known limitations and EmDash feature requests
  FREEFORM-POC.md         Original POC handoff — architecture decisions and gotchas
```

---

## Packages

### `freeform-plugin` — EmDash plugin

The core plugin. Runs in EmDash's V8 sandbox (`format: "standard"`). Manages forms, submissions, email notifications, webhooks, spam scoring, and CSV exports via Block Kit admin UI and a full set of plugin routes.

**Install** (EmDash marketplace, once published):
```
# In the EmDash admin: Marketplace → Search "Freeform" → Install
```

**Build locally:**
```bash
cd freeform-plugin
pnpm install
pnpm run build          # compile src/ → dist/
pnpm run bundle         # produces dist/freeform-x.x.x.tar.gz
```

**Development** (alongside the demo site):
```bash
# Terminal 1 — recompile plugin on change
cd freeform-plugin && pnpm run build:watch

# Terminal 2 — demo site
cd emdash-app && npx emdash dev
```

**Publish to marketplace:**
```bash
cd freeform-plugin
pnpm run build
npx emdash plugin publish --build
```
Requires `EMDASH_MARKETPLACE_TOKEN` (set via `npx emdash plugin login`).

---

### `freeform-astro` — `@solspace/freeform-astro`

Astro integration and component library. Injects 6 Freeform-specific routes into any Astro site and provides unstyled `FreeformForm` and `FreeformChat` components.

**Install:**
```bash
pnpm add @solspace/freeform-astro
```

**Usage:**
```ts
// astro.config.mjs
import freeformAstro from "@solspace/freeform-astro"
export default defineConfig({ integrations: [emdash(), freeformAstro()] })
```

```astro
---
import { FreeformForm } from "@solspace/freeform-astro/components"
---
<FreeformForm formId="contact" />
```

Components ship unstyled. Style them by targeting `data-freeform-*` attributes — see `emdash-app/src/pages/contact.astro` for a full dark-theme example.

---

### `emdash-freeform-mcp` — Cloudflare Worker MCP server

Standalone Cloudflare Worker that exposes 25 MCP tools to AI agents (Claude Desktop, Cursor, etc.). Each customer deploys their own Worker instance pointed at their EmDash site.

**Deploy:**
```bash
cd emdash-freeform-mcp
pnpm install
# Edit wrangler.jsonc — set your Worker name and custom domain
wrangler secret put EMDASH_SITE_URL
wrangler deploy
```

See `emdash-freeform-mcp/README.md` for full setup instructions including Claude Desktop config.

---

### `emdash-app` — Demo site

Mars Rover Supply — a demo EmDash site that consumes all three packages. Used for development and as a reference implementation.

```bash
cd emdash-app
npx emdash dev   # starts at http://localhost:4321
```

The demo site is NOT published. It exists to validate the packages and demonstrate real-world usage.

---

## Development setup

```bash
# Clone and install everything from the repo root
git clone https://github.com/solspace/emdash-freeform
cd emdash-freeform
pnpm install

# Build the plugin (required before starting the demo)
pnpm run build --filter freeform-plugin

# Start the demo dev server
cd emdash-app && npx emdash dev
```

For live plugin recompilation while the dev server is running:
```bash
# In a separate terminal
pnpm run build:watch --filter freeform-plugin
```

---

## CI / releasing

| Tag pattern | Action |
|---|---|
| `freeform-plugin/v*` | Build + publish to EmDash marketplace |
| `freeform-astro/v*` | Publish `@solspace/freeform-astro` to npm |

Secrets required in GitHub repository settings:
- `EMDASH_MARKETPLACE_TOKEN` — from `npx emdash plugin login`
- `NPM_TOKEN` — npm automation token with publish rights to `@solspace`
