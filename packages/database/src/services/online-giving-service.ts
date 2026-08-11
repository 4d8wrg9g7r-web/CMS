import { ContributionMethod } from "@prisma/client";
import { tenantDb } from "../client";

/**
 * Online giving (docs/domain/giving.md "Online giving", ADR-015): per-church
 * Stripe config plus webhook-driven contribution recording. The church's
 * Stripe keys never leave the server — the masked config is all any UI sees,
 * and nothing here is reachable from the member-facing app API except the
 * checkout redirect (which only ever returns a Stripe URL).
 */

export interface MaskedGivingConfig {
  enabled: boolean;
  currency: string;
  hasSecretKey: boolean;
  hasWebhookSecret: boolean;
  /** Last 4 of the secret key so staff can tell which key is stored. */
  secretKeyLast4: string | null;
}

/** Full config — server-side use only (checkout + webhook). Never serialize to a client. */
export async function getConfig(organizationId: string) {
  return tenantDb.onlineGivingConfig.findFirst({ where: { organizationId } });
}

export async function getMaskedConfig(organizationId: string): Promise<MaskedGivingConfig> {
  const config = await getConfig(organizationId);
  return {
    enabled: config?.enabled ?? false,
    currency: config?.currency ?? "usd",
    hasSecretKey: Boolean(config?.stripeSecretKey),
    hasWebhookSecret: Boolean(config?.stripeWebhookSecret),
    secretKeyLast4: config?.stripeSecretKey ? config.stripeSecretKey.slice(-4) : null,
  };
}

export interface SaveConfigInput {
  enabled: boolean;
  currency?: string;
  /** Empty/absent keeps the stored key; a value replaces it. */
  stripeSecretKey?: string | null;
  stripeWebhookSecret?: string | null;
}

export async function saveConfig(organizationId: string, input: SaveConfigInput) {
  const currency = (input.currency ?? "usd").trim().toLowerCase() || "usd";
  const secretKey = input.stripeSecretKey?.trim();
  if (secretKey && !secretKey.startsWith("sk_") && !secretKey.startsWith("rk_")) {
    throw new Error("That doesn't look like a Stripe secret key (sk_… or rk_…).");
  }
  const webhookSecret = input.stripeWebhookSecret?.trim();
  if (webhookSecret && !webhookSecret.startsWith("whsec_")) {
    throw new Error("That doesn't look like a Stripe webhook signing secret (whsec_…).");
  }

  const existing = await getConfig(organizationId);
  if (existing) {
    await tenantDb.onlineGivingConfig.updateMany({
      where: { id: existing.id, organizationId },
      data: {
        enabled: input.enabled,
        currency,
        ...(secretKey ? { stripeSecretKey: secretKey } : {}),
        ...(webhookSecret ? { stripeWebhookSecret: webhookSecret } : {}),
      },
    });
    return;
  }
  await tenantDb.onlineGivingConfig.create({
    data: {
      organizationId,
      enabled: input.enabled,
      currency,
      stripeSecretKey: secretKey || null,
      stripeWebhookSecret: webhookSecret || null,
    },
  });
}

/** Enabled + both keys stored = the app can offer in-app giving. */
export function isLive(config: { enabled: boolean; stripeSecretKey: string | null; stripeWebhookSecret: string | null } | null): boolean {
  return Boolean(config?.enabled && config.stripeSecretKey && config.stripeWebhookSecret);
}

export async function setFundOnline(organizationId: string, fundId: string, online: boolean) {
  await tenantDb.fund.updateMany({ where: { id: fundId, organizationId }, data: { onlineEnabled: online } });
}

export async function listOnlineFunds(organizationId: string) {
  return tenantDb.fund.findMany({
    where: { organizationId, archivedAt: null, onlineEnabled: true },
    select: { id: true, name: true, description: true },
    orderBy: { name: "asc" },
  });
}

export interface OnlineContributionInput {
  /** Stripe payment_intent / invoice id — the idempotency key. */
  externalId: string;
  amountCents: number;
  fundId: string | null;
  personId?: string | null;
  email?: string | null;
  donorName?: string | null;
  receivedAt: Date;
}

/**
 * Record a webhook-confirmed gift. Idempotent on (org, externalId) — Stripe
 * retries webhooks, and a replay must not double-record. Donor linking: an
 * explicit personId (signed-in member checkout) wins; otherwise match the
 * receipt email to a Person; otherwise keep the donor name so the row stays
 * attributable. A missing/deleted fund falls back to the first active fund —
 * money received must never be dropped on the floor.
 */
