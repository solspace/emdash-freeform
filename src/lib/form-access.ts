import type { FormAccessSettings, StoredForm } from "../types";

/** AI chat / agent endpoints — all off unless explicitly enabled. */
export function formAccess(form: StoredForm): Required<
  Pick<FormAccessSettings, "chatEnabled" | "agentDiscoverable" | "agentSubmitEnabled">
> &
  Pick<FormAccessSettings, "chatSalesContext" | "chatSiteName"> {
  const a = form.access;
  return {
    chatEnabled: a?.chatEnabled === true,
    agentDiscoverable: a?.agentDiscoverable === true,
    agentSubmitEnabled: a?.agentSubmitEnabled === true,
    chatSalesContext: a?.chatSalesContext,
    chatSiteName: a?.chatSiteName,
  };
}

export function isChatEnabled(form: StoredForm): boolean {
  return formAccess(form).chatEnabled;
}

export function isAgentDiscoverable(form: StoredForm): boolean {
  return formAccess(form).agentDiscoverable;
}

export function isAgentSubmitEnabled(form: StoredForm): boolean {
  return formAccess(form).agentSubmitEnabled;
}

export function formHasTurnstile(form: StoredForm): boolean {
  return (
    form.captcha?.provider === "turnstile" && Boolean(form.captcha.secretKey?.trim())
  );
}
