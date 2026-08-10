import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalStorageProvider } from "../LocalStorageProvider";

describe("LocalStorageProvider", () => {
  let publicDir: string;

  beforeEach(async () => {
    publicDir = await mkdtemp(path.join(os.tmpdir(), "cms-storage-test-"));
  });

  afterEach(async () => {
    await rm(publicDir, { recursive: true, force: true });
  });

  it("writes the file under uploads/<organizationId>/ and returns a matching URL", async () => {
    const provider = new LocalStorageProvider(publicDir);
    const data = Buffer.from("fake-png-bytes");

    const result = await provider.saveFile({
      organizationId: "org_123",
      fileName: "logo.png",
      contentType: "image/png",
      data,
    });

    expect(result.url).toMatch(/^\/uploads\/org_123\/[a-f0-9-]+\.png$/);

    const savedPath = path.join(publicDir, result.url);
    const savedBytes = await readFile(savedPath);
    expect(savedBytes.equals(data)).toBe(true);
  });

  it("generates a unique file name per call so re-uploads never collide", async () => {
    const provider = new LocalStorageProvider(publicDir);
    const input = { organizationId: "org_123", fileName: "logo.png", contentType: "image/png", data: Buffer.from("a") };

    const first = await provider.saveFile(input);
    const second = await provider.saveFile(input);

    expect(first.url).not.toBe(second.url);
  });
});
