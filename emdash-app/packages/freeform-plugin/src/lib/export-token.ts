import type { PluginContext } from "emdash";

export interface ExportFilter {
  formId?: string;
  submissionIds?: string[];
  since?: string;
  until?: string;
  includeArchived?: boolean;
  minSpamScore?: number;
  filename?: string;
}

export interface ExportPayload {
  filter: ExportFilter;
  exp: number;
  iat: number;
}

export const EXPORT_TOKEN_TTL_MS = 15 * 60 * 1000;

function bytesToHex(buf: ArrayBuffer | Uint8Array): string {
  const view = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < view.length; i++) out += view[i].toString(16).padStart(2, "0");
  return out;
}

function base64UrlEncode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const bin = atob(input.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function getOrCreateSecret(ctx: PluginContext): Promise<string> {
  const existing = await ctx.kv.get<string>("export:secret");
  if (existing) return existing;
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  const secret = bytesToHex(buf);
  await ctx.kv.set("export:secret", secret);
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

function canonicalPayload(p: ExportPayload): string {
  return JSON.stringify({ filter: p.filter, exp: p.exp, iat: p.iat });
}

export async function signExportToken(
  ctx: PluginContext,
  filter: ExportFilter,
): Promise<{ token: string; expiresAt: string }> {
  const now = Date.now();
  const payload: ExportPayload = { filter, iat: now, exp: now + EXPORT_TOKEN_TTL_MS };
  const secret = await getOrCreateSecret(ctx);
  const sig = await hmacSign(secret, canonicalPayload(payload));
  const token = base64UrlEncode(JSON.stringify({ ...payload, sig }));
  return { token, expiresAt: new Date(payload.exp).toISOString() };
}

export async function verifyExportToken(
  ctx: PluginContext,
  token: string,
): Promise<ExportPayload | null> {
  let parsed: { filter?: ExportFilter; exp?: number; iat?: number; sig?: string };
  try {
    parsed = JSON.parse(base64UrlDecode(token));
  } catch {
    return null;
  }
  const { filter, exp, iat, sig } = parsed;
  if (!filter || typeof exp !== "number" || typeof iat !== "number" || typeof sig !== "string") {
    return null;
  }
  if (Date.now() > exp) return null;
  const secret = await getOrCreateSecret(ctx);
  const expected = await hmacSign(secret, canonicalPayload({ filter, exp, iat }));
  if (!timingSafeEqual(sig, expected)) return null;
  return { filter, exp, iat };
}
