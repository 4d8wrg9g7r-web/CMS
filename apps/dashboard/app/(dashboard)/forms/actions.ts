"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditService, formService } from "@cms/database";
import { getCurrentOrganization, getCurrentUser } from "../../../lib/session";
import { requireForms } from "../../../lib/forms-access";

/**
 * Forms staff server actions. Each resolves the org, enforces authorization via
 * requireForms (BLUEPRINT §34), mutates through the tenant-scoped service, and records an
 * audit event (BLUEPRINT §47). Record-specific actions take the form id as a bound arg.
 */

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

async function requireOrg() {
  const organization = await getCurrentOrganization();
  if (!organization) throw new Error("No organization");
  return organization;
}

async function audit(organizationId: string, action: string, formId: string, metadata?: Record<string, unknown>) {
  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId,
    actorUserId: actor?.id,
    action,
    targetType: "FormDefinition",
    targetId: formId,
    metadata,
  });
}

export async function createFormAction(formData: FormData) {
  const organization = await requireOrg();
  await requireForms(organization.id, "form.manage");

  const title = str(formData, "title");
  if (!title) throw new Error("Form title is required.");

  const form = await formService.createForm(organization.id, {
    title,
    description: str(formData, "description") || null,
  });
  await audit(organization.id, "form.created", form.id, { title });
  redirect(`/forms/${form.id}`);
}

export async function updateFormSettingsAction(formId: string, formData: FormData) {
  const organization = await requireOrg();
  await requireForms(organization.id, "form.manage");

  const title = str(formData, "title");
  if (!title) throw new Error("Form title is required.");

  const notificationEmails = str(formData, "notificationEmails")
    .split(/[\n,]/)
    .map((e) => e.trim())
    .filter(Boolean);

  const updated = await formService.updateFormSettings(organization.id, formId, {
    title,
    description: str(formData, "description") || null,
    confirmationMessage: str(formData, "confirmationMessage") || undefined,
    createPeople: formData.get("createPeople") === "on",
    notificationEmails,
  });
  if (!updated) throw new Error("Form not found.");
  await audit(organization.id, "form.updated", formId);
  revalidatePath(`/forms/${formId}`);
}

export async function saveDraftSchemaAction(formId: string, formData: FormData) {
  const organization = await requireOrg();
  await requireForms(organization.id, "form.manage");

  let schema: unknown = [];
  try {
    schema = JSON.parse(str(formData, "schema") || "[]");
  } catch {
    throw new Error("Could not read the form fields.");
  }
  const saved = await formService.saveDraftSchema(organization.id, formId, schema);
  if (saved === null) throw new Error("Form not found.");
  await audit(organization.id, "form.updated", formId, { fieldCount: saved.length });
  revalidatePath(`/forms/${formId}`);
}

export async function publishFormAction(formId: string) {
  const organization = await requireOrg();
  await requireForms(organization.id, "form.manage");

  const version = await formService.publishForm(organization.id, formId);
  await audit(organization.id, "form.published", formId, { version });
  revalidatePath(`/forms/${formId}`);
}

export async function closeFormAction(formId: string) {
  const organization = await requireOrg();
  await requireForms(organization.id, "form.manage");
  await formService.closeForm(organization.id, formId);
  await audit(organization.id, "form.closed", formId);
  revalidatePath(`/forms/${formId}`);
}

export async function archiveFormAction(formId: string) {
  const organization = await requireOrg();
  await requireForms(organization.id, "form.manage");
  await formService.archiveForm(organization.id, formId);
  await audit(organization.id, "form.archived", formId);
  revalidatePath(`/forms/${formId}`);
  revalidatePath("/forms");
}

export async function restoreFormAction(formId: string) {
  const organization = await requireOrg();
  await requireForms(organization.id, "form.manage");
  await formService.restoreForm(organization.id, formId);
  await audit(organization.id, "form.restored", formId);
  revalidatePath(`/forms/${formId}`);
  revalidatePath("/forms");
}
