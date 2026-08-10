import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auditService, organizationService } from "@cms/database";
import { getCurrentOrganization, requireCurrentUser } from "../../lib/session";
import { noIndexMetadata } from "../../lib/no-index-metadata";
import { slugify } from "../../lib/slug";
import { SubmitButton } from "../../components/SubmitButton";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";

export const metadata: Metadata = noIndexMetadata;

async function createOrganizationAction(formData: FormData) {
  "use server";
  const user = await requireCurrentUser();
  const existing = await getCurrentOrganization();
  if (existing) redirect("/dashboard");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/onboarding?error=missing");

  // Slugs are unique; suffix with a short random tail on collision rather than failing.
  let slug = slugify(name);
  if (await organizationService.getOrganizationBySlug(slug)) {
    slug = `${slug}-${crypto.randomUUID().slice(0, 6)}`;
  }

  const organization = await organizationService.createOrganizationWithOwner({
    name,
    slug,
    ownerUserId: user.id,
  });
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: user.id,
    action: "organization.created",
    targetType: "Organization",
    targetId: organization.id,
    metadata: { name, slug },
  });

  redirect("/dashboard");
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireCurrentUser();
  const existing = await getCurrentOrganization();
  if (existing) redirect("/dashboard");
  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-2 text-2xl font-semibold text-ink">Set up your church</h1>
      <p className="mb-6 text-sm text-ink-secondary">
        Create your organization to start managing people, groups, and events.
      </p>
      {params.error && (
        <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">Enter your church&rsquo;s name.</p>
      )}
      <Card>
        <form action={createOrganizationAction} className="flex flex-col gap-3">
          <label className="text-sm font-medium text-ink-secondary">
            Church name
            <Input name="name" type="text" required placeholder="Grace Community Church" className="mt-1 block w-full" />
          </label>
          <SubmitButton pendingLabel="Creating...">Create organization</SubmitButton>
        </form>
      </Card>
    </main>
  );
}
