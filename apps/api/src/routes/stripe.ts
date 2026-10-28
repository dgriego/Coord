import { Hono } from "hono";
import { formatMoney } from "@coord/shared";
import type { Env } from "../context.ts";
import { HttpError } from "../http.ts";
import { applyProviderEvent } from "../payments/events.ts";
import { SimulatedProvider, signStripePayload } from "../payments/provider.ts";

/** Stripe's Connect webhook. The signature is the only authentication. */
export const stripeWebhookRoutes = new Hono<Env>().post("/", async (c) => {
  const provider = c.var.deps.payments;
  if (!provider) throw new HttpError(404, "not_found", "Payments aren't configured.");
  const raw = await c.req.text();
  let event;
  try {
    event = provider.parseWebhook(raw, c.req.header("stripe-signature"));
  } catch {
    throw new HttpError(400, "bad_signature", "Webhook signature didn't verify.");
  }
  const result = await applyProviderEvent(c.var.deps, event);
  return c.json({ received: true, result });
});

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/**
 * Local development only: a stand-in for Stripe Checkout. Its buttons
 * produce signed events handled by the same code as real webhooks.
 */
export const devCheckoutRoutes = new Hono<Env>()
  .use(async (c, next) => {
    if (!(c.var.deps.payments instanceof SimulatedProvider)) throw new HttpError(404, "not_found", "No such endpoint.");
    await next();
  })
  .get("/:id", (c) => {
    const sim = c.var.deps.payments as SimulatedProvider;
    const s = sim.sessions.get(c.req.param("id"));
    if (!s) return c.html("<p>This simulated checkout expired. Go back and try again.</p>", 404);
    return c.html(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>Simulated checkout</title>
<body style="font:16px system-ui;max-width:440px;margin:10vh auto;padding:16px">
<p style="background:#fff4dc;padding:10px 14px;border-radius:10px">Simulated Stripe Checkout for local development. No money moves.</p>
<h1 style="margin-bottom:4px">${esc(formatMoney(s.amountCents))}</h1><p style="color:#6b6761">${esc(s.description)}</p>
<div style="display:grid;gap:10px;margin-top:24px">
<button data-o="card">Pay by card (succeeds now)</button>
<button data-o="ach">Pay by bank (processing, settles later)</button>
<button data-o="ach_settle">Bank payment settles</button>
<button data-o="ach_fail">Bank payment fails</button>
<a href="${esc(s.cancelUrl)}">Cancel</a></div>
<style>button{font:inherit;padding:12px;border-radius:999px;border:1px solid #d3cfc6;background:#fff;cursor:pointer}button:first-child{background:#2f54eb;color:#fff;border-color:#2f54eb}</style>
<script>document.querySelectorAll("button").forEach(b=>b.onclick=async()=>{const r=await fetch(location.pathname,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({outcome:b.dataset.o})});if(r.ok)location.href=${JSON.stringify(s.successUrl)};else alert("Failed")})</script>`);
  })
  .post("/:id", async (c) => {
    const sim = c.var.deps.payments as SimulatedProvider;
    const id = c.req.param("id");
    const s = sim.sessions.get(id);
    if (!s) throw new HttpError(404, "not_found", "That checkout expired.");
    const { outcome } = (await c.req.json()) as { outcome: string };
    const type = { card: "checkout.session.completed", ach: "checkout.session.completed", ach_settle: "checkout.session.async_payment_succeeded", ach_fail: "checkout.session.async_payment_failed" }[outcome];
    if (!type) throw new HttpError(400, "invalid_input", "Unknown outcome.");
    const event = {
      id: `evt_sim_${Date.now()}`,
      type,
      account: s.accountId,
      data: { object: { id, amount_total: s.amountCents, payment_status: outcome === "card" ? "paid" : "unpaid", metadata: { payment_id: s.paymentId, studio_id: s.studioId } } },
    };
    // Signed and verified exactly like a webhook delivery, then applied the same way.
    const raw = JSON.stringify(event);
    await applyProviderEvent(c.var.deps, sim.parseWebhook(raw, signStripePayload(raw, sim.webhookSecret)));
    return c.json({ ok: true });
  });
