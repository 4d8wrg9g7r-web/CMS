import { afterEach, describe, expect, it, vi } from "vitest";
import { S3PrivateStorageProvider, s3ConfigFromEnv } from "../S3PrivateStorageProvider";

const CONFIG = {
  endpoint: "https://acct.r2.cloudflarestorage.com",
  bucket: "cms-private",
  region: "auto",
  accessKeyId: "AKIA_TEST",
  secretAccessKey: "secret",
};

function mockFetch(status: number, body = "") {
  const impl = vi.fn(async () => new Response(body, { status }));
  vi.stubGlobal("fetch", impl);
  return impl;
}

afterEach(() => vi.unstubAllGlobals());

describe("S3PrivateStorageProvider", () => {
  it("PUTs to the path-style bucket URL with signed headers and payload hash", async () => {
    const fetchMock = mockFetch(200);
    await new S3PrivateStorageProvider(CONFIG).put("org1/files/a.pdf", Buffer.from("hello"));
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [URL, RequestInit];
    expect(String(url)).toBe("https://acct.r2.cloudflarestorage.com/cms-private/org1/files/a.pdf");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIA_TEST\/\d{8}\/auto\/s3\/aws4_request/);
    expect(headers["x-amz-content-sha256"]).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824", // sha256("hello")
    );
  });

  it("returns null for missing objects and bytes for found ones", async () => {
    mockFetch(404);
    const provider = new S3PrivateStorageProvider(CONFIG);
    expect(await provider.get("org1/missing.bin")).toBeNull();

    mockFetch(200, "file-bytes");
    expect((await provider.get("org1/found.bin"))!.toString()).toBe("file-bytes");
  });

  it("throws on non-404 failures and tolerates delete of missing keys", async () => {
    mockFetch(403, "AccessDenied");
    const provider = new S3PrivateStorageProvider(CONFIG);
    await expect(provider.put("org1/a.bin", Buffer.from("x"))).rejects.toThrow(/S3 put failed \(403\)/);

    mockFetch(404);
    await expect(provider.delete("org1/gone.bin")).resolves.toBeUndefined();
  });

  it("rejects unsafe keys before any request is made", async () => {
    const fetchMock = mockFetch(200);
    const provider = new S3PrivateStorageProvider(CONFIG);
    await expect(provider.get("../../etc/passwd")).rejects.toThrow(/Unsafe storage key/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("s3ConfigFromEnv", () => {
  it("requires the full variable set and defaults region to auto", () => {
    expect(s3ConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
    expect(
      s3ConfigFromEnv({ STORAGE_S3_ENDPOINT: "https://x", STORAGE_S3_BUCKET: "b" } as NodeJS.ProcessEnv),
    ).toBeNull();
    const full = s3ConfigFromEnv({
      STORAGE_S3_ENDPOINT: "https://x",
      STORAGE_S3_BUCKET: "b",
      STORAGE_S3_ACCESS_KEY_ID: "k",
      STORAGE_S3_SECRET_ACCESS_KEY: "s",
    } as NodeJS.ProcessEnv);
    expect(full).toMatchObject({ region: "auto", bucket: "b" });
  });
});
