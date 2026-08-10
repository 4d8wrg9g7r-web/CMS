import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { auditService, peopleService, type MembershipStatus } from "@cms/database";
import { authenticateApiRequest } from "../../../../lib/api-auth";
import { drainOutbox } from "../../../../lib/outbox-worker";

export const runtime = "nodejs";

/**
 * Public API v1: People (BLUEPRINT §42). Runs through the same tenant-scoped services as
 * first-party clients — POST /people emits PersonCreated exactly like dashboard
 * creation, so workflows and webhooks fire identically. Purpose-built read models; no
 * raw entity serialization.
 */

function personReadModel(p: {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  email: string | null;
  phone: string | null;
  membershipStatus: string;
  createdAt: Date;
}) {
  return {
    id: p.id,
    first_name: p.firstName,
    last_name: p.lastName,
    preferred_name: p.preferredName,
    email: p.email,
    phone: p.phone,
    membership_status: p.membershipStatus,
    created_at: p.createdAt.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const authed = await authenticateApiRequest(req);
  if (!authed.ok) return authed.response;

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? undefined;
  const status = (url.searchParams.get("status") as MembershipStatus | null) ?? undefined;

  const people = await peopleService.listPeople(authed.auth.organizationId, { search: q, status, take: 100 });
  return NextResponse.json({ data: people.map(personReadModel) });
}

export async function POST(req: NextRequest) {
  const authed = await authenticateApiRequest(req);
  if (!authed.ok) return authed.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: "invalid_json", message: "Body must be JSON" } }, { status: 400 });
  }

  const firstName = typeof body.first_name === "string" ? body.first_name.trim() : "";
  const lastName = typeof body.last_name === "string" ? body.last_name.trim() : "";
  if (!firstName || !lastName) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "first_name and last_name are required" } },
      { status: 422 },
    );
  }

  const person = await peopleService.createPerson(authed.auth.organizationId, {
    firstName,
    lastName,
    email: typeof body.email === "string" ? body.email : null,
    phone: typeof body.phone === "string" ? body.phone : null,
  });

  await auditService.recordAuditEvent({
    organizationId: authed.auth.organizationId,
    actorUserId: null,
    action: "person.created",
    targetType: "Person",
    targetId: person.id,
    metadata: { via: "api", apiKeyId: authed.auth.apiKeyId },
  });

  after(async () => {
    try {
      await drainOutbox();
    } catch (err) {
      console.error("Opportunistic outbox drain failed (cron will retry):", err);
    }
  });

  return NextResponse.json({ data: personReadModel(person) }, { status: 201 });
}
