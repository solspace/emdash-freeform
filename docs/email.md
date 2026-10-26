# Email & notifications

Freeform **sends** notification emails. It does **not** configure mailboxes,
IMAP, POP3, or SMTP. EmDash owns delivery through an email **provider plugin**.

That split is intentional for 1.0: one place to set up mail for the whole site
(magic links, invites, Freeform notifications), and Freeform only decides
*what* to send and *to whom*.

Official EmDash guide: [Email Setup](https://docs.emdashcms.com/guides/email/).

---

## Architecture

```
Form submit
  → Freeform templates + recipients (this plugin)
  → ctx.email.send()  (capability: email:send)
  → EmDash email pipeline
  → Active provider plugin (email:deliver)
  → Inbox
```

| Layer | Responsibility |
| --- | --- |
| **Freeform** | Templates, Mustache vars, attach to forms, submitter vs custom recipient, skip when spam-flagged |
| **EmDash** | Pipeline, Settings → Email, pick active provider, test send |
| **Provider plugin** | Actual delivery (SMTP, Resend, Cloudflare Email, …) |

Freeform declares the `email:send` capability. `ctx.email` is only available
when some other plugin has registered the exclusive `email:deliver` hook and
the site has selected that provider under **Settings → Email**.

---

## What Freeform does *not* include

- IMAP / POP3 (inbound mail)
- SMTP host / username / password UI inside Freeform
- “Connect Gmail / Outlook” account linking
- Its own From-address transport settings

Configure those on EmDash (or the provider plugin’s settings), not in Freeform.

---

## Production: configure EmDash email first

1. Install and activate an email provider plugin (examples below).
2. Open **EmDash admin → Settings → Email**.
3. Select the active provider (only one delivers at a time).
4. Use **Send test email** until it succeeds.
5. Then set up Freeform notification templates and assignments.

### Cloudflare Workers

Use `cloudflareEmail()` from `@emdash-cms/cloudflare/plugins` with a
`send_email` Worker binding. See EmDash’s Cloudflare deployment / email docs
for domain onboarding and the binding.

### Node and other platforms

Community package [`emdash-smtp`](https://www.npmjs.com/package/emdash-smtp)
covers generic SMTP and hosted APIs (Amazon SES, Brevo, Mailgun, Postmark,
Resend, SendGrid, Zoho, and more):

```bash
pnpm add emdash-smtp
```

```js
// astro.config.mjs
import emdash from "emdash/astro";
import { emdashSmtp } from "emdash-smtp";

export default defineConfig({
  integrations: [
    emdash({
      // …database / storage…
      plugins: [emdashSmtp()],
    }),
  ],
});
```

Enter provider credentials on that plugin’s settings page in the admin.
Rotating a key means pasting the new value there (EmDash stores plugin
settings in the site database).

---

## Development (`astro dev`)

If no production provider is selected, EmDash activates a **built-in console
provider**:

- Does **not** send real email
- Logs each message to the terminal
- Keeps the last 100 messages in memory
- Dev-only — never used in production builds

Useful endpoints while developing:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/_emdash/api/dev/emails` | List captured emails |
| `DELETE` | `/_emdash/api/dev/emails` | Clear the capture buffer |

So Freeform notifications “work” in local dev without SMTP — check the
terminal (or the dev emails API) after a test submit.

---

## Freeform notification setup

### 1. Templates

**Freeform → Settings → Notifications** (email templates).

Built-in templates ship locked:

- **Admin Notify** — new submission alert
- **Submitter Receipt** — confirmation to the person who filled the form

Duplicate a built-in to customize. Create your own for anything else.

**Mustache variables** (simple `{{ name }}` substitution — no loops/conditionals):

| Variable | Meaning |
| --- | --- |
| `{{form_name}}` | Form title |
| `{{submission_id}}` | Submission id |
| `{{submitted_at}}` | ISO timestamp |
| `{{all_fields}}` | Label: value list of all answers |
| `{{field_handle}}` | Any field by handle, e.g. `{{email}}` |

### 2. Attach to a form

Open a form → **Notifications** tab:

- Pick a template
- **Send to:** submitter (email field) or a custom address
- Enable / disable without deleting the assignment

Spam-flagged submissions (AI score ≥ threshold) skip notification emails;
the submission is still stored.

### 3. Capability on install

When installing Freeform from the registry, approve **`email:send`**. Without
it, Freeform cannot call `ctx.email.send()`.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| No email in production | No provider active | EmDash → **Settings → Email** — install/select a provider, send test |
| Works in dev, silent in prod | Dev console provider masks missing prod setup | Configure a real provider on the deployed site |
| Freeform logs “ctx.email unavailable” | Provider missing or capability denied | Activate provider; re-check Freeform was granted `email:send` |
| Template sent but empty body | Wrong Mustache names | Use `{{form_name}}`, `{{all_fields}}`, field handles — not `{{form.name}}` |
| Submitter never gets mail | Wrong recipient field / invalid email | Notifications tab → submitter field must be an email field with a valid value |
| Spam folder | DNS / reputation | Configure SPF/DKIM/DMARC at your email provider (not Freeform) |
| Notifications skipped | AI spam threshold | Check spam score on the submission; adjust **Settings → AI & spam** |

Webhooks are separate from email: they still fire when notifications are
skipped for spam (unless you pause the webhook). Treat webhook destinations
as additional processors under your privacy policy.

---

## Checklist for 1.0 go-live

1. [ ] EmDash **Settings → Email** — provider selected, test email OK  
2. [ ] Freeform installed with **`email:send`** approved  
3. [ ] At least one notification template (or built-in) attached to each live form  
4. [ ] Submit a real test and confirm inbox (and spam folder)  
5. [ ] Optional: webhooks for Slack/CRM if you also need non-email alerts  

---

## Related

- [Privacy / GDPR tooling](./privacy.md) — consent, retention, export/delete  
- [Security](./security.md) — CSRF, honeypot, webhook signatures  
- [FAQ](./faq.md)  
- EmDash: [Email Setup](https://docs.emdashcms.com/guides/email/)  
- EmDash: [Capabilities (`email:send`)](https://docs.emdashcms.com/plugins/creating-plugins/capabilities/)  
