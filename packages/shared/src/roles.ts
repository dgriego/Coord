// Roles and permissions shared by the API (enforcement) and the web app (hiding UI).
// The API is always the authority; the web app only uses these to avoid showing
// controls a user can't use.

export const ROLES = ["owner", "admin", "designer", "assistant", "bookkeeper"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  designer: "Designer",
  assistant: "Assistant",
  bookkeeper: "Bookkeeper",
};

export const PERMISSIONS = [
  "projects.edit",
  "cost.view",
  "pricing.edit",
  "documents.send",
  "payments.manage",
  "accounting.manage",
  "team.manage",
  "studio.settings",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

// Defaults from PLAN.md section 7. "Configurable" entries in the plan start
// enabled for designers; per-studio overrides arrive with studio settings.
const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: ["projects.edit", "cost.view", "pricing.edit", "documents.send", "payments.manage", "accounting.manage", "team.manage"],
  designer: ["projects.edit", "cost.view", "pricing.edit", "documents.send"],
  // Assistants source and enter items but never see or set cost and markup.
  assistant: ["projects.edit"],
  bookkeeper: ["cost.view", "documents.send", "payments.manage", "accounting.manage"],
};

export function permissionsFor(role: Role): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * A stable fingerprint of what a role may see. Cache keys include it so a
 * response shaped for one permission set is never reused for another
 * (PLAN.md 9.3).
 */
export function permissionKey(role: Role): string {
  return [...ROLE_PERMISSIONS[role]].sort().join(",") || "none";
}

/** Whether `actor` may assign `target` to someone. Only owners create owners. */
export function canAssignRole(actor: Role, target: Role): boolean {
  if (!can(actor, "team.manage")) return false;
  if (target === "owner") return actor === "owner";
  return true;
}
