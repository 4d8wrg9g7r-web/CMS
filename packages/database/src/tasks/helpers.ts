import { TaskStatus } from "@prisma/client";

/**
 * Pure Tasks-domain helpers — no Prisma access, unit-tested without a database.
 */

/** A task is overdue when it's still live and its due date has passed. */
export function isOverdue(
  task: { status: TaskStatus; dueAt: Date | null | undefined },
  now: Date = new Date(),
): boolean {
  if (task.status !== TaskStatus.OPEN && task.status !== TaskStatus.IN_PROGRESS) return false;
  if (!task.dueAt) return false;
  return task.dueAt.getTime() < now.getTime();
}
