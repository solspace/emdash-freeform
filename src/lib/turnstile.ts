/**
 * Server-side Cloudflare Turnstile verification.
 * @see https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstileToken(opts: {
  secretKey: string;
  token: string;
  remoteIp?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const secret = opts.secretKey.trim();
  const token = opts.token.trim();
  if (!secret || !token) {
    return { ok: false, error: "Captcha verification failed." };
  }

  try {
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", token);
    if (opts.remoteIp) body.set("remoteip", opts.remoteIp);

    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      return { ok: false, error: "Captcha verification unavailable. Please try again." };
    }
    const json = (await res.json()) as {
      success?: boolean;
      "error-codes"?: string[];
    };
    if (json.success) return { ok: true };
    return { ok: false, error: "Captcha check failed. Please try again." };
  } catch {
    return { ok: false, error: "Captcha verification unavailable. Please try again." };
  }
}

export const TURNSTILE_TOKEN_FIELD = "cf-turnstile-response";
