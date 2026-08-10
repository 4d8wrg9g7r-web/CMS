/**
 * Pure Groups-domain helpers, free of Prisma access so they unit-test without a
 * database. DB-touching behaviour lives in services/group-service.ts.
 */

/**
 * Whether a group with the given capacity can accept one more member. A null capacity
 * means unlimited. Used by group-service.addMember to reject over-capacity joins
 * (BLUEPRINT §8 "capacity").
 */
export function hasCapacity(currentCount: number, capacity: number | null | undefined): boolean {
  if (capacity === null || capacity === undefined) return true;
  return currentCount < capacity;
}
