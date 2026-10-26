# Freeform — Registry Guide

How to verify Freeform's registry listing, install it on an EmDash site, and
troubleshoot common problems.

- **Package:** `@solspace.com/freeform` ([plugin page](https://plugins.emdashcms.com/plugins/@solspace.com/freeform))
- **Current release:** `freeform@1.0.1`
- **Publisher:** `solspace.com` (`did:plc:tsp7az5h6qsqjzqsgz37wonx`)
- **Registry:** https://registry.emdashcms.com
- **Source:** https://github.com/solspace/emdash-freeform

Freeform has two installable parts:

| Part | Package | Source |
| --- | --- | --- |
| Backend plugin | `freeform` | EmDash **Plugins → Registry** |
| Frontend integration | `@solspace/freeform-astro` | [npm](https://www.npmjs.com/package/@solspace/freeform-astro) |

Both are required on a production site. The plugin provides the admin UI,
storage, and APIs; the Astro package renders the public forms and routes.

## Verify the listing

```bash
npx @emdash-cms/plugin-cli search freeform
npx @emdash-cms/plugin-cli info solspace.com freeform
```

`info` shows the profile, the latest release (currently `1.0.1`), and the
download URL. The registry index can lag a few minutes behind a fresh
publish; if a new version doesn't appear yet, wait and retry.

You can also download the release tarball directly:

https://github.com/solspace/emdash-freeform/releases/download/freeform/v1.0.1/freeform-1.0.1.tar.gz

## Install on an EmDash site

### Requirements

- EmDash **≥ 1.0** (the plugin refuses to install on older hosts)
- Astro **6+** with server output
- A sandbox runner configured (registry plugins install sandboxed — e.g. `@emdash-cms/cloudflare/sandbox` on Cloudflare)
- Node.js **≥ 22**

### 1. Enable the registry

```js
// astro.config.mjs
import emdash from "emdash/astro";

export default defineConfig({
  integrations: [
    emdash({
      registry: "https://registry.emdashcms.com",
      sandboxRunner: "@emdash-cms/cloudflare/sandbox",
      // …existing database / storage config…
    }),
  ],
});
```

Restart the dev server (or redeploy) after changing this.

### 2. Install the plugin

1. Open `/_emdash/admin`
2. Go to **Plugins → Registry**
3. Search for **`freeform`** and click **Install**
4. Approve the requested capabilities:
   - **Network requests** — AI features and webhook delivery
   - **Email send** — submission notifications

**Freeform** then appears in the admin sidebar.

### 3. Install the Astro package

```bash
pnpm add @solspace/freeform-astro
```

```js
import freeformAstro from "@solspace/freeform-astro";

export default defineConfig({
  integrations: [emdash({ /* … */ }), freeformAstro()],
});
```

### 4. Create and embed a form

1. Admin → **Freeform** → **New form** — set the name and **handle** (e.g. `contact`)
2. Add fields (or use the AI builder after adding an Anthropic API key in **Freeform → Settings**)
3. Embed by handle:

```astro
---
import { FreeformForm } from "@solspace/freeform-astro/components";
---

<FreeformForm formId="contact" />
```

Components ship unstyled; theme them with `data-freeform-*` CSS selectors.
Submit a test entry and confirm it under **Freeform → Submissions**.

## Optional features

| Feature | Where | Notes |
| --- | --- | --- |
| **Email delivery** | **EmDash → Settings → Email** | Provider plugin (SMTP/Resend/CF Email…) — required for prod notification mail; see [email.md](./email.md) |
| Notification templates | Freeform → Settings → Notifications + form → Notifications | What to send / to whom (not SMTP) |
| Webhooks | Freeform → Settings → Webhooks | HMAC-signed POST on every submission |
| AI / spam scoring | Freeform → Settings → AI & spam | Your own OpenAI API key |
| CSV export / delete | Freeform → Submissions | Access / erasure helpers |
| AI chat widget | `<FreeformChat />` component | See `packages/astro/README.md` |
| MCP server | `packages/mcp/` | Optional Worker for AI agents |

## Updating

1. Check the latest version: `npx @emdash-cms/plugin-cli info solspace.com freeform`
2. Admin → **Plugins → Registry** → install the update for **freeform**
3. Update the frontend package when a new npm release appears: `pnpm update @solspace/freeform-astro`

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Freeform missing from Registry search | Index lag, or registry not enabled | Wait a few minutes; confirm `registry:` is set in `astro.config.mjs` and EmDash ≥ 1.0 |
| CLI finds Freeform but the admin doesn't | Site config | Add `registry:`, restart/redeploy |
| Plugin installed but no public form | Missing Astro package | Install `@solspace/freeform-astro` and add `freeformAstro()` |
| "Form not found" on a page | Wrong handle | Use the form **handle** from the admin (e.g. `contact`), not its internal ID |
| Notification emails never arrive (prod) | No EmDash email provider | **Settings → Email** — select provider, send test; see [email.md](./email.md) |
| Registry root URL shows an error in the browser | Expected — it's an API, not a website | Use the CLI commands above |

## Links

| Resource | URL |
| --- | --- |
| Source repository | https://github.com/solspace/emdash-freeform |
| Plugin page | https://plugins.emdashcms.com/plugins/@solspace.com/freeform |
| Astro package (npm) | https://www.npmjs.com/package/@solspace/freeform-astro |
| Plugin tarball | https://github.com/solspace/emdash-freeform/releases/download/freeform/v1.0.1/freeform-1.0.1.tar.gz |
| EmDash CMS | https://emdashcms.com |
