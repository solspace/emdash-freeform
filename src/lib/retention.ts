import type { PluginContext } from "emdash";
import type { StoredForm, StoredSubmission } from "../types";

const RETENTION_CRON = "submissions:retention";

/**
 * Hard-delete submissions older than each form’s privacy.retentionDays.
 * Forms without retention (null/omit) are skipped.
 */
export async function purgeExpiredSubmissions(ctx: PluginContext): Promise<{
  deleted: number;
}> {
  const { items: formItems } = await ctx.storage.forms.query({ limit: 1000 });
  const forms = formItems as Array<{ id: string; data: StoredForm }>;
  const retentionByForm = new Map<string, number>();
  for (const f of forms) {
    const days = f.data.privacy?.retentionDays;
    if (typeof days === "number" && days > 0) retentionByForm.set(f.id, days);
  }
  if (retentionByForm.size === 0) return { deleted: 0 };

  const { items: subItems } = await ctx.storage.submissions.query({
    orderBy: { createdAt: "asc" },
    limit: 10000,
  });
  const now = Date.now();
  let deleted = 0;
  for (const item of subItems as Array<{ id: string; data: StoredSubmission }>) {
    const days = retentionByForm.get(item.data.formId);
    if (!days) continue;
    const created = new Date(item.data.createdAt).getTime();
    if (!Number.isFinite(created)) continue;
    const ageMs = now - created;
    if (ageMs >= days * 24 * 60 * 60 * 1000) {
      await ctx.storage.submissions.delete(item.id);
      deleted += 1;
    }
  }
  if (deleted > 0) {
    ctx.log.info("Freeform: retention purge deleted submissions", { deleted });
  }
  return { deleted };
}

export async function ensureRetentionCronScheduled(
  ctx: PluginContext,
): Promise<void> {
  if (!ctx.cron) return;
  try {
    const tasks = await ctx.cron.list();
    const exists = tasks.some((t) => t.name === RETENTION_CRON);
    if (!exists) {
      // Daily at 03:15 UTC
      await ctx.cron.schedule(RETENTION_CRON, { schedule: "15 3 * * *" });
    }
  } catch (e) {
    ctx.log.warn("Freeform: could not schedule submissions:retention cron", {
      error: String(e),
    });
  }
}

export { RETENTION_CRON };
