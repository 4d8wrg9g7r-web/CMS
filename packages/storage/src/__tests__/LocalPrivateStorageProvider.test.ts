import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { LocalPrivateStorageProvider, sanitizeStorageKey } from "../PrivateStorageProvider";

const baseDir = mkdtempSync(path.join(tmpdir(), "cms-private-"));
const provider = new LocalPrivateStorageProvider(baseDir);

afterAll(() => rmSync(baseDir, { recursive: true, force: true }));

describe("LocalPrivateStorageProvider", () => {
  it("round-trips bytes and returns null for missing keys", async () => {
    await provider.put("org_1/abc-file.pdf", Buffer.from("hello"));
    expect((await provider.get("org_1/abc-file.pdf"))?.toString()).toBe("hello");
    expect(await provider.get("org_1/nope.pdf")).toBeNull();
  });

  it("deletes idempotently", async () => {
    await provider.put("org_1/gone.txt", Buffer.from("x"));
    await provider.delete("org_1/gone.txt");
    await provider.delete("org_1/gone.txt"); // second delete is a no-op
    expect(await provider.get("org_1/gone.txt")).toBeNull();
  });

  it("rejects traversal and unsafe keys", async () => {
    await expect(provider.get("../outside")).rejects.toThrow(/Unsafe|escapes/);
    await expect(provider.put("org_1/../../etc/passwd", Buffer.from("x"))).rejects.toThrow(/Unsafe|escapes/);
    expect(() => sanitizeStorageKey("")).toThrow();
    expect(() => sanitizeStorageKey("a/b.c-d_e/f.txt")).not.toThrow(); // dots inside a segment are fine...
    expect(() => sanitizeStorageKey("a/../c")).toThrow(); // ...but anything containing ".." is not
    expect(() => sanitizeStorageKey("a/..b../c")).toThrow();
  });
});
