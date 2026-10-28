import { z } from "zod";
import { ROLES } from "./roles.ts";

const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);
const password = z.string().min(10, "Use at least 10 characters").max(200);
const personName = z.string().trim().min(1, "Enter your name").max(120);

export const signupInput = z.object({
  name: personName,
  email,
  password,
  studioName: z.string().trim().min(1, "Enter your studio's name").max(120),
});
export type SignupInput = z.infer<typeof signupInput>;

export const loginInput = z.object({
  email,
  password: z.string().min(1, "Enter your password").max(200),
});
export type LoginInput = z.infer<typeof loginInput>;

export const roleSchema = z.enum(ROLES);

export const inviteInput = z.object({
  email,
  role: roleSchema,
});
export type InviteInput = z.infer<typeof inviteInput>;

export const acceptInviteInput = z.object({
  token: z.string().min(20).max(200),
  // Only needed when the invited email has no account yet.
  name: personName.optional(),
  password: password.optional(),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteInput>;

export const changeRoleInput = z.object({ role: roleSchema });

export const switchStudioInput = z.object({ studioId: z.string().uuid() });
