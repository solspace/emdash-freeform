# Freeform Roadmap

Freeform is a form builder plugin for EmDash, modeled on the feature set of
[Solspace Freeform for Craft CMS](https://plugins.craftcms.com/freeform).

**Current release:** `1.0.0` — see the [changelog](../CHANGELOG.md).

## Distribution strategy (decided 2026-10-25)

| Surface | Admin UI | Format | Notes |
| --- | --- | --- | --- |
| **Trusted / self-hosted** (`plugins: [freeformPlugin()]`) | **React + `@dnd-kit`** drag-and-drop builder | `native` | Hero UX for demos & marketing screenshots |
| **Registry / sandboxed** | Block Kit (buttons, no custom JS) | `standard` | Stays marketplace-eligible |

## 1.0 status

**Shipped in `1.0.0`.** Post-1.0 work is under [Later](#later-post-10).

### Explicitly deferred past 1.0

- Anthropic (and other) providers in the React Settings UI (OpenAI-first for 1.0)
- Full integrations CRM wave, Stripe, multi-step, file uploads, conditional logic
- Duplicate form; import / export form JSON; marketing screenshot pack

## Shipped

- Form builder with 13+ field types (incl. consent), row layout, and per-field validation
- React admin shell with Forms · Submissions · Settings (+ Freeform icon / brand color)
- Native DnD builder: Layout · Notifications · Protection; starter templates
- Submissions inbox (detail, CSV export, hard delete, spam score when present)
- Email templates CRUD + built-ins; per-form notification attachments
- Signed webhooks (HMAC-SHA256) with React UI, retries, and delivery log
- Honeypot + Turnstile + CSRF on public submit
- EU / privacy: consent evidence, notice, retention cron, opt-in IP
- OpenAI AI generate / spam / brief (Settings)
- Companion packages: `@solspace/freeform-astro` and MCP server
- Published on the EmDash plugin registry as `@solspace.com/freeform`

## Path to 1.0 — checklist

### Form builder

- [x] Native React DnD palette → canvas → property editor
- [x] Starter templates on create
- [x] Top nav on every Freeform page
- [x] Builder tabs: **Layout · Notifications · Protection**
- [ ] Duplicate form; import / export form JSON (React UI)
- [ ] Marketing screenshots from React builder

### Notifications (1.0)

- [x] Settings → **Email templates** CRUD (React)
- [x] Built-in **Admin Notify** + **Submitter Receipt** (locked; duplicate to edit)
- [x] Form builder → **Notifications** tab (attach / enable / remove)
- [x] Backend routes already exist (`list-templates`, `attach-notification`, …)

### Webhooks (1.0)

- [x] Backend signed deliveries + retry queue + delivery log
- [x] Settings → **Webhooks** tab (React): create, pause, rotate secret, log
- [x] Settings sub-nav: Notifications · Webhooks · AI & spam

### Protection / captcha (1.0)

- [x] Honeypot on public submit
- [x] Form builder → **Protection** tab (Turnstile site/secret keys)
- [x] Verify Turnstile on submit when configured
- [x] Render Turnstile widget on public forms when configured
- [ ] Later: reCAPTCHA / hCaptcha / Friendly Captcha

### AI (1.0 — OpenAI only)

- [x] Settings → **AI & spam**: OpenAI API key + global spam threshold
- [x] Forms → **Generate with AI**
- [x] Submit pipeline: spam score + brief when key present (existing backend)
- [ ] Later: Anthropic in React UI; per-form spam override UI

### EU / privacy (1.0)

- [x] **Consent** field type (required, never pre-checked, evidence on submission)
- [x] Per-form privacy notice + policy URL on public form
- [x] Per-form retention + daily hard-delete cron
- [x] Store IP opt-in (default off)
- [x] Submissions: detail drawer, CSV export, hard delete
- [x] Docs: [privacy.md](./privacy.md)

### Submissions

- [x] List with preview + search
- [x] Detail view in React (export / delete)
- [x] CSV export (prepare-export + download)

### 1.0 release

- [x] Publish `1.0.0`
- [ ] Marketing screenshots / docs polish (ongoing)

## Later (post-1.0)

### Fields v2

`website`, `datetime`, `rating`, opinion scale, range, password + confirmation,
table, group, calculation; conditional logic; multi-step; file upload.

### Integrations

Slack, Zapier, Mailchimp, HubSpot, Sheets → CRM → Stripe (stretch).

### Frontend (`packages/astro`)

Optional themes, inline validation UX, a11y audit.

## Platform constraints

See [Known limitations](LIMITATIONS.md).
