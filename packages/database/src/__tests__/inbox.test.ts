import { describe, expect, it } from "vitest";
import { TENANT_SCOPED_MODELS } from "../tenant-guard";

describe("inbox", () => {
  it("InboxDismissal is tenant-scoped", () => {
    expect(TENANT_SCOPED_MODELS.has("InboxDismissal")).toBe(true);
  });
});
