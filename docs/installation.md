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

## 3. Email delivery (required for real notification mail)

Freeform does **not** configure SMTP/IMAP. Configure EmDash first:

1. Install an email provider plugin (e.g. `emdash-smtp` or Cloudflare Email)
2. **EmDash admin → Settings → Email** → select provider → **Send test email**
3. Then attach Freeform notification templates to your forms

Full details: [Email & notifications](./email.md).

In local `astro dev`, EmDash uses a console provider (logs to the terminal) so
you can test Freeform notifications without SMTP.

## 4. Optional: AI features

Generate with AI, spam scoring, and submission briefs need your own OpenAI API
key under **Freeform → Settings → AI & spam**. Without a key, everything else —
building forms by hand, submissions, email (via EmDash), webhooks — works
normally. The **Generate with AI** button only appears once a key is saved.