export async function recordOnlineContribution(
  organizationId: string,
  input: OnlineContributionInput,
): Promise<{ recorded: boolean; contributionId?: string }> {
  const existing = await tenantDb.contribution.findFirst({
    where: { organizationId, externalId: input.externalId },
    select: { id: true },
  });
  if (existing) return { recorded: false, contributionId: existing.id };

  let fund = input.fundId
    ? await tenantDb.fund.findFirst({ where: { id: input.fundId, organizationId }, select: { id: true } })
    : null;
  if (!fund) {
    fund = await tenantDb.fund.findFirst({
      where: { organizationId, archivedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
  }
  if (!fund) throw new Error("No fund exists to record the gift against.");

  let personId = input.personId ?? null;
  if (personId) {
    const person = await tenantDb.person.findFirst({ where: { id: personId, organizationId }, select: { id: true } });
    personId = person?.id ?? null;
  }
  if (!personId && input.email) {
    const person = await tenantDb.person.findFirst({
      where: { organizationId, archivedAt: null, email: { equals: input.email.trim().toLowerCase(), mode: "insensitive" } },
      select: { id: true },
    });
    personId = person?.id ?? null;
  }

  const created = await tenantDb.contribution.create({
    data: {
      organizationId,
      personId,
      donorName: personId ? null : (input.donorName?.trim() || null),
      fundId: fund.id,
      amountCents: input.amountCents,
      method: ContributionMethod.ONLINE,
      receivedAt: input.receivedAt,
      note: "Online gift (Stripe)",
      externalId: input.externalId,
    },
  });
  return { recorded: true, contributionId: created.id };
}

/* ---------------------------------------------------------------- *
 * Recurring gifts — a local mirror of Stripe subscriptions so the
 * app can show schedules and members can cancel, without Stripe keys
 * ever reaching a client. Stripe stays the source of truth for
 * charging; this mirror is upserted from webhooks.
 * ---------------------------------------------------------------- */

export interface RecurringGiftUpsert {
  subscriptionId: string;
  personId?: string | null;
  email?: string | null;
  fundId?: string | null;
  amountCents: number;
  interval: string;
  lastPaymentAt: Date;
}

export async function upsertRecurringGift(organizationId: string, input: RecurringGiftUpsert) {
  const existing = await tenantDb.recurringGift.findFirst({
    where: { organizationId, subscriptionId: input.subscriptionId },
    select: { id: true },
  });

  let personId = input.personId ?? null;
  if (personId) {
    const person = await tenantDb.person.findFirst({ where: { id: personId, organizationId }, select: { id: true } });
    personId = person?.id ?? null;
  }
  if (!personId && input.email) {
    const person = await tenantDb.person.findFirst({
      where: { organizationId, archivedAt: null, email: { equals: input.email.trim().toLowerCase(), mode: "insensitive" } },
      select: { id: true },
    });
    personId = person?.id ?? null;
  }
  const fund = input.fundId
    ? await tenantDb.fund.findFirst({ where: { id: input.fundId, organizationId }, select: { id: true } })
    : null;

  if (existing) {
    await tenantDb.recurringGift.updateMany({
      where: { id: existing.id, organizationId },
      data: {
        amountCents: input.amountCents,
        interval: input.interval,
        lastPaymentAt: input.lastPaymentAt,
        // A paid invoice on a "canceled" gift means it's actually alive again.
        canceledAt: null,
        ...(personId ? { personId } : {}),
        ...(input.email ? { email: input.email } : {}),
        ...(fund ? { fundId: fund.id } : {}),
      },
    });
    return;
  }
  await tenantDb.recurringGift.create({
    data: {
      organizationId,
      subscriptionId: input.subscriptionId,
      personId,
      email: input.email ?? null,
      fundId: fund?.id ?? null,
      amountCents: input.amountCents,
      interval: input.interval,
      lastPaymentAt: input.lastPaymentAt,
    },
  });
}

export async function markRecurringGiftCanceled(organizationId: string, subscriptionId: string) {
  await tenantDb.recurringGift.updateMany({
    where: { organizationId, subscriptionId },
    data: { canceledAt: new Date() },
  });
}

/** A member's active schedules — ownership is the personId link. */
export async function listRecurringGiftsForPerson(organizationId: string, personId: string) {
  return tenantDb.recurringGift.findMany({
    where: { organizationId, personId, canceledAt: null },
    include: { fund: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getRecurringGiftForPerson(organizationId: string, personId: string, subscriptionId: string) {
  return tenantDb.recurringGift.findFirst({
    where: { organizationId, personId, subscriptionId },
    select: { id: true, subscriptionId: true, canceledAt: true },
  });
}
