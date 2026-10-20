# Security

**Reporting a vulnerability**

Email **support@solspace.com**. Please do not open a public issue for
security problems.

**How Freeform protects your site**

- Submission forms carry a honeypot field and HMAC-signed CSRF tokens
  (timing-safe verification, 2-hour expiry).
- Outbound webhooks are signed with HMAC-SHA256 (`X-Freeform-Signature`)
  so receivers can verify authenticity.
- API keys you provide (e.g. Anthropic) are stored in your site's own
  plugin storage — they are never sent to Solspace.
- Export links are short-lived, signed tokens; they expire automatically.
