import type { Permission, Role } from "./roles.ts";

// Response shapes shared by the API and the web client.

export interface Me {
  user: { id: string; email: string; name: string };
  studio: { id: string; name: string };
  role: Role;
  permissions: Permission[];
  /** Cache partition for this user's view of the studio (PLAN.md 9.3). */
  cacheKey: string;
  studios: { id: string; name: string; role: Role }[];
}

export interface Member {
  userId: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
}

export interface InvitationPreview {
  studioName: string;
  email: string;
  role: Role;
  /** True when the invited email already has an account, so no password is needed. */
  hasAccount: boolean;
}

export interface CreatedInvitation extends Invitation {
  /** Shown once to the inviter so they can copy it; email delivery arrives with Postmark. */
  acceptUrl: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorName: string | null;
  createdAt: string;
  before: unknown;
  after: unknown;
}

export interface ApiError {
  error: { code: string; message: string; fields?: Record<string, string> };
}

/** Pushed over the studio event stream after a write commits. */
export interface InvalidateEvent {
  type: "invalidate";
  /** Query keys that are now stale, e.g. ["members"]. */
  keys: string[][];
}
