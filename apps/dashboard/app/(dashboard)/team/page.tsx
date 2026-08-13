import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { UserPlus } from "lucide-react";
import type { OrganizationRole } from "@cms/database";
import { auditService, teamService } from "@cms/database";
import { getEmailProvider } from "@cms/email";
import { TeamMemberList } from "../../../components/TeamMemberList";
import { buttonClasses } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Input, Select } from "../../../components/ui/Input";
import { getCurrentOrganization, getCurrentOrgRole, getCurrentUser, requireOrgRole } from "../../../lib/session";

/**
 * All four roles are always assignable (OWNER via this same role Select doubles as
 * the ownership-transfer flow -- teamService.updateMemberRole's assertNotLastOwner
 * is what actually guards it).
 */
const ASSIGNABLE_ROLES: OrganizationRole[] = ["OWNER", "ADMIN", "CONTENT_MANAGER", "ANALYTICS_VIEWER"];

async function inviteMemberAction(formData: FormData) {
  "use server";
  const organization = await getCurrentOrganization();
  if (!organization) throw new Error("No organization");
  await requireOrgRole(organization.id, ["OWNER", "ADMIN"]);

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "CONTENT_MANAGER") as OrganizationRole;
  if (!email) throw new Error("Enter an email address.");
  if (!ASSIGNABLE_ROLES.includes(role)) throw new Error("Unknown role.");

  const tempPassword = randomBytes(9).toString("base64url");
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const { user, isNewUser } = await teamService.inviteMember({ organizationId: organization.id, email, role, passwordHash });

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "team.member_invited",
    targetType: "User",
    targetId: user.id,
    metadata: { email, role },
  });

  await getEmailProvider().sendEmail({
    to: email,
    subject: `You've been invited to ${organization.name}`,
    text: isNewUser
      ? `${actor?.name || actor?.email} invited you to join ${organization.name} as ${role}.\n\nLog in at /login with:\nEmail: ${email}\nTemporary password: ${tempPassword}`
      : `${actor?.name || actor?.email} added your existing account to ${organization.name} as ${role}. Log in as usual to switch in.`,
  });

  revalidatePath("/team");
}

async function updateMemberRoleAction(userId: string, role: OrganizationRole) {
  "use server";
  const organization = await getCurrentOrganization();
  if (!organization) throw new Error("No organization");
  await requireOrgRole(organization.id, ["OWNER", "ADMIN"]);
  if (!ASSIGNABLE_ROLES.includes(role)) throw new Error("Unknown role.");

  await teamService.updateMemberRole(organization.id, userId, role);

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "team.member_role_updated",
    targetType: "User",
    targetId: userId,
    metadata: { role },
  });

  revalidatePath("/team");
}

async function removeMemberAction(userId: string) {
  "use server";
  const organization = await getCurrentOrganization();
  if (!organization) throw new Error("No organization");
  await requireOrgRole(organization.id, ["OWNER", "ADMIN"]);

  await teamService.removeMember(organization.id, userId);

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "team.member_removed",
    targetType: "User",
    targetId: userId,
  });

  revalidatePath("/team");
}

export default async function TeamPage() {
  const organization = await getCurrentOrganization();
  const user = await getCurrentUser();
  if (!organization || !user) return null;

  const [members, currentRole] = await Promise.all([
    teamService.listMembers(organization.id),
    getCurrentOrgRole(organization.id),
  ]);
  const canManage = currentRole === "OWNER" || currentRole === "ADMIN";

  const memberRows = members.map((m) => ({
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
    joinedAt: m.createdAt,
  }));

  return (
    <div>
      <h1 className="mb-1 text-display text-[28px] leading-tight text-ink">Users</h1>
      <p className="mb-8 text-sm text-ink-secondary">Who has access to {organization.name}.</p>

      {canManage && (
        <Card padding="md" className="mb-6">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
            <UserPlus size={15} /> Invite a teammate
          </h2>
          <p className="mb-4 text-xs text-ink-muted">
            They&rsquo;ll get an email with login instructions. New accounts are created automatically.
          </p>
          <form action={inviteMemberAction} className="flex flex-wrap items-end gap-3">
            <label className="text-sm text-ink-secondary">
              Email
              <Input name="email" type="email" required placeholder="teammate@example.org" className="mt-1 w-64" />
            </label>
            <label className="text-sm text-ink-secondary">
              Role
              <Select name="role" defaultValue="CONTENT_MANAGER" className="mt-1 w-48">
                <option value="ADMIN">Admin</option>
                <option value="CONTENT_MANAGER">Content Manager</option>
                <option value="ANALYTICS_VIEWER">Analytics Viewer</option>
              </Select>
            </label>
            <button type="submit" className={buttonClasses("primary", "md")}>
              Send invite
            </button>
          </form>
        </Card>
      )}

      <Card padding="md">
        <h2 className="mb-4 text-sm font-semibold text-ink">Members ({memberRows.length})</h2>
        <TeamMemberList
          members={memberRows}
          currentUserId={user.id}
          canManage={canManage}
          onUpdateRole={updateMemberRoleAction}
          onRemove={removeMemberAction}
        />
      </Card>
    </div>
  );
}
