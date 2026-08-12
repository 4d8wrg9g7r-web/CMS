import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Target, Trash2, Undo2, UserPlus, X } from "lucide-react";
import {
  campaignPercent,
  campaignService,
  formatCents,
  peopleService,
  personDisplayName,
} from "@cms/database";
import { Badge } from "../../../../../components/ui/Badge";
import { buttonClasses } from "../../../../../components/ui/Button";
import { Card } from "../../../../../components/ui/Card";
import { Input, Select } from "../../../../../components/ui/Input";
import { canGiving } from "../../../../../lib/giving-access";
import { getCurrentOrganization } from "../../../../../lib/session";
import { removePledgeAction, setCampaignArchivedAction, staffUpsertPledgeAction } from "../../actions";

/** One campaign: thermometer, pledge roster with fulfillment, staff pledge entry. */
export default async function CampaignDetailPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const organization = await getCurrentOrganization();
  if (!organization) return null;
  if (!(await canGiving(organization.id, "giving.view"))) return null;
  const canManage = await canGiving(organization.id, "giving.manage_funds");

  const { campaignId } = await params;
  const campaign = await campaignService.getCampaign(organization.id, campaignId);
  if (!campaign) notFound();

  const [progress, pledges, allPeople] = await Promise.all([
    campaignService.campaignProgress(organization.id, campaign),
    campaignService.listPledgesWithFulfillment(organization.id, campaign),
    canManage ? peopleService.listPeople(organization.id, { take: 200 }) : Promise.resolve([]),
  ]);
  const pct = campaignPercent(progress.raisedCents, campaign.goalCents);
  const pledgedPct = campaignPercent(progress.pledgedCents, campaign.goalCents);
  const pledgedIds = new Set(pledges.map((p) => p.personId));

  const dateRange = `${new Date(campaign.startsAt).toLocaleDateString()} – ${
    campaign.endsAt ? new Date(campaign.endsAt).toLocaleDateString() : "open-ended"
  }`;

  return (
    <div>
      <Link
        href="/giving/campaigns"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink"
      >
        <ArrowLeft size={15} /> Back to Campaigns
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-display text-[28px] leading-tight text-ink">{campaign.name}</h1>
        <Badge variant="info">{campaign.fund.name}</Badge>
        {campaign.archivedAt && <Badge variant="warning">Archived</Badge>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* The campaign presentation: one big honest thermometer — the ledger, drawn large. */}
          <Card padding="none" data-section="campaign-progress" className="p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">{campaign.fund.name}</p>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-3">
              <p className="text-metric text-[44px] leading-none text-ink">{formatCents(progress.raisedCents)}</p>
              <p className="text-[15px] text-ink-secondary">of {formatCents(campaign.goalCents)}</p>
            </div>
            <div className="mt-5 h-3 w-full overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-ink-secondary">
              <span className="font-semibold text-ink">{pct}% of goal</span>
              <span>
                {progress.giftCount} gifts · {formatCents(progress.pledgedCents)} pledged ({pledgedPct}%) by{" "}
                {progress.pledgeCount} {progress.pledgeCount === 1 ? "person" : "people"}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-ink-muted">{dateRange}</p>
            {campaign.description && <p className="mt-3 text-sm text-ink-secondary">{campaign.description}</p>}
          </Card>

          <Card padding="md" data-section="campaign-pledges">
            <h2 className="mb-3 text-sm font-semibold text-ink">Pledges ({pledges.length})</h2>
            {pledges.length === 0 ? (
              <p className="text-sm text-ink-muted">No pledges yet — members can pledge from the app.</p>
            ) : (
              <ul className="divide-y divide-border">
                {pledges.map((pledge) => {
                  const fulfillment = campaignPercent(pledge.givenCents, pledge.amountCents);
                  return (
                    <li key={pledge.personId} className="flex items-center gap-3 py-2.5">
                      <Link
                        href={`/people/${pledge.personId}`}
                        className="w-44 shrink-0 truncate text-sm font-medium text-ink hover:text-accent"
                      >
                        {pledge.name}
                      </Link>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${fulfillment}%` }} />
                      </div>
                      <span className="w-40 shrink-0 text-right text-xs text-ink-secondary">
                        {formatCents(pledge.givenCents)} of {formatCents(pledge.amountCents)} · {fulfillment}%
                      </span>
                      {canManage && (
                        <form action={removePledgeAction.bind(null, campaign.id, pledge.personId)}>
                          <button
                            type="submit"
                            aria-label={`Remove ${pledge.name}'s pledge`}
                            className="rounded-sm p-1 text-ink-muted hover:bg-surface-muted hover:text-danger"
                          >
                            <X size={13} />
                          </button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {canManage && (
              <form
                action={staffUpsertPledgeAction.bind(null, campaign.id)}
                className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4"
              >
                <label className="text-xs text-ink-secondary">
                  Record a pledge
                  <Select name="personId" required defaultValue="" className="mt-1 block w-56 text-sm">
                    <option value="" disabled>
                      Choose a person…
                    </option>
                    {allPeople
                      .filter((p) => !pledgedIds.has(p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {personDisplayName(p)}
                        </option>
                      ))}
                  </Select>
                </label>
                <label className="text-xs text-ink-secondary">
                  Amount
                  <Input name="amount" required placeholder="5,000" className="mt-1 block w-28 text-sm" />
                </label>
                <button type="submit" className={buttonClasses("secondary", "sm")}>
                  <UserPlus size={14} /> Record
                </button>
              </form>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card padding="md">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
              <Target size={15} /> About
            </h2>
            <dl className="space-y-2 text-sm text-ink">
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-muted">Window</dt>
                <dd>{dateRange}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-muted">In the app</dt>
                <dd>{campaign.showInApp ? "Progress card + pledge form on the Give tab" : "Hidden"}</dd>
              </div>
            </dl>
          </Card>

          {canManage && (
            <Card padding="md">
              <h2 className="mb-2 text-sm font-semibold text-ink">Status</h2>
              {campaign.archivedAt ? (
                <form action={setCampaignArchivedAction.bind(null, campaign.id, false)}>
                  <button type="submit" className={buttonClasses("secondary", "sm") + " w-full"}>
                    <Undo2 size={14} /> Restore campaign
                  </button>
                </form>
              ) : (
                <>
                  <p className="mb-3 text-xs text-ink-muted">
                    Archiving hides the campaign everywhere; pledges and history are preserved.
                  </p>
                  <form action={setCampaignArchivedAction.bind(null, campaign.id, true)}>
                    <button type="submit" className={buttonClasses("danger", "sm") + " w-full"}>
                      <Trash2 size={14} /> Archive campaign
                    </button>
                  </form>
                </>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
