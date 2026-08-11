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

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as T;
}

export async function fetchDirectory(query?: string): Promise<DirectoryEntry[]> {
  const q = query?.trim();
  const data = await getJson<{ data: DirectoryEntry[] }>(
    `/api/app/v1/directory${q ? `?q=${encodeURIComponent(q)}` : ""}`,
  );
  return data.data;
}

export async function fetchApp(publicAppId: string): Promise<AppPayload> {
  const data = await getJson<{ data: AppPayload }>(`/api/app/v1/apps/${encodeURIComponent(publicAppId)}`);
  return data.data;
}
