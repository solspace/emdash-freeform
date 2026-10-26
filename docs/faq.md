# FAQ

**Do I need an API key?**
Only for AI features (Generate with AI, spam scoring, submission briefs).
Add your own OpenAI API key under Freeform → Settings → AI & spam. Forms,
submissions, email notifications, and webhooks work without one.

**Where do I configure SMTP / Resend / SendGrid?**
In **EmDash → Settings → Email**, not inside Freeform. Freeform only decides
what to send and to whom; EmDash’s email provider plugin delivers the message.
See [Email & notifications](./email.md). Freeform does not include IMAP, POP3,
or mailbox “connect” settings.

**Why don’t notification emails arrive in production?**
Usually no email provider is selected. Open EmDash → Settings → Email, install
or activate a provider (e.g. `emdash-smtp` or Cloudflare Email), send a test
email, then retry a form submit. In local `astro dev`, EmDash logs mail to the
terminal instead of sending (console provider).

**How are submissions protected from spam?**
Every form ships with a honeypot field and signed CSRF tokens. Optional
Cloudflare Turnstile lives on the form’s Protection tab. With an OpenAI key and
spam scoring enabled, each submission also gets an AI score; at/above the
threshold, notification emails are skipped (the submission is still saved).

**Can I get notified about new submissions?**
Yes. Create or use a built-in email template, attach it on the form’s
Notifications tab, and choose submitter (email field) or a custom address.
You can also fire signed webhooks to any HTTPS URL on every submission.

**How do I export or delete someone’s data?**
Open Freeform → Submissions, click a row for the detail panel, then **Export
CSV** or **Delete**. You can also export the current list. See
[Privacy](./privacy.md).

**Can AI agents manage my forms?**
Yes. Freeform ships an optional MCP server (`emdash-freeform-mcp`) that
exposes form and submission tools to clients like Claude and Cursor.

**Are the rendered forms styled?**
No — by design. `@solspace/freeform-astro` renders semantic HTML with
`data-freeform-*` attributes so the forms match your site's design system.
