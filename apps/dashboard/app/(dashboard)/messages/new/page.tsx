import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { campusService, groupService, peopleService, personDisplayName } from "@cms/database";
import { BlastComposer } from "../../../../components/BlastComposer";
import { Card } from "../../../../components/ui/Card";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { canMessages } from "../../../../lib/messages-access";
import { getCurrentOrganization } from "../../../../lib/session";

export default async function NewBlastPage({
  searchParams,
}: {
  searchParams: Promise<{
    audienceKind?: string;
    membershipStatus?: string;
    campusId?: string;
    tag?: string;
    customFieldKey?: string;
    customFieldValue?: string;
  }>;
}) {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  if (!(await canMessages(organization.id, "message.manage"))) {
    return (
      <Card padding="md" className="mt-6">
        <EmptyState icon={<Lock size={22} />} title="You don't have access to send email" description="" />
      </Card>
    );
  }

  const [campuses, groups, people, fieldDefs, params] = await Promise.all([
    campusService.listCampuses(organization.id),
    groupService.listGroups(organization.id),
    // Bounded picker, same v1 tradeoff as relationship linking.
    peopleService.listPeople(organization.id, { take: 500 }),
    peopleService.listFieldDefinitions(organization.id),
    searchParams,
  ]);

  // Launched from People/Reports with filters in the query string — prefill the
  // audience so "email these people" carries the current view over directly.
  const prefill = {
    audienceKind: params.audienceKind,
    membershipStatus: params.membershipStatus,
    campusId: params.campusId,
    tag: params.tag,
    customFieldKey: params.customFieldKey,
    customFieldValue: params.customFieldValue,
  };

  return (
    <div>
      <Link href="/messages" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
        <ArrowLeft size={14} /> Back to Messages
      </Link>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-ink">New email</h1>
      <p className="mb-6 text-sm text-ink-secondary">
        Send an email or newsletter to people in your database — with formatting and attachments. Every recipient
        gets an individual, consent-checked message in the log.
      </p>
      <Card padding="md">
        <BlastComposer
          campuses={campuses.map((c) => ({ id: c.id, name: c.name }))}
          groups={groups.map((g) => ({ id: g.id, name: g.name }))}
          people={people.map((p) => ({ id: p.id, name: personDisplayName(p) }))}
          fieldKeys={fieldDefs.map((f) => f.key)}
          prefill={prefill}
        />
      </Card>
    </div>
  );
}
