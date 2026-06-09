import type { PluginContext } from "emdash";
import { DEFAULT_SPAM_THRESHOLD } from "../constants";
import type { SpamSettings, StoredForm } from "../types";

// Global defaults — read from KV. Used as fallback for forms that don't carry
// their own per-form override.
export async function getSpamSettings(ctx: PluginContext): Promise<SpamSettings> {
  const enabled = (await ctx.kv.get<boolean>("spam:enabled")) === true;
  const threshold = (await ctx.kv.get<number>("spam:threshold")) ?? DEFAULT_SPAM_THRESHOLD;
  return { enabled, threshold };
}

export async function setSpamSettings(
  ctx: PluginContext,
  patch: Partial<SpamSettings>,
): Promise<SpamSettings> {
  if (typeof patch.enabled === "boolean") await ctx.kv.set("spam:enabled", patch.enabled);
  if (typeof patch.threshold === "number") {
    const clamped = Math.max(0, Math.min(10, Math.round(patch.threshold)));
    await ctx.kv.set("spam:threshold", clamped);
  }
  return getSpamSettings(ctx);
}

// Resolve the settings that should govern a given form's submissions. If the
// form has a `spam` override, that wins; otherwise inherit the global defaults.
export function effectiveSpamSettings(
  form: Pick<StoredForm, "spam"> | null | undefined,
  globalDefaults: SpamSettings,
): SpamSettings {
  if (!form?.spam) return globalDefaults;
  return {
    enabled: typeof form.spam.enabled === "boolean" ? form.spam.enabled : globalDefaults.enabled,
    threshold:
      typeof form.spam.threshold === "number" ? form.spam.threshold : globalDefaults.threshold,
  };
}

// Convenience: load global defaults and apply form override in one call.
export async function getEffectiveSpamSettings(
  ctx: PluginContext,
  form: Pick<StoredForm, "spam"> | null | undefined,
): Promise<SpamSettings> {
  const globalDefaults = await getSpamSettings(ctx);
  return effectiveSpamSettings(form, globalDefaults);
}

// Per-form override write. Reads/writes the form's `spam` field. Pass null to
// clear the override (form reverts to inheriting the global defaults).
export async function setFormSpamOverride(
  ctx: PluginContext,
  formId: string,
  patch: SpamSettings | null,
): Promise<StoredForm | null> {
  const form = (await ctx.storage.forms.get(formId)) as StoredForm | null;
  if (!form) return null;
  const next: StoredForm = { ...form, updatedAt: new Date().toISOString() };
  if (patch === null) {
    delete next.spam;
  } else {
    next.spam = {
      enabled: !!patch.enabled,
      threshold: Math.max(0, Math.min(10, Math.round(patch.threshold))),
    };
  }
  await ctx.storage.forms.put(formId, next);
  return next;
}
