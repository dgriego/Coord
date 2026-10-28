import { auditLog } from "./db/schema.ts";
import type { Db, Tx } from "./db/client.ts";

export interface AuditInput {
  studioId: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

/** Records who changed what. Call inside the same transaction as the change. */
export async function audit(tx: Tx | Db, entry: AuditInput) {
  await tx.insert(auditLog).values({
    studioId: entry.studioId,
    actorUserId: entry.actorUserId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}
