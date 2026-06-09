# @solspace/freeform-astro

Astro integration and component library for the [Freeform](https://emdashcms.com) plugin on [EmDash CMS](https://emdashcms.com).

Install the **Freeform** plugin from the EmDash registry (**Plugins → Registry** in the admin — see [`freeform/README.md`](../freeform/README.md#getting-started)), then add this package to your Astro site for forms, submissions, AI chat, and agent discovery routes.

## Requirements

- [Astro](https://astro.build) 6+
- An EmDash site with the **Freeform** plugin installed and at least one form created

## Install

```bash
pnpm add @solspace/freeform-astro
# npm install @solspace/freeform-astro
# yarn add @solspace/freeform-astro
```

## Setup

**Prerequisite:** the Freeform EmDash plugin must already be installed (registry or trusted). See [`freeform/README.md`](../freeform/README.md#getting-started).

Add the integration to `astro.config.mjs` alongside EmDash:

```js
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import freeformAstro from "@solspace/freeform-astro";

export default defineConfig({
  integrations: [
    emdash({
      experimental: { registry: "https://registry.emdashcms.com" },
      // …database, storage, etc.
    }),
    freeformAstro(),
  ],
});
```

`freeformAstro()` injects these routes automatically:

| Route | Purpose |
|-------|---------|
| `/api/freeform/submit` | Public form submission proxy |
| `/api/freeform/chat` | AI chat proxy |
| `/freeform/export/[token]` | Signed CSV export download |
| `/.well-known/freeform.json` | Agent form catalog |
| `/.well-known/freeform/[handle]` | Per-form agent manifest |
| `/.well-known/oauth-protected-resource/freeform/mcp` | MCP OAuth metadata |

## Components

Import from `@solspace/freeform-astro/components` (not from the package root — the root entry is config-time only).

### `FreeformForm`

Server-rendered form. Fetches the form schema from the Freeform plugin at request time and outputs semantic, **unstyled** HTML.

```astro
---
import { FreeformForm } from "@solspace/freeform-astro/components";
---

<FreeformForm formId="contact" class="my-form" />
```

| Prop | Type | Description |
|------|------|-------------|
| `formId` | `string` | Form handle or ID (e.g. `"contact"`) |
| `class` | `string` | Optional class on the `<form>` element |
| `disablePrefill` | `boolean` | Disable URL query-string field prefill |

Style with your own CSS by targeting `data-freeform-*` attributes:

- `[data-freeform-form]` — the `<form>`
- `[data-freeform-field]` — field wrapper
- `[data-freeform-type]` — field type (`text`, `email`, `textarea`, …)
- `[data-freeform-input]` — input, textarea, or select
- `[data-freeform-submit]` — submit button
- `[data-freeform-message]` — success/error message after submit

### `FreeformChat`

Streaming AI chat widget tied to a form handle. Submissions go through the same Freeform pipeline as a normal form.

```astro
---
import { FreeformChat } from "@solspace/freeform-astro/components";

const salesContext = "Your site/product context for the AI assistant.";
---

<FreeformChat
  formHandle="contact"
  salesContext={salesContext}
  siteName="My Site"
/>
```

### `FreeformDiscovery`

Machine-readable discovery markup for AI agents (links to `/.well-known/freeform.json`).

## Client utilities

For custom pages or API routes:

```ts
import { fetchForm, getFetcher, publicOrigin } from "@solspace/freeform-astro/client";
import type { FreeformFormData } from "@solspace/freeform-astro/client";
```

## Package exports

| Import | Use |
|--------|-----|
| `@solspace/freeform-astro` | Astro integration (`astro.config.mjs` only) |
| `@solspace/freeform-astro/components` | `FreeformForm`, `FreeformChat`, `FreeformDiscovery` |
| `@solspace/freeform-astro/client` | `fetchForm`, `getFetcher`, `publicOrigin` |

## License

MIT © [Solspace](https://solspace.com)
