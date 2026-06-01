# Freeform for EmDash

Form builder plugin for [EmDash CMS](https://emdashcms.com) — monorepo.

**Every day — two terminals:**

```bash
# 1 — demo site → http://localhost:4321/demo
cd emdash-app && pnpm run dev:clean

# 2 — plugin rebuild on save (optional)
cd freeform-plugin && pnpm run build:watch
```

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

**Development:** see [Daily dev — start here every time](#daily-dev--start-here-every-time) in Development setup.

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

The demo site is NOT published. It exists to validate the packages and demonstrate real-world usage.

---

## Development setup

**Requirements:** Node.js ≥ 22.12, pnpm ≥ 11 (see root `package.json`).

### First time (clone)

```bash
git clone https://github.com/solspace/emdash-freeform
cd emdash-freeform
pnpm install

# Build the plugin once (required before the demo site can load Freeform)
cd freeform-plugin && pnpm run build
```

### Daily dev — start here every time

Use **two terminals** from the repo root.

**Terminal 1 — demo site (keep running)**

```bash
cd emdash-app
pnpm run dev:clean
```

`dev:clean` clears Vite’s cache and runs `npx emdash dev` (migrations + Astro on port **4321**). Wait until you see `astro … ready`, then open:

| URL | What |
|-----|------|
| http://localhost:4321/demo | Freeform POC (contact form) |
| http://localhost:4321/contact | Styled form example |
| http://localhost:4321/_emdash/admin | EmDash admin → **Freeform** |

On the **first start** after a cache clear, the terminal may log one `emdash/middleware` optimize + `program reload` — that’s normal. If a page shows `Astro is not defined`, wait a few seconds and refresh once.

**Terminal 2 — plugin watch (while editing `freeform-plugin/`)**

```bash
cd freeform-plugin
pnpm run build:watch
```

Rebuilds `dist/` on save; refresh the browser or admin after changes.

**If the dev server acts up** (wrong port, stale errors): stop all dev processes, then run `pnpm run dev:clean` again in `emdash-app`. Only one server should use port 4321.

**Plain start** (no cache clear — use when yesterday’s dev session was fine):

```bash
cd emdash-app && npx emdash dev
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
