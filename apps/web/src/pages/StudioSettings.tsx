import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { can, type StudioSettings } from "@coord/shared";
import { ApiError } from "../api.ts";
import { paymentAccountQuery, studioSettingsQuery, useConnectPayments, useRefreshPayments, useSaveStudioSettings } from "../data/proposals.ts";
import { useMe } from "../data/queries.ts";
import { Labeled, PercentInput } from "../ui/inputs.tsx";
import { useToast } from "../ui/kit.tsx";

export function StudioSettingsPage({ stripeReturn }: { stripeReturn?: boolean }) {
  const me = useMe();
  const settings = useQuery(studioSettingsQuery);
  const owner = can(me.role, "studio.settings");

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div className="stack" style={{ gap: 4 }}>
          <h1>Studio settings</h1>
          <span className="muted">What clients see on proposals, and how they pay you.</span>
        </div>
      </div>
      {can(me.role, "payments.manage") && <Payments stripeReturn={stripeReturn} />}
      {settings.data ? (
        <Branding key={JSON.stringify(settings.data)} initial={settings.data} readOnly={!owner} />
      ) : (
        <div className="shimmer" style={{ height: 240 }} />
      )}
    </div>
  );
}

function Branding({ initial, readOnly }: { initial: StudioSettings; readOnly: boolean }) {
  const save = useSaveStudioSettings();
  const toast = useToast();
  const [d, setD] = useState(initial);
  const fields = save.error instanceof ApiError ? save.error.fields : {};
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Proposals</h2>
        {readOnly && <span className="muted small">Only owners can change these.</span>}
      </div>
      <form
        className="panel-body stack"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(d, { onSuccess: () => toast("Studio settings saved") });
        }}
      >
        <fieldset disabled={readOnly} className="stack">
          <div className="grid-2">
            <Labeled label="Studio name" htmlFor="ss-name" error={fields.name}>
              <input className="input" id="ss-name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
            </Labeled>
            <Labeled label="Default deposit" htmlFor="ss-deposit" hint="For new proposals; change it per proposal or line">
              <PercentInput id="ss-deposit" value={d.depositBps} max={100} onChange={(depositBps) => setD({ ...d, depositBps })} />
            </Labeled>
            <Labeled label="Email on documents" htmlFor="ss-email" error={fields.email}>
              <input className="input" id="ss-email" type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} />
            </Labeled>
            <Labeled label="Phone" htmlFor="ss-phone">
              <input className="input" id="ss-phone" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} />
            </Labeled>
          </div>
          <Labeled label="Address" htmlFor="ss-address">
            <textarea className="textarea" id="ss-address" rows={2} value={d.address} onChange={(e) => setD({ ...d, address: e.target.value })} />
          </Labeled>
          <Labeled label="Standard terms" htmlFor="ss-terms" hint="Copied into each new proposal. Signed proposals keep these as evidence if a client disputes a charge.">
            <textarea
              className="textarea"
              id="ss-terms"
              rows={7}
              placeholder="Deposits on custom and made-to-order items are non-refundable once ordered…"
              value={d.terms}
              onChange={(e) => setD({ ...d, terms: e.target.value })}
            />
          </Labeled>
        </fieldset>
        {!readOnly && (
          <div className="row">
            <button className="btn btn-primary" disabled={!dirty || save.isPending}>Save</button>
            {dirty && <button type="button" className="btn btn-ghost" onClick={() => setD(initial)}>Discard changes</button>}
          </div>
        )}
      </form>
    </section>
  );
}

function Payments({ stripeReturn }: { stripeReturn?: boolean }) {
  const account = useQuery(paymentAccountQuery);
  const connect = useConnectPayments();
  const refresh = useRefreshPayments();
  const toast = useToast();

  // Back from Stripe's onboarding: ask Stripe whether the account is ready.
  useEffect(() => {
    if (stripeReturn) refresh.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripeReturn]);

  const a = account.data;
  const start = () =>
    connect.mutate(undefined, {
      onSuccess: ({ url }) => {
        if (a?.mode === "simulated") {
          toast("Payments connected (simulated)");
          void account.refetch();
        } else window.location.href = url;
      },
      onError: (e) => toast(e instanceof ApiError ? e.message : "Couldn't reach Stripe. Try again."),
    });

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Client payments</h2>
        {a && <span className={`pill status-${a.status === "enabled" ? "succeeded" : a.status === "pending" ? "processing" : "draft"}`}>{a.status === "enabled" ? "Ready" : a.status === "pending" ? "Finish setup" : "Not set up"}</span>}
      </div>
      <div className="panel-body stack">
        <p className="muted" style={{ margin: 0 }}>
          Clients pay deposits by card or bank transfer (ACH) from their proposal link. Money goes straight to your own Stripe account; Coord never holds it and adds no fee.
        </p>
        {!a ? (
          <div className="shimmer" style={{ height: 40 }} />
        ) : a.mode === null ? (
          <p className="warning" style={{ margin: 0 }}>Online payments aren't configured on this server yet.</p>
        ) : a.status === "enabled" ? (
          <p style={{ margin: 0 }}>Connected{a.accountId ? <span className="muted small"> · {a.accountId}</span> : null}. Clients see a pay button once they sign.</p>
        ) : (
          <div className="row">
            <button className="btn btn-primary" onClick={start} disabled={connect.isPending}>
              {a.status === "pending" ? "Continue Stripe setup" : "Connect with Stripe"}
            </button>
            {a.status === "pending" && <button className="btn btn-ghost" onClick={() => refresh.mutate()} disabled={refresh.isPending}>Check status</button>}
          </div>
        )}
        {a?.mode === "simulated" && <p className="muted small" style={{ margin: 0 }}>Local development: Stripe is simulated, so no keys or real accounts are needed.</p>}
      </div>
    </section>
  );
}
