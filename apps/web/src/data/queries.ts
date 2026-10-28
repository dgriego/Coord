import { queryOptions, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { AuditEntry, CreatedInvitation, Invitation, Me, Member, Role } from "@coord/shared";
import { api } from "../api.ts";
import { switchPartition } from "./client.ts";

// The app layout moves the cache partition when me.cacheKey changes; doing it
// here would clear the cache while this very query is in flight.
export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: () => api.get<Me>("/me"),
  // Render from cache, but always confirm who's signed in: another tab may
  // have signed in as someone else since this copy was saved.
  staleTime: 0,
});

/** After sign-in, sign-up or joining a studio: adopt the new session's view. */
export async function adoptSession(qc: QueryClient, me: Me) {
  qc.setQueryData(["me"], me);
  await switchPartition(me.cacheKey);
}

export const membersQuery = queryOptions({
  queryKey: ["members"],
  queryFn: () => api.get<Member[]>("/studio/members"),
});

export const invitationsQuery = queryOptions({
  queryKey: ["invitations"],
  queryFn: () => api.get<Invitation[]>("/studio/invitations"),
});

export const auditQuery = queryOptions({
  queryKey: ["audit"],
  queryFn: () => api.get<AuditEntry[]>("/studio/audit"),
});

/** The signed-in user. Only rendered under the app layout, which loads it first. */
export function useMe(): Me {
  const { data } = useQuery(meQuery);
  if (!data) throw new Error("useMe used outside the signed-in app");
  return data;
}

/** Role change shows immediately and rolls back if the server refuses. */
export function useChangeRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      api.patch<void>(`/studio/members/${userId}`, { role }),
    onMutate: async ({ userId, role }) => {
      await qc.cancelQueries({ queryKey: ["members"] });
      const previous = qc.getQueryData<Member[]>(["members"]);
      qc.setQueryData<Member[]>(["members"], (list) => list?.map((m) => (m.userId === userId ? { ...m, role } : m)));
      return { previous };
    },
    onError: (_err, _vars, ctx) => qc.setQueryData(["members"], ctx?.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: ["members"] }),
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.delete<void>(`/studio/members/${userId}`),
    onMutate: async (userId) => {
      await qc.cancelQueries({ queryKey: ["members"] });
      const previous = qc.getQueryData<Member[]>(["members"]);
      qc.setQueryData<Member[]>(["members"], (list) => list?.filter((m) => m.userId !== userId));
      return { previous };
    },
    onError: (_err, _vars, ctx) => qc.setQueryData(["members"], ctx?.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: ["members"] }),
  });
}

export function useInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; role: Role }) => api.post<CreatedInvitation>("/studio/invitations", input),
    onSuccess: (inv) => {
      qc.setQueryData<Invitation[]>(["invitations"], (list) => [inv, ...(list ?? []).filter((i) => i.email !== inv.email)]);
    },
  });
}

export function useCancelInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/studio/invitations/${id}`),
    onMutate: (id) => {
      const previous = qc.getQueryData<Invitation[]>(["invitations"]);
      qc.setQueryData<Invitation[]>(["invitations"], (list) => list?.filter((i) => i.id !== id));
      return { previous };
    },
    onError: (_err, _id, ctx) => qc.setQueryData(["invitations"], ctx?.previous),
  });
}

export function useSwitchStudio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (studioId: string) => api.post<Me>("/me/studio", { studioId }),
    onSuccess: (me) => adoptSession(qc, me),
  });
}
