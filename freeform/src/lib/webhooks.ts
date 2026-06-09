// Webhook delivery, HMAC signing, KV delivery log, and retry queue.

import type { PluginContext } from "emdash";
import type {
  RetryItem,
  StoredSubmission,
  StoredWebhook,
  WebhookDeliveryRecord,
} from "../types";

// Retry backoff delays for attempts 1, 2, 3 (after the initial failure).
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000];
const MAX_RETRIES = 3;
const MAX_LOG_ENTRIES = 20;
const RETRY_QUEUE_KEY = "webhooks:retry:queue";

// ── Secret generation ─────────────────────────────────────────────

export function generateWebhookSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ── HMAC-SHA256 signing ───────────────────────────────────────────

// Returns `sha256=<hex>` — the standard format used by GitHub, Stripe, etc.
async function signPayload(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const hex = Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
  return `sha256=${hex}`;
}

// ── Single delivery attempt ────────────────────────────────────────

interface DeliveryResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

async function attemptDelivery(
  ctx: PluginContext,
  url: string,
  secret: string,
  payload: string,
): Promise<DeliveryResult> {
  if (!ctx.http) {
    return { success: false, error: "ctx.http not available (network:request:unrestricted capability missing?)" };
  }
  try {
    const signature = await signPayload(secret, payload);
    const res = await ctx.http.fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Freeform-Signature": signature,
        "User-Agent": "Freeform-Webhook/1.0",
      },
      body: payload,
    });
    if (res.ok) return { success: true, statusCode: res.status };
    const text = await res.text().catch(() => "");
    return {
      success: false,
      statusCode: res.status,
      error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
    };
  } catch (e: unknown) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ── KV delivery log (ring buffer per webhook) ─────────────────────

export async function appendDeliveryLog(
  ctx: PluginContext,
  webhookId: string,
  entry: WebhookDeliveryRecord,
): Promise<void> {
  const key = `webhooks:log:${webhookId}`;
  const existing = (await ctx.kv.get<WebhookDeliveryRecord[]>(key)) ?? [];
  await ctx.kv.set(key, [entry, ...existing].slice(0, MAX_LOG_ENTRIES));
}

export async function getDeliveryLog(
  ctx: PluginContext,
  webhookId: string,
): Promise<WebhookDeliveryRecord[]> {
  return (await ctx.kv.get<WebhookDeliveryRecord[]>(`webhooks:log:${webhookId}`)) ?? [];
}

// ── KV retry queue ────────────────────────────────────────────────

async function getRetryQueue(ctx: PluginContext): Promise<RetryItem[]> {
  return (await ctx.kv.get<RetryItem[]>(RETRY_QUEUE_KEY)) ?? [];
}

async function saveRetryQueue(ctx: PluginContext, queue: RetryItem[]): Promise<void> {
  await ctx.kv.set(RETRY_QUEUE_KEY, queue);
}

async function enqueueRetry(ctx: PluginContext, item: RetryItem): Promise<void> {
  const queue = await getRetryQueue(ctx);
  // Upsert by id — replace an existing entry for the same delivery.
  await saveRetryQueue(ctx, [...queue.filter((q) => q.id !== item.id), item]);
}

// ── Public: fire on submit ────────────────────────────────────────

// Called from the submit route after the submission is persisted.
// Does NOT throw — delivery errors are logged and queued for retry.
export async function deliverWebhooks(
  ctx: PluginContext,
  formId: string,
  formHandle: string,
  submission: StoredSubmission,
  submissionId: string,
): Promise<void> {
  const { items } = await ctx.storage.webhooks.query({ limit: 200 });
  const webhooks = (items as Array<{ id: string; data: StoredWebhook }>).filter(
    (w) => w.data.enabled && (!w.data.formId || w.data.formId === formId),
  );
  if (webhooks.length === 0) return;

  const payload = JSON.stringify({
    event: "submission.created",
    submissionId,
    formId,
    formHandle,
    createdAt: submission.createdAt,
    data: submission.data,
    ...(submission.journey ? { journey: submission.journey } : {}),
  });

  for (const { id: webhookId, data: webhook } of webhooks) {
    const deliveryId = `${webhookId}:${submissionId}:${Date.now()}`;
    const result = await attemptDelivery(ctx, webhook.url, webhook.secret, payload);

    const record: WebhookDeliveryRecord = {
      id: deliveryId,
      submissionId,
      formId,
      status: result.success ? "success" : "failed",
      attempts: 1,
      statusCode: result.statusCode,
      error: result.error,
      deliveredAt: new Date().toISOString(),
    };

    await appendDeliveryLog(ctx, webhookId, record);

    if (!result.success) {
      await enqueueRetry(ctx, {
        id: deliveryId,
        webhookId,
        url: webhook.url,
        secret: webhook.secret,
        submissionId,
        formId,
        payload,
        attempts: 1,
        nextRetryAt: new Date(Date.now() + RETRY_DELAYS_MS[0]).toISOString(),
      });
      ctx.log.warn("Freeform: webhook delivery failed, queued for retry", {
        webhookId,
        deliveryId,
        error: result.error,
      });
    }
  }
}

// ── Public: process retry queue (called from cron) ─────────────────

// Runs every minute via the `cron` hook. Attempts delivery for all items
// whose nextRetryAt is in the past. Removes succeeded items and permanently
// failed items (>= MAX_RETRIES attempts) from the queue.
export async function processRetryQueue(ctx: PluginContext): Promise<void> {
  const queue = await getRetryQueue(ctx);
  if (queue.length === 0) return;

  const now = Date.now();
  const due = queue.filter((item) => new Date(item.nextRetryAt).getTime() <= now);
  const notYetDue = queue.filter((item) => new Date(item.nextRetryAt).getTime() > now);

  const remaining: RetryItem[] = [];

  for (const item of due) {
    // Skip if the webhook was deleted since this item was queued.
    const webhook = (await ctx.storage.webhooks.get(item.webhookId)) as StoredWebhook | null;
    if (!webhook) continue;

    const result = await attemptDelivery(ctx, item.url, item.secret, item.payload);
    const totalAttempts = item.attempts + 1;

    await appendDeliveryLog(ctx, item.webhookId, {
      id: item.id,
      submissionId: item.submissionId,
      formId: item.formId,
      status: result.success ? "success" : "failed",
      attempts: totalAttempts,
      statusCode: result.statusCode,
      error: result.error,
      deliveredAt: new Date().toISOString(),
    });

    if (!result.success && totalAttempts <= MAX_RETRIES) {
      const delayMs = RETRY_DELAYS_MS[Math.min(totalAttempts - 1, RETRY_DELAYS_MS.length - 1)];
      remaining.push({
        ...item,
        attempts: totalAttempts,
        nextRetryAt: new Date(now + delayMs).toISOString(),
      });
    } else if (!result.success) {
      ctx.log.error("Freeform: webhook delivery permanently failed after max retries", {
        webhookId: item.webhookId,
        deliveryId: item.id,
        attempts: totalAttempts,
      });
    }
  }

  await saveRetryQueue(ctx, [...notYetDue, ...remaining]);
}
