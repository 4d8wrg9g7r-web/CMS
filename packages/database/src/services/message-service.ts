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
