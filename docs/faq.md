# FAQ

**Do I need an API key?**
Only for AI features (Generate with AI, spam scoring, briefs). Add an OpenAI
key under Freeform → Settings → AI & spam. Forms, email, and webhooks work
without one.

**Where do I configure SMTP / Resend / SendGrid?**
In **EmDash → Settings → Email**, not Freeform. Freeform decides what to send;
EmDash’s email provider delivers it. See [Email & notifications](./email.md).

**Why don’t notification emails arrive in production?**
Usually no email provider is selected. Open EmDash → Settings → Email, activate
a provider (e.g. `emdash-smtp` or Cloudflare Email), send a test, then retry.
In local `astro dev`, EmDash logs mail to the terminal (console provider).

**How are submissions protected from spam?**
Every form has a honeypot and signed CSRF. Optional Cloudflare Turnstile is on
the form’s Protection tab. With OpenAI spam scoring enabled, emails are skipped
at/above the threshold (the submission is still saved).

**Can I get notified about new submissions?**
Yes. Attach a built-in or custom email template on the form’s Notifications
tab (submitter field or custom address), or fire signed HTTPS webhooks.

**How do I export or delete someone’s data?**
Freeform → Submissions → open a row → **Export CSV** or **Delete**. See
[Privacy](./privacy.md).

**Can AI agents manage my forms?**
Yes. The optional MCP server (`emdash-freeform-mcp`) exposes form and
submission tools to clients like Claude and Cursor.

**Are the rendered forms styled?**
No — by design. `@solspace/freeform-astro` renders semantic HTML with
`data-freeform-*` attributes so forms match your site’s design system.
