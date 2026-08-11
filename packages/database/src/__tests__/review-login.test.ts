import { describe, expect, it } from "vitest";
import { isReviewLogin } from "../services/app-member-service";

const ENV = { reviewEmail: "Reviewer@Example.org", reviewCode: "review-passcode-2026" };

describe("isReviewLogin", () => {
  it("accepts the configured email + code, case-insensitive on email", () => {
    expect(isReviewLogin("reviewer@example.org", "review-passcode-2026", ENV)).toBe(true);
    expect(isReviewLogin("  REVIEWER@EXAMPLE.ORG  ", "review-passcode-2026", ENV)).toBe(true);
  });

  it("rejects a wrong code and a wrong email", () => {
    expect(isReviewLogin("reviewer@example.org", "wrong", ENV)).toBe(false);
    expect(isReviewLogin("someone.else@example.org", "review-passcode-2026", ENV)).toBe(false);
  });

  it("is fully disabled when either env var is missing", () => {
    expect(isReviewLogin("reviewer@example.org", "review-passcode-2026", { reviewEmail: null, reviewCode: "review-passcode-2026" })).toBe(false);
    expect(isReviewLogin("reviewer@example.org", "review-passcode-2026", { reviewEmail: "reviewer@example.org", reviewCode: "" })).toBe(false);
    expect(isReviewLogin("reviewer@example.org", "review-passcode-2026", {})).toBe(false);
  });

  it("refuses weak codes shorter than 8 characters", () => {
    expect(isReviewLogin("reviewer@example.org", "123456", { reviewEmail: "reviewer@example.org", reviewCode: "123456" })).toBe(false);
  });
});
