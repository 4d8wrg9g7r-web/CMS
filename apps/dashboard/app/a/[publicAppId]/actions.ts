"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { appFeedService, appMemberService, appService, messageService } from "@cms/database";
import { drainOutbox } from "../../../lib/outbox-worker";

/**
 * Public church-app actions (docs/domain/app.md): member sign-in and the
 * community feed. No staff session here — identity is the app-member session
 * cookie (per-app path), and every call re-resolves the app by publicAppId so
 * all service calls stay org-scoped. Member writes are their own posts, likes,
 * and comments only; moderation lives in the dashboard.
 */

const SESSION_COOKIE = (publicAppId: string) => `app_session_${publicAppId}`;
const SESSION_MAX_AGE = 90 * 24 * 60 * 60;

async function resolveApp(publicAppId: string) {
  const app = await appService.resolvePublicApp(publicAppId);
  if (!app) throw new Error("This app is not available.");
  return app;
}

async function requireMember(publicAppId: string, organizationId: string) {
  const token = (await cookies()).get(SESSION_COOKIE(publicAppId))?.value ?? "";
  const member = await appMemberService.getSessionMember(organizationId, token);
  if (!member) throw new Error("Sign in first.");
  return member;
}

export interface SignInFormState {
  step: "email" | "code";
  email: string;
  error: string | null;
}

/** Step 1: email in, code out (via the message pipeline). Same reply whether or not the email matched. */
export async function requestAppCodeAction(
  publicAppId: string,
  _prev: SignInFormState,
  formData: FormData,
): Promise<SignInFormState> {
  const app = await resolveApp(publicAppId);
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { step: "email", email: "", error: "Enter your email address." };

  const request = await appMemberService.requestLoginCode(app.organizationId, email);
  if (request) {
    // Transactional (user-initiated sign-in): sent without a person link so the
    // marketing opt-out doesn't lock members out of their own app.
    await messageService.queueMessage({
      organizationId: app.organizationId,
      toEmail: request.email,
      subject: `${request.code} is your ${app.manifest.appName} sign-in code`,
      body: `Hi ${request.firstName},\n\nYour sign-in code for ${app.manifest.appName} is: ${request.code}\n\nIt expires in 10 minutes. If you didn't request this, you can ignore this email.`,
      source: "app_signin",
    });
    after(async () => {
      try {
        await drainOutbox();
      } catch (err) {
        console.error("Opportunistic outbox drain failed (cron will retry):", err);
      }
    });
  }
  // Identical response either way — no account enumeration.
  return { step: "code", email, error: null };
}

/** Step 2: code in, session cookie out. */
export async function verifyAppCodeAction(
  publicAppId: string,
  _prev: SignInFormState,
  formData: FormData,
): Promise<SignInFormState> {
  const app = await resolveApp(publicAppId);
  const email = String(formData.get("email") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { step: "code", email, error: "Enter the 6-digit code from your email." };

  const result = await appMemberService.verifyLoginCode(app.organizationId, email, code);
  if (!result.ok) return { step: "code", email, error: result.error };

  (await cookies()).set(SESSION_COOKIE(publicAppId), result.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: `/a/${publicAppId}`,
    maxAge: SESSION_MAX_AGE,
  });
  redirect(`/a/${publicAppId}`);
}

export async function signOutAppAction(publicAppId: string): Promise<void> {
  const app = await resolveApp(publicAppId);
  const store = await cookies();
  const token = store.get(SESSION_COOKIE(publicAppId))?.value ?? "";
  await appMemberService.signOut(app.organizationId, token);
  store.delete(SESSION_COOKIE(publicAppId));
  redirect(`/a/${publicAppId}`);
}

export interface PostFormState {
  error: string | null;
}

export async function createAppPostAction(
  publicAppId: string,
  _prev: PostFormState,
  formData: FormData,
): Promise<PostFormState> {
  try {
    const app = await resolveApp(publicAppId);
    if (!app.manifest.allowMemberPosts) return { error: "Posting is turned off for this app." };
    const member = await requireMember(publicAppId, app.organizationId);
    await appFeedService.createMemberPost(app.organizationId, member.personId, {
      body: String(formData.get("body") ?? ""),
      groupId: String(formData.get("groupId") ?? "") || null,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not post" };
  }
  revalidatePath(`/a/${publicAppId}`);
  return { error: null };
}

export async function toggleAppLikeAction(publicAppId: string, postId: string): Promise<void> {
  const app = await resolveApp(publicAppId);
  const member = await requireMember(publicAppId, app.organizationId);
  await appFeedService.toggleLike(app.organizationId, member.personId, postId);
  revalidatePath(`/a/${publicAppId}`);
}

export async function addAppCommentAction(
  publicAppId: string,
  postId: string,
  _prev: PostFormState,
  formData: FormData,
): Promise<PostFormState> {
  try {
    const app = await resolveApp(publicAppId);
    const member = await requireMember(publicAppId, app.organizationId);
    await appFeedService.addComment(app.organizationId, member.personId, postId, String(formData.get("body") ?? ""));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not comment" };
  }
  revalidatePath(`/a/${publicAppId}`);
  return { error: null };
}
