import Link from "next/link";
import { ArrowLeft, Lock, ReceiptText } from "lucide-react";
import { formatCents, givingService, peopleService, personDisplayName } from "@cms/database";
import { Card } from "../../../../components/ui/Card";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { Select } from "../../../../components/ui/Input";
import { buttonClasses } from "../../../../components/ui/Button";
import { canGiving } from "../../../../lib/giving-access";
import { contributionMethodLabel, givingDate } from "../../../../lib/giving-format";
import { getCurrentOrganization } from "../../../../lib/session";

/**
 * Year-end giving statement (nonprofit acknowledgment): itemized tax-deductible
 * gifts + total, with non-deductible payments summarized separately and never in
 * the deductible total. Print via the browser — the layout is print-clean.
 */
export default async function StatementsPage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string; year?: string }>;
}) {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  if (!(await canGiving(organization.id, "giving.statements"))) {
    return (
      <Card padding="md" className="mt-6">
        <EmptyState icon={<Lock size={22} />} title="You don't have access to Giving" description="" />
      </Card>
    );
  }

  const params = await searchParams;
  const currentYear = new Date().getUTCFullYear();
  const year = Math.min(Math.max(Number(params.year) || currentYear, currentYear - 10), currentYear);
  const people = await peopleService.listPeople(organization.id, { take: 500 });
  const personId = params.person && people.some((p) => p.id === params.person) ? params.person : "";
  const person = personId ? people.find((p) => p.id === personId) : null;
  const statement = personId ? await givingService.annualStatement(organization.id, personId, year) : null;

  return (
    <div>
      <Link
        href="/giving"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink print:hidden"
      >
        <ArrowLeft size={14} /> Back to Giving
      </Link>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-ink print:hidden">Giving statements</h1>
      <p className="mb-6 text-sm text-ink-secondary print:hidden">
        Year-end contribution statements for donors. Non-tax-deductible payments (books, trips) appear as a separate
        informational line, never in the deductible total. Use your browser&rsquo;s Print for a mailable copy.
      </p>

      <Card padding="md" className="mb-6 print:hidden">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-ink-secondary">
            Person
            <Select name="person" defaultValue={personId} className="mt-1 w-64">
              <option value="">Choose a person…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {personDisplayName(p)}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-sm text-ink-secondary">
            Year
            <Select name="year" defaultValue={String(year)} className="mt-1 w-28">
              {Array.from({ length: 6 }, (_, i) => currentYear - i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </label>
          <button type="submit" className={buttonClasses("primary", "sm")}>
            <ReceiptText size={15} /> View statement
          </button>
        </form>
      </Card>

      {person && statement && (
        <Card padding="md">
          <div className="mb-6 border-b border-border pb-4">
            <h2 className="text-lg font-semibold text-ink">{organization.name}</h2>
            <p className="text-sm text-ink-secondary">
              {statement.year} Contribution Statement — {personDisplayName(person)}
            </p>
          </div>

          {statement.lines.length === 0 ? (
            <p className="text-sm text-ink-muted">No tax-deductible gifts recorded in {statement.year}.</p>
          ) : (
            <table className="mb-4 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted">
                  <th className="pb-2 pr-4 font-medium">Date</th>
                  <th className="pb-2 pr-4 font-medium">Fund</th>
                  <th className="pb-2 pr-4 font-medium">Method</th>
                  <th className="pb-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {statement.lines.map((line, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-1.5 pr-4">{givingDate(line.receivedAt)}</td>
                    <td className="py-1.5 pr-4">{line.fundName}</td>
                    <td className="py-1.5 pr-4 text-ink-secondary">
                      {contributionMethodLabel(line.method)}
                      {line.checkNumber && ` #${line.checkNumber}`}
                    </td>
                    <td className="py-1.5 text-right">{formatCents(line.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="flex flex-col items-end gap-1 border-t border-border pt-3 text-sm">
            <p className="text-lg font-bold text-ink">
              Total tax-deductible gifts: {formatCents(statement.totalDeductibleCents)}
            </p>
            {statement.nonDeductibleTotalCents > 0 && (
              <p className="text-ink-secondary">
                Non-deductible payments (goods &amp; services): {formatCents(statement.nonDeductibleTotalCents)} — not
                included above.
              </p>
            )}
          </div>

          <p className="mt-6 text-xs text-ink-muted">
            No goods or services were provided in exchange for the tax-deductible contributions listed above, other
            than intangible religious benefits. Retain this statement for your tax records.
          </p>
        </Card>
      )}
    </div>
  );
}
