import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formAccess,
  formHasTurnstile,
  isAgentDiscoverable,
  isAgentSubmitEnabled,
  isChatEnabled,
} from "./form-access.ts";
import type { StoredForm } from "../types";

function form(partial: Partial<StoredForm> = {}): StoredForm {
  return {
    name: "Test",
    handle: "test",
    rows: [],
    successMessage: "ok",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("form-access defaults", () => {
  it("treats omitted access as all off", () => {
    const f = form();
    assert.equal(isChatEnabled(f), false);
    assert.equal(isAgentDiscoverable(f), false);
    assert.equal(isAgentSubmitEnabled(f), false);
    assert.deepEqual(formAccess(f), {
      chatEnabled: false,
      agentDiscoverable: false,
      agentSubmitEnabled: false,
      chatSalesContext: undefined,
      chatSiteName: undefined,
    });
  });

  it("requires explicit true for each flag", () => {
    const f = form({
      access: {
        chatEnabled: true,
        agentDiscoverable: false,
        agentSubmitEnabled: true,
        chatSalesContext: "Sell widgets",
        chatSiteName: "Acme",
      },
    });
    assert.equal(isChatEnabled(f), true);
    assert.equal(isAgentDiscoverable(f), false);
    assert.equal(isAgentSubmitEnabled(f), true);
    assert.equal(formAccess(f).chatSalesContext, "Sell widgets");
    assert.equal(formAccess(f).chatSiteName, "Acme");
  });

  it("detects Turnstile only when secret is present", () => {
    assert.equal(formHasTurnstile(form()), false);
    assert.equal(
      formHasTurnstile(
        form({ captcha: { provider: "turnstile", siteKey: "site" } }),
      ),
      false,
    );
    assert.equal(
      formHasTurnstile(
        form({
          captcha: {
            provider: "turnstile",
            siteKey: "site",
            secretKey: "secret",
          },
        }),
      ),
      true,
    );
  });
});
