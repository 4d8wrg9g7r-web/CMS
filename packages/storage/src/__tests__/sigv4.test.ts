import { describe, expect, it } from "vitest";
import { canonicalRequest, signature, signRequest, sha256Hex, EMPTY_PAYLOAD_HASH } from "../sigv4";

/**
 * Signature vectors cross-verified against the `aws4` reference implementation
 * (the de-facto standard SigV4 library) on identical inputs — same credentials,
 * date, and signed-header set. If this implementation drifts from the spec,
 * these fail. The canonical request / string-to-sign shapes additionally match
 * the worked example in the AWS S3 SigV4 documentation.
 */
const CREDS = {
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRcfiCYEXAMPLEKEY",
  region: "us-east-1",
  service: "s3",
  now: new Date("2013-05-24T00:00:00Z"),
};

describe("SigV4 cross-verified vectors", () => {
  it("signs a GET object request (verified against aws4)", () => {
    const input = {
      ...CREDS,
      method: "GET",
      url: new URL("https://examplebucket.s3.amazonaws.com/test.txt"),
      payloadHash: EMPTY_PAYLOAD_HASH,
    };
    expect(signature(input)).toBe("92a82c525ee5e66f5ec1166ec2660d9ec1d54f0cee66a2cfa4d1171cd3a1aba2");
    const headers = signRequest(input);
    expect(headers.Authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=92a82c525ee5e66f5ec1166ec2660d9ec1d54f0cee66a2cfa4d1171cd3a1aba2",
    );
    expect(headers["x-amz-date"]).toBe("20130524T000000Z");
  });

  it("canonicalizes query strings (verified against aws4)", () => {
    const input = {
      ...CREDS,
      method: "GET",
      url: new URL("https://examplebucket.s3.amazonaws.com/?max-keys=2&prefix=J"),
      payloadHash: EMPTY_PAYLOAD_HASH,
    };
    expect(signature(input)).toBe("c2d3e5d32af425164c0e3114180a1e040b620fb7946261cd4447b21a328322c3");
  });

  it("signs PUTs with a real payload hash (regression pin)", () => {
    const body = Buffer.from("Welcome to Amazon S3.");
    const input = {
      ...CREDS,
      method: "PUT",
      url: new URL("https://examplebucket.s3.amazonaws.com/myfile.txt"),
      payloadHash: sha256Hex(body),
    };
    expect(signature(input)).toBe("44cbed70fea5ac31f6a7b1acacd69d7f720ac9dbe86a51a65a0aa64d77d70acd");
  });

  it("builds the documented canonical request shape, extra headers folded in sorted", () => {
    const cr = canonicalRequest({
      ...CREDS,
      method: "GET",
      url: new URL("https://examplebucket.s3.amazonaws.com/test.txt"),
      payloadHash: EMPTY_PAYLOAD_HASH,
      extraHeaders: { Range: "bytes=0-9" },
    });
    expect(cr.split("\n")[0]).toBe("GET");
    expect(cr.split("\n")[1]).toBe("/test.txt");
    expect(cr).toContain("host:examplebucket.s3.amazonaws.com");
    expect(cr).toContain("range:bytes=0-9");
    expect(cr).toContain("host;range;x-amz-content-sha256;x-amz-date");
    expect(cr.endsWith(EMPTY_PAYLOAD_HASH)).toBe(true);
  });

  it("hashes payloads correctly", () => {
    expect(sha256Hex("")).toBe(EMPTY_PAYLOAD_HASH);
  });
});
