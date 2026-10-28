import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Stripe Connect behind a small interface (PLAN.md 11). Each studio is its
// own merchant of record: checkout runs as a direct charge on the studio's
// connected account, so funds never pass through us. Card details only ever
// enter Stripe's hosted pages (PCI SAQ A).

export interface CheckoutInput {
  amountCents: number;
  description: string;
  paymentId: string;
  studioId: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

/** The parts of a Stripe event we act on. */
export interface ProviderEvent {
  id: string;
  type: string;
  /** Connected account the event happened on. */
  account?: string;
  data: { object: Record<string, unknown> };
}

export interface PaymentProvider {
  mode: "stripe" | "simulated";
  createAccount(input: { email: string; businessName: string }): Promise<{ id: string }>;
  /** Hosted onboarding (identity, bank account, EIN) for the studio's owner. */
  onboardingUrl(accountId: string, returnUrl: string, refreshUrl: string): Promise<string>;
  getAccount(accountId: string): Promise<{ chargesEnabled: boolean }>;
  createCheckout(accountId: string, input: CheckoutInput): Promise<{ id: string; url: string }>;
  /** Verifies a webhook's signature and returns the event. Throws when it doesn't verify. */
  parseWebhook(rawBody: string, signature: string | undefined): ProviderEvent;
}

const TOLERANCE_SECONDS = 300;

/** Stripe's webhook signature: `t=<unix>,v1=<hex HMAC-SHA256 of "t.body">`. */
export function verifyStripeSignature(rawBody: string, header: string | undefined, secret: string, now = Date.now()) {
  if (!header) throw new Error("Missing signature");
  const parts = header.split(",").map((p) => p.split("=") as [string, string]);
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || sigs.length === 0) throw new Error("Malformed signature");
  if (Math.abs(now / 1000 - Number(t)) > TOLERANCE_SECONDS) throw new Error("Signature too old");
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  const ok = sigs.some((s) => {
    const got = Buffer.from(s, "hex");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
  if (!ok) throw new Error("Bad signature");
}

/** Builds a header Stripe would send. For tests and the local simulator. */
export function signStripePayload(rawBody: string, secret: string, now = Date.now()) {
  const t = Math.floor(now / 1000);
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex")}`;
}

/** Flattens nested params into Stripe's form encoding: a[b][0]=c. */
function form(params: Record<string, unknown>, prefix = "", out = new URLSearchParams()): URLSearchParams {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => (typeof x === "object" ? form(x as Record<string, unknown>, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(x))));
    else if (typeof v === "object") form(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export class StripeProvider implements PaymentProvider {
  mode = "stripe" as const;
  constructor(
    private secretKey: string,
    private webhookSecret: string,
  ) {}

  private async call<T>(method: "GET" | "POST", path: string, params: Record<string, unknown> = {}, account?: string): Promise<T> {
    const body = method === "POST" ? form(params).toString() : undefined;
    const res = await fetch(`https://api.stripe.com/v1${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        "content-type": "application/x-www-form-urlencoded",
        ...(account ? { "stripe-account": account } : {}),
      },
      body,
    });
    const data = (await res.json()) as T & { error?: { message?: string } };
    if (!res.ok) throw new Error(`Stripe ${path}: ${data.error?.message ?? res.status}`);
    return data;
  }

  async createAccount(input: { email: string; businessName: string }) {
    const acct = await this.call<{ id: string }>("POST", "/accounts", {
      type: "express",
      country: "US",
      email: input.email || undefined,
      business_profile: { name: input.businessName },
      capabilities: { card_payments: { requested: true }, us_bank_account_ach_payments: { requested: true }, transfers: { requested: true } },
    });
    return { id: acct.id };
  }

  async onboardingUrl(accountId: string, returnUrl: string, refreshUrl: string) {
    const link = await this.call<{ url: string }>("POST", "/account_links", {
      account: accountId,
      type: "account_onboarding",
      return_url: returnUrl,
      refresh_url: refreshUrl,
    });
    return link.url;
  }

  async getAccount(accountId: string) {
    const acct = await this.call<{ charges_enabled: boolean }>("GET", `/accounts/${accountId}`);
    return { chargesEnabled: acct.charges_enabled };
  }

  async createCheckout(accountId: string, input: CheckoutInput) {
    const metadata = { payment_id: input.paymentId, studio_id: input.studioId };
    const session = await this.call<{ id: string; url: string }>(
      "POST",
      "/checkout/sessions",
      {
        mode: "payment",
        payment_method_types: ["card", "us_bank_account"],
        customer_email: input.customerEmail || undefined,
        client_reference_id: input.paymentId,
        line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: input.amountCents, product_data: { name: input.description } } }],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        metadata,
        payment_intent_data: { metadata },
      },
      accountId,
    );
    return { id: session.id, url: session.url };
  }

  parseWebhook(rawBody: string, signature: string | undefined): ProviderEvent {
    verifyStripeSignature(rawBody, signature, this.webhookSecret);
    return JSON.parse(rawBody) as ProviderEvent;
  }
}

/**
 * Local development without Stripe keys. Accounts are enabled at once and
 * checkout opens a page on our own API that plays the part of Stripe,
 * producing the same signed events the real webhook receives.
 */
export class SimulatedProvider implements PaymentProvider {
  mode = "simulated" as const;
  readonly webhookSecret = randomBytes(16).toString("hex");
  /** Open checkouts, so the simulator page can show the amount. */
  readonly sessions = new Map<string, CheckoutInput & { accountId: string }>();

  constructor(private apiOrigin: string) {}

  async createAccount() {
    return { id: `acct_sim_${randomBytes(6).toString("hex")}` };
  }
  async onboardingUrl(_accountId: string, returnUrl: string) {
    return returnUrl;
  }
  async getAccount() {
    return { chargesEnabled: true };
  }
  async createCheckout(accountId: string, input: CheckoutInput) {
    const id = `cs_sim_${randomBytes(8).toString("hex")}`;
    this.sessions.set(id, { ...input, accountId });
    return { id, url: `${this.apiOrigin}/api/dev/checkout/${id}` };
  }
  parseWebhook(rawBody: string, signature: string | undefined): ProviderEvent {
    verifyStripeSignature(rawBody, signature, this.webhookSecret);
    return JSON.parse(rawBody) as ProviderEvent;
  }
}
