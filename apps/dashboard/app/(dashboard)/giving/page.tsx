import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, HandCoins, Lock, Plus, ReceiptText, Target } from "lucide-react";
import { formatCents, givingService } from "@cms/database";
import { Badge } from "../../../components/ui/Badge";
import { buttonClasses } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Input } from "../../../components/ui/Input";
import { GivingSectionNav } from "../../../components/GivingSectionNav";
import { canGiving } from "../../../lib/giving-access";
import { givingDate, todayInputValue } from "../../../lib/giving-format";
import { getCurrentOrganization } from "../../../lib/session";
import { createBatchAction } from "./actions";

/**
 * Giving overview (docs/design-system.md): premium financial software, not a
 * ledger dump. One hero number — this month, against last month — then the
 * year by fund, the batch workflow, and quiet section navigation. Money is
 * only ever computed from the contribution ledger.
 */
export default async function GivingPage() {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  if (!(await canGiving(organization.id, "giving.view"))) {
    return (
      <div>
        <h1 className="text-display mb-6 text-[32px] text-ink">Giving</h1>
        <Card padding="md">
          <EmptyState
            icon={<Lock size={22} />}
            title="You don't have access to Giving"
            description="Financial records are restricted to organization owners and admins."
          />
        </Card>
      </div>
    );
  }

  const now = new Date();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [summaries, monthSummaries, lastMonthSummaries, batches] = await Promise.all([
    givingService.fundSummaries(organization.id, yearStart, now),
    givingService.fundSummaries(organization.id, monthStart, now),
    givingService.fundSummaries(organization.id, lastMonthStart, monthStart),
    givingService.listBatches(organization.id, 8),
  ]);
  const ytdTotal = summaries.reduce((sum, s) => sum + s.totalCents, 0);
  const monthTotal = monthSummaries.reduce((sum, s) => sum + s.totalCents, 0);
  const lastMonthTotal = lastMonthSummaries.reduce((sum, s) => sum + s.totalCents, 0);
  const monthGiftCount = monthSummaries.reduce((sum, s) => sum + s.count, 0);
  const deltaPct = lastMonthTotal > 0 ? Math.round(((monthTotal - lastMonthTotal) / lastMonthTotal) * 100) : null;
  const maxFund = Math.max(1, ...summaries.map((s) => s.totalCents));

  return (
    <div className="mx-auto max-w-5xl">
      {/* Hero: the number that matters, said once, said big. */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6 pt-2" data-section="giving-hero">
        <div>
          <h1 className="text-display text-[32px] leading-tight text-ink">Giving</h1>
          <p className="text-metric mt-4 text-[48px] leading-none text-ink">{formatCents(monthTotal)}</p>
          <p className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-ink-secondary">
            <span>
              This month · {monthGiftCount} {monthGiftCount === 1 ? "gift" : "gifts"}
            </span>
            {deltaPct !== null && deltaPct !== 0 && (
              <span className={`inline-flex items-center gap-0.5 font-semibold ${deltaPct > 0 ? "text-success" : "text-danger"}`}>
                {deltaPct > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                {Math.abs(deltaPct)}% from last month
              </span>
            )}
            <span className="text-ink-muted">· {formatCents(ytdTotal)} this year</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 pb-1">
          <Link href="/giving/statements" className={buttonClasses("secondary", "sm")}>
            <ReceiptText size={15} /> Generate statements
          </Link>
          <Link href="/giving/campaigns" className={buttonClasses("secondary", "sm")}>
            <Target size={15} /> Create campaign
          </Link>
        </div>
      </div>

      <GivingSectionNav active="/giving" />

      <div className="mb-6 grid gap-5 lg:grid-cols-3">
        <Card padding="md" className="lg:col-span-2" data-section="giving-by-fund">
          <h2 className="mb-4 text-sm font-semibold text-ink">This year by fund</h2>
          {summaries.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No funds yet —{" "}
              <Link href="/giving/funds" className="font-medium text-accent">
                create one
              </Link>{" "}
              to start recording.
            </p>
          ) : (
            <ul className="space-y-4 text-sm">
              {summaries.map((s) => (
                <li key={s.fund.id}>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-ink">{s.fund.name}</span>
                      {!s.fund.taxDeductible && <Badge variant="warning">Not tax-deductible</Badge>}
                      {s.fund.archivedAt && <Badge variant="neutral">Archived</Badge>}
                    </span>
                    <span className="text-metric text-[15px] text-ink">
                      {formatCents(s.totalCents)} <span className="text-xs font-normal text-ink-muted">· {s.count} gifts</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                    <div className="h-full rounded-full bg-accent/70" style={{ width: `${Math.round((s.totalCents / maxFund) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="md" className="h-fit">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <Plus size={15} /> New batch
          </h2>
          <p className="mb-3 text-xs text-ink-muted">
            A batch is one counting session — Sunday offering, a scanner run. Enter the counted total to reconcile
            against as you go.
          </p>
          <form action={createBatchAction} className="flex flex-col gap-3">
            <label className="text-sm text-ink-secondary">
              Name
              <Input name="name" required placeholder="Sunday offering" className="mt-1 block w-full" />
            </label>
            <label className="text-sm text-ink-secondary">
              Date
              <Input name="batchDate" type="date" defaultValue={todayInputValue()} className="mt-1 block w-full" />
            </label>
            <label className="text-sm text-ink-secondary">
              Counted total <span className="text-ink-muted">(optional)</span>
              <Input name="expected" placeholder="2,450.00" className="mt-1 block w-full" />
            </label>
            <button type="submit" className={buttonClasses("primary", "md")}>
              <HandCoins size={15} /> Start batch
            </button>
          </form>
        </Card>
      </div>

      <Card padding="none">
        <h2 className="px-6 pb-1 pt-5 text-sm font-semibold text-ink">Recent batches</h2>
        {batches.length === 0 ? (
          <p className="px-6 pb-5 pt-2 text-sm text-ink-muted">No batches yet — start one to record Sunday&rsquo;s offering.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {batches.map((batch) => (
              <li key={batch.id}>
                <Link
                  href={`/giving/batches/${batch.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-6 py-3 transition-colors duration-180 hover:bg-surface-muted"
                >
                  <span className="flex items-center gap-2.5">
                    <span className="font-medium text-ink">{batch.name}</span>
                    <Badge variant={batch.status === "OPEN" ? "info" : "success"}>
                      {batch.status === "OPEN" ? "Open" : "Closed"}
                    </Badge>
                  </span>
                  <span className="text-ink-secondary">
                    {givingDate(batch.batchDate)} · {batch._count.contributions} entries ·{" "}
                    <span className="text-metric text-ink">{formatCents(batch.totalCents)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
