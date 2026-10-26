# Privacy & GDPR tooling

Freeform does **not** make a site “GDPR certified.” Controllers remain responsible
for lawful basis, notices, and processor agreements. These features help EU teams
run forms with less guesswork.

## What ships in 1.0

### Consent field
Drag a **Consent** field onto the form. It is always required, never pre-checked.
On submit Freeform stores: field handle, label, timestamp, and privacy policy URL
(field-level or form-level).

### Privacy notice
Under **Protection**, set a short notice and optional privacy policy URL. Both
render on the public form under the submit button.

### Retention (auto-delete)
Set **Auto-delete submissions after** 30 / 90 / 180 / 365 days per form.
A daily cron hard-deletes older submissions. Leave “Keep forever” if you must
retain data longer (e.g. tax records).

### IP storage
**Off by default.** Enable **Store submitter IP** only when you have a clear need.

### Export & erasure
In **Submissions**, open a row to:
- **Export CSV** — one submission or the current list (access / portability)
- **Delete** — hard-delete that submission (erasure)

### Captcha
Cloudflare Turnstile is verified server-side when configured. Prefer Turnstile (or
similar) over Google reCAPTCHA when that matches your privacy preference.

### Self-hosted data
With EmDash trusted plugins, submissions live in **your** install / region — not a
US SaaS black box. Document your own hosting and sub-processors for clients.

## Email delivery

Notification emails are sent through EmDash’s email provider (Settings → Email),
not through IMAP/SMTP settings inside Freeform. See [email.md](./email.md).
The email provider and any webhook destinations are additional processors —
document them for your clients the same way you document Freeform storage.

## Webhooks
Outbound webhooks send submission data to third parties. Treat each webhook
destination as another processor and apply the same retention / deletion discipline.

## Checklist for agencies

1. Privacy notice + policy URL on every public form  
2. Consent field when relying on consent (e.g. newsletter)  
3. Retention period that matches the purpose  
4. Know how to export / delete on request (Submissions UI)  
5. Turnstile or honeypot for bots without unnecessary third-party tracking  
