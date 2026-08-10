/**
 * Pure Journeys-domain helpers — no Prisma access, unit-tested without a database.
 */

export interface JourneyProgress {
  totalMilestones: number;
  completedMilestones: number;
  /** 0–100, rounded; 0 for a journey with no milestones. */
  percent: number;
  /** The first uncompleted milestone in order, or null when done/empty. */
  nextMilestone: { id: string; name: string } | null;
  /** True when every milestone (≥1) is completed. */
  isComplete: boolean;
}

/**
 * Compute an enrollment's progress against the journey's CURRENT ordered milestone list.
 * Journeys are living pathways — progress is always relative to today's definition
 * (docs/domain/journeys.md "Editing note"), unlike form submissions which pin a version.
 */
export function journeyProgress(
  milestones: { id: string; name: string; order: number }[],
  completedMilestoneIds: Iterable<string>,
): JourneyProgress {
  const ordered = [...milestones].sort((a, b) => a.order - b.order);
  const completed = new Set(completedMilestoneIds);
  const completedCount = ordered.filter((m) => completed.has(m.id)).length;
  const next = ordered.find((m) => !completed.has(m.id)) ?? null;

  return {
    totalMilestones: ordered.length,
    completedMilestones: completedCount,
    percent: ordered.length === 0 ? 0 : Math.round((completedCount / ordered.length) * 100),
    nextMilestone: next ? { id: next.id, name: next.name } : null,
    isComplete: ordered.length > 0 && completedCount === ordered.length,
  };
}
