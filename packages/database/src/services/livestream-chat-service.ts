import { LivestreamChatRoleKind } from "@prisma/client";
import { tenantDb } from "../client";

/**
 * Livestream chat (docs/domain/app.md): member messages on the app's
 * livestream tab, polled by clients. Assignable roles — HOST (badge +
 * moderation) and MODERATOR (moderation) — belong to people, not staff
 * accounts, so a volunteer can moderate from their phone. Staff moderate and
 * post from the dashboard (app.manage). Realtime is polling on an indexed
 * afterId cursor — no socket infrastructure on serverless.
 */

export const CHAT_MESSAGE_MAX = 500;
export const CHAT_PAGE_SIZE = 100;
export const CHAT_SLOW_MODE_MAX_SECONDS = 600;

/** Pure: message body validation, shared by API + dashboard. */
export function cleanChatBody(raw: unknown): { ok: true; body: string } | { ok: false; message: string } {
  const body = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!body) return { ok: false, message: "Say something first." };
  if (body.length > CHAT_MESSAGE_MAX) return { ok: false, message: `Keep it under ${CHAT_MESSAGE_MAX} characters.` };
  return { ok: true, body };
}

/** Pure: slow-mode gate — roles are exempt; returns seconds left to wait. */
export function chatWaitSeconds(lastPostedAt: Date | null, now: Date, slowModeSeconds: number, hasRole: boolean): number {
  if (hasRole || slowModeSeconds <= 0 || !lastPostedAt) return 0;
  const elapsed = (now.getTime() - lastPostedAt.getTime()) / 1000;
  return elapsed >= slowModeSeconds ? 0 : Math.ceil(slowModeSeconds - elapsed);
}

export async function listChatRoles(organizationId: string) {
  return tenantDb.livestreamChatRole.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
    include: { person: { select: { id: true, firstName: true, lastName: true, preferredName: true } } },
  });
}

export async function assignChatRole(organizationId: string, personId: string, role: LivestreamChatRoleKind) {
  const person = await tenantDb.person.findFirst({ where: { id: personId, organizationId, archivedAt: null } });
  if (!person) throw new Error("Person not found.");
  const existing = await tenantDb.livestreamChatRole.findFirst({ where: { organizationId, personId } });
  if (existing) {
    await tenantDb.livestreamChatRole.updateMany({ where: { id: existing.id, organizationId }, data: { role } });
    return existing.id;
  }
  const created = await tenantDb.livestreamChatRole.create({ data: { organizationId, personId, role } });
  return created.id;
}

export async function removeChatRole(organizationId: string, personId: string) {
  const result = await tenantDb.livestreamChatRole.deleteMany({ where: { organizationId, personId } });
  return result.count > 0;
}

export async function getChatRole(organizationId: string, personId: string): Promise<LivestreamChatRoleKind | null> {
  const row = await tenantDb.livestreamChatRole.findFirst({ where: { organizationId, personId } });
  return row?.role ?? null;
}

export interface ChatMessageView {
  id: string;
  personId: string | null;
  displayName: string;
  body: string;
  role: LivestreamChatRoleKind | "STAFF" | null;
  hiddenAt: Date | null;
  createdAt: Date;
}

/**
 * Recent messages ascending. `afterId` is the polling cursor (strictly newer
 * messages); hidden messages are excluded unless includeHidden (moderation).
 */
export async function listChatMessages(
  organizationId: string,
  opts: { afterId?: string; includeHidden?: boolean } = {},
): Promise<ChatMessageView[]> {
  let afterCreatedAt: Date | null = null;
  if (opts.afterId) {
    const anchor = await tenantDb.livestreamChatMessage.findFirst({
      where: { id: opts.afterId, organizationId },
      select: { createdAt: true },
    });
    afterCreatedAt = anchor?.createdAt ?? null;
  }
  // Newest page first, then re-sorted ascending for display.
  const rows = await tenantDb.livestreamChatMessage.findMany({
    where: {
      organizationId,
      ...(opts.includeHidden ? {} : { hiddenAt: null }),
      ...(afterCreatedAt ? { createdAt: { gt: afterCreatedAt } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: CHAT_PAGE_SIZE,
  });
  rows.reverse();

  const personIds = [...new Set(rows.map((r) => r.personId).filter((v): v is string => !!v))];
  const roles = personIds.length
    ? await tenantDb.livestreamChatRole.findMany({ where: { organizationId, personId: { in: personIds } } })
    : [];
  const roleByPerson = new Map(roles.map((r) => [r.personId, r.role]));

  return rows.map((r) => ({
    id: r.id,
    personId: r.personId,
    displayName: r.displayName,
    body: r.body,
    role: r.personId ? (roleByPerson.get(r.personId) ?? null) : "STAFF",
    hiddenAt: r.hiddenAt,
    createdAt: r.createdAt,
  }));
}

/** Member post — slow mode applies unless the person holds a chat role. */
export async function postChatMessage(
  organizationId: string,
  input: { personId: string; displayName: string; body: string },
): Promise<{ ok: true; id: string } | { ok: false; error: "invalid" | "slow_mode"; message: string; waitSeconds?: number }> {
  const cleaned = cleanChatBody(input.body);
  if (!cleaned.ok) return { ok: false, error: "invalid", message: cleaned.message };

  const app = await tenantDb.churchApp.findFirst({
    where: { organizationId },
    select: { chatSlowModeSeconds: true },
  });
  const slowMode = app?.chatSlowModeSeconds ?? 0;
  if (slowMode > 0) {
    const [role, last] = await Promise.all([
      getChatRole(organizationId, input.personId),
      tenantDb.livestreamChatMessage.findFirst({
        where: { organizationId, personId: input.personId },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    ]);
    const wait = chatWaitSeconds(last?.createdAt ?? null, new Date(), slowMode, role !== null);
    if (wait > 0) {
      return { ok: false, error: "slow_mode", message: `Slow mode is on — try again in ${wait}s.`, waitSeconds: wait };
    }
  }

  const created = await tenantDb.livestreamChatMessage.create({
    data: {
      organizationId,
      personId: input.personId,
      displayName: input.displayName.trim().slice(0, 80) || "Member",
      body: cleaned.body,
    },
  });
  return { ok: true, id: created.id };
}

/** Staff post from the dashboard (no person, no slow mode). */
export async function postStaffChatMessage(organizationId: string, input: { displayName: string; body: string }) {
  const cleaned = cleanChatBody(input.body);
  if (!cleaned.ok) throw new Error(cleaned.message);
  return tenantDb.livestreamChatMessage.create({
    data: {
      organizationId,
      displayName: input.displayName.trim().slice(0, 80) || "Church team",
      body: cleaned.body,
    },
  });
}

export async function setChatMessageHidden(organizationId: string, messageId: string, hidden: boolean) {
  const result = await tenantDb.livestreamChatMessage.updateMany({
    where: { id: messageId, organizationId },
    data: { hiddenAt: hidden ? new Date() : null },
  });
  return result.count > 0;
}

export async function setChatSlowMode(organizationId: string, seconds: number) {
  const value = Math.max(0, Math.min(CHAT_SLOW_MODE_MAX_SECONDS, Math.round(seconds)));
  const result = await tenantDb.churchApp.updateMany({
    where: { organizationId },
    data: { chatSlowModeSeconds: value },
  });
  return result.count > 0;
}
