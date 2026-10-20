# Freeform Roadmap

Freeform is a form builder plugin for EmDash, modeled on the feature set of
[Solspace Freeform for Craft CMS](https://plugins.craftcms.com/freeform),
adapted to EmDash's sandboxed plugin platform (Block Kit admin UI — no
custom JavaScript in the admin).

**Current release:** `0.1.4` — see the [changelog](../CHANGELOG.md).

## Shipped

- Form builder with 13 field types, row layout, and per-field validation
- AI form builder (plain-English prompt → form), AI submission briefs
- Submissions inbox with pagination, detail view, and CSV export
- Email notifications with Mustache templates and per-form assignments
- Signed webhooks (HMAC-SHA256) with retries and a delivery log
- Spam protection: honeypot, CSRF tokens, AI spam scoring with thresholds
- Companion packages: `@solspace/freeform-astro` (routes + components) and an
  MCP server (25 tools) for AI agents
- Published on the EmDash plugin registry as `@solspace.com/freeform`

## Path to 1.0

### Product identity

- [x] Official Freeform icon and registry listing (description, keywords, docs sections)
- [ ] Banner and admin screenshots for the registry listing
- [ ] Replace emoji form-card markers with a cleaner treatment

### Builder v2 (Block Kit-max)

- [ ] Separate admin sections: Forms · Submissions · Integrations · Settings
- [ ] Field reorder (move up/down), duplicate field, duplicate/delete rows
- [ ] Grouped field palette and a starter template library (Contact, Job
  Application, Event RSVP, Survey, Support Ticket, …)
- [ ] Duplicate form, import/export form JSON

### Fields v2

Modeled on the Craft Freeform field catalogue. Priority additions:
`website`, `datetime`, `rating`, opinion scale, range, password +
confirmation, table, group, calculation — plus per-field help text and
field widths.

- [ ] Conditional logic (show/hide fields based on other fields)
- [ ] Multi-step forms (page breaks with progress)
- [ ] File upload (pending a sandbox-safe media path — see Limitations)

### Spam v2

- [ ] Captchas: Cloudflare Turnstile, then reCAPTCHA / hCaptcha / Friendly Captcha
- [ ] IP, email-domain, and keyword blocklists; minimum fill time
- [ ] Spam review queue (approve / reject / mark as spam)

### Integrations

Generalize notifications into per-form integration actions with field
mapping, test sends, and delivery logs. Waves:

1. Slack, Zapier/generic webhooks, Mailchimp, HubSpot, Google Sheets
2. Salesforce, Pipedrive, Klaviyo/Brevo, create EmDash entries from submissions
3. Stripe payments (stretch)

### Submissions inbox

- [ ] Search and filters, unread/starred status, bulk actions
- [ ] Resend notification, export selected, retention/auto-delete, GDPR tools

### Frontend polish (`packages/astro`)

- [ ] Optional light/dark themes (components stay unstyled by default)
- [ ] Inline validation UX, multi-step progress, accessibility audit

### 1.0 release

- [ ] Fresh listing screenshots, docs pass, publish `1.0.0`

## Platform constraints

Some roadmap items depend on EmDash platform capabilities (for example,
raw `Response` returns from plugin routes). These are tracked in
[Known limitations](LIMITATIONS.md).
