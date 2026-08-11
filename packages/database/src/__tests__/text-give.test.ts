import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  matchFundByKeyword,
  normalizePhone,
  parseTextGift,
  TEXT_GIVE_HELP,
  twimlReply,
  verifyTwilioSignature,
} from "../giving/text-give";

describe("parseTextGift", () => {
  it("parses bare and decorated amounts", () => {
    expect(parseTextGift("50")).toEqual({ ok: true, gift: { amountCents: 5000, fundKeyword: null } });
    expect(parseTextGift("$50")).toEqual({ ok: true, gift: { amountCents: 5000, fundKeyword: null } });
    expect(parseTextGift(" give 25.50 ")).toEqual({ ok: true, gift: { amountCents: 2550, fundKeyword: null } });
    expect(parseTextGift("GIVE $100")).toEqual({ ok: true, gift: { amountCents: 10000, fundKeyword: null } });
  });

  it("captures a trailing fund keyword", () => {
    expect(parseTextGift("50 missions")).toEqual({ ok: true, gift: { amountCents: 5000, fundKeyword: "missions" } });
    expect(parseTextGift("give $100 Building   Fund")).toEqual({
      ok: true,
      gift: { amountCents: 10000, fundKeyword: "building fund" },
    });
  });

  it("replies with help for non-gifts and bad amounts", () => {
    expect(parseTextGift("hello")).toEqual({ ok: false, reply: TEXT_GIVE_HELP });
    expect(parseTextGift("help")).toEqual({ ok: false, reply: TEXT_GIVE_HELP });
    expect(parseTextGift("")).toEqual({ ok: false, reply: TEXT_GIVE_HELP });
    const tiny = parseTextGift("0.50");
    expect(tiny.ok).toBe(false);
    if (!tiny.ok) expect(tiny.reply).toContain("minimum");
    const huge = parseTextGift("999999");
    expect(huge.ok).toBe(false);
  });
});

describe("matchFundByKeyword", () => {
  const funds = [
    { id: "f1", name: "General" },
    { id: "f2", name: "Missions" },
    { id: "f3", name: "Building Fund" },
  ];

  it("defaults to the first fund without a keyword", () => {
    expect(matchFundByKeyword(funds, null)?.id).toBe("f1");
  });

  it("matches exact, prefix, then substring, else falls back", () => {
    expect(matchFundByKeyword(funds, "missions")?.id).toBe("f2");
    expect(matchFundByKeyword(funds, "build")?.id).toBe("f3");
    expect(matchFundByKeyword(funds, "fund")?.id).toBe("f3");
    expect(matchFundByKeyword(funds, "youth trip")?.id).toBe("f1");
    expect(matchFundByKeyword([], "missions")).toBeNull();
  });
});

describe("normalizePhone", () => {
  it("compares across formats via last 10 digits", () => {
    expect(normalizePhone("+1 (555) 123-4567")).toBe("5551234567");
    expect(normalizePhone("555.123.4567")).toBe("5551234567");
    expect(normalizePhone("15551234567")).toBe("5551234567");
  });
});

describe("verifyTwilioSignature", () => {
  const url = "https://church.example/api/giving/text/app_1";
  const params = { From: "+15551234567", Body: "50 missions", To: "+15559990000" };
  const token = "twilio_auth_token_test";
  const sign = (u: string, p: Record<string, string>, t: string) =>
    createHmac("sha1", t)
      .update(Buffer.from(u + Object.keys(p).sort().map((k) => k + p[k]).join(""), "utf8"))
      .digest("base64");

  it("accepts Twilio's documented scheme", () => {
    expect(verifyTwilioSignature(url, params, sign(url, params, token), token)).toBe(true);
  });

  it("rejects a wrong token, tampered params, wrong URL, and missing signature", () => {
    expect(verifyTwilioSignature(url, params, sign(url, params, "other_token"), token)).toBe(false);
    expect(verifyTwilioSignature(url, { ...params, Body: "5000" }, sign(url, params, token), token)).toBe(false);
    expect(verifyTwilioSignature("https://evil.example/x", params, sign(url, params, token), token)).toBe(false);
    expect(verifyTwilioSignature(url, params, "", token)).toBe(false);
  });
});

describe("twimlReply", () => {
  it("wraps and escapes the message", () => {
    const out = twimlReply('Give $50 <now> & "rejoice"');
    expect(out).toContain("<Response><Message>");
    expect(out).toContain("&lt;now&gt; &amp;");
    expect(out).not.toContain("<now>");
  });
});
