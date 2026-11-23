import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clientIp } from "./client-ip.ts";

describe("clientIp", () => {
  it("prefers cf-connecting-ip", () => {
    const req = new Request("https://example.com", {
      headers: {
        "cf-connecting-ip": "203.0.113.9",
        "x-forwarded-for": "198.51.100.1, 10.0.0.1",
        "x-real-ip": "192.0.2.1",
      },
    });
    assert.equal(clientIp(req), "203.0.113.9");
  });

  it("falls back to first x-forwarded-for hop", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "198.51.100.1, 10.0.0.1" },
    });
    assert.equal(clientIp(req), "198.51.100.1");
  });

  it("falls back to x-real-ip", () => {
    const req = new Request("https://example.com", {
      headers: { "x-real-ip": "192.0.2.55" },
    });
    assert.equal(clientIp(req), "192.0.2.55");
  });

  it("returns null when no headers", () => {
    assert.equal(clientIp(new Request("https://example.com")), null);
    assert.equal(clientIp(null), null);
  });
});
