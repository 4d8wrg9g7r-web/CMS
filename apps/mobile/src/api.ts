import Constants from "expo-constants";
import type { AppPayload, DirectoryEntry } from "./contract";

/**
 * Thin client for the CMS church-app content API (keyless, public content
 * only). Base URL: EXPO_PUBLIC_API_BASE at build/start time, else the
 * `apiBase` set in app.config.ts extra, else production.
 */

const DEFAULT_BASE = "https://cms-dashboard-isaiahshort-8905s-projects.vercel.app";

export function apiBase(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE;
  const raw = (Constants.expoConfig?.extra as { apiBase?: unknown } | undefined)?.apiBase;
  const fromConfig = typeof raw === "string" && raw ? raw : null;
  return (fromEnv || fromConfig || DEFAULT_BASE).replace(/\/$/, "");
}

/** Absolute URL for app-relative hrefs the API returns (e.g. /f/<publicId>). */
export function resolveUrl(href: string): string {
  return href.startsWith("/") ? `${apiBase()}${href}` : href;
}

async function getJson<T>(path: string, token?: string | null): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    headers: { accept: "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as T;
}

async function postJson<T>(path: string, token: string, body: unknown): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(json.message ?? `Request failed (${res.status})`);
  return json;
}

export async function fetchDirectory(query?: string): Promise<DirectoryEntry[]> {
  const q = query?.trim();
  const data = await getJson<{ data: DirectoryEntry[] }>(
    `/api/app/v1/directory${q ? `?q=${encodeURIComponent(q)}` : ""}`,
  );
  return data.data;
}

/** With a member token the feed personalizes and `member`/`my_groups` appear. */
export async function fetchApp(publicAppId: string, token?: string | null): Promise<AppPayload> {
  const data = await getJson<{ data: AppPayload }>(`/api/app/v1/apps/${encodeURIComponent(publicAppId)}`, token);
  return data.data;
}

const appPath = (publicAppId: string, rest: string) => `/api/app/v1/apps/${encodeURIComponent(publicAppId)}${rest}`;

export async function createPost(
  publicAppId: string,
  token: string,
  input: { body: string; groupId?: string | null; imageUrl?: string | null },
) {
  await postJson(appPath(publicAppId, "/posts"), token, {
    body: input.body,
    group_id: input.groupId ?? null,
    image_url: input.imageUrl ?? null,
  });
}

/** Upload a photo for a post (React Native multipart: {uri, name, type}). Returns its public URL. */
export async function uploadPhoto(
  publicAppId: string,
  token: string,
  asset: { uri: string; mimeType?: string | null; fileName?: string | null },
): Promise<string> {
  const form = new FormData();
  const type = asset.mimeType ?? "image/jpeg";
  const name = asset.fileName ?? `photo.${type.split("/")[1] ?? "jpg"}`;
  // React Native's fetch accepts {uri, name, type} file descriptors in FormData.
  form.append("file", { uri: asset.uri, name, type } as unknown as Blob);
  const res = await fetch(`${apiBase()}${appPath(publicAppId, "/photos")}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  const json = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
  if (!res.ok || !json.url) throw new Error(json.message ?? "Could not upload the photo.");
  return json.url;
}

export async function setReaction(publicAppId: string, token: string, postId: string, emoji: string) {
  await postJson(appPath(publicAppId, `/posts/${encodeURIComponent(postId)}/reaction`), token, { emoji });
}

export async function addComment(
  publicAppId: string,
  token: string,
  postId: string,
  body: string,
  parentCommentId?: string | null,
) {
  await postJson(appPath(publicAppId, `/posts/${encodeURIComponent(postId)}/comments`), token, {
    body,
    parent_comment_id: parentCommentId ?? null,
  });
}
