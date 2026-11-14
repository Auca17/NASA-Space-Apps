/** Fetch helpers: 404 -> null (missing shards are normal states). */
import { DATA_BASE_URL, API_BASE } from "../config";

export function dataUrl(path: string): string {
  return DATA_BASE_URL.replace(/\/+$/, "") + "/" +
    path.replace(/^\/+/, "");
}

export function apiUrl(path: string): string {
  return API_BASE.replace(/\/+$/, "") + path;
}

export async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    if (r.status === 404) return null;
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export async function postJson<T>(path: string, body: unknown):
    Promise<T | null> {
  try {
    const r = await fetch(apiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}
