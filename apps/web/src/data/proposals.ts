import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ManualPaymentInput,
  PaymentAccount,
  ProposalDetail,
  ProposalInput,
  ProposalPatch,
  ProposalSummary,
  StudioSettings,
  StudioSettingsInput,
} from "@coord/shared";
import { api } from "../api.ts";

export const proposalsQuery = (projectId: string) =>
  queryOptions({ queryKey: ["proposals", projectId], queryFn: () => api.get<ProposalSummary[]>(`/proposals?projectId=${projectId}`) });

/** The newest version unless `version` picks an older one. */
export const proposalQuery = (id: string, version?: number) =>
  queryOptions({
    queryKey: version === undefined ? ["proposal", id] : ["proposal", id, version],
    queryFn: () => api.get<ProposalDetail>(`/proposals/${id}${version === undefined ? "" : `?version=${version}`}`),
  });

export const studioSettingsQuery = queryOptions({ queryKey: ["studio-settings"], queryFn: () => api.get<StudioSettings>("/studio/settings") });
export const paymentAccountQuery = queryOptions({ queryKey: ["payment-account"], queryFn: () => api.get<PaymentAccount>("/studio/payments") });

/**
 * Every proposal write answers with the fresh detail, so the page updates
 * from the response; lists and the project refresh in the background.
 */
function useProposalWrite<V>(fn: (vars: V) => Promise<ProposalDetail>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (p) => {
      qc.setQueryData(["proposal", p.id], p);
      void qc.invalidateQueries({ queryKey: ["proposal", p.id] });
      void qc.invalidateQueries({ queryKey: ["proposals", p.projectId] });
      void qc.invalidateQueries({ queryKey: ["project", p.projectId] });
    },
  });
}

export const useCreateProposal = () => useProposalWrite((input: ProposalInput) => api.post<ProposalDetail>("/proposals", input));

export function useProposalActions(id: string) {
  return {
    update: useProposalWrite((patch: ProposalPatch) => api.patch<ProposalDetail>(`/proposals/${id}`, patch)),
    addItems: useProposalWrite((itemIds: string[]) => api.post<ProposalDetail>(`/proposals/${id}/lines`, { itemIds })),
    setLineDeposit: useProposalWrite(({ lineId, depositBps }: { lineId: string; depositBps: number | null }) =>
      api.patch<ProposalDetail>(`/proposals/${id}/lines/${lineId}`, { depositBps }),
    ),
    removeLine: useProposalWrite((lineId: string) => api.delete<ProposalDetail>(`/proposals/${id}/lines/${lineId}`)),
    refresh: useProposalWrite(() => api.post<ProposalDetail>(`/proposals/${id}/refresh`)),
    send: useProposalWrite(() => api.post<ProposalDetail>(`/proposals/${id}/send`)),
    newVersion: useProposalWrite(() => api.post<ProposalDetail>(`/proposals/${id}/versions`)),
    replaceLink: useProposalWrite(() => api.post<ProposalDetail>(`/proposals/${id}/share`)),
    revokeLink: useProposalWrite(() => api.delete<ProposalDetail>(`/proposals/${id}/share`)),
    recordPayment: useProposalWrite((input: ManualPaymentInput) => api.post<ProposalDetail>(`/proposals/${id}/payments`, input)),
  };
}

export function useDeleteProposal(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/proposals/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["proposals", projectId] }),
  });
}

export function useSaveStudioSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: StudioSettingsInput) => api.patch<StudioSettings>("/studio/settings", patch),
    onSuccess: (s) => {
      qc.setQueryData(["studio-settings"], s);
      void qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

export function useConnectPayments() {
  return useMutation({ mutationFn: () => api.post<{ url: string }>("/studio/payments/connect") });
}

export function useRefreshPayments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PaymentAccount>("/studio/payments/refresh"),
    onSuccess: (a) => qc.setQueryData(["payment-account"], a),
  });
}
