import { appMemberService, appService, type AppMember, type PublicApp } from "@cms/database";

/**
 * Bearer-token auth for the native app's member endpoints (docs/domain/app.md).
 * The token is the same AppSession credential the web PWA keeps in its cookie —
 * issued by verifyLoginCode, hashed at rest, 90-day expiry. Every route
 * re-resolves the app by publicAppId so all service calls stay org-scoped.
 */

export interface ResolvedAppRequest {
  app: PublicApp;
  member: AppMember | null;
}

export function bearerToken(req: Request): string {
  const header = req.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
}

/** Null when the app doesn't exist or isn't published (caller 404s). */
export async function resolveAppRequest(req: Request, publicAppId: string): Promise<ResolvedAppRequest | null> {
  const app = await appService.resolvePublicApp(publicAppId);
  if (!app) return null;
  const token = bearerToken(req);
  const member = token ? await appMemberService.getSessionMember(app.organizationId, token) : null;
  return { app, member };
}

export function memberJson(member: AppMember) {
  return {
    person_id: member.personId,
    first_name: member.firstName,
    display_name: member.displayName,
    photo_url: member.photoUrl,
  };
}
