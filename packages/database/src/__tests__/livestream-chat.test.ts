import { describe, expect, it } from "vitest";
import { chatWaitSeconds, cleanChatBody, CHAT_MESSAGE_MAX } from "../services/livestream-chat-service";

describe("cleanChatBody", () => {
  it("trims and collapses whitespace", () => {
    const result = cleanChatBody("  hello   there \n friends  ");
    expect(result).toEqual({ ok: true, body: "hello there friends" });
  });

  it("rejects empty and whitespace-only messages", () => {
    expect(cleanChatBody("").ok).toBe(false);
    expect(cleanChatBody("   \n  ").ok).toBe(false);
    expect(cleanChatBody(undefined).ok).toBe(false);
  });

  it("rejects messages over the cap", () => {
    expect(cleanChatBody("x".repeat(CHAT_MESSAGE_MAX + 1)).ok).toBe(false);
    expect(cleanChatBody("x".repeat(CHAT_MESSAGE_MAX)).ok).toBe(true);
  });
});

describe("chatWaitSeconds", () => {
  const now = new Date("2026-08-13T12:00:00Z");
  const secondsAgo = (s: number) => new Date(now.getTime() - s * 1000);

  it("returns 0 when slow mode is off or there is no prior message", () => {
    expect(chatWaitSeconds(secondsAgo(1), now, 0, false)).toBe(0);
    expect(chatWaitSeconds(null, now, 30, false)).toBe(0);
  });

  it("counts down the remaining wait", () => {
    expect(chatWaitSeconds(secondsAgo(10), now, 30, false)).toBe(20);
    expect(chatWaitSeconds(secondsAgo(30), now, 30, false)).toBe(0);
    expect(chatWaitSeconds(secondsAgo(29.5), now, 30, false)).toBe(1);
  });

  it("exempts hosts and moderators", () => {
    expect(chatWaitSeconds(secondsAgo(1), now, 30, true)).toBe(0);
  });
});
