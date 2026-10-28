import { eq } from "drizzle-orm";
import type { PaymentMethod, PaymentStatus } from "@coord/shared";
import type { Deps } from "../context.ts";
import { payments, proposals, proposalVersions, studios } from "../db/schema.ts";
import { audit } from "../audit.ts";
import { settleDeposit } from "../proposals/model.ts";
import { changedFor } from "../routes/helpers.ts";
import type { ProviderEvent } from "./provider.ts";

// Applies Stripe events. The webhook route and the local simulator both end
// here, so there is one path from "Stripe says" to "payment recorded".
// Status only moves forward, so replayed or out-of-order events are harmless.

const RANK: Record<PaymentStatus, number> = { pending: 0, processing: 1, failed: 2, canceled: 2, succeeded: 3 };

export async function applyProviderEvent(deps: Deps, event: ProviderEvent): Promise<"applied" | "ignored"> {
  const obj = event.data.object;
  if (event.type === "account.updated") {
    const id = String(obj.id ?? "");
    const enabled = obj.charges_enabled === true;
    const [s] = await deps.db.sys.update(studios).set({ stripeChargesEnabled: enabled }).where(eq(studios.stripeAccountId, id)).returning({ id: studios.id });
    if (!s) return "ignored";
    changedFor(deps, s.id, ["payment-account"]);
    return "applied";
  }

  const next: { status: PaymentStatus; method?: PaymentMethod } | null =
    event.type === "checkout.session.completed"
      ? // Bank debits finish checkout unpaid and settle days later (PLAN.md 11.6).
        obj.payment_status === "paid"
        ? { status: "succeeded", method: "card" }
        : { status: "processing", method: "us_bank_account" }
      : event.type === "checkout.session.async_payment_succeeded"
        ? { status: "succeeded", method: "us_bank_account" }
        : event.type === "checkout.session.async_payment_failed"
          ? { status: "failed", method: "us_bank_account" }
          : event.type === "checkout.session.expired"
            ? { status: "canceled" }
            : null;
  if (!next) return "ignored";

  const metadata = (obj.metadata ?? {}) as Record<string, string>;
  const paymentId = metadata.payment_id;
  if (!paymentId || !/^[0-9a-f-]{36}$/.test(paymentId)) return "ignored";

  // Find the studio first (owner connection), then do the work under its RLS scope.
  const [found] = await deps.db.sys
    .select({ studioId: payments.studioId, account: studios.stripeAccountId })
    .from(payments)
    .innerJoin(studios, eq(studios.id, payments.studioId))
    .where(eq(payments.id, paymentId));
  if (!found) return "ignored";
  // A connected-account event must come from the account the payment was made on.
  if (event.account && event.account !== found.account) return "ignored";

  const result = await deps.db.withStudio(found.studioId, async (tx) => {
    const [pay] = await tx.select().from(payments).where(eq(payments.id, paymentId));
    if (!pay || pay.providerSessionId !== obj.id) return null;
    if (typeof obj.amount_total === "number" && obj.amount_total !== pay.amountCents) {
      console.error(`Payment ${pay.id}: Stripe amount ${obj.amount_total} doesn't match ${pay.amountCents}`);
      return null;
    }
    if (RANK[next.status] <= RANK[pay.status]) return null;

    await tx
      .update(payments)
      .set({
        status: next.status,
        method: next.method ?? pay.method,
        providerPaymentId: typeof obj.payment_intent === "string" ? obj.payment_intent : pay.providerPaymentId,
        paidAt: next.status === "succeeded" ? new Date() : pay.paidAt,
      })
      .where(eq(payments.id, pay.id));
    await audit(tx, {
      studioId: found.studioId,
      actorUserId: null,
      action: `payment.${next.status}`,
      entityType: "payment",
      entityId: pay.id,
      before: { status: pay.status },
      after: { status: next.status, amountCents: pay.amountCents, method: next.method ?? pay.method, event: event.id },
    });
    const [v] = pay.versionId
      ? await tx
          .select({ proposalId: proposalVersions.proposalId, version: proposalVersions.version })
          .from(proposalVersions)
          .where(eq(proposalVersions.id, pay.versionId))
      : [];
    if (v && next.status === "succeeded") {
      await settleDeposit(tx, v.proposalId, v.version);
      await tx.update(proposals).set({ updatedAt: new Date() }).where(eq(proposals.id, v.proposalId));
    }
    return { projectId: pay.projectId, proposalId: v?.proposalId ?? null };
  });
  if (!result) return "ignored";
  changedFor(deps, found.studioId, ["project", result.projectId], ["projects"], ["proposals", result.projectId], ...(result.proposalId ? [["proposal", result.proposalId]] : []));
  return "applied";
}
