import { OrganizationRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { can, type FileAction } from "../authz/file-permissions";
import { buildStorageKey, sanitizeFileName } from "../files/helpers";
import { TENANT_SCOPED_MODELS } from "../tenant-guard";

describe("sanitizeFileName", () => {
  it("strips paths and unsafe characters", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("C:\\Users\\me\\notes.pdf")).toBe("notes.pdf");
    expect(sanitizeFileName("weird name (final)!.PDF")).toBe("weird-name-final-.PDF");
  });

  it("never returns an empty or dot-leading name and caps length", () => {
    expect(sanitizeFileName("")).toBe("file");
    expect(sanitizeFileName("....")).toBe("file");
    expect(sanitizeFileName(".hidden")).toBe("hidden");
    expect(sanitizeFileName("a".repeat(300)).length).toBeLessThanOrEqual(80);
  });
});

describe("buildStorageKey", () => {
  it("is tenant-prefixed and traversal-free", () => {
    const key = buildStorageKey("org_1", "u123", "../secret.pdf");
    expect(key).toBe("org_1/u123-secret.pdf");
    expect(key).not.toContain("..");
  });
});

describe("file-permissions can()", () => {
  const ALL: FileAction[] = ["file.view", "file.manage"];

  it("grants Owner/Admin and denies every other role and null", () => {
    for (const action of ALL) {
      expect(can("OWNER", action)).toBe(true);
      expect(can("ADMIN", action)).toBe(true);
      for (const role of ["CONTENT_MANAGER", "ANALYTICS_VIEWER"] as OrganizationRole[]) {
        expect(can(role, action), `${role} should be denied ${action}`).toBe(false);
      }
      expect(can(null, action)).toBe(false);
    }
  });
});

describe("tenant guard registration (files)", () => {
  it("registers File as tenant-scoped", () => {
    expect(TENANT_SCOPED_MODELS.has("File")).toBe(true);
  });
});
