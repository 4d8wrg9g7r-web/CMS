import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonClasses } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { Input, Textarea } from "../../../../components/ui/Input";
import { requireJourneys } from "../../../../lib/journeys-access";
import { getCurrentOrganization } from "../../../../lib/session";
import { createJourneyAction } from "../actions";

export default async function NewJourneyPage() {
  const organization = await getCurrentOrganization();
  if (!organization) return null;
  await requireJourneys(organization.id, "journey.manage");

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/journeys" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
        <ArrowLeft size={15} /> Back to Journeys
      </Link>
      <h1 className="mb-1 text-display text-[28px] leading-tight text-ink">Create a pathway</h1>
      <p className="mb-6 text-sm text-ink-secondary">Name it, then add milestones in order.</p>
      <Card padding="md">
        <form action={createJourneyAction} className="space-y-4">
          <label className="block text-sm text-ink-secondary">
            Name <span className="text-danger">*</span>
            <Input name="name" required placeholder="Newcomer Pathway" className="mt-1" />
          </label>
          <label className="block text-sm text-ink-secondary">
            Description
            <Textarea name="description" rows={2} className="mt-1" />
          </label>
          <button type="submit" className={buttonClasses("primary", "md")}>
            Create pathway
          </button>
        </form>
      </Card>
    </div>
  );
}
