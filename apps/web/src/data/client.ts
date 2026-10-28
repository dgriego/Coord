import { QueryCache, QueryClient } from "@tanstack/react-query";
import { persistQueryClientRestore, persistQueryClientSubscribe } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { del, get, set } from "idb-keyval";
import { ApiError } from "../api.ts";

// Browser cache layer (PLAN.md 9.2): every query result is kept in IndexedDB
// so screens render instantly on the next visit, then refresh in the
// background. Storage is partitioned by the server-issued cacheKey
// (user + studio + permission set), so switching studio or role never shows
// data shaped for a different view.

const LAST_KEY = "studio:lastCacheKey";
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (err) => {
      if (err instanceof ApiError && err.status === 401) onUnauthorized();
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: MAX_AGE,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      refetchOnWindowFocus: true,
    },
  },
});

const storage = {
  getItem: async (key: string) => (await safe(() => get<string>(key))) ?? null,
  setItem: (key: string, value: string) => safe(() => set(key, value)),
  removeItem: (key: string) => safe(() => del(key)),
};

async function safe<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch {
    return undefined; // Private windows and blocked storage: run without the cache.
  }
}

let currentKey: string | null = null;
let unsubscribe: (() => void) | null = null;

function persisterFor(cacheKey: string) {
  return createAsyncStoragePersister({ storage, key: `studio-cache:${cacheKey}`, throttleTime: 500 });
}

/** Restores the last session's cache before first render, if there is one. */
export async function restoreLastCache() {
  let key: string | null = null;
  try {
    key = localStorage.getItem(LAST_KEY);
  } catch {}
  if (key) await switchPartition(key);
}

/** Points persistence at `cacheKey`, dropping in-memory data from any other partition. */
export async function switchPartition(cacheKey: string) {
  if (currentKey === cacheKey) return;
  const hadPartition = currentKey !== null;
  unsubscribe?.();
  if (hadPartition) {
    // Keep the fresh "me" so the app doesn't flash; everything else belongs to the old view.
    const me = queryClient.getQueryData(["me"]);
    queryClient.clear();
    if (me) queryClient.setQueryData(["me"], me);
  }
  currentKey = cacheKey;
  try {
    localStorage.setItem(LAST_KEY, cacheKey);
  } catch {}
  const persister = persisterFor(cacheKey);
  if (!hadPartition) await persistQueryClientRestore({ queryClient, persister, maxAge: MAX_AGE });
  unsubscribe = persistQueryClientSubscribe({ queryClient, persister });
}

/** Sign-out: forget everything this browser cached for the session. */
export async function clearAllCaches() {
  unsubscribe?.();
  unsubscribe = null;
  if (currentKey) await storage.removeItem(`studio-cache:${currentKey}`);
  currentKey = null;
  try {
    localStorage.removeItem(LAST_KEY);
  } catch {}
  queryClient.clear();
}
