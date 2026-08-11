import { MessageChannel, MessageStatus, Prisma } from "@prisma/client";
import { rawDb, tenantDb } from "../client";
import { emit } from "./outbox-service";

/**
 * Communications service (BLUEPRINT §19) — the canonical Message log. queueMessage is
 * the ONLY way the platform sends outbound mail: it enforces person-linked consent,
 * writes the Message row, and emits MessageQueued in one transaction (§38); the outbox
 * worker performs the actual provider send and records the outcome. Fire-and-forget
 * provider calls from feature code are a bug.
 */

export interface QueueMessageInput {
  organizationId: string;
  toEmail: string;
  toPersonId?: string | null;
  subject: string;
  body: string;
  source: string;
  workflowRunId?: string | null;
  blastId?: string | null;
}

export type QueueResult =
  | { queued: true; messageId: string }
  | { queued: false; messageId: string; reason: "opted_out" };

/**
 * Queue an email. If the linked person has opted out, the message is recorded as FAILED
 * ("opted out") WITHOUT emitting a send event — history without delivery, so staff can
 * see the suppression (§19 auditable consent).
 */
export async function queueMessage(input: QueueMessageInput): Promise<QueueResult> {
  const toPersonId = input.toPersonId ?? null;

  if (toPersonId) {
    const person = await tenantDb.person.findFirst({
      where: { id: toPersonId, organizationId: input.organizationId },
      select: { emailOptedOutAt: true },
    });
    if (person?.emailOptedOutAt) {
      const suppressed = await tenantDb.message.create({
        data: {
          organizationId: input.organizationId,
          channel: MessageChannel.EMAIL,
          toEmail: input.toEmail,
          toPersonId,
          subject: input.subject,
          body: input.body,
          status: MessageStatus.FAILED,
          source: input.source,
          workflowRunId: input.workflowRunId ?? null,
          blastId: input.blastId ?? null,
          error: "Suppressed: recipient has opted out of email",
        },
      });
      return { queued: false, messageId: suppressed.id, reason: "opted_out" };
    }
  }

  const message = await rawDb.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: {
        organizationId: input.organizationId,
        channel: MessageChannel.EMAIL,
        toEmail: input.toEmail,
        toPersonId,
        subject: input.subject,
        body: input.body,
        source: input.source,
        workflowRunId: input.workflowRunId ?? null,
        blastId: input.blastId ?? null,
      },
    });
    await emit(tx, {
      organizationId: input.organizationId,
      type: "MessageQueued",
      payload: { messageId: created.id },
    });
    return created;
  });

  return { queued: true, messageId: message.id };
}

/** Worker: load a QUEUED message for delivery (null if already handled/cancelled). */
export async function getQueuedMessage(organizationId: string, messageId: string) {
  return tenantDb.message.findFirst({
    where: { id: messageId, organizationId, status: MessageStatus.QUEUED },
    include: {
      // Blast messages carry their rendering + attachment context to the worker.
      blast: { include: { attachments: true } },
      organization: { select: { name: true } },
    },
  });
}

export async function markSent(organizationId: string, messageId: string) {
  await tenantDb.message.updateMany({
    where: { id: messageId, organizationId, status: MessageStatus.QUEUED },
    data: { status: MessageStatus.SENT, sentAt: new Date(), error: null },
  });
}

export async function markFailed(organizationId: string, messageId: string, error: string) {
  await tenantDb.message.updateMany({
    where: { id: messageId, organizationId, status: MessageStatus.QUEUED },
    data: { status: MessageStatus.FAILED, error: error.slice(0, 1000) },
  });
}

/** Staff resend of a FAILED message: queues a fresh message (new row, full history). */
export async function resend(organizationId: string, messageId: string): Promise<QueueResult | null> {
  const original = await tenantDb.message.findFirst({
    where: { id: messageId, organizationId, status: MessageStatus.FAILED },
  });
  if (!original) return null;
  return queueMessage({
    organizationId,
    toEmail: original.toEmail,
    toPersonId: original.toPersonId,
    subject: original.subject,
    body: original.body,
    source: "manual_resend",
    workflowRunId: original.workflowRunId,
  });
}

export interface ListMessagesOptions {
  status?: MessageStatus;
  source?: string;
  personId?: string;
  skip?: number;
  take?: number;
}

function messagesWhere(organizationId: string, opts: ListMessagesOptions): Prisma.MessageWhereInput {
  const where: Prisma.MessageWhereInput = { organizationId };
  if (opts.status) where.status = opts.status;
  if (opts.source) where.source = opts.source;
  if (opts.personId) where.toPersonId = opts.personId;
  return where;
}

export async function listMessages(organizationId: string, opts: ListMessagesOptions = {}) {
  return tenantDb.message.findMany({
    where: messagesWhere(organizationId, opts),
    orderBy: { createdAt: "desc" },
    skip: opts.skip,
    take: opts.take ?? 100,
    include: { toPerson: { select: { id: true, firstName: true, lastName: true, preferredName: true } } },
  });
}

export async function countMessages(organizationId: string, opts: ListMessagesOptions = {}) {
  return tenantDb.message.count({ where: messagesWhere(organizationId, opts) });
}

export async function listMessagesForPerson(organizationId: string, personId: string, take = 10) {
  return listMessages(organizationId, { personId, take });
}

// -- Email blasts (newsletters) ---------------------------------------------------

import type { BlastAudience } from "../messaging/audience";
import { formatFieldValue } from "../people/custom-fields";

export interface BlastAttachmentInput {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
}

/**
 * Resolve an audience to sendable recipients: non-archived people with an email,
 * deduplicated case-insensitively (shared family addresses get one copy). Consent
 * is NOT applied here — queueMessage enforces it per recipient so suppressions are
 * recorded as visible Message rows.
 */
