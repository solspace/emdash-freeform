# Installation

## 1. Install the plugin

Make sure the registry is enabled in your `astro.config.mjs`
(`emdash({ registry: "https://registry.emdashcms.com", … })`, EmDash ≥ 1.0),
then in the EmDash admin go to **Plugins → Registry**, find **Freeform**, and
install it. Freeform appears in the sidebar once installed.

## 2. Render forms on your site

Freeform's admin lives in the plugin; the public forms are rendered by a
small companion Astro package:

```bash
pnpm add @solspace/freeform-astro
```

```ts
// astro.config.mjs
import freeformAstro from "@solspace/freeform-astro";

export default defineConfig({
  integrations: [emdash(), freeformAstro()],
});
```

Then embed any form by its handle:

```astro
---
import { FreeformForm } from "@solspace/freeform-astro/components";
---

<FreeformForm formId="contact" />
```

## 3. Optional: AI features

The AI form builder, spam scoring, and submission briefs need your own
Anthropic API key. Add it under **Freeform → Settings**. Without a key,
everything else — building forms by hand, submissions, email, webhooks —
works normally.
