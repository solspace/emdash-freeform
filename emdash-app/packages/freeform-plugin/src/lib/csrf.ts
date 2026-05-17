import type { PluginContext } from "emdash";
import { CSRF_MAX_AGE_MS } from "../constants";

function bytesToHex(buf: ArrayBuffer | Uint8Array): string {
  const view = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < view.length; i++) out += view[i].toString(16).padStart(2, "0");
  return out;
}

async function getOrCreateSecret(ctx: PluginContext): Promise<string> {
  const existing = await ctx.kv.get<string>("csrf:secret");
  if (existing) return existing;
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  const secret = bytesToHex(buf);
  await ctx.kv.set("csrf:secret", secret);
  return secret;
}

async function hmacSign(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return bytesToHex(sig);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function createCsrfToken(ctx: PluginContext, formId: string): Promise<string> {
  const secret = await getOrCreateSecret(ctx);
  const ts = Date.now().toString(36);
  const sig = await hmacSign(secret, `${ts}.${formId}`);
  return `${ts}.${formId}.${sig}`;
}

export async function verifyCsrfToken(
  ctx: PluginContext,
  token: string,
  formId: string,
): Promise<boolean> {
  if (typeof token !== "string" || !token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [ts, tokenFormId, sig] = parts;
  if (tokenFormId !== formId) return false;
  const issuedAt = parseInt(ts, 36);
  if (!Number.isFinite(issuedAt)) return false;
  if (Date.now() - issuedAt > CSRF_MAX_AGE_MS) return false;
  const secret = await getOrCreateSecret(ctx);
  const expected = await hmacSign(secret, `${ts}.${formId}`);
  return timingSafeEqual(sig, expected);
}
