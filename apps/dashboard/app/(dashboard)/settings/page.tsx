import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auditService, campusService, organizationService, peopleService, userService, PERSON_FIELD_TYPES, type PersonFieldType } from "@cms/database";
import { unstable_update } from "../../../auth";
import { AccountForm } from "../../../components/AccountForm";
import { Card } from "../../../components/ui/Card";
import { buttonClasses } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { getCurrentOrganization, getCurrentUser, requireCurrentUser, requireOrgRole } from "../../../lib/session";

const accountNameSchema = z.string().trim().min(1, "Name is required.").max(120);
const accountEmailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");

async function updateAccountAction(formData: FormData) {
  "use server";
  const user = await requireCurrentUser();

  const nameParsed = accountNameSchema.safeParse(String(formData.get("name") ?? ""));
  if (!nameParsed.success) throw new Error(nameParsed.error.issues[0]?.message ?? "Invalid name.");

  const emailParsed = accountEmailSchema.safeParse(String(formData.get("email") ?? ""));
  if (!emailParsed.success) throw new Error(emailParsed.error.issues[0]?.message ?? "Invalid email.");

  await userService.updateUser(user.id, { name: nameParsed.data, email: emailParsed.data });
  await unstable_update({ user: { name: nameParsed.data, email: emailParsed.data } });

  const organization = await getCurrentOrganization();
  if (organization) {
    await auditService.recordAuditEvent({
      organizationId: organization.id,
      actorUserId: user.id,
      action: "account.updated",
      targetType: "User",
      targetId: user.id,
    });
  }

  revalidatePath("/settings");
}

/**
 * Self-service password change: verifies the CURRENT password first (a stolen
 * session must not be enough to take over the account), then stores a fresh
 * bcrypt hash. Feedback flows through redirect query params like the login page.
 */
async function changePasswordAction(formData: FormData) {
  "use server";
  const sessionUser = await requireCurrentUser();
  const user = await userService.getUser(sessionUser.id);
  if (!user) throw new Error("Account not found.");

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!(await bcrypt.compare(current, user.passwordHash))) redirect("/settings?pwerror=wrong");
  if (next.length < 8) redirect("/settings?pwerror=short");
  if (next !== confirm) redirect("/settings?pwerror=mismatch");
  if (next === current) redirect("/settings?pwerror=same");

  await userService.updatePassword(user.id, await bcrypt.hash(next, 10));

  const organization = await getCurrentOrganization();
  if (organization) {
    await auditService.recordAuditEvent({
      organizationId: organization.id,
      actorUserId: user.id,
      action: "account.password_changed",
      targetType: "User",
      targetId: user.id,
    });
  }
  redirect("/settings?pw=1");
}

const PW_ERRORS: Record<string, string> = {
  wrong: "Your current password is incorrect.",
  short: "The new password must be at least 8 characters.",
  mismatch: "The new passwords don't match.",
  same: "The new password must be different from the current one.",
};

async function createCampusAction(formData: FormData) {
  "use server";
  const organization = await getCurrentOrganization();
  if (!organization) throw new Error("No organization");
  await requireOrgRole(organization.id, ["OWNER", "ADMIN"]);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Campus name is required.");
  const address = String(formData.get("address") ?? "").trim() || null;

  const campus = await campusService.createCampus(organization.id, { name, address });

  const user = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: user?.id,
    action: "campus.created",
    targetType: "Campus",
    targetId: campus.id,
    metadata: { name },
  });

  revalidatePath("/settings");
}

async function setCampusArchivedAction(campusId: string, archived: boolean) {
  "use server";
  const organization = await getCurrentOrganization();
  if (!organization) throw new Error("No organization");
  await requireOrgRole(organization.id, ["OWNER", "ADMIN"]);

  await campusService.setCampusArchived(organization.id, campusId, archived);

  const user = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: user?.id,
    action: archived ? "campus.archived" : "campus.restored",
    targetType: "Campus",
    targetId: campusId,
  });

  revalidatePath("/settings");
}

const FIELD_TYPE_NAMES: Record<PersonFieldType, string> = {
  TEXT: "Text",
  NUMBER: "Number",
  DATE: "Date",
  BOOLEAN: "Yes / No",
  SELECT: "Dropdown",
  MULTI_SELECT: "Multi-select",
};

