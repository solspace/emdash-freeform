import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rateLimitCheck } from "./rate-limit.ts";

function mockCtx() {
  const store = new Map<string, unknown>();
  return {
    kv: {
      get: async <T>(key: string) => (store.get(key) as T | undefined) ?? null,
      set: async (key: string, value: unknown) => {
        store.set(key, value);
      },
    },
    _store: store,
  };
}

describe("rateLimitCheck", () => {
  it("allows up to the limit then blocks", async () => {
    const ctx = mockCtx() as any;
    assert.equal(
      await rateLimitCheck(ctx, "1.2.3.4", { prefix: "t", limit: 2 }),
      true,
    );
    assert.equal(
      await rateLimitCheck(ctx, "1.2.3.4", { prefix: "t", limit: 2 }),
      true,
    );
    assert.equal(
      await rateLimitCheck(ctx, "1.2.3.4", { prefix: "t", limit: 2 }),
      false,
    );
  });

  it("does not fail open when IP is missing — uses shared no-ip bucket", async () => {
    const ctx = mockCtx() as any;
    assert.equal(await rateLimitCheck(ctx, null, { prefix: "t", limit: 1 }), true);
    assert.equal(
      await rateLimitCheck(ctx, undefined, { prefix: "t", limit: 1 }),
      false,
    );
    assert.equal(await rateLimitCheck(ctx, "  ", { prefix: "t", limit: 1 }), false);
  });

  it("isolates different IPs", async () => {
    const ctx = mockCtx() as any;
    assert.equal(
      await rateLimitCheck(ctx, "10.0.0.1", { prefix: "t", limit: 1 }),
      true,
    );
    assert.equal(
      await rateLimitCheck(ctx, "10.0.0.2", { prefix: "t", limit: 1 }),
      true,
    );
    assert.equal(
      await rateLimitCheck(ctx, "10.0.0.1", { prefix: "t", limit: 1 }),
      false,
    );
  });
});
