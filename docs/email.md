# Email & notifications

Freeform **sends** notification emails. It does **not** handle IMAP/POP3
inbound mail.

Delivery options:

1. **EmDash Host (default)** — `email:send` through EmDash Settings → Email
2. **Direct SMTP** — optional Freeform SMTP settings (host/user/password)
3. **Resend** — optional Freeform Resend API key
4. **Log** — dev mailbox (no outbound send)

Official EmDash guide: [Email Setup](https://docs.emdashcms.com/guides/email/).

---

## Architecture

```
Form submit
  → Freeform templates + recipients
  → Freeform email settings (provider picker)
       ├─ emdash  → ctx.email.send() → EmDash Settings → Email provider
       ├─ smtp    → Freeform SMTP client (TLS verified)
       ├─ resend  → Resend HTTP API
       └─ log     → console / log only
```

| Layer | Responsibility |
| --- | --- |
| **Freeform** | Templates, Mustache vars, form assignments, provider picker, optional SMTP/Resend credentials |
| **EmDash** | When provider is EmDash Host: pipeline, Settings → Email, site-wide providers |
| **Provider** | Actual delivery |

---

## Recommended: EmDash Host

1. Configure **EmDash admin → Settings → Email** (SMTP plugin, Cloudflare Email, etc.).
2. In Freeform → **Settings → Email Delivery**, leave provider on **EmDash Host**.
3. Set Freeform notification templates and form assignments.

### Cloudflare Workers

Use `cloudflareEmail()` from `@emdash-cms/cloudflare/plugins` with a
`send_email` Worker binding.

### Node and other platforms

Community package [`emdash-smtp`](https://www.npmjs.com/package/emdash-smtp)
or EmDash’s built-in SMTP provider under Settings → Email.

---

## Optional: Freeform direct SMTP / Resend

Use when you want notification mail configured inside Freeform instead of
(or in addition to choosing over) EmDash Host:

1. Freeform → **Settings → Email Delivery**
2. Choose **SMTP Server** or **Resend**
3. Enter host/credentials (or API key) and From address
4. Save and send a test email

SMTP connections verify TLS certificates (`rejectUnauthorized: true`).
Credentials are stored in your site’s Freeform plugin storage only.

---

## Templates

Mustache subset: `{{form_name}}`, `{{submission_id}}`, `{{submitted_at}}`,
`{{all_fields}}`, plus field handles (`{{email}}`). Assign on the form’s
**Notifications** tab. Spam-flagged submissions skip notification send.
