# Freeform for EmDash

Form builder plugin for [EmDash CMS](https://emdashcms.com) — monorepo.

**Manager / install guide:** [FREEFORM-REGISTRY-GUIDE.md](./FREEFORM-REGISTRY-GUIDE.md) — verify publish, install on a site, links.

**Every day — two terminals:**

```bash
# 1 — demo site → http://localhost:4321/demo
cd emdash-app && pnpm run dev:clean

# 2 — plugin rebuild on save (optional)
cd freeform && pnpm run build:watch
```

---

## Repository layout

```
emdash-freeform/
  freeform/               EmDash registry plugin
  freeform-astro/         Astro integration + component library
  emdash-freeform-mcp/    Standalone Cloudflare Worker MCP server
  emdash-app/             Mars Rover Supply demo site (EmDash + Freeform consumer)
  PLAN.md                 Phased product plan with progress tracking
  LIMITATIONS.md          Known limitations and EmDash feature requests
  FREEFORM-POC.md         Original POC handoff — architecture decisions and gotchas
```

---

## Packages

### `freeform` — EmDash plugin

The core plugin. Runs in EmDash's V8 sandbox (`format: "standard"`). Manages forms, submissions, email notifications, webhooks, spam scoring, and CSV exports via Block Kit admin UI and a full set of plugin routes.

**Install** (for site owners): see [`freeform/README.md`](freeform/README.md#getting-started) — enable the registry in `astro.config.mjs`, install **freeform** from **Plugins → Registry**, then add **`@solspace/freeform-astro`** on the frontend.

**Build locally:**
```bash
cd freeform
pnpm install
pnpm run build          # compile src/ → dist/
pnpm run bundle         # produces dist/freeform-x.x.x.tar.gz
```

**Development:** see [Daily dev — start here every time](#daily-dev--start-here-every-time) in Development setup.

**Publish to registry:** see [Publishing](#publishing) (`pnpm dlx @emdash-cms/plugin-cli@0.5.1 login` must run outside the monorepo).
See [Publishing](#publishing) for CI via `freeform/v*` tags.

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
cd freeform && pnpm run build
```

### Daily dev — start here every time

Use **two terminals** from the repo root.

**Terminal 1 — demo site (keep running)**

```bash
cd emdash-app
pnpm run dev:clean
```

`dev:clean` builds the Freeform plugin first, clears Vite’s cache, and runs `npx emdash dev` (migrations + Astro on port **4321**). Wait until you see `astro … ready`, then open:

| URL | What |
|-----|------|
| http://localhost:4321/demo | Freeform POC (contact form) |
| http://localhost:4321/contact | Styled form example |
| http://localhost:4321/_emdash/admin | EmDash admin → **Freeform** |

On the **first start** after a cache clear, the terminal may log one `emdash/middleware` optimize + `program reload` — that’s normal. If a page shows `Astro is not defined`, wait a few seconds and refresh once.

**Terminal 2 — plugin watch (while editing `freeform/`)**

```bash
cd freeform
pnpm run build:watch
```

Rebuilds `dist/` on save; refresh the browser or admin after changes.

**If the dev server acts up** (wrong port, stale errors): stop all dev processes, then run `pnpm run dev:clean` again in `emdash-app`. Only one server should use port 4321.

**Plain start** (no cache clear — use when yesterday’s dev session was fine):

```bash
cd emdash-app && npx emdash dev
```

---

## Publishing

Releases are tag-driven GitHub Actions workflows. Push a scoped tag and CI builds + publishes automatically.

| Tag pattern | Package | Destination |
|---|---|---|
| `freeform/v*` | EmDash plugin | [Plugin registry](https://registry.emdashcms.com) |
| `freeform-astro/v*` | `@solspace/freeform-astro` | [npm](https://www.npmjs.com/package/@solspace/freeform-astro) |

Sites install registry plugins with `experimental.registry: "https://registry.emdashcms.com"` in `astro.config.mjs`.

### One-time setup (GitHub Actions secrets)

In the repo → **Settings** → **Secrets and variables** → **Actions**, add:

| Secret | How to get it |
|---|---|
| `EMDASH_PLUGIN_OAUTH_SESSIONS` | After login (see below), copy the full contents of `~/.emdash/oauth/sessions.json`. CI also derives `~/.emdash/credentials.json` from this file (publish checks both). |
| `NPM_TOKEN` | [npmjs.com](https://www.npmjs.com) → **Access Tokens** → granular token with **read/write** on `@solspace/*` |
| `REGISTRY_TARBALL_URL` (optional) | Override the public tarball URL passed to `emdash-plugin publish`. By default CI publishes the tarball to npm as `@solspace/freeform-plugin-dist` and uses its unpkg URL (works with a private GitHub repo). |

The GitHub repo can stay **private** for source code — you do **not** need to make it public. Registry publish needs a **public HTTPS URL** for the tarball; CI mirrors each release to `@solspace/freeform-plugin-dist` on npm (same `NPM_TOKEN` as `freeform-astro`) and registers a jsDelivr/unpkg URL with the EmDash registry. CDNs can lag npm by a few minutes after first publish; re-run the workflow if that step times out. GitHub Releases are still created for your own archive. Override with `REGISTRY_TARBALL_URL` if you host the tarball elsewhere (R2, S3, etc.).

### Release checklist

1. **Bump the version** in the package you are shipping:
   - Registry plugin: `freeform/package.json` **and** `freeform/src/index.ts` (`version` field)
   - npm package: `freeform-astro/package.json`
   - Update `freeform/CHANGELOG.md` when releasing the plugin
   - Add or update `freeform-astro/README.md` when releasing the Astro package (npm displays this on the package page)

2. **Commit and push** to `main` (merge `dev` → `main` first if needed).

3. **Tag and push** (one tag per package, or both for a combined release):

```bash
# EmDash plugin registry
git tag freeform/v0.1.0
git push origin freeform/v0.1.0

# npm Astro package
git tag freeform-astro/v0.1.1
git push origin freeform-astro/v0.1.1
```

4. Watch **Actions** in GitHub for the publish workflow result.

5. Verify:
   - Registry: `npx emdash-plugin search freeform` or EmDash admin → **Plugins** → **Registry**
   - npm: `npm view @solspace/freeform-astro`

### Re-running a failed registry publish

If bundle and GitHub Release succeeded but **Publish release record to registry** failed, re-run that job (or step) from **Actions** — you do not need a new tag.

If the workflow failed earlier (e.g. bundle), delete the tag and push it again on the fixed commit:

```bash
git tag -d freeform-astro/v0.1.1
git push origin :refs/tags/freeform-astro/v0.1.1
git tag freeform-astro/v0.1.1
git push origin freeform-astro/v0.1.1
```

If the version **already exists on npm or the registry**, bump the version — you cannot republish the same semver.

### Publish locally (optional)

**Registry plugin:**

Log in **outside the monorepo** (workspace dependency hoisting breaks `emdash-plugin login` here):

```bash
pnpm dlx @emdash-cms/plugin-cli@0.5.1 login thejahid.bsky.social
cat ~/.emdash/oauth/sessions.json   # → paste into EMDASH_PLUGIN_OAUTH_SESSIONS secret
```

Then bundle and publish:

```bash
cd freeform
pnpm run bundle
pnpm dlx @emdash-cms/plugin-cli@0.5.1 publish \
  --url https://your-host/freeform-x.y.z.tar.gz \
  --local dist/freeform-x.y.z.tar.gz
```

**npm package:**

```bash
cd freeform-astro
npm login   # first time
pnpm publish --access public --no-git-checks --dry-run   # test
pnpm publish --access public --no-git-checks             # publish
```
