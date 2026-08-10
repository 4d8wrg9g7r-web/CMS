import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, Plus, Trash2 } from "lucide-react";
import { formatCents, givingService, peopleService, personDisplayName } from "@cms/database";
import { GivingImportForm } from "../../../../../components/GivingImportForm";
import { Badge } from "../../../../../components/ui/Badge";
import { buttonClasses } from "../../../../../components/ui/Button";
import { Card } from "../../../../../components/ui/Card";
import { EmptyState } from "../../../../../components/ui/EmptyState";
import { Input, Select } from "../../../../../components/ui/Input";
import { canGiving } from "../../../../../lib/giving-access";
import {
  CONTRIBUTION_METHOD_OPTIONS,
  contributionMethodLabel,
  givingDate,
} from "../../../../../lib/giving-format";
import { getCurrentOrganization } from "../../../../../lib/session";
import {
  deleteContributionAction,
  importContributionsAction,
  recordContributionAction,
  setBatchClosedAction,
} from "../../actions";

export default async function BatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  if (!(await canGiving(organization.id, "giving.view"))) {
    return (
      <Card padding="md" className="mt-6">
        <EmptyState icon={<Lock size={22} />} title="You don't have access to Giving" description="" />
      </Card>
    );
  }

  const { batchId } = await params;
  const [batch, funds, people] = await Promise.all([
    givingService.getBatch(organization.id, batchId),
    givingService.listFunds(organization.id),
    // Bounded select, same v1 tradeoff as relationship linking on the person page.
    peopleService.listPeople(organization.id, { take: 200 }),
  ]);
  if (!batch) notFound();

  const open = batch.status === "OPEN";
  const boundRecord = recordContributionAction.bind(null, batch.id);
  const boundImport = importContributionsAction.bind(null, batch.id);
  const batchDateValue = batch.batchDate.toISOString().slice(0, 10);

  return (
    <div>
      <Link href="/giving" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
        <ArrowLeft size={14} /> Back to Giving
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{batch.name}</h1>
          <Badge variant={open ? "info" : "success"}>{open ? "Open" : "Closed"}</Badge>
        </div>
        <form action={setBatchClosedAction.bind(null, batch.id, open)}>
          <button type="submit" className={buttonClasses(open ? "primary" : "secondary", "sm")}>
            {open ? "Close batch" : "Reopen batch"}
          </button>
        </form>
      </div>
      <p className="mb-6 text-sm text-ink-secondary">
        {givingDate(batch.batchDate)}
        {batch.createdBy && ` · started by ${batch.createdBy.name || batch.createdBy.email}`}
      </p>

      <div className="mb-6 grid gap-6 lg:grid-cols-4">
        <Card padding="md">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Entered</p>
          <p className="mt-1 text-2xl font-bold text-ink">{formatCents(batch.totals.totalCents)}</p>
          <p className="text-xs text-ink-muted">{batch.totals.count} entries</p>
        </Card>
        <Card padding="md">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Counted total</p>
          <p className="mt-1 text-2xl font-bold text-ink">
            {batch.expectedCents === null ? "—" : formatCents(batch.expectedCents)}
          </p>
        </Card>
        <Card padding="md">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Difference</p>
          <p
            className={`mt-1 text-2xl font-bold ${
              batch.totals.differenceCents === null || batch.totals.differenceCents === 0
                ? "text-ink"
                : "text-danger"
            }`}
          >
            {batch.totals.differenceCents === null ? "—" : formatCents(batch.totals.differenceCents)}
          </p>
          {batch.totals.differenceCents === 0 && <p className="text-xs text-success">Reconciled ✓</p>}
        </Card>
        <Card padding="md">
          <p className="text-xs uppercase tracking-wide text-ink-muted">By method</p>
          <ul className="mt-1 space-y-0.5 text-sm text-ink-secondary">
            {batch.totals.byMethod.length === 0 && <li className="text-ink-muted">Nothing yet</li>}
            {batch.totals.byMethod.map((m) => (
              <li key={m.method}>
                {contributionMethodLabel(m.method)}: {formatCents(m.totalCents)}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {open && funds.length === 0 && (
        <Card padding="md" className="mb-6">
          <p className="text-sm text-ink-secondary">
            Create a fund first —{" "}
            <Link href="/giving/funds" className="text-accent hover:underline">
              Giving → Funds
            </Link>
            .
          </p>
        </Card>
      )}

      {open && funds.length > 0 && (
        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          <Card padding="md">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
              <Plus size={15} /> Add entry
            </h2>
            <form action={boundRecord} className="grid grid-cols-2 gap-3">
              <label className="col-span-2 text-sm text-ink-secondary">
                Person <span className="text-ink-muted">(or leave blank and give a donor name)</span>
                <Select name="personId" className="mt-1 block w-full" defaultValue="">
                  <option value="">— Not linked —</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {personDisplayName(p)}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="col-span-2 text-sm text-ink-secondary">
                Donor name <span className="text-ink-muted">(unlinked entries)</span>
                <Input name="donorName" className="mt-1 block w-full" placeholder="Loose plate cash" />
              </label>
              <label className="text-sm text-ink-secondary">
                Amount
                <Input name="amount" required placeholder="125.00" className="mt-1 block w-full" />
              </label>
              <label className="text-sm text-ink-secondary">
                Fund
                <Select name="fundId" className="mt-1 block w-full">
                  {funds.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                      {f.taxDeductible ? "" : " (not deductible)"}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="text-sm text-ink-secondary">
                Method
                <Select name="method" className="mt-1 block w-full" defaultValue="CHECK">
                  {CONTRIBUTION_METHOD_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="text-sm text-ink-secondary">
                Check #<Input name="checkNumber" className="mt-1 block w-full" />
              </label>
              <label className="text-sm text-ink-secondary">
                Date
                <Input name="receivedAt" type="date" defaultValue={batchDateValue} className="mt-1 block w-full" />
              </label>
              <label className="text-sm text-ink-secondary">
                Note
                <Input name="note" className="mt-1 block w-full" />
              </label>
              <div className="col-span-2">
                <button type="submit" className={buttonClasses("primary", "md")}>
                  Add entry
                </button>
              </div>
            </form>
          </Card>

          <Card padding="md">
            <h2 className="mb-1 text-sm font-semibold text-ink">Check scanner / bank import</h2>
            <p className="mb-3 text-xs text-ink-muted">
              Export from your scanner software or bank and import it here — columns named date, amount, check
              number, fund, name, and email are recognized in any order. Rows with an email that matches a person
              are linked automatically.
            </p>
            <GivingImportForm action={boundImport} funds={funds.map((f) => ({ id: f.id, name: f.name }))} />
          </Card>
        </div>
      )}

      <Card padding="md">
        <h2 className="mb-3 text-sm font-semibold text-ink">Entries</h2>
        {batch.contributions.length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing recorded in this batch yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted">
                  <th className="pb-2 pr-4 font-medium">Donor</th>
                  <th className="pb-2 pr-4 font-medium">Fund</th>
                  <th className="pb-2 pr-4 font-medium">Method</th>
                  <th className="pb-2 pr-4 text-right font-medium">Amount</th>
                  {open && <th className="pb-2 font-medium" />}
                </tr>
              </thead>
              <tbody>
                {batch.contributions.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="py-2 pr-4">
                      {c.person ? (
                        <Link href={`/people/${c.person.id}`} className="text-accent hover:underline">
                          {personDisplayName(c.person)}
                        </Link>
                      ) : (
                        <span className="text-ink-secondary">{c.donorName || "Unattributed"}</span>
                      )}
                      {c.note && <span className="ml-2 text-xs text-ink-muted">{c.note}</span>}
                    </td>
                    <td className="py-2 pr-4 text-ink-secondary">
                      {c.fund.name}
                      {!c.fund.taxDeductible && <span className="ml-1 text-xs text-ink-muted">(not deductible)</span>}
                    </td>
                    <td className="py-2 pr-4 text-ink-secondary">
                      {contributionMethodLabel(c.method)}
                      {c.checkNumber && ` #${c.checkNumber}`}
                    </td>
                    <td className="py-2 pr-4 text-right font-medium text-ink">{formatCents(c.amountCents)}</td>
                    {open && (
                      <td className="py-2 text-right">
                        <form action={deleteContributionAction.bind(null, batch.id, c.id)}>
                          <button
                            type="submit"
                            className="text-ink-muted hover:text-danger"
                            title="Delete entry (open batches only)"
                          >
                            <Trash2 size={14} />
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
