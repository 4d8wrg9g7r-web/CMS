import { JourneyEnrollmentStatus, Prisma } from "@prisma/client";
import { tenantDb } from "../client";
import { journeyProgress } from "../journeys/helpers";

/**
 * Journeys service (BLUEPRINT §6). Tenant-scoped throughout. Enrollment is idempotent
 * (unique journey+person) so the ENROLL_IN_JOURNEY workflow step can fire safely on
 * every trigger; completions auto-complete the enrollment when the last milestone lands.
 * Audit events are recorded by callers (server actions / workflow timeline).
 */

// -- Definitions & milestones --------------------------------------------------

export async function listJourneys(organizationId: string, opts: { includeArchived?: boolean } = {}) {
  return tenantDb.journeyDefinition.findMany({
    where: { organizationId, ...(opts.includeArchived ? {} : { archivedAt: null }) },
    orderBy: { name: "asc" },
    include: {
      milestones: { orderBy: { order: "asc" }, select: { id: true } },
      _count: { select: { enrollments: { where: { status: JourneyEnrollmentStatus.ACTIVE } } } },
    },
  });
}

export async function getJourney(organizationId: string, journeyId: string) {
  return tenantDb.journeyDefinition.findFirst({
    where: { id: journeyId, organizationId },
    include: {
      milestones: { orderBy: { order: "asc" } },
      enrollments: {
        orderBy: { startedAt: "desc" },
        include: {
          person: { select: { id: true, firstName: true, lastName: true, preferredName: true } },
          completions: { select: { milestoneId: true } },
        },
      },
    },
  });
}

export async function createJourney(organizationId: string, input: { name: string; description?: string | null }) {
  return tenantDb.journeyDefinition.create({
    data: { organizationId, name: input.name.trim(), description: input.description?.trim() || null },
  });
}

export async function updateJourney(
  organizationId: string,
  journeyId: string,
  input: Partial<{ name: string; description: string | null; isActive: boolean }>,
) {
  const data: Prisma.JourneyDefinitionUncheckedUpdateManyInput = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  const result = await tenantDb.journeyDefinition.updateMany({ where: { id: journeyId, organizationId }, data });
  return result.count > 0;
}

export async function archiveJourney(organizationId: string, journeyId: string) {
  const result = await tenantDb.journeyDefinition.updateMany({
    where: { id: journeyId, organizationId },
    data: { archivedAt: new Date(), isActive: false },
  });
  return result.count > 0;
}

export async function restoreJourney(organizationId: string, journeyId: string) {
  const result = await tenantDb.journeyDefinition.updateMany({
    where: { id: journeyId, organizationId },
    data: { archivedAt: null },
  });
  return result.count > 0;
}

