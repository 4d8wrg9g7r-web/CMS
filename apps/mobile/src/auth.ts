import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiBase } from "./api";
import type { ApiMember } from "./contract";

/**
 * Member auth for the native app: the email-code flow the web PWA uses, with a
 * Bearer token (the same AppSession credential) stored per church in
 * AsyncStorage. The server never reveals whether an email matched.
 */

const tokenKey = (publicAppId: string) => `cms.memberToken.${publicAppId}`;

export async function getToken(publicAppId: string): Promise<string | null> {
  return AsyncStorage.getItem(tokenKey(publicAppId));
}

export async function clearToken(publicAppId: string): Promise<void> {
  await AsyncStorage.removeItem(tokenKey(publicAppId));
}

export async function requestCode(publicAppId: string, email: string): Promise<void> {
  const res = await fetch(`${apiBase()}/api/app/v1/apps/${encodeURIComponent(publicAppId)}/auth/request-code`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error("Could not send the code. Check your connection.");
}

export async function verifyCode(
  publicAppId: string,
  email: string,
  code: string,
): Promise<{ member: ApiMember | null }> {
  const res = await fetch(`${apiBase()}/api/app/v1/apps/${encodeURIComponent(publicAppId)}/auth/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, code }),
  });
  const json = (await res.json()) as { token?: string; member?: ApiMember | null; message?: string };
  if (!res.ok || !json.token) {
    throw new Error(json.message ?? "That code didn't work. Check it and try again.");
  }
  await AsyncStorage.setItem(tokenKey(publicAppId), json.token);
  return { member: json.member ?? null };
}

export async function signOut(publicAppId: string): Promise<void> {
  const token = await getToken(publicAppId);
  if (token) {
    // Best-effort server revocation; the local token is cleared regardless.
    try {
      await fetch(`${apiBase()}/api/app/v1/apps/${encodeURIComponent(publicAppId)}/auth/signout`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
    } catch {
      /* offline sign-out still clears locally */
    }
  }
  await clearToken(publicAppId);
}
