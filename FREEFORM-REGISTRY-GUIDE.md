# Freeform — Registry publish & installation guide

**For:** Solspace team / site owners installing Freeform on EmDash  
**Product:** [Freeform](https://github.com/solspace/emdash-freeform) — form builder plugin for [EmDash CMS](https://emdashcms.com)  
**Current plugin release:** `freeform@0.1.2`  
**Publisher:** `solspace.com` (`did:plc:tsp7az5h6qsqjzqsgz37wonx`)  
**Registry:** https://registry.emdashcms.com  

---

## Summary

Freeform is published on the **EmDash plugin registry**. Site owners can search for it in the EmDash admin and install it like any other registry plugin.

Freeform is **two parts**:

| Part | Package | Where it comes from |
|------|---------|---------------------|
| **Backend plugin** | `freeform` | EmDash **Plugins → Registry** |
| **Frontend integration** | `@solspace/freeform-astro` | [npm](https://www.npmjs.com/package/@solspace/freeform-astro) |

Both are required on a production Astro site. The plugin provides the admin UI, storage, and APIs. The Astro package adds public form pages, submission endpoints, and UI components.

The GitHub source repo can stay **private**. Public downloads are served via npm/jsDelivr (`@solspace/freeform-plugin-dist`).

---

## Important: Marketplace ≠ Registry

EmDash currently has **two separate plugin distribution systems**. Freeform is on the **new registry only** — it will **not** appear in the old marketplace.

| | **Old Marketplace** | **New Registry** (where Freeform lives) |
|---|---------------------|----------------------------------------|
| **URL** | `https://marketplace.emdashcms.com` | `https://registry.emdashcms.com` |
| **Admin config** | `marketplace: "https://marketplace.emdashcms.com"` | `experimental: { registry: "https://registry.emdashcms.com" }` |
| **What you see** | ~3 official EmDash plugins | Community plugins including **Freeform** |
| **Publish target** | `emdash plugin publish` (broken / deprecated) | `emdash-plugin publish` (what we use) |
| **Browser homepage** | Has a web UI | **API only** — opening the root URL shows `not found` (normal) |

If your admin shows only three EmDash plugins, you are almost certainly on the **Marketplace**, not the Registry. Typical causes:

1. **EmDash version too old** — registry install UI requires **EmDash ≥ 0.17** (experimental). Older sites (e.g. `emdash@0.12`) only have Marketplace.
2. **Registry not enabled in config** — `experimental.registry` is missing from `astro.config.mjs`.
3. **Still using `marketplace:` only** — that setting does not query the decentralized registry.

**Registry is not a website.** `https://registry.emdashcms.com/` returns an API error in the browser. To verify in a browser or curl, use the search API:

```bash
curl "https://registry.emdashcms.com/xrpc/com.emdashcms.experimental.aggregator.searchPackages?q=freeform"
```

Or use the CLI (easier):

```bash
pnpm dlx @emdash-cms/plugin-cli@0.5.1 search freeform
```

If CLI search finds Freeform but the admin UI does not, fix EmDash version + config (below) — **the publish itself is fine**.

---

## How to verify the publish

### 1. Registry search (recommended)

From any machine with Node.js:

```bash
pnpm dlx @emdash-cms/plugin-cli@0.5.1 search freeform
```

**Expected output** (example):

```
Freeform (freeform)
  Build forms, collect submissions, and send notifications directly from EmDash.
  at://did:plc:tsp7az5h6qsqjzqsgz37wonx/com.emdashcms.experimental.package.profile/freeform
```

If this appears, the plugin is **indexed and discoverable**.

### 2. Package details & latest version

```bash
pnpm dlx @emdash-cms/plugin-cli@0.5.1 info solspace.com freeform
```

Shows profile metadata, latest release version, and download URL.

### 3. EmDash admin UI

On an EmDash site with registry enabled (see [Installation](#installation-on-an-emdash-site)):

1. Open **`https://<your-site>/_emdash/admin`**
2. Go to **Plugins → Registry**
3. Search for **`freeform`**

The plugin should appear as **Freeform**.

### 4. Public download URL (technical check)

The registry points at this tarball:

https://cdn.jsdelivr.net/npm/@solspace/freeform-plugin-dist@0.1.2/freeform-0.1.2.tar.gz

Opening that URL in a browser should download the plugin bundle (HTTP 200).

### 5. npm mirror

https://www.npmjs.com/package/@solspace/freeform-plugin-dist  

Lists published plugin tarball versions used for public CDN hosting.

---

## Installation on an EmDash site

### Requirements

- EmDash **≥ 0.17** (registry is experimental; not available on `emdash@0.12`)
- Astro **6+** with **server output**
- **`sandboxRunner`** configured (registry plugins always install sandboxed — e.g. `@emdash-cms/cloudflare/sandbox` on Cloudflare)
- Node.js ≥ 22 for local development

### Step 1 — Enable the plugin registry (replaces Marketplace UI)

In `astro.config.mjs`, add **`experimental.registry`** and remove or stop relying on the old **`marketplace`** setting for browse/install:

```js
import emdash from "emdash/astro";

export default defineConfig({
  integrations: [
    emdash({
      // …existing database / storage config…
      sandboxRunner: "@emdash-cms/cloudflare/sandbox", // required for registry installs
      experimental: {
        registry: "https://registry.emdashcms.com",
      },
    }),
  ],
});
```

When `experimental.registry` is set, EmDash **replaces** the Marketplace browse/install UI with the Registry UI.

Restart the dev server or redeploy after this change.

### Step 2 — Install the Freeform plugin

1. Open **`/_emdash/admin`**
2. **Plugins → Registry**
3. Search **`freeform`**
4. Click **Install**
5. Approve capabilities when prompted:
   - **Network requests** (plugin API calls, AI, webhooks)
   - **Email send** (submission notifications)

After install, **Freeform** appears in the admin sidebar.

### Step 3 — Install the Astro frontend package

```bash
pnpm add @solspace/freeform-astro
```

Add the integration in `astro.config.mjs`:

```js
import freeformAstro from "@solspace/freeform-astro";

export default defineConfig({
  integrations: [
    emdash({ /* … */ }),
    freeformAstro(),
  ],
});
```

This injects routes such as `/api/freeform/submit` and `/.well-known/freeform.json` for AI agents.

### Step 4 — Create a form

1. Admin → **Freeform**
2. **New form** — set name and **handle** (e.g. `contact`)
3. Add fields (or use **AI generate** if Anthropic API key is configured under **Settings**)
4. Save

### Step 5 — Embed on a page

```astro
---
import { FreeformForm } from "@solspace/freeform-astro/components";
---

<FreeformForm formId="contact" />
```

Components ship **unstyled**. Style with CSS using `data-freeform-*` attributes on the rendered markup.

Submit a test entry, then confirm it under **Freeform → Submissions**.

---

## Optional features (after install)

| Feature | Admin location | Notes |
|---------|----------------|-------|
| Email notifications | **Freeform → Notifications** | Mustache templates per form |
| Webhooks | **Freeform → Settings → Webhooks** | Signed POST to external URLs |
| AI form builder & spam scoring | **Freeform → Settings → AI** | Requires Anthropic API key |
| CSV export | **Freeform → Submissions** | Signed download links |
| AI chat widget | `<FreeformChat />` component | See npm package README |

---

## Updating to a new version

1. Check registry for a newer version:
   ```bash
   pnpm dlx @emdash-cms/plugin-cli@0.5.1 info solspace.com freeform
   ```
2. In admin → **Plugins → Registry**, install the update for **freeform**
3. Bump `@solspace/freeform-astro` on npm when a new frontend release is published:
   ```bash
   pnpm update @solspace/freeform-astro
   ```

---

## Troubleshooting

| Symptom | Likely cause | What to do |
|---------|--------------|------------|
| **Only 3 EmDash plugins in admin** | Old **Marketplace** UI, not Registry | Upgrade to EmDash ≥ 0.17; set `experimental.registry`; ensure `sandboxRunner` is configured |
| **`registry.emdashcms.com` shows not found in browser** | Expected — it's an API server | Use CLI `search freeform` or the `searchPackages` XRPC URL above |
| **CLI finds Freeform but admin does not** | Site not on registry config / old EmDash | Upgrade EmDash + add `experimental.registry`, restart |
| **Registry search empty** in admin | Aggregator still indexing | Wait and retry `emdash-plugin search freeform` |
| **Plugin installed but no public form** | Missing `@solspace/freeform-astro` | Install and add `freeformAstro()` integration |
| **Form not found on page** | Wrong handle | Use the form **handle** from admin (e.g. `contact`), not the internal ID |
| **CLI `info` fails but `search` works** | Transient indexer lag | Retry after a few minutes |

---

## Links

| Resource | URL |
|----------|-----|
| Source repo | https://github.com/solspace/emdash-freeform |
| Plugin registry | https://registry.emdashcms.com |
| Astro package (npm) | https://www.npmjs.com/package/@solspace/freeform-astro |
| Plugin tarball CDN | https://cdn.jsdelivr.net/npm/@solspace/freeform-plugin-dist@0.1.2/freeform-0.1.2.tar.gz |
| EmDash CMS | https://emdashcms.com |
| Developer README (detailed) | [freeform/README.md](./freeform/README.md) |

---

## Release process (internal — Solspace dev)

New plugin versions are published by pushing a git tag:

```bash
git tag freeform/v0.1.3
git push origin freeform/v0.1.3
```

GitHub Actions bundles the plugin, mirrors the tarball to npm, and registers it with the EmDash registry. See [README.md — Publishing](./README.md#publishing) for full CI setup and secrets.

**Contact:** jahid@solspace.com
