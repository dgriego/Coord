import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  Client,
  ClientInput,
  ClipResult,
  Item,
  ItemInput,
  ItemPatch,
  ProjectDetail,
  ProjectInput,
  ProjectSummary,
  Room,
  Vendor,
  VendorImportResult,
  VendorInput,
} from "@coord/shared";
import { api } from "../api.ts";

export const clientsQuery = queryOptions({ queryKey: ["clients"], queryFn: () => api.get<Client[]>("/clients") });
// All vendors load once; filtering happens in the browser so it's instant.
export const vendorsQuery = queryOptions({ queryKey: ["vendors"], queryFn: () => api.get<Vendor[]>("/vendors") });
export const projectsQuery = queryOptions({ queryKey: ["projects"], queryFn: () => api.get<ProjectSummary[]>("/projects") });
export const projectQuery = (id: string) =>
  queryOptions({ queryKey: ["project", id], queryFn: () => api.get<ProjectDetail>(`/projects/${id}`) });

function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: string[][]) => Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));
}

export function useSaveClient() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...input }: ClientInput & { id?: string }) =>
      id ? api.patch<Client>(`/clients/${id}`, input) : api.post<Client>("/clients", input),
    onSuccess: () => invalidate(["clients"], ["projects"]),
  });
}

export function useDeleteClient() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/clients/${id}`),
    onSuccess: () => invalidate(["clients"], ["projects"]),
  });
}

export function useSaveVendor() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...input }: VendorInput & { id?: string }) =>
      id ? api.patch<Vendor>(`/vendors/${id}`, input) : api.post<Vendor>("/vendors", input),
    onSuccess: () => invalidate(["vendors"]),
  });
}

export function useDeleteVendor() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/vendors/${id}`),
    onSuccess: () => invalidate(["vendors"], ["project"]),
  });
}

export function useImportVendors() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { csv: string; dryRun: boolean }) => api.post<VendorImportResult>("/vendors/import", input),
    onSuccess: (_r, vars) => (vars.dryRun ? undefined : invalidate(["vendors"])),
  });
}

export function useCreateProject() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: ProjectInput) => api.post<{ id: string }>("/projects", input),
    onSuccess: () => invalidate(["projects"], ["clients"]),
  });
}

/** Project edits show at once; the server's version replaces them when it answers. */
export function useUpdateProject(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<ProjectInput>) => api.patch<void>(`/projects/${id}`, patch),
    onMutate: (patch) => {
      const previous = qc.getQueryData<ProjectDetail>(["project", id]);
      if (previous) qc.setQueryData<ProjectDetail>(["project", id], { ...previous, ...(patch as Partial<ProjectDetail>) });
      return { previous };
    },
    onError: (_e, _p, ctx) => qc.setQueryData(["project", id], ctx?.previous),
    onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: ["project", id] }), qc.invalidateQueries({ queryKey: ["projects"] })]),
  });
}

export function useDeleteProject() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/projects/${id}`),
    onSuccess: () => invalidate(["projects"], ["clients"]),
  });
}

export function useAddRoom(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post<Room>(`/projects/${projectId}/rooms`, { name }),
    onSuccess: (room) =>
      qc.setQueryData<ProjectDetail>(["project", projectId], (p) => (p ? { ...p, rooms: [...p.rooms, room] } : p)),
  });
}

export function useRenameRoom(projectId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.patch<Room>(`/rooms/${id}`, { name }),
    onSuccess: () => invalidate(["project", projectId]),
  });
}

export function useDeleteRoom(projectId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/rooms/${id}`),
    onSuccess: () => invalidate(["project", projectId]),
  });
}

export function useAddItem(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ItemInput) => api.post<Item>(`/projects/${projectId}/items`, input),
    onSuccess: (item) => {
      qc.setQueryData<ProjectDetail>(["project", projectId], (p) => (p ? { ...p, items: [...p.items, item] } : p));
      void qc.invalidateQueries({ queryKey: ["project", projectId] });
      void qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

/** Item edits apply instantly in the grid and roll back if the server refuses. */
export function useUpdateItem(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ItemPatch }) => api.patch<Item>(`/items/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ["project", projectId] });
      const previous = qc.getQueryData<ProjectDetail>(["project", projectId]);
      const simple = Object.fromEntries(Object.entries(patch).filter(([k]) => k !== "components" && k !== "vendorId"));
      qc.setQueryData<ProjectDetail>(["project", projectId], (p) =>
        p ? { ...p, items: p.items.map((i) => (i.id === id ? ({ ...i, ...simple } as Item) : i)) } : p,
      );
      return { previous };
    },
    onSuccess: (item) =>
      qc.setQueryData<ProjectDetail>(["project", projectId], (p) =>
        p ? { ...p, items: p.items.map((i) => (i.id === item.id ? item : i)) } : p,
      ),
    onError: (_e, _v, ctx) => qc.setQueryData(["project", projectId], ctx?.previous),
    onSettled: () => {
      // Totals depend on every item, so refresh the project and list in the background.
      void qc.invalidateQueries({ queryKey: ["project", projectId] });
      void qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useDeleteItem(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/items/${id}`),
    onMutate: (id) => {
      const previous = qc.getQueryData<ProjectDetail>(["project", projectId]);
      qc.setQueryData<ProjectDetail>(["project", projectId], (p) => (p ? { ...p, items: p.items.filter((i) => i.id !== id) } : p));
      return { previous };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(["project", projectId], ctx?.previous),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["project", projectId] });
      void qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useClip() {
  return useMutation({ mutationFn: (url: string) => api.post<ClipResult>("/clip", { url }) });
}
