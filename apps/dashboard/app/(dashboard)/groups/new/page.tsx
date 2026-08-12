import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { campusService } from "@cms/database";
import { Card } from "../../../../components/ui/Card";
import { GroupForm } from "../../../../components/GroupForm";
import { requireGroups } from "../../../../lib/groups-access";
import { getCurrentOrganization } from "../../../../lib/session";
import { createGroupAction } from "../actions";

export default async function NewGroupPage() {
  const organization = await getCurrentOrganization();
  if (!organization) return null;
  await requireGroups(organization.id, "group.manage");

  const campuses = await campusService.listCampuses(organization.id);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/groups" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
        <ArrowLeft size={15} /> Back to Groups
      </Link>
      <h1 className="mb-1 text-display text-[28px] leading-tight text-ink">Create a group</h1>
      <p className="mb-6 text-sm text-ink-secondary">Add leaders and members after saving.</p>
      <Card padding="md">
        <GroupForm
          action={createGroupAction}
          campuses={campuses.map((c) => ({ id: c.id, name: c.name }))}
          submitLabel="Create group"
        />
      </Card>
    </div>
  );
}
