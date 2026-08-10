import Link from "next/link";
import { HandCoins, Landmark, Lock, Plus, ReceiptText } from "lucide-react";
import { formatCents, givingService } from "@cms/database";
import { Badge } from "../../../components/ui/Badge";
import { buttonClasses } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Input } from "../../../components/ui/Input";
import { canGiving } from "../../../lib/giving-access";
import { givingDate, todayInputValue } from "../../../lib/giving-format";
import { getCurrentOrganization } from "../../../lib/session";
import { createBatchAction } from "./actions";

export default async function GivingPage() {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  if (!(await canGiving(organization.id, "giving.view"))) {
    return (
      <div>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-ink">Giving</h1>
        <Card padding="md" className="mt-6">
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
  const [summaries, batches] = await Promise.all([
    givingService.fundSummaries(organization.id, yearStart, now),
    givingService.listBatches(organization.id, 12),
  ]);
  const ytdTotal = summaries.reduce((sum, s) => sum + s.totalCents, 0);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="mb-1 text-2xl font-semibold tracking-tight text-ink">Giving</h1>
          <p className="text-sm text-ink-secondary">
            Record cash, checks, and scanner batches. Online giving comes later via a payment processor — no card
            data ever lives here.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/giving/funds" className={buttonClasses("secondary", "sm")}>
            <Landmark size={15} /> Funds
          </Link>
          <Link href="/giving/statements" className={buttonClasses("secondary", "sm")}>
            <ReceiptText size={15} /> Statements
          </Link>
        </div>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card padding="md" className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-ink">This year by fund</h2>
          {summaries.length === 0 ? (
            <p className="text-sm text-ink-muted">No funds yet — create one under Funds to start recording.</p>
          ) : (
            <>
              <p className="mb-3 text-2xl font-bold text-ink">{formatCents(ytdTotal)}</p>
              <ul className="divide-y divide-border text-sm">
                {summaries.map((s) => (
                  <li key={s.fund.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-ink">{s.fund.name}</span>
                      {!s.fund.taxDeductible && <Badge variant="warning">Not tax-deductible</Badge>}
                      {s.fund.archivedAt && <Badge variant="neutral">Archived</Badge>}
                    </span>
                    <span className="text-ink-secondary">
                      {formatCents(s.totalCents)} <span className="text-xs text-ink-muted">· {s.count} gifts</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card padding="md">
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

      <Card padding="md">
        <h2 className="mb-3 text-sm font-semibold text-ink">Recent batches</h2>
        {batches.length === 0 ? (
          <p className="text-sm text-ink-muted">No batches yet.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {batches.map((batch) => (
              <li key={batch.id}>
                <Link
                  href={`/giving/batches/${batch.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 hover:bg-surface-muted"
                >
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-ink">{batch.name}</span>
                    <Badge variant={batch.status === "OPEN" ? "info" : "success"}>
                      {batch.status === "OPEN" ? "Open" : "Closed"}
                    </Badge>
                  </span>
                  <span className="text-ink-secondary">
                    {givingDate(batch.batchDate)} · {batch._count.contributions} entries ·{" "}
                    {formatCents(batch.totalCents)}
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
