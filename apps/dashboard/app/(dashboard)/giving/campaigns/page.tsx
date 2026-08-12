import Link from "next/link";
import { ArrowLeft, Lock, Target } from "lucide-react";
import { campaignService, formatCents, givingService } from "@cms/database";
import { campaignPercent } from "@cms/database";
import { Badge } from "../../../../components/ui/Badge";
import { GivingSectionNav } from "../../../../components/GivingSectionNav";
import { buttonClasses } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { Input, Select, Textarea } from "../../../../components/ui/Input";
import { canGiving } from "../../../../lib/giving-access";
import { todayInputValue } from "../../../../lib/giving-format";
import { getCurrentOrganization } from "../../../../lib/session";
import { createCampaignAction } from "../actions";

/** Pledge campaigns (docs/domain/giving.md): goals, windows, thermometers. */
export default async function CampaignsPage() {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  if (!(await canGiving(organization.id, "giving.view"))) {
    return (
      <Card padding="md" className="mt-6">
        <EmptyState icon={<Lock size={22} />} title="You don't have access to Giving" description="" />
      </Card>
    );
  }
  const canManage = await canGiving(organization.id, "giving.manage_funds");

  const [campaigns, funds] = await Promise.all([
    campaignService.listCampaigns(organization.id, { includeArchived: true }),
    givingService.listFunds(organization.id),
  ]);

  return (
    <div>
      <h1 className="text-display mb-1 text-[28px] leading-tight text-ink">Campaigns</h1>
      <p className="mb-5 text-sm text-ink-secondary">
        A goal, a fund, and a window. Every gift to the fund in the window counts toward the thermometer —
        Sunday checks and app gifts alike — and members can pledge from the church app.
      </p>

      <GivingSectionNav active="/giving/campaigns" />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 flex flex-col gap-4">
          {campaigns.length === 0 ? (
            <Card padding="md">
              <p className="text-sm text-ink-muted">No campaigns yet — start one to the right.</p>
            </Card>
          ) : (
            campaigns.map((campaign) => {
              const pct = campaignPercent(campaign.progress.raisedCents, campaign.goalCents);
              return (
                <Link key={campaign.id} href={`/giving/campaigns/${campaign.id}`}>
                  <Card padding="md" interactive>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                        <Target size={15} /> {campaign.name}
                      </h2>
                      <Badge variant="info">{campaign.fund.name}</Badge>
                      {campaign.archivedAt && <Badge variant="warning">Archived</Badge>}
                      {!campaign.showInApp && !campaign.archivedAt && <Badge>Hidden in app</Badge>}
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-muted">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1.5 text-xs text-ink-secondary">
                      <span className="font-semibold text-ink">{formatCents(campaign.progress.raisedCents)}</span> of{" "}
                      {formatCents(campaign.goalCents)} ({pct}%) · {formatCents(campaign.progress.pledgedCents)} pledged
                      by {campaign.progress.pledgeCount}
                    </p>
                  </Card>
                </Link>
              );
            })
          )}
        </div>

        {canManage && (
          <Card padding="md">
            <h2 className="mb-3 text-sm font-semibold text-ink">New campaign</h2>
            <form action={createCampaignAction} className="flex flex-col gap-3">
              <label className="text-sm text-ink-secondary">
                Name
                <Input name="name" required placeholder="Building Fund 2027" className="mt-1 block w-full" />
              </label>
              <label className="text-sm text-ink-secondary">
                Fund
                <Select name="fundId" required defaultValue="" className="mt-1 block w-full">
                  <option value="" disabled>
                    Choose a fund…
                  </option>
                  {funds
                    .filter((f) => !f.archivedAt)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                </Select>
              </label>
              <label className="text-sm text-ink-secondary">
                Goal
                <Input name="goal" required placeholder="500,000" className="mt-1 block w-full" />
              </label>
              <div className="flex gap-2">
                <label className="flex-1 text-sm text-ink-secondary">
                  Starts
                  <Input name="startsAt" type="date" defaultValue={todayInputValue()} className="mt-1 block w-full" />
                </label>
                <label className="flex-1 text-sm text-ink-secondary">
                  Ends <span className="text-ink-muted">(optional)</span>
                  <Input name="endsAt" type="date" className="mt-1 block w-full" />
                </label>
              </div>
              <label className="text-sm text-ink-secondary">
                Description <span className="text-ink-muted">(optional)</span>
                <Textarea name="description" rows={2} className="mt-1 block w-full" />
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="showInApp" defaultChecked className="h-4 w-4" />
                Show in the church app
              </label>
              <button type="submit" className={buttonClasses("primary", "md")}>
                <Target size={15} /> Start campaign
              </button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
