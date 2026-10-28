import { permissionKey, type Role } from "@coord/shared";

/**
 * Server-side read cache (PLAN.md 9.2–9.3). Every key is partitioned by studio,
 * studio data version and permission set, so:
 *  - any write to a studio bumps its version and orphans all older entries;
 *  - a response shaped for one permission set is never served to another.
 * In-memory with TTL for now; the same interface fronts Redis later.
 */
export class StudioCache {
  private versions = new Map<string, number>();
  private entries = new Map<string, { value: unknown; expires: number }>();

  constructor(
    private ttlMs = 60_000,
    private maxEntries = 5_000,
  ) {}

  bump(studioId: string) {
    this.versions.set(studioId, (this.versions.get(studioId) ?? 0) + 1);
  }

  key(studioId: string, role: Role, name: string): string {
    return `studio:${studioId}:v${this.versions.get(studioId) ?? 0}:perm:${permissionKey(role)}:${name}`;
  }

  async get<T>(studioId: string, role: Role, name: string, load: () => Promise<T>): Promise<T> {
    const key = this.key(studioId, role, name);
    const hit = this.entries.get(key);
    if (hit && hit.expires > Date.now()) return hit.value as T;
    const value = await load();
    // ttl 0 turns the cache off (serverless instances don't share memory or versions).
    if (this.ttlMs <= 0) return value;
    if (this.entries.size >= this.maxEntries) {
      // Map keeps insertion order, so the first key is the oldest.
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expires: Date.now() + this.ttlMs });
    return value;
  }
}
