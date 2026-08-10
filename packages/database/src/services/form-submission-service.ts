import { Prisma } from "@prisma/client";
import { rawDb, tenantDb } from "../client";
import { extractPersonInput, validateSubmission } from "../forms/schema";
import { personDisplayName } from "../people/helpers";
import { emit } from "./outbox-service";
import { createPerson, findByEmail } from "./people-service";
import type { PublicForm } from "./form-service";

/**
 * Form submission service (BLUEPRINT §7). Validates a public submission against the
 * form's published schema, stores it referencing that version (so it stays interpretable
 * after the form changes), and optionally matches-or-creates a Person. Everything is
 * tenant-scoped; the raw submission is stored before Person linkage so a match/create
 * failure never loses the response.
 */

type SubmitResult =
  | { ok: true; submissionId: string; personId: string | null }
  | { ok: false; errors: Record<string, string> };

export async function submitForm(form: PublicForm, rawData: Record<string, unknown>): Promise<SubmitResult> {
  const { ok, values, errors } = validateSubmission(form.fields, rawData);
  if (!ok) return { ok: false, errors };

  const personInput = extractPersonInput(form.fields, values);
  const submitterName = personDisplayName({ firstName: personInput.firstName, lastName: personInput.lastName }) || null;

  // Store the submission and record the FormSubmitted domain event in the SAME
  // transaction (BLUEPRINT §38) -- external side effects (staff notification) are then
  // performed after commit by the outbox worker, never inline here.
  const submission = await rawDb.$transaction(async (tx) => {
    const created = await tx.formSubmission.create({
      data: {
        organizationId: form.organizationId,
        formId: form.id,
        version: form.version,
        data: values as unknown as Prisma.InputJsonValue,
        submitterEmail: personInput.email ?? null,
        submitterName,
      },
    });
    await emit(tx, {
      organizationId: form.organizationId,
      type: "FormSubmitted",
      payload: {
        formId: form.id,
        submissionId: created.id,
        version: form.version,
        submitterEmail: personInput.email ?? null,
        submitterName,
      },
    });
    return created;
  });

  let personId: string | null = null;
  if (form.createPeople) {
    personId = await matchOrCreatePerson(form.organizationId, personInput);
    if (personId) {
      await tenantDb.formSubmission.updateMany({
        where: { id: submission.id, organizationId: form.organizationId },
        data: { personId },
      });
    }
  }

  return { ok: true, submissionId: submission.id, personId };
}

/**
 * Match an existing Person by email (case-insensitive) or create a new one. Only acts when
 * there's something reliable to key on -- an email, or both a first and last name -- so
 * anonymous submissions don't spawn junk records. Returns the Person id, or null when
 * there's nothing mappable.
 */
async function matchOrCreatePerson(
  organizationId: string,
  input: { firstName?: string; lastName?: string; email?: string; phone?: string },
): Promise<string | null> {
  const hasName = !!input.firstName && !!input.lastName;
  if (!input.email && !hasName) return null;

  if (input.email) {
    const existing = await findByEmail(organizationId, input.email);
    if (existing) return existing.id;
  }

  const firstName = input.firstName || input.email?.split("@")[0] || "Guest";
  const person = await createPerson(organizationId, {
    firstName,
    lastName: input.lastName || "",
    email: input.email ?? null,
    phone: input.phone ?? null,
  });
  return person.id;
}

export async function listSubmissions(
  organizationId: string,
  formId: string,
  opts: { skip?: number; take?: number } = {},
) {
  return tenantDb.formSubmission.findMany({
    where: { organizationId, formId },
    orderBy: { createdAt: "desc" },
    skip: opts.skip,
    take: opts.take,
    include: { person: { select: { id: true, firstName: true, lastName: true, preferredName: true } } },
  });
}

export async function countSubmissions(organizationId: string, formId: string) {
  return tenantDb.formSubmission.count({ where: { organizationId, formId } });
}

export async function getSubmission(organizationId: string, submissionId: string) {
  return tenantDb.formSubmission.findFirst({
    where: { id: submissionId, organizationId },
    include: {
      person: { select: { id: true, firstName: true, lastName: true, preferredName: true } },
      form: { select: { id: true, title: true } },
    },
  });
}
