import { PrismaClient } from "@prisma/client";

/**
 * Models that carry organizationId and must never be queried/mutated without it.
 * This is the backstop layer of tenant isolation (brief §6) — the primary mechanism
 * is the service-layer helpers in src/services/*, which always pass organizationId.
 * This extension exists so a service-layer bug becomes a thrown error instead of a
 * silent cross-tenant leak. A CI grep check (scripts/check-tenant-scoping.sh) is the
 * third layer, forbidding raw prisma.<tenantModel> calls outside the service layer.
 */
export const TENANT_SCOPED_MODELS = new Set([
  "OrganizationMember",
  "Campus",
  "AuditLog",
  "Person",
  "Household",
  "PersonRelationship",
  "PersonImport",
  "PersonFieldDefinition",
  "PersonFieldValue",
  "Fund",
  "ContributionBatch",
  "Contribution",
  "OnlineGivingConfig",
  "RecurringGift",
  "SavedReport",
  "EmailBlast",
  "EmailBlastAttachment",
  "SavedPersonFilter",
  "DashboardPreference",
  "Sermon",
  "ChurchApp",
  "AppPost",
  "AppPostLike",
  "AppPostComment",
  "AppLoginCode",
  "AppSession",
  "AppPushSubscription",
  "AppPage",
  "Group",
  "GroupMembership",
  "GroupPost",
  "GroupPostPrayer",
  "GroupEvent",
  "GroupEventRsvp",
  "GroupPoll",
  "GroupPollVote",
  "FormDefinition",
  "FormVersion",
  "FormSubmission",
  "WorkflowDefinition",
  "WorkflowVersion",
  "WorkflowRun",
  "Task",
  "JourneyDefinition",
  "JourneyMilestone",
  "JourneyEnrollment",
  "JourneyMilestoneCompletion",
  "Event",
  "EventRegistration",
  "Message",
  "CheckIn",
  "ServingTeam",
  "ServingPosition",
  "ServingAssignment",
  "PersonQualification",
  "File",
  "ApiKey",
  "WebhookSubscription",
  "WebhookDelivery",
]);

const FIND_UNIQUE_OPS = new Set(["findUnique", "findUniqueOrThrow"]);
const SCOPED_READ_WRITE_OPS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);
const CREATE_OPS = new Set(["create", "createMany"]);

export function isScopedWhere(where: unknown): boolean {
  if (!where || typeof where !== "object") return false;
  const w = where as Record<string, unknown>;
  if (typeof w.organizationId !== "undefined") return true;
  if (Array.isArray(w.AND) && w.AND.some(isScopedWhere)) return true;
  if (Array.isArray(w.OR) && w.OR.length > 0 && w.OR.every(isScopedWhere)) return true;
  return false;
}

export function isScopedCreateData(data: unknown): boolean {
  if (Array.isArray(data)) {
    return data.length > 0 && data.every(isScopedCreateData);
  }
  if (!data || typeof data !== "object") return false;
  return typeof (data as Record<string, unknown>).organizationId !== "undefined";
}

class TenantScopeViolationError extends Error {
  constructor(model: string, operation: string) {
    super(
      `Tenant scoping violation: ${model}.${operation} was called without organizationId. ` +
        `Use the service-layer helpers in @cms/database/services, which always scope by organizationId. ` +
        `findUnique/findUniqueOrThrow are disallowed on tenant models — use findFirst with organizationId instead.`,
    );
    this.name = "TenantScopeViolationError";
  }
}

/**
 * Wraps a raw PrismaClient with a runtime guardrail that throws if any query
 * against a tenant-owned model omits organizationId. Intended to be applied once,
 * inside the service layer — application code should never construct Prisma queries
 * directly against tenant models.
 */
export function withTenantGuard(client: PrismaClient) {
  return client.$extends({
    name: "tenant-guard",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          if (FIND_UNIQUE_OPS.has(operation)) {
            throw new TenantScopeViolationError(model, operation);
          }

          if (CREATE_OPS.has(operation)) {
            const data = (args as { data?: unknown }).data;
            if (!isScopedCreateData(data)) {
              throw new TenantScopeViolationError(model, operation);
            }
            return query(args);
          }

          if (SCOPED_READ_WRITE_OPS.has(operation)) {
            const where = (args as { where?: unknown }).where;
            if (!isScopedWhere(where)) {
              throw new TenantScopeViolationError(model, operation);
            }
            return query(args);
          }

          return query(args);
        },
      },
    },
  });
}
