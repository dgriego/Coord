import { Hono, type Context } from "hono";
import { eq } from "drizzle-orm";
import { studioSettingsInput, type PaymentAccount, type StudioSettings } from "@coord/shared";
import { requirePermission, requireSession, type Env } from "../context.ts";
import { studios, users } from "../db/schema.ts";
import type { Tx } from "../db/client.ts";
import { audit } from "../audit.ts";
import { HttpError, patchBody } from "../http.ts";
import { changed, inStudio } from "./helpers.ts";

// Studio branding, proposal defaults and Stripe Connect onboarding.

async function settings(tx: Tx, studioId: string): Promise<StudioSettings> {
  const [s] = await tx.select().from(studios).where(eq(studios.id, studioId));
  return { name: s!.name, address: s!.address, email: s!.email, phone: s!.phone, depositBps: s!.depositBps, terms: s!.proposalTerms };
}

async function account(c: Context<Env>, tx: Tx): Promise<PaymentAccount> {
  const [s] = await tx.select({ id: studios.stripeAccountId, enabled: studios.stripeChargesEnabled }).from(studios).where(eq(studios.id, c.var.session.studioId));
  return {
    mode: c.var.deps.payments?.mode ?? null,
    status: !s?.id ? "not_connected" : s.enabled ? "enabled" : "pending",
    accountId: s?.id ?? null,
  };
}

export const studioSettingsRoutes = new Hono<Env>()
  .use(requireSession)
  .get("/", async (c) => c.json(await inStudio(c, (tx) => settings(tx, c.var.session.studioId))))
  .patch("/", requirePermission("studio.settings"), async (c) => {
    const { terms, ...input } = await patchBody(c, studioSettingsInput);
    const { studioId, userId } = c.var.session;
    const result = await inStudio(c, async (tx) => {
      const before = await settings(tx, studioId);
      await tx.update(studios).set({ ...input, ...(terms !== undefined ? { proposalTerms: terms } : {}) }).where(eq(studios.id, studioId));
      const after = await settings(tx, studioId);
      const keys = Object.keys({ ...input, ...(terms !== undefined ? { terms } : {}) }) as (keyof StudioSettings)[];
      await audit(tx, {
        studioId,
        actorUserId: userId,
        action: "studio.updated",
        entityType: "studio",
        entityId: studioId,
        before: Object.fromEntries(keys.map((k) => [k, before[k]])),
        after: Object.fromEntries(keys.map((k) => [k, after[k]])),
      });
      return after;
    });
    // The studio name shows in the top bar and studio switcher.
    changed(c, ["studio-settings"], ["me"]);
    return c.json(result);
  });

export const paymentAccountRoutes = new Hono<Env>()
  .use(requireSession, requirePermission("payments.manage"))
  .get("/", async (c) => c.json(await inStudio(c, (tx) => account(c, tx))))

  /** Creates the studio's connected account if needed and returns Stripe's onboarding link. */
  .post("/connect", async (c) => {
    const provider = c.var.deps.payments;
    if (!provider) throw new HttpError(409, "payments_unavailable", "Online payments aren't configured on this server. Set STRIPE_SECRET_KEY.");
    const { studioId, userId } = c.var.session;
    const back = `${c.var.deps.config.appOrigin}/settings/studio`;
    const url = await inStudio(c, async (tx) => {
      const [s] = await tx.select().from(studios).where(eq(studios.id, studioId));
      let accountId = s!.stripeAccountId;
      if (!accountId) {
        const [me] = await tx.select({ email: users.email }).from(users).where(eq(users.id, userId));
        accountId = (await provider.createAccount({ email: s!.email || me?.email || "", businessName: s!.name })).id;
        await tx.update(studios).set({ stripeAccountId: accountId }).where(eq(studios.id, studioId));
        await audit(tx, { studioId, actorUserId: userId, action: "payments.account_created", entityType: "studio", entityId: studioId, after: { accountId } });
      }
      if (provider.mode === "simulated") await tx.update(studios).set({ stripeChargesEnabled: true }).where(eq(studios.id, studioId));
      return provider.onboardingUrl(accountId, `${back}?stripe=return`, `${back}?stripe=refresh`);
    });
    changed(c, ["payment-account"]);
    return c.json({ url });
  })

  /** After onboarding: asks Stripe whether the account can take payments yet. */
  .post("/refresh", async (c) => {
    const provider = c.var.deps.payments;
    const result = await inStudio(c, async (tx) => {
      const [s] = await tx.select({ id: studios.stripeAccountId }).from(studios).where(eq(studios.id, c.var.session.studioId));
      if (provider && s?.id) {
        const { chargesEnabled } = await provider.getAccount(s.id);
        await tx.update(studios).set({ stripeChargesEnabled: chargesEnabled }).where(eq(studios.id, c.var.session.studioId));
      }
      return account(c, tx);
    });
    changed(c, ["payment-account"]);
    return c.json(result);
  });
