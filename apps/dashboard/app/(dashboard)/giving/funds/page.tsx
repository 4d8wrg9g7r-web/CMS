import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { givingService } from "@cms/database";
import { Badge } from "../../../../components/ui/Badge";
import { buttonClasses } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { Input } from "../../../../components/ui/Input";
import { canGiving } from "../../../../lib/giving-access";
import { getCurrentOrganization } from "../../../../lib/session";
import { createFundAction, setFundArchivedAction } from "../actions";

export default async function FundsPage() {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  if (!(await canGiving(organization.id, "giving.manage_funds"))) {
    return (
      <Card padding="md" className="mt-6">
        <EmptyState icon={<Lock size={22} />} title="You don't have access to Giving" description="" />
      </Card>
    );
  }

  const funds = await givingService.listFunds(organization.id, { includeArchived: true });

  return (
    <div>
      <Link href="/giving" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
        <ArrowLeft size={14} /> Back to Giving
      </Link>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-ink">Funds</h1>
      <p className="mb-6 text-sm text-ink-secondary">
        Where money is designated. Uncheck &ldquo;tax-deductible&rdquo; for payments for goods and services — book
        sales, trip fees, event payments — so they stay off year-end giving statements.
      </p>

      <Card padding="md" className="mb-6">
        <form action={createFundAction} className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-ink-secondary">
            Name
            <Input name="name" required placeholder="General" className="mt-1 w-52" />
          </label>
          <label className="text-sm text-ink-secondary">
            Description <span className="text-ink-muted">(optional)</span>
            <Input name="description" className="mt-1 w-72" />
          </label>
          <label className="flex h-11 items-center gap-2 text-sm text-ink-secondary">
            <input type="checkbox" name="taxDeductible" defaultChecked /> Tax-deductible
          </label>
          <button type="submit" className={buttonClasses("primary", "sm")}>
            Add fund
          </button>
        </form>
        <p className="mt-2 text-xs text-ink-muted">
          A fund&rsquo;s tax treatment can&rsquo;t be changed later — that would rewrite the tax character of past
          gifts. Archive it and create a new fund instead.
        </p>
      </Card>

      <Card padding="md">
        {funds.length === 0 ? (
          <p className="text-sm text-ink-muted">No funds yet. Most churches start with General and Missions.</p>
        ) : (
          <ul className="divide-y divide-border">
            {funds.map((fund) => (
              <li key={fund.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <span className={fund.archivedAt ? "text-ink-muted line-through" : "font-medium text-ink"}>
                    {fund.name}
                  </span>
                  {!fund.taxDeductible && <Badge variant="warning">Not tax-deductible</Badge>}
                  {fund.description && <span className="text-xs text-ink-muted">{fund.description}</span>}
                </div>
                <form action={setFundArchivedAction.bind(null, fund.id, !fund.archivedAt)}>
                  <button type="submit" className={buttonClasses("ghost", "sm")}>
                    {fund.archivedAt ? "Restore" : "Archive"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
