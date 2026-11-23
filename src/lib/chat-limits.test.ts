import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHAT_MAX_MESSAGE_CHARS,
  CHAT_MAX_MESSAGES,
  sanitizeChatMessages,
} from "./chat-limits.ts";

describe("sanitizeChatMessages", () => {
  it("accepts valid turns and drops bad roles", () => {
    const out = sanitizeChatMessages([
      { role: "user", content: "hi" },
      { role: "system" as any, content: "nope" },
      { role: "assistant", content: "hello" },
    ]);
    assert.ok(Array.isArray(out));
    assert.deepEqual(out, [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
  });

  it("rejects too many messages", () => {
    const raw = Array.from({ length: CHAT_MAX_MESSAGES + 1 }, () => ({
      role: "user" as const,
      content: "x",
    }));
    const out = sanitizeChatMessages(raw);
    assert.ok(!Array.isArray(out));
    assert.match(out.error, /Too many messages/);
  });

  it("rejects oversized message content", () => {
    const out = sanitizeChatMessages([
      { role: "user", content: "a".repeat(CHAT_MAX_MESSAGE_CHARS + 1) },
    ]);
    assert.ok(!Array.isArray(out));
    assert.match(out.error, /Message too long/);
  });

  it("treats non-arrays as empty", () => {
    assert.deepEqual(sanitizeChatMessages(null), []);
    assert.deepEqual(sanitizeChatMessages("nope"), []);
  });
});
