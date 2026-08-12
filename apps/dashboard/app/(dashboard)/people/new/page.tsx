import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { campusService } from "@cms/database";
import { Card } from "../../../../components/ui/Card";
import { PersonForm } from "../../../../components/PersonForm";
import { requirePeople } from "../../../../lib/people-access";
import { getCurrentOrganization } from "../../../../lib/session";
import { createPersonAction } from "../actions";

export default async function NewPersonPage() {
  const organization = await getCurrentOrganization();
  if (!organization) return null;
  // Gate the page itself, not just the action -- a user without manage rights should
  // never see the form.
  await requirePeople(organization.id, "person.manage");

  const campuses = await campusService.listCampuses(organization.id);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/people" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
        <ArrowLeft size={15} /> Back to People
      </Link>
      <h1 className="mb-1 text-display text-[28px] leading-tight text-ink">Add a person</h1>
      <p className="mb-6 text-sm text-ink-secondary">
        Create a canonical record. You can add household and relationships after saving.
      </p>
      <Card padding="md">
        <PersonForm
          action={createPersonAction}
          campuses={campuses.map((c) => ({ id: c.id, name: c.name }))}
          submitLabel="Create person"
        />
      </Card>
    </div>
  );
}