export async function resolveBlastRecipients(
  organizationId: string,
  audience: BlastAudience,
): Promise<{ recipients: { id: string; email: string }[]; noEmailCount: number }> {
  const where: Prisma.PersonWhereInput = { organizationId, archivedAt: null };
  if (audience.kind === "filter") {
    if (audience.membershipStatus) where.membershipStatus = audience.membershipStatus as never;
    if (audience.campusId) where.campusId = audience.campusId;
    if (audience.tag) where.tags = { has: audience.tag };
  } else if (audience.kind === "group") {
    where.groupMemberships = { some: { groupId: audience.groupId } };
  } else if (audience.kind === "people") {
    where.id = { in: audience.personIds };
  }

  const people = await tenantDb.person.findMany({
    where,
    select: { id: true, email: true },
    orderBy: { createdAt: "asc" },
  });

  // Custom-field equality (same semantics as the report builder's field filter).
  let customPass: ((personId: string) => boolean) | null = null;
  if (audience.kind === "filter" && audience.customFieldKey && audience.customFieldValue) {
    const values = await tenantDb.personFieldValue.findMany({
      where: { organizationId, field: { key: audience.customFieldKey } },
      include: { field: { select: { type: true } } },
    });
    const wanted = audience.customFieldValue.toLowerCase();
    const matching = new Set(
      values.filter((v) => formatFieldValue(v.field.type, v.value).toLowerCase() === wanted).map((v) => v.personId),
    );
    customPass = (personId) => matching.has(personId);
  }

  const seen = new Set<string>();
  const recipients: { id: string; email: string }[] = [];
  let noEmailCount = 0;
  for (const person of people) {
    if (customPass && !customPass(person.id)) continue;
    const email = person.email?.trim();
    if (!email) {
      noEmailCount++;
      continue;
    }
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push({ id: person.id, email });
  }
  return { recipients, noEmailCount };
}

/**
 * Create a blast and fan it out: one consent-checked queueMessage per recipient
 * (each with its own outbox event, so delivery inherits retry/backoff), then the
 * stored counts reflect what actually happened.
 */
export async function createEmailBlast(
  organizationId: string,
  input: {
    subject: string;
    bodyMarkdown: string;
    /** Rich block layout; bodyMarkdown then holds the plain-text alternative. */
    blocks?: unknown[] | null;
    audience: BlastAudience;
    attachments: BlastAttachmentInput[];
    createdByUserId?: string | null;
  },
) {
  const subject = input.subject.trim();
  if (!subject) throw new Error("Subject is required.");
  if (!input.bodyMarkdown.trim()) throw new Error("Write the email body first.");

  const blast = await tenantDb.emailBlast.create({
    data: {
      organizationId,
      subject,
      bodyMarkdown: input.bodyMarkdown,
      blocks: (input.blocks ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      audience: input.audience as unknown as Prisma.InputJsonValue,
      createdByUserId: input.createdByUserId ?? null,
      attachments: {
        create: input.attachments.map((a) => ({
          organizationId,
          fileName: a.fileName,
          contentType: a.contentType,
          sizeBytes: a.sizeBytes,
          storageKey: a.storageKey,
        })),
      },
    },
  });

  const { recipients, noEmailCount } = await resolveBlastRecipients(organizationId, input.audience);
  let queued = 0;
  let suppressed = 0;
  for (const recipient of recipients) {
    const result = await queueMessage({
      organizationId,
      toEmail: recipient.email,
      toPersonId: recipient.id,
      subject,
      body: input.bodyMarkdown,
      source: "blast",
      blastId: blast.id,
    });
    if (result.queued) queued++;
    else suppressed++;
  }

  await tenantDb.emailBlast.updateMany({
    where: { id: blast.id, organizationId },
    data: { recipientCount: queued, suppressedCount: suppressed, noEmailCount },
  });

  return { blastId: blast.id, recipientCount: queued, suppressedCount: suppressed, noEmailCount };
}

export async function listEmailBlasts(organizationId: string, take = 20) {
  const blasts = await tenantDb.emailBlast.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take,
    include: { createdBy: { select: { name: true, email: true } }, _count: { select: { attachments: true } } },
  });
  const counts = await tenantDb.message.groupBy({
    by: ["blastId", "status"],
    where: { organizationId, blastId: { in: blasts.map((b) => b.id) } },
    _count: true,
  });
  const byBlast = new Map<string, Record<string, number>>();
  for (const row of counts) {
    if (!row.blastId) continue;
    const entry = byBlast.get(row.blastId) ?? {};
    entry[row.status] = row._count;
    byBlast.set(row.blastId, entry);
  }
  return blasts.map((b) => ({
    ...b,
    sentCount: byBlast.get(b.id)?.SENT ?? 0,
    queuedCount: byBlast.get(b.id)?.QUEUED ?? 0,
    failedCount: byBlast.get(b.id)?.FAILED ?? 0,
  }));
}

export async function getEmailBlast(organizationId: string, blastId: string) {
  const blast = await tenantDb.emailBlast.findFirst({
    where: { id: blastId, organizationId },
    include: {
      attachments: true,
      createdBy: { select: { name: true, email: true } },
    },
  });
  if (!blast) return null;
  const [counts, failures] = await Promise.all([
    tenantDb.message.groupBy({
      by: ["status"],
      where: { organizationId, blastId },
      _count: true,
    }),
    tenantDb.message.findMany({
      where: { organizationId, blastId, status: MessageStatus.FAILED },
      select: { toEmail: true, error: true },
      take: 10,
    }),
  ]);
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  return {
    ...blast,
    sentCount: byStatus.SENT ?? 0,
    queuedCount: byStatus.QUEUED ?? 0,
    failedCount: byStatus.FAILED ?? 0,
    failures,
  };
}