export async function addMilestone(
  organizationId: string,
  journeyId: string,
  input: { name: string; description?: string | null; targetDays?: number | null },
) {
  const journey = await tenantDb.journeyDefinition.findFirst({ where: { id: journeyId, organizationId } });
  if (!journey) throw new Error("Journey not found.");
  const last = await tenantDb.journeyMilestone.findFirst({
    where: { organizationId, journeyId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  return tenantDb.journeyMilestone.create({
    data: {
      organizationId,
      journeyId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      targetDays: input.targetDays ?? null,
      order: (last?.order ?? -1) + 1,
    },
  });
}

export async function updateMilestone(
  organizationId: string,
  milestoneId: string,
  input: Partial<{ name: string; description: string | null; targetDays: number | null }>,
) {
  const data: Prisma.JourneyMilestoneUncheckedUpdateManyInput = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.targetDays !== undefined) data.targetDays = input.targetDays;
  const result = await tenantDb.journeyMilestone.updateMany({ where: { id: milestoneId, organizationId }, data });
  return result.count > 0;
}

/** Removing a milestone cascades its completion records (living-pathway semantics). */
export async function removeMilestone(organizationId: string, milestoneId: string) {
  const result = await tenantDb.journeyMilestone.deleteMany({ where: { id: milestoneId, organizationId } });
  return result.count > 0;
}

/**
 * Move a milestone one position up or down. Swaps `order` with its neighbor through a
 * temporary negative slot so the (journeyId, order) unique constraint never trips.
 */
export async function moveMilestone(organizationId: string, milestoneId: string, direction: "up" | "down") {
  const milestone = await tenantDb.journeyMilestone.findFirst({ where: { id: milestoneId, organizationId } });
  if (!milestone) return false;
  const neighbor = await tenantDb.journeyMilestone.findFirst({
    where: {
      organizationId,
      journeyId: milestone.journeyId,
      order: direction === "up" ? { lt: milestone.order } : { gt: milestone.order },
    },
    orderBy: { order: direction === "up" ? "desc" : "asc" },
  });
  if (!neighbor) return false;

  await tenantDb.journeyMilestone.updateMany({
    where: { id: milestone.id, organizationId },
    data: { order: -1 - milestone.order },
  });
  await tenantDb.journeyMilestone.updateMany({
    where: { id: neighbor.id, organizationId },
    data: { order: milestone.order },
  });
  await tenantDb.journeyMilestone.updateMany({
    where: { id: milestone.id, organizationId },
    data: { order: neighbor.order },
  });
  return true;
}

// -- Enrollment & progress -----------------------------------------------------

export type EnrollResult =
  | { ok: true; enrollmentId: string; alreadyEnrolled: boolean }
  | { ok: false; reason: "not_found" | "inactive" };

/**
 * Enroll a person. Idempotent: an existing enrollment (any status) is returned as
 * alreadyEnrolled rather than duplicated -- safe for workflow steps that may fire more
 * than once per person.
 */
export async function enroll(
  organizationId: string,
  journeyId: string,
  personId: string,
  opts: { enrolledByUserId?: string | null; workflowRunId?: string | null } = {},
): Promise<EnrollResult> {
  const journey = await tenantDb.journeyDefinition.findFirst({ where: { id: journeyId, organizationId } });
  if (!journey || journey.archivedAt) return { ok: false, reason: "not_found" };
  if (!journey.isActive) return { ok: false, reason: "inactive" };

  const person = await tenantDb.person.findFirst({ where: { id: personId, organizationId } });
  if (!person) return { ok: false, reason: "not_found" };

  const existing = await tenantDb.journeyEnrollment.findFirst({ where: { organizationId, journeyId, personId } });
  if (existing) return { ok: true, enrollmentId: existing.id, alreadyEnrolled: true };

  const enrollment = await tenantDb.journeyEnrollment.create({
    data: {
      organizationId,
      journeyId,
      personId,
      enrolledByUserId: opts.enrolledByUserId ?? null,
      workflowRunId: opts.workflowRunId ?? null,
    },
  });
  return { ok: true, enrollmentId: enrollment.id, alreadyEnrolled: false };
}

/**
 * Mark a milestone complete for an ACTIVE enrollment. Idempotent per (enrollment,
 * milestone). Auto-completes the enrollment when every current milestone is done.
 * Returns whether the whole journey completed as a result.
 */
export async function completeMilestone(
  organizationId: string,
  enrollmentId: string,
  milestoneId: string,
  completedByUserId?: string | null,
): Promise<{ ok: boolean; journeyCompleted: boolean }> {
  const enrollment = await tenantDb.journeyEnrollment.findFirst({
    where: { id: enrollmentId, organizationId, status: JourneyEnrollmentStatus.ACTIVE },
  });
  if (!enrollment) return { ok: false, journeyCompleted: false };

  const milestone = await tenantDb.journeyMilestone.findFirst({
    where: { id: milestoneId, organizationId, journeyId: enrollment.journeyId },
  });
  if (!milestone) return { ok: false, journeyCompleted: false };

  await tenantDb.journeyMilestoneCompletion.createMany({
    data: [{ organizationId, enrollmentId, milestoneId, completedByUserId: completedByUserId ?? null }],
    skipDuplicates: true,
  });

  const [milestones, completions] = await Promise.all([
    tenantDb.journeyMilestone.findMany({ where: { organizationId, journeyId: enrollment.journeyId } }),
    tenantDb.journeyMilestoneCompletion.findMany({
      where: { organizationId, enrollmentId },
      select: { milestoneId: true },
    }),
  ]);
  const progress = journeyProgress(milestones, completions.map((c) => c.milestoneId));

  if (progress.isComplete) {
    await tenantDb.journeyEnrollment.updateMany({
      where: { id: enrollmentId, organizationId, status: JourneyEnrollmentStatus.ACTIVE },
      data: { status: JourneyEnrollmentStatus.COMPLETED, completedAt: new Date() },
    });
  }
  return { ok: true, journeyCompleted: progress.isComplete };
}

/** Undo a completion; a COMPLETED enrollment drops back to ACTIVE. */
export async function uncompleteMilestone(organizationId: string, enrollmentId: string, milestoneId: string) {
  const result = await tenantDb.journeyMilestoneCompletion.deleteMany({
    where: { organizationId, enrollmentId, milestoneId },
  });
  if (result.count === 0) return false;
  await tenantDb.journeyEnrollment.updateMany({
    where: { id: enrollmentId, organizationId, status: JourneyEnrollmentStatus.COMPLETED },
    data: { status: JourneyEnrollmentStatus.ACTIVE, completedAt: null },
  });
  return true;
}

export async function exitEnrollment(organizationId: string, enrollmentId: string) {
  const result = await tenantDb.journeyEnrollment.updateMany({
    where: { id: enrollmentId, organizationId, status: JourneyEnrollmentStatus.ACTIVE },
    data: { status: JourneyEnrollmentStatus.EXITED, exitedAt: new Date() },
  });
  return result.count > 0;
}

export async function reactivateEnrollment(organizationId: string, enrollmentId: string) {
  const result = await tenantDb.journeyEnrollment.updateMany({
    where: { id: enrollmentId, organizationId, status: JourneyEnrollmentStatus.EXITED },
    data: { status: JourneyEnrollmentStatus.ACTIVE, exitedAt: null },
  });
  return result.count > 0;
}

/** A person's journeys with progress -- powers the Person detail panel. */
export async function listEnrollmentsForPerson(organizationId: string, personId: string) {
  const enrollments = await tenantDb.journeyEnrollment.findMany({
    where: { organizationId, personId },
    orderBy: { startedAt: "desc" },
    include: {
      journey: { include: { milestones: { orderBy: { order: "asc" } } } },
      completions: { select: { milestoneId: true } },
    },
  });
  return enrollments.map((e) => ({
    ...e,
    progress: journeyProgress(e.journey.milestones, e.completions.map((c) => c.milestoneId)),
  }));
}