async function createFieldAction(formData: FormData) {
  "use server";
  const organization = await getCurrentOrganization();
  if (!organization) throw new Error("No organization");
  await requireOrgRole(organization.id, ["OWNER", "ADMIN"]);

  const label = String(formData.get("label") ?? "").trim();
  const type = String(formData.get("type") ?? "TEXT") as PersonFieldType;
  if (!label) throw new Error("Field name is required.");
  if (!PERSON_FIELD_TYPES.includes(type)) throw new Error("Unknown field type.");
  const options = String(formData.get("options") ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if ((type === "SELECT" || type === "MULTI_SELECT") && options.length === 0) {
    throw new Error("Dropdown fields need at least one option (comma-separated).");
  }

  const field = await peopleService.createFieldDefinition(organization.id, { label, type, options });

  const user = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: user?.id,
    action: "person_field.created",
    targetType: "PersonFieldDefinition",
    targetId: field.id,
    metadata: { label, type },
  });

  revalidatePath("/settings");
}

async function archiveFieldAction(fieldId: string) {
  "use server";
  const organization = await getCurrentOrganization();
  if (!organization) throw new Error("No organization");
  await requireOrgRole(organization.id, ["OWNER", "ADMIN"]);

  await peopleService.archiveFieldDefinition(organization.id, fieldId);

  const user = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: user?.id,
    action: "person_field.archived",
    targetType: "PersonFieldDefinition",
    targetId: fieldId,
  });

  revalidatePath("/settings");
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ pw?: string; pwerror?: string }>;
}) {
  const params = await searchParams;
  const organization = await getCurrentOrganization();
  const sessionUser = await getCurrentUser();
  if (!organization || !sessionUser) return null;
  // Read fresh from the DB rather than the session -- unstable_update()'s cookie only
  // takes effect on the *next* request, so right after Save this render would
  // otherwise still show the pre-edit name/email even though the write succeeded.
  const user = await userService.getUser(sessionUser.id);
  const org = await organizationService.getOrganization(organization.id);
  const campuses = await campusService.listCampuses(organization.id, { includeArchived: true });
  const personFields = await peopleService.listFieldDefinitions(organization.id, { includeArchived: true });

  const appOrigin = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  return (
    <div>
      <h1 className="mb-1 text-display text-[28px] leading-tight text-ink">Settings</h1>
      <p className="mb-8 text-sm text-ink-secondary">Organization profile and preferences.</p>

      <Card padding="md" className="mb-6">
        <h2 className="mb-4 text-sm font-semibold text-ink">Organization</h2>
        <dl className="grid grid-cols-[140px_1fr] gap-y-3 text-sm">
          <dt className="text-ink-muted">Name</dt>
          <dd className="text-ink">{organization.name}</dd>
          <dt className="text-ink-muted">Slug</dt>
          <dd className="text-ink">{organization.slug}</dd>
          <dt className="text-ink-muted">Public calendar</dt>
          <dd className="break-all text-ink">{`${appOrigin}/c/${org?.publicSiteId}`}</dd>
          <dt className="text-ink-muted">Group finder</dt>
          <dd className="break-all text-ink">{`${appOrigin}/g/${org?.publicSiteId}`}</dd>
        </dl>
      </Card>

      <Card padding="md" className="mb-6">
        <h2 className="mb-1 text-sm font-semibold text-ink">Campuses</h2>
        <p className="mb-4 text-sm text-ink-secondary">
          Physical locations people, groups, events, and serving teams can be assigned to. Campuses are archived, never
          deleted, so history keeps pointing at them.
        </p>
        <form action={createCampusAction} className="mb-4 flex flex-wrap items-end gap-3 border-b border-border pb-4">
          <label className="text-sm text-ink-secondary">
            Name
            <Input name="name" required placeholder="North Campus" className="mt-1 w-56" />
          </label>
          <label className="text-sm text-ink-secondary">
            Address <span className="text-ink-muted">(optional)</span>
            <Input name="address" placeholder="123 Main St" className="mt-1 w-72" />
          </label>
          <button type="submit" className={buttonClasses("primary", "sm")}>
            Add campus
          </button>
        </form>
        {campuses.length === 0 ? (
          <p className="text-sm text-ink-muted">No campuses yet — single-site churches don&rsquo;t need any.</p>
        ) : (
          <ul className="divide-y divide-border">
            {campuses.map((campus) => (
              <li key={campus.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div>
                  <span className={campus.archivedAt ? "text-ink-muted line-through" : "font-medium text-ink"}>
                    {campus.name}
                  </span>
                  {campus.address && <span className="ml-2 text-xs text-ink-muted">{campus.address}</span>}
                </div>
                <form action={setCampusArchivedAction.bind(null, campus.id, !campus.archivedAt)}>
                  <button type="submit" className={buttonClasses("ghost", "sm")}>
                    {campus.archivedAt ? "Restore" : "Archive"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card padding="md" className="mb-6">
        <h2 className="mb-1 text-sm font-semibold text-ink">Person fields</h2>
        <p className="mb-4 text-sm text-ink-secondary">
          Custom fields shown on every person&rsquo;s profile — there&rsquo;s no limit. The import wizard creates
          these automatically for columns you keep; fields are archived, never deleted, so old values stay readable.
        </p>
        <form action={createFieldAction} className="mb-4 flex flex-wrap items-end gap-3 border-b border-border pb-4">
          <label className="text-sm text-ink-secondary">
            Name
            <Input name="label" required placeholder="Veteran" className="mt-1 w-48" />
          </label>
          <label className="text-sm text-ink-secondary">
            Type
            <select
              name="type"
              className="mt-1 block h-9 w-40 rounded-sm border border-border bg-surface px-2 text-sm text-ink"
            >
              {PERSON_FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FIELD_TYPE_NAMES[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-ink-secondary">
            Options <span className="text-ink-muted">(dropdowns, comma-separated)</span>
            <Input name="options" placeholder="Choir, Band, Tech" className="mt-1 w-64" />
          </label>
          <button type="submit" className={buttonClasses("primary", "sm")}>
            Add field
          </button>
        </form>
        {personFields.length === 0 ? (
          <p className="text-sm text-ink-muted">No custom fields yet — import a spreadsheet or add one above.</p>
        ) : (
          <ul className="divide-y divide-border">
            {personFields.map((field) => (
              <li key={field.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div>
                  <span className={field.archivedAt ? "text-ink-muted line-through" : "font-medium text-ink"}>
                    {field.label}
                  </span>
                  <span className="ml-2 text-xs text-ink-muted">
                    {FIELD_TYPE_NAMES[field.type]}
                    {field.options.length > 0 && ` · ${field.options.slice(0, 6).join(", ")}${field.options.length > 6 ? "…" : ""}`}
                  </span>
                </div>
                {!field.archivedAt && (
                  <form action={archiveFieldAction.bind(null, field.id)}>
                    <button type="submit" className={buttonClasses("ghost", "sm")}>
                      Archive
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card padding="md">
        <h2 className="mb-4 text-sm font-semibold text-ink">Your account</h2>
        <AccountForm defaultName={user?.name ?? ""} defaultEmail={user?.email ?? ""} action={updateAccountAction} />

        <div className="mt-6 border-t border-border pt-5">
          <h3 className="mb-1 text-sm font-semibold text-ink">Change password</h3>
          <p className="mb-3 text-xs text-ink-muted">
            You&rsquo;ll stay signed in here; other devices need the new password on their next sign-in.
          </p>
          {params.pw && (
            <p className="mb-3 rounded-md bg-success-bg px-3 py-2 text-sm text-success">Password changed.</p>
          )}
          {params.pwerror && (
            <p className="mb-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
              {PW_ERRORS[params.pwerror] ?? "Something went wrong. Try again."}
            </p>
          )}
          <form action={changePasswordAction} className="flex flex-wrap items-end gap-3">
            <label className="text-sm text-ink-secondary">
              Current password
              <Input name="currentPassword" type="password" required className="mt-1 block w-52" />
            </label>
            <label className="text-sm text-ink-secondary">
              New password
              <Input name="newPassword" type="password" required minLength={8} className="mt-1 block w-52" />
            </label>
            <label className="text-sm text-ink-secondary">
              Verify new password
              <Input name="confirmPassword" type="password" required minLength={8} className="mt-1 block w-52" />
            </label>
            <button type="submit" className={buttonClasses("primary", "sm")}>
              Change password
            </button>
          </form>
        </div>
      </Card>

      <p className="mt-6 text-xs text-ink-muted">
        Manage teammates on the <a href="/team" className="underline hover:text-ink-secondary">Team</a> page and activity
        history on the <a href="/audit-log" className="underline hover:text-ink-secondary">Audit log</a> page.
      </p>
    </div>
  );
}
