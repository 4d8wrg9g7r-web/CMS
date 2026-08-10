import { OutboxStatus, Prisma } from "@prisma/client";
import { rawDb } from "../client";
import { computeBackoff } from "../outbox/backoff";

/**
 * Transactional outbox service (BLUEPRINT §38). Uses rawDb intentionally: emission
 * happens inside the caller's transaction (atomic with the state change), and the worker
 * scans/updates events across tenants with explicit organization context -- the
 * documented background-job exception (BLUEPRINT §32). These infra tables are touched
 * only here, never by app code, so they stay out of the app-facing tenant guard.
 */

export interface EmitInput {
  organizationId: string;
  type: string;
  payload: unknown;
  dedupeKey?: string;
  maxAttempts?: number;
}

/**
 * Insert an event INSIDE the caller's transaction so it commits atomically with the
 * domain state that produced it. Pass the Prisma transaction client from
 * `rawDb.$transaction(async (tx) => ...)`. Idempotent on (organizationId, dedupeKey) when
 * a dedupeKey is supplied.
 */
export async function emit(tx: Prisma.TransactionClient, input: EmitInput) {
  return tx.outboxEvent.create({
    data: {
      organizationId: input.organizationId,
      type: input.type,
      payload: input.payload as Prisma.InputJsonValue,
      dedupeKey: input.dedupeKey ?? null,
      maxAttempts: input.maxAttempts ?? 5,
    },
  });
}

/** Emit outside any surrounding transaction (best-effort, not atomic with other writes). */
export async function emitStandalone(input: EmitInput) {
  return rawDb.$transaction((tx) => emit(tx, input));
}

export interface ClaimedEvent {
  id: string;
  organizationId: string;
  type: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
}

/**
 * Atomically move up to `limit` due PENDING events to PROCESSING and return the ones this
 * caller won. The per-row guarded update (status must still be PENDING) means two
 * concurrent drainers never process the same event.
 */
export async function claimBatch(limit = 20): Promise<ClaimedEvent[]> {
  const candidates = await rawDb.outboxEvent.findMany({
    where: { status: OutboxStatus.PENDING, nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
  });

  const claimed: ClaimedEvent[] = [];
  for (const event of candidates) {
    const res = await rawDb.outboxEvent.updateMany({
      where: { id: event.id, status: OutboxStatus.PENDING },
      data: { status: OutboxStatus.PROCESSING, updatedAt: new Date() },
    });
    if (res.count === 1) {
      claimed.push({
        id: event.id,
        organizationId: event.organizationId,
        type: event.type,
        payload: event.payload,
        attempts: event.attempts,
        maxAttempts: event.maxAttempts,
      });
    }
  }
  return claimed;
}

export async function markCompleted(id: string) {
  await rawDb.outboxEvent.update({
    where: { id },
    data: { status: OutboxStatus.COMPLETED, processedAt: new Date(), lastError: null },
  });
}

/** Schedule another attempt with exponential backoff. */
export async function markRetry(id: string, attempts: number, error: string) {
  await rawDb.outboxEvent.update({
    where: { id },
    data: {
      status: OutboxStatus.PENDING,
      attempts,
      nextAttemptAt: new Date(Date.now() + computeBackoff(attempts)),
      lastError: error.slice(0, 1000),
    },
  });
}

/** Dead-letter: no more retries. Stays visible in the table with its last error. */
export async function markFailed(id: string, attempts: number, error: string) {
  await rawDb.outboxEvent.update({
    where: { id },
    data: { status: OutboxStatus.FAILED, attempts, processedAt: new Date(), lastError: error.slice(0, 1000) },
  });
}

/** Return events stuck in PROCESSING (crashed worker) to PENDING so they get retried. */
export async function reclaimStale(olderThanMs = 5 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const res = await rawDb.outboxEvent.updateMany({
    where: { status: OutboxStatus.PROCESSING, updatedAt: { lt: cutoff } },
    data: { status: OutboxStatus.PENDING },
  });
  return res.count;
}

export async function hasProcessed(eventId: string, handler: string): Promise<boolean> {
  const row = await rawDb.processedEvent.findFirst({ where: { eventId, handler } });
  return row !== null;
}

export async function markProcessed(organizationId: string, eventId: string, handler: string) {
  try {
    await rawDb.processedEvent.create({ data: { organizationId, eventId, handler } });
  } catch (err) {
    // Unique (eventId, handler) violation just means another drainer recorded it first --
    // that's the at-most-once guarantee working, not an error.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
  }
}

export interface OutboxHandler {
  name: string;
  run: (event: ClaimedEvent) => Promise<void>;
}

/** Event type -> handlers subscribed to it. */
export type HandlerRegistry = Record<string, OutboxHandler[]>;

/**
 * Drain due events once: claim a batch, dispatch each to its handlers with per-handler
 * idempotency, and complete/retry/dead-letter based on the outcome. A handler that already
 * ran for an event (ProcessedEvent) is skipped, so a partial failure re-runs only the
 * handlers that hadn't succeeded. Returns processing counts.
 */
export async function drain(
  registry: HandlerRegistry,
  opts: { batchSize?: number; reclaimStaleMs?: number } = {},
): Promise<{ processed: number; failed: number; retried: number }> {
  await reclaimStale(opts.reclaimStaleMs);
  const events = await claimBatch(opts.batchSize ?? 20);

  let processed = 0;
  let failed = 0;
  let retried = 0;

  for (const event of events) {
    const handlers = registry[event.type] ?? [];
    try {
      for (const handler of handlers) {
        if (await hasProcessed(event.id, handler.name)) continue;
        await handler.run(event);
        await markProcessed(event.organizationId, event.id, handler.name);
      }
      await markCompleted(event.id);
      processed++;
    } catch (err) {
      const attempts = event.attempts + 1;
      const message = err instanceof Error ? err.message : String(err);
      if (attempts >= event.maxAttempts) {
        await markFailed(event.id, attempts, message);
        failed++;
      } else {
        await markRetry(event.id, attempts, message);
        retried++;
      }
    }
  }

  return { processed, failed, retried };
}
