import { OrganizationRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { can } from "../authz/developer-permissions";
import {
  API_KEY_PREFIX,
  generateApiKey,
  generateWebhookSecret,
  hashApiKey,
  signWebhookPayload,
  verifyWebhookSignature,
} from "../developer/helpers";
import { TENANT_SCOPED_MODELS } from "../tenant-guard";

describe("API key generation & hashing", () => {
  it("mints cms_-prefixed keys whose stored hash is stable and plaintext-free", async () => {
    const { key, hash, prefix } = await generateApiKey();
    expect(key.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(key.length).toBeGreaterThan(40);
    expect(prefix.endsWith("…")).toBe(true);
    expect(hash).toBe(await hashApiKey(key));
    expect(hash).not.toContain(key);
    const second = await generateApiKey();
    expect(second.key).not.toBe(key);
  });
});

describe("webhook signing", () => {
  it("signs and verifies a payload; tampering or wrong secret fails", async () => {
    const secret = generateWebhookSecret();
    const body = JSON.stringify({ type: "PersonCreated", data: { personId: "p1" } });
    const header = await signWebhookPayload(secret, "1723100000", body);
    expect(header).toMatch(/^t=1723100000,v1=[0-9a-f]{64}$/);
    expect(await verifyWebhookSignature(secret, header, body)).toBe(true);
    expect(await verifyWebhookSignature(secret, header, body + "x")).toBe(false);
    expect(await verifyWebhookSignature(generateWebhookSecret(), header, body)).toBe(false);
    expect(await verifyWebhookSignature(secret, "malformed", body)).toBe(false);
  });
});

describe("developer-permissions can()", () => {
  it("grants Owner/Admin api.manage and denies every other role and null", () => {
    expect(can("OWNER", "api.manage")).toBe(true);
    expect(can("ADMIN", "api.manage")).toBe(true);
    for (const role of ["CONTENT_MANAGER", "ANALYTICS_VIEWER"] as OrganizationRole[]) {
      expect(can(role, "api.manage"), role).toBe(false);
    }
    expect(can(null, "api.manage")).toBe(false);
  });
});

describe("tenant guard registration (developer platform)", () => {
  it("registers ApiKey, WebhookSubscription, and WebhookDelivery as tenant-scoped", () => {
    for (const model of ["ApiKey", "WebhookSubscription", "WebhookDelivery"]) {
      expect(TENANT_SCOPED_MODELS.has(model), model).toBe(true);
    }
  });
});
