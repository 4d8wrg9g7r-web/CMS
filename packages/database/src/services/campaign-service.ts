import { tenantDb } from "../client";
import { campaignIsActive, pledgeAmountError } from "../giving/campaigns";
import { personDisplayName } from "../people/helpers";

/**
 * Pledge campaigns (docs/domain/giving.md "Pledge campaigns"). Progress is
 * computed from the Contribution ledger — every gift to the campaign's fund
 * inside the window counts, whatever the method — so the thermometer always
 * matches the books. Pledges are one row per person per campaign, upserted.
 */

function windowFilter(campaign: { fundId: string; startsAt: Date; endsAt: Date | null }) {
  return {
    fundId: campaign.fundId,
    receivedAt: { gte: campaign.startsAt, ...(campaign.endsAt ? { lte: campaign.endsAt } : {}) },
  };
}

export interface CampaignProgress {
  raisedCents: number;
  giftCount: number;
  pledgedCents: number;
  pledgeCount: number;
}

export async function campaignProgress(
  organizationId: string,
  campaign: { id: string; fundId: string; startsAt: Date; endsAt: Date | null },
): Promise<CampaignProgress> {
  const [gifts, pledges] = await Promise.all([
    tenantDb.contribution.aggregate({
      where: { organizationId, ...windowFilter(campaign) },
      _sum: { amountCents: true },
      _count: true,
    }),
    tenantDb.pledge.aggregate({
      where: { organizationId, campaignId: campaign.id },
      _sum: { amountCents: true },
      _count: true,
    }),
  ]);
  return {
    raisedCents: gifts._sum.amountCents ?? 0,
    giftCount: gifts._count,
    pledgedCents: pledges._sum.amountCents ?? 0,
    pledgeCount: pledges._count,
  };
}

export async function listCampaigns(organizationId: string, opts: { includeArchived?: boolean } = {}) {
  const campaigns = await tenantDb.campaign.findMany({
    where: { organizationId, ...(opts.includeArchived ? {} : { archivedAt: null }) },
    include: { fund: { select: { name: true } } },
    orderBy: { startsAt: "desc" },
  });
  return Promise.all(
    campaigns.map(async (campaign) => ({ ...campaign, progress: await campaignProgress(organizationId, campaign) })),
  );
}

export async function getCampaign(organizationId: string, campaignId: string) {
  return tenantDb.campaign.findFirst({
    where: { id: campaignId, organizationId },
    include: { fund: { select: { id: true, name: true } } },
  });
}

export interface CampaignInput {
  name: string;
  fundId: string;
  description?: string | null;
  goalCents: number;
  startsAt: Date;
  endsAt?: Date | null;
  showInApp?: boolean;
}

function validateCampaignInput(input: CampaignInput) {
  if (!input.name.trim()) throw new Error("The campaign needs a name.");
  if (!Number.isInteger(input.goalCents) || input.goalCents < 100) throw new Error("Set a goal of at least $1.");
  if (Number.isNaN(input.startsAt.getTime())) throw new Error("Pick a valid start date.");
  if (input.endsAt && input.endsAt <= input.startsAt) throw new Error("The end date must be after the start.");
}

export async function createCampaign(organizationId: string, input: CampaignInput) {
  validateCampaignInput(input);
  const fund = await tenantDb.fund.findFirst({
    where: { id: input.fundId, organizationId, archivedAt: null },
    select: { id: true },
  });
  if (!fund) throw new Error("Pick a fund for the campaign.");
  return tenantDb.campaign.create({
    data: {
      organizationId,
      fundId: fund.id,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      goalCents: input.goalCents,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
      showInApp: input.showInApp ?? true,
    },
  });
}

export async function updateCampaign(organizationId: string, campaignId: string, input: CampaignInput) {
  validateCampaignInput(input);
  await tenantDb.campaign.updateMany({
    where: { id: campaignId, organizationId },
    data: {
      name: input.name.trim(),
      fundId: input.fundId,
      description: input.description?.trim() || null,
      goalCents: input.goalCents,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
      showInApp: input.showInApp ?? true,
    },
  });
}

export async function setCampaignArchived(organizationId: string, campaignId: string, archived: boolean) {
  await tenantDb.campaign.updateMany({
    where: { id: campaignId, organizationId },
    data: { archivedAt: archived ? new Date() : null },
  });
}

