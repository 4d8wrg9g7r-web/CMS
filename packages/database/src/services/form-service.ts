import { FormStatus, Prisma } from "@prisma/client";
import { rawDb, tenantDb } from "../client";
import { parseSchema, type FormField } from "../forms/schema";

/**
 * Forms definition service (BLUEPRINT §7). Tenant-scoped for all staff operations. The
 * one exception is resolvePublicForm, which resolves a form by its public id before any
 * tenant context exists (the same bootstrapping boundary as widgets/prayer walls) and so
 * uses rawDb intentionally.
 */

export interface FormSettingsInput {
  title: string;
  description?: string | null;
  confirmationMessage?: string;
  createPeople?: boolean;
  notificationEmails?: string[];
}

export interface ListFormsOptions {
  includeArchived?: boolean;
  skip?: number;
  take?: number;
}

export async function listForms(organizationId: string, opts: ListFormsOptions = {}) {
  return tenantDb.formDefinition.findMany({
    where: { organizationId, ...(opts.includeArchived ? {} : { archivedAt: null }) },
    orderBy: { updatedAt: "desc" },
    skip: opts.skip,
    take: opts.take,
    include: { _count: { select: { submissions: true } } },
  });
}

export async function getForm(organizationId: string, formId: string) {
  return tenantDb.formDefinition.findFirst({
    where: { id: formId, organizationId },
    include: { _count: { select: { submissions: true } } },
  });
}

export async function createForm(organizationId: string, input: FormSettingsInput) {
  return tenantDb.formDefinition.create({
    data: {
      organizationId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      confirmationMessage: input.confirmationMessage?.trim() || undefined,
      createPeople: input.createPeople ?? true,
      draftSchema: [],
    },
  });
}

export async function updateFormSettings(organizationId: string, formId: string, input: Partial<FormSettingsInput>) {
  const data: Prisma.FormDefinitionUncheckedUpdateManyInput = {};
  if (input.title !== undefined) data.title = input.title.trim();
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.confirmationMessage !== undefined) data.confirmationMessage = input.confirmationMessage.trim() || undefined;
  if (input.createPeople !== undefined) data.createPeople = input.createPeople;
  if (input.notificationEmails !== undefined) data.notificationEmails = input.notificationEmails;

  const result = await tenantDb.formDefinition.updateMany({ where: { id: formId, organizationId }, data });
  if (result.count === 0) return null;
  return getForm(organizationId, formId);
}

/** Save the working field list. Validated/normalized through parseSchema before storage. */
export async function saveDraftSchema(organizationId: string, formId: string, schema: unknown) {
  const fields = parseSchema(schema);
  const result = await tenantDb.formDefinition.updateMany({
    where: { id: formId, organizationId },
    data: { draftSchema: fields as unknown as Prisma.InputJsonValue },
  });
  if (result.count === 0) return null;
  return fields;
}

/**
 * Publish the current draft: snapshot it as a new immutable FormVersion and point
 * publishedVersion at it. Refuses to publish an empty schema. Returns the new version
 * number.
 */
export async function publishForm(organizationId: string, formId: string): Promise<number> {
  const form = await tenantDb.formDefinition.findFirst({ where: { id: formId, organizationId } });
  if (!form) throw new Error("Form not found.");
  const fields = parseSchema(form.draftSchema);
  if (fields.length === 0) throw new Error("Add at least one field before publishing.");

  const latest = await tenantDb.formVersion.findFirst({
    where: { organizationId, formId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (latest?.version ?? 0) + 1;

  await tenantDb.formVersion.create({
    data: { organizationId, formId, version: nextVersion, schema: fields as unknown as Prisma.InputJsonValue },
  });
  await tenantDb.formDefinition.updateMany({
    where: { id: formId, organizationId },
    data: { status: FormStatus.PUBLISHED, publishedVersion: nextVersion },
  });
  return nextVersion;
}

export async function closeForm(organizationId: string, formId: string) {
  const result = await tenantDb.formDefinition.updateMany({
    where: { id: formId, organizationId },
    data: { status: FormStatus.CLOSED },
  });
  return result.count > 0;
}

export async function archiveForm(organizationId: string, formId: string) {
  const result = await tenantDb.formDefinition.updateMany({
    where: { id: formId, organizationId },
    data: { archivedAt: new Date() },
  });
  return result.count > 0;
}

export async function restoreForm(organizationId: string, formId: string) {
  const result = await tenantDb.formDefinition.updateMany({
    where: { id: formId, organizationId },
    data: { archivedAt: null },
  });
  return result.count > 0;
}

export async function getVersionSchema(
  organizationId: string,
  formId: string,
  version: number,
): Promise<FormField[] | null> {
  const row = await tenantDb.formVersion.findFirst({ where: { organizationId, formId, version } });
  if (!row) return null;
  return parseSchema(row.schema);
}

export interface PublicForm {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  confirmationMessage: string;
  createPeople: boolean;
  version: number;
  fields: FormField[];
}

/**
 * Resolve a form for public submission by its public id -- no tenant context yet, so this
 * uses rawDb (documented bootstrapping exception, like widget/prayer resolution). Returns
 * null unless the form is PUBLISHED with a live version.
 */
export async function resolvePublicForm(publicId: string): Promise<PublicForm | null> {
  const form = await rawDb.formDefinition.findUnique({ where: { publicId } });
  if (!form || form.status !== FormStatus.PUBLISHED || form.publishedVersion == null || form.archivedAt) {
    return null;
  }
  const version = await rawDb.formVersion.findFirst({
    where: { formId: form.id, version: form.publishedVersion },
  });
  if (!version) return null;
  return {
    id: form.id,
    organizationId: form.organizationId,
    title: form.title,
    description: form.description,
    confirmationMessage: form.confirmationMessage,
    createPeople: form.createPeople,
    version: form.publishedVersion,
    fields: parseSchema(version.schema),
  };
}
