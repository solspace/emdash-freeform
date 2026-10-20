# FAQ

**Do I need an API key?**
Only for the AI features (AI form builder, AI spam scoring, submission
briefs). Add your own Anthropic API key in Freeform → Settings. Forms,
submissions, email notifications, and webhooks work without one.

**How are submissions protected from spam?**
Every form ships with a honeypot field and signed CSRF tokens. If you add
an Anthropic key, each submission also gets an AI spam score and is flagged
against a threshold you control, per form or globally.

**Can I get notified about new submissions?**
Yes. Create an email template, assign it to a form, and choose whether it
goes to the submitter (using their email field) or to a fixed address. You
can also fire signed webhooks to any URL on every submission.

**How do I export submissions?**
From the Submissions view you can download a CSV for any form, or generate
a short-lived export link.

**Can AI agents manage my forms?**
Yes. Freeform ships an optional MCP server (`emdash-freeform-mcp`) that
exposes form and submission tools to clients like Claude and Cursor.

**Are the rendered forms styled?**
No — by design. `@solspace/freeform-astro` renders semantic HTML with
`data-freeform-*` attributes so the forms match your site's design system.