/** Pledge roster with per-person fulfillment (their in-window gifts to the fund). */
export async function listPledgesWithFulfillment(
  organizationId: string,
  campaign: { id: string; fundId: string; startsAt: Date; endsAt: Date | null },
) {
  const pledges = await tenantDb.pledge.findMany({
    where: { organizationId, campaignId: campaign.id },
    include: { person: { select: { id: true, firstName: true, lastName: true, preferredName: true } } },
    orderBy: { amountCents: "desc" },
  });
  if (pledges.length === 0) return [];

  const given = await tenantDb.contribution.groupBy({
    by: ["personId"],
    where: { organizationId, ...windowFilter(campaign), personId: { in: pledges.map((p) => p.personId) } },
    _sum: { amountCents: true },
  });
  const givenByPerson = new Map(given.map((g) => [g.personId, g._sum.amountCents ?? 0]));

  return pledges.map((pledge) => ({
    personId: pledge.personId,
    name: personDisplayName(pledge.person),
    amountCents: pledge.amountCents,
    givenCents: givenByPerson.get(pledge.personId) ?? 0,
    updatedAt: pledge.updatedAt,
  }));
}

/** Create or update the member's own pledge; campaign must be live. */
export async function upsertPledge(
  organizationId: string,
  campaignId: string,
  personId: string,
  amountCents: number,
) {
  const amountProblem = pledgeAmountError(amountCents);
  if (amountProblem) throw new Error(amountProblem);
  const campaign = await tenantDb.campaign.findFirst({
    where: { id: campaignId, organizationId },
    select: { id: true, startsAt: true, endsAt: true, archivedAt: true },
  });
  if (!campaign || !campaignIsActive(campaign)) throw new Error("This campaign isn't open for pledges.");

  const existing = await tenantDb.pledge.findFirst({
    where: { organizationId, campaignId, personId },
    select: { id: true },
  });
  if (existing) {
    await tenantDb.pledge.updateMany({ where: { id: existing.id, organizationId }, data: { amountCents } });
    return;
  }
  await tenantDb.pledge.create({ data: { organizationId, campaignId, personId, amountCents } });
}

export async function removePledge(organizationId: string, campaignId: string, personId: string) {
  await tenantDb.pledge.deleteMany({ where: { organizationId, campaignId, personId } });
}

export interface AppCampaign {
  id: string;
  name: string;
  description: string | null;
  fundId: string;
  fundName: string;
  goalCents: number;
  raisedCents: number;
  pledgedCents: number;
  pledgeCount: number;
  endsAt: string | null;
  myPledgeCents: number | null;
  myGivenCents: number;
}

/** Live campaigns for the app's Give tab, personalized when a member views. */
export async function listActiveCampaignsForApp(
  organizationId: string,
  viewerPersonId: string | null,
): Promise<AppCampaign[]> {
  const now = new Date();
  const campaigns = await tenantDb.campaign.findMany({
    where: {
      organizationId,
      archivedAt: null,
      showInApp: true,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gte: now } }],
    },
    include: { fund: { select: { id: true, name: true } } },
    orderBy: { startsAt: "desc" },
    take: 5,
  });

  return Promise.all(
    campaigns.map(async (campaign) => {
      const progress = await campaignProgress(organizationId, campaign);
      let myPledgeCents: number | null = null;
      let myGivenCents = 0;
      if (viewerPersonId) {
        const [pledge, myGifts] = await Promise.all([
          tenantDb.pledge.findFirst({
            where: { organizationId, campaignId: campaign.id, personId: viewerPersonId },
            select: { amountCents: true },
          }),
          tenantDb.contribution.aggregate({
            where: { organizationId, ...windowFilter(campaign), personId: viewerPersonId },
            _sum: { amountCents: true },
          }),
        ]);
        myPledgeCents = pledge?.amountCents ?? null;
        myGivenCents = myGifts._sum.amountCents ?? 0;
      }
      return {
        id: campaign.id,
        name: campaign.name,
        description: campaign.description,
        fundId: campaign.fund.id,
        fundName: campaign.fund.name,
        goalCents: campaign.goalCents,
        raisedCents: progress.raisedCents,
        pledgedCents: progress.pledgedCents,
        pledgeCount: progress.pledgeCount,
        endsAt: campaign.endsAt?.toISOString() ?? null,
        myPledgeCents,
        myGivenCents,
      };
    }),
  );
}
