# Freeform for EmDash

Build forms, collect submissions, and act on them — without leaving EmDash.

**Form builder**

- 13 field types: text, email, textarea, number, phone, date, checkboxes, radio, dropdowns, multi-select, hidden, and HTML blocks
- Row-based layout with per-field validation (length, pattern, min/max)
- An AI builder that creates and edits forms from a plain-English description
- Starter forms for contact and newsletter signup out of the box

**Submissions**

- A searchable submissions inbox with pagination and full detail views
- AI submission briefs: intent, urgency, key facts, and a suggested next action
- CSV export for spreadsheets and reporting

**Automation & protection**

- Email notifications with reusable templates (delivery via EmDash’s email provider — Settings → Email)
- Privacy tooling: consent fields, retention auto-delete, export/delete submissions
- Signed webhooks (HMAC-SHA256) with automatic retries and a delivery log
- Spam scoring with honeypot + CSRF protection on every submission
- Optional MCP server so AI agents can manage forms and read submissions

Forms render on your site with the companion `@solspace/freeform-astro`
package, which ships unstyled components you theme with your own CSS.
