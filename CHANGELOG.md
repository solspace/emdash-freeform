# Changelog

All notable changes to the Freeform plugin for EmDash are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] — 2026-10-30

### Added

- **Email service providers** — Settings panel for direct SMTP, Resend, SendGrid, Postmark, and webhook delivery (alongside EmDash’s email pipeline when available)
- **Form builder upgrades** — field options editor, real-time field preview cards, and custom field icon rendering
- **Webhooks & notifications** — attachment manager polish, webhook secret rotation, and delivery logs in the React admin
- **Showcase demo site** (companion `emdash-cms`) — dark-mode gallery on `/`, form pages on `/forms/[handle]`, and docs link

### Changed

- `@solspace/freeform-astro` **0.2.0** — streamlined form rendering (no prompt cue text) and Cloudflare Workers `SELF` service binding support for same-origin SSR fetches

## [1.0.1] — 2026-10-26

### Fixed

- `@solspace/freeform-astro` same-origin form fetch on Cloudflare Workers now uses the `SELF` service binding (avoids false “Form not found” during SSR)
- Built-in Admin Notify subject: `{{form_name}}` spacing (no space after `{{`)

## [1.0.0] — 2026-10-26

### Added

- React admin shell (Forms · Submissions · Settings) with Freeform brand color and icon
- Native DnD form builder: layout, field props, starter templates, Notifications / Protection tabs
- Email templates CRUD in Settings with built-in Admin Notify and Submitter Receipt
- Per-form notification attachments (submitter field or custom recipient)
- Webhooks React UI: create, pause, rotate secret, delivery log
- Cloudflare Turnstile on public forms (render + verify) alongside honeypot
- Consent field type with evidence stored on submission
- Per-form privacy notice, retention auto-delete cron, and opt-in IP storage
- Submissions detail drawer, CSV export, and hard delete
- Form card colors / tinted backgrounds; AI generate multi-row layout reflow
- Agent submit path delivers signed webhooks (parity with public submit)
- Privacy docs (`docs/privacy.md`)

### Changed

- OpenAI-first AI Settings (generate, spam score, brief) with clearer 401 / Settings link UX
- Registry bundle kept under the 128 KB per-file limit

## [0.1.4] — 2026-10-20

### Added

- Official Freeform icon (from Solspace Freeform for Craft) shown on the registry listing.
- Registry listing sections: long description, installation, FAQ, and security docs.

### Changed

- New registry description and keywords; listing now requires EmDash ≥ 1.0.0.
- Built against EmDash 1.3.1 / plugin-cli 0.13.4.

## [0.1.3] — 2026-06-09

### Changed

- Registry publisher transferred to Solspace (`did:plc:tsp7az5h6qsqjzqsgz37wonx`).

## [0.1.2] — 2026-06-09

### Changed

- Registry publish CI: CDN propagation wait and version/tag alignment checks.

## [0.1.1] — 2026-06-09

### Changed

- Registry publish CI: npm tarball mirror and credential handling fixes.

## [0.1.0] — 2026-06-09

### Added

**Form builder**
- Form management via Block Kit admin UI: create, edit, delete forms
- 13 field types: `text`, `email`, `textarea`, `number`, `phone`, `date`, `checkbox`, `checkbox_group`, `radio`, `select`, `multi_select`, `hidden`, `html`
- Per-field validation: `minLength`, `maxLength`, `pattern`/`patternError` for text types; `min`/`max` for number and date
- Row-based layout: up to 4 fields side-by-side per row
- Form handles as stable public references (`<FreeformForm formId="contact" />`)
- AI form builder via Claude Haiku — describe a form, fields are added automatically; understands all field types and validation rules
- Manual field add/remove controls alongside AI builder
- `defaultValue` support on all field types including pre-checked checkboxes, pre-selected options, and pre-filled text
- Success message per form

**Submissions**
- Submission storage with cursor-based pagination (25/page)
- Submission detail view with full field values, AI-generated brief, and visitor page journey
- AI brief on every submission: intent, urgency, key facts, suggested next action
- Visitor journey tracking (pages visited before submitting)
- CSRF protection + honeypot spam field on all forms
- URL-based form prefill via query parameters

**Spam filtering**
- AI-powered spam scoring (0–10) on every submission via Claude Haiku
- Global default threshold with per-form overrides
- Scores stored on submissions; nothing auto-rejected
- MCP `archive_spam_submissions` tool for bulk archiving

**Email notifications**
- Global reusable notification templates (Mustache syntax)
- Per-form notification assignments with recipient type: submitter email field or fixed address
- HTML and plain-text template formats
- Spam-scored submissions above threshold skip notifications

**Webhooks**
- Outbound HTTPS POST on every form submission
- HMAC-SHA256 signed (`X-Freeform-Signature: sha256=...`)
- Per-webhook or all-forms scope
- Automatic retry with exponential backoff: 1 min → 5 min → 15 min (3 retries)
- KV delivery log (last 20 per webhook)
- Secret rotation without downtime
- Admin UI: add, pause/resume, delete, view log, rotate secret

**CSV export**
- Signed short-lived download URLs (15 min expiry)
- Per-form exports with one column per field handle
- Multi-form exports with a `data_json` column
- Filterable by date range, spam score, archived status, or explicit submission ID list

**MCP server** (via `emdash-freeform-mcp` companion Worker)
- 25 tools covering forms, submissions, notifications, spam settings, and webhooks
- Bearer token authentication (EmDash PAT)
- Proxy-ready via `SOLSPACE_PROXY_MODE` environment variable

### Technical

- `format: "standard"` — marketplace-compatible, runs in EmDash V8 sandbox
- Block Kit admin UI only (no React, no custom JS in browser)
- Storage: EmDash generic JSON+indexes KV API (5 collections: forms, submissions, templates, notificationAssignments, webhooks)
- Network: `network:request:unrestricted` for Anthropic API + webhook delivery
- `email:send` capability for notification emails
- `cron` hook for webhook retry processing (runs every minute)
- Idempotent demo seed via KV flag (`seed:contact_v1`) — works on both marketplace install and trusted-plugin first-load

[1.1.0]: https://github.com/solspace/emdash-freeform/releases/tag/freeform/v1.1.0
[1.0.1]: https://github.com/solspace/emdash-freeform/releases/tag/freeform/v1.0.1
[1.0.0]: https://github.com/solspace/emdash-freeform/releases/tag/freeform/v1.0.0
[0.1.0]: https://github.com/solspace/emdash-freeform/releases/tag/freeform/v0.1.0
