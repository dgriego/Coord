import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  can,
  formatMoney,
  formatPct,
  formatProposalNumber,
  ITEM_STATUS_LABELS,
  MANUAL_PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  PROPOSAL_STATUS_LABELS,
  type ManualPaymentInput,
  type ProposalDetail,
  type ProposalLine,
  type ProjectDetail,
} from "@coord/shared";
import { ApiError } from "../api.ts";
import { projectQuery } from "../data/catalog.ts";
import { paymentAccountQuery, proposalQuery, proposalsQuery, useCreateProposal, useDeleteProposal, useProposalActions } from "../data/proposals.ts";
import { useMe } from "../data/queries.ts";
import { confetti } from "../ui/confetti.ts";
import { Icon } from "../ui/icons.tsx";
import { ConfirmButton, Drawer, Labeled, MoneyInput, PercentInput } from "../ui/inputs.tsx";
import { EmptyState, formatDate, formatDateTime, initials, useToast } from "../ui/kit.tsx";

const money = (c: number) => formatMoney(c);
const errorText = (err: unknown) => (err instanceof ApiError ? err.message : "Something went wrong. Try again.");

// ── On the project page ─────────────────────────────────

export function ProposalsPanel({ project }: { project: ProjectDetail }) {
  const me = useMe();
  const list = useQuery(proposalsQuery(project.id));
  const [creating, setCreating] = useState(false);
  const edit = can(me.role, "projects.edit");

  return (
    <section className="panel" id="proposals" style={{ scrollMarginTop: 80 }}>
      <div className="panel-head">
        <h2>Proposals</h2>
        <span className="spacer" />
        {edit && project.items.length > 0 && (
          <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
            <Icon name="plus" size={16} /> New proposal
          </button>
        )}
      </div>
      {list.isPending ? (
        <div className="panel-body"><div className="shimmer" style={{ height: 48 }} /></div>
      ) : !list.data?.length ? (
        <div className="panel-body muted">
          {project.items.length ? "Gather items into a proposal, send the client a link, and collect the deposit when they sign." : "Add items first, then send them to the client as a proposal."}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Proposal</th>
                <th>Status</th>
                <th className="num hide-sm">Items</th>
                <th className="num">Total</th>
                <th className="num hide-sm">Deposit</th>
                <th className="num">Paid</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((p) => (
                <tr key={p.id} className="clickable">
                  <td>
                    <Link to="/projects/$projectId/proposals/$proposalId" params={{ projectId: project.id, proposalId: p.id }} className="item-name row-link">
                      {p.title}
                    </Link>
                    <div className="muted small">
                      {formatProposalNumber(p.number)}
                      {p.version > 1 ? ` · version ${p.version}` : ""}
                      {p.sentAt ? ` · sent ${formatDate(p.sentAt)}` : ""}
                    </div>
                  </td>
                  <td><span className={`pill status-${p.status}`}>{PROPOSAL_STATUS_LABELS[p.status]}</span></td>
                  <td className="num hide-sm">{p.lineCount}</td>
                  <td className="num item-name">{money(p.totalCents)}</td>
                  <td className="num hide-sm">{money(p.depositCents)}</td>
                  <td className="num">{p.paidCents ? money(p.paidCents) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <NewProposal project={project} onClose={() => setCreating(false)} />}
    </section>
  );
}

function NewProposal({ project, onClose }: { project: ProjectDetail; onClose: () => void }) {
  const create = useCreateProposal();
  const navigate = useNavigate();
  const toast = useToast();
  const candidates = project.items.filter((i) => i.procured);
  // Items not yet proposed or decided start checked.
  const [picked, setPicked] = useState(() => new Set(candidates.filter((i) => i.status === "draft").map((i) => i.id)));
  const [title, setTitle] = useState(`${project.name}: furnishings`);
  const rooms = useMemo(() => {
    const groups = project.rooms.map((r) => ({ id: r.id, name: r.name, items: candidates.filter((i) => i.roomId === r.id) }));
    const loose = candidates.filter((i) => !i.roomId);
    if (loose.length) groups.push({ id: "none", name: "No room", items: loose });
    return groups.filter((g) => g.items.length);
  }, [project.rooms, candidates]);
  const total = candidates.filter((i) => picked.has(i.id)).reduce((s, i) => s + i.totalCents, 0);
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const submit = () =>
    create.mutate(
      { projectId: project.id, title: title.trim(), itemIds: candidates.filter((i) => picked.has(i.id)).map((i) => i.id) },
      {
        onSuccess: (p) => {
          toast(`Started ${formatProposalNumber(p.number)}`);
          void navigate({ to: "/projects/$projectId/proposals/$proposalId", params: { projectId: project.id, proposalId: p.id } });
        },
      },
    );

  return (
    <Drawer
      open
      wide
      title="New proposal"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-primary" disabled={!title.trim() || picked.size === 0 || create.isPending} onClick={submit}>
            Create with {picked.size} {picked.size === 1 ? "item" : "items"}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <span className="spacer" />
          <span className="muted small">{money(total)} before tax</span>
        </>
      }
    >
      <label className="field" htmlFor="np-title">
        <span>Title</span>
        <input className="input" id="np-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      {create.error && <div className="form-error">{errorText(create.error)}</div>}
      <div className="row">
        <span className="section-label">Items</span>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => setPicked(new Set(candidates.map((i) => i.id)))}>Select all</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setPicked(new Set())}>Clear</button>
      </div>
      {rooms.map((g) => (
        <fieldset key={g.id} className="stack" style={{ gap: 6 }}>
          <legend className="item-name small" style={{ marginBottom: 6 }}>{g.name}</legend>
          {g.items.map((i) => (
            <label key={i.id} className="pick-row" htmlFor={`pick-${i.id}`}>
              <input type="checkbox" id={`pick-${i.id}`} checked={picked.has(i.id)} onChange={() => toggle(i.id)} />
              {i.imageUrl ? <img className="thumb" src={i.imageUrl} alt="" /> : <span className="thumb">{initials(i.name)}</span>}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="item-name">{i.name}</span>
                <span className="muted small" style={{ display: "block" }}>Qty {i.qty} · {ITEM_STATUS_LABELS[i.status]}</span>
              </span>
              <span className="num item-name">{money(i.totalCents)}</span>
            </label>
          ))}
        </fieldset>
      ))}
    </Drawer>
  );
}

// ── The proposal itself ─────────────────────────────────

export function ProposalPage({ projectId, proposalId }: { projectId: string; proposalId: string }) {
  const me = useMe();
  const [version, setVersion] = useState<number | undefined>(undefined);
  const project = useQuery(projectQuery(projectId));
  const query = useQuery(proposalQuery(proposalId, version));
  const actions = useProposalActions(proposalId);
  const remove = useDeleteProposal(projectId);
  const navigate = useNavigate();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState(false);

  if (query.isPending) return <div className="page"><div className="shimmer" style={{ height: 200 }} /></div>;
  if (query.error) return <div className="page"><p className="muted">{query.error.message}</p></div>;
  const p = query.data;
  const color = project.data?.color ?? "lagoon";
  const draft = p.status === "draft" && p.latest;
  const edit = draft && can(me.role, "projects.edit");
  const pricing = draft && can(me.role, "pricing.edit");
  const send = can(me.role, "documents.send");
  const showCost = can(me.role, "cost.view");
  const signedOpen = p.signature !== null;

  const run = <T,>(m: { mutate: (v: T, o: { onSuccess?: () => void; onError?: (e: unknown) => void }) => void }, v: T, ok?: string) =>
    m.mutate(v, { onSuccess: () => ok && toast(ok), onError: (e) => toast(errorText(e)) });

  const rooms = new Map<string, ProposalLine[]>();
  for (const l of p.lines) rooms.set(l.roomName, [...(rooms.get(l.roomName) ?? []), l]);
  const columns = 6 + (showCost ? 1 : 0) + (edit ? 1 : 0);
  const notOnProposal = (project.data?.items ?? []).filter((i) => i.procured && !p.lines.some((l) => l.itemId === i.id));

  return (
    <div className={`paint-${color}`}>
      <section className="project-hero">
        <div className="project-hero-inner">
          <div className="row">
            <Link to="/projects/$projectId" params={{ projectId }} className="crumb">← {p.projectName}</Link>
            <span className="spacer" />
            {p.share && <a className="btn btn-sm" href={p.share.url} target="_blank" rel="noreferrer">Open client view</a>}
          </div>
          <div className="row" style={{ alignItems: "flex-end", gap: 14 }}>
            <div className="stack" style={{ gap: 6, minWidth: 0, flex: "1 1 320px" }}>
              {edit ? (
                <TitleInput value={p.title} onSave={(title) => run(actions.update, { title })} />
              ) : (
                <h1>{p.title}</h1>
              )}
              <div className="row muted" style={{ gap: 10 }}>
                <span className="item-name" style={{ color: "var(--ink)" }}>{formatProposalNumber(p.number)}</span>
                <span className={`pill status-${p.status}`}>{PROPOSAL_STATUS_LABELS[p.status]}</span>
                <span>{p.clientName ? `For ${p.clientName}` : "No client on this project yet"}</span>
                {p.sentAt && <span>· sent {formatDate(p.sentAt)}</span>}
              </div>
            </div>
            {p.versions.length > 1 && (
              <div className="seg" role="group" aria-label="Version">
                {[...p.versions].reverse().map((v) => (
                  <button key={v.id} aria-pressed={v.version === p.version} onClick={() => setVersion(v.id === p.versions[0]!.id ? undefined : v.version)}>
                    v{v.version}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="page">
        {!p.latest && <div className="banner">You're looking at version {p.version}, which was replaced. <button className="link-btn" onClick={() => setVersion(undefined)}>See the latest</button></div>}

        <NextStep p={p} draft={draft} canSend={send} onSend={() => run(actions.send, undefined, "Sent. The client has the link by email.")} onNewVersion={() => run(actions.newVersion, undefined, "Started a new draft version")} sending={actions.send.isPending} />

        <div className="totals">
          <div><span>Total</span><b>{money(p.totals.totalCents)}</b></div>
          <div><span>{signedOpen ? "Approved" : "Items"}</span><b>{signedOpen ? money(p.totals.approvedCents) : p.lines.length}</b></div>
          <div><span>Deposit{signedOpen ? "" : ` (${formatPct(p.depositBps)} default)`}</span><b>{money(p.totals.depositCents)}</b></div>
          <div><span>Paid</span><b>{money(p.totals.paidCents)}</b></div>
          {p.totals.processingCents > 0 && <div><span>Processing (ACH)</span><b>{money(p.totals.processingCents)}</b></div>}
          {showCost && p.costTotals && <div><span>Product margin</span><b>{formatPct(p.costTotals.marginBps)}</b></div>}
        </div>

        {(p.share || p.signature) && (
          <div className="grid-2">
            {p.share && <ShareBox p={p} canSend={send} onReplace={() => run(actions.replaceLink, undefined, "New link ready. The old one stopped working.")} onRevoke={() => run(actions.revokeLink, undefined, "Link turned off")} />}
            {p.signature && (
              <div className="panel panel-body stack" style={{ gap: 4 }}>
                <span className="section-label" style={{ paddingTop: 0 }}>Signed electronically</span>
                <span className="signature">{p.signature.name}</span>
                <span className="muted small">{p.signature.email} · {formatDateTime(p.signature.signedAt)} · IP {p.signature.ip}</span>
                <span className="muted small" title={p.signature.documentHash}>Document fingerprint {p.signature.documentHash.slice(0, 16)}…</span>
              </div>
            )}
          </div>
        )}

        <section className="panel">
          <div className="panel-head">
            <h2>Items</h2>
            <span className="spacer" />
            {edit && (
              <>
                <button className="btn btn-sm" onClick={() => run(actions.refresh, undefined, "Prices updated from the items")} disabled={actions.refresh.isPending}>Update prices</button>
                <button className="btn btn-sm" onClick={() => setAdding(true)} disabled={notOnProposal.length === 0}><Icon name="plus" size={16} /> Add items</button>
              </>
            )}
          </div>
          {p.lines.length === 0 ? (
            <EmptyState title="Nothing on this proposal yet">{edit ? "Add items from the project to get started." : "No items."}</EmptyState>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 64 }} aria-label="Photo" />
                    <th>Item</th>
                    <th className="num">Qty</th>
                    <th className="num">Unit price</th>
                    <th className="num">Total</th>
                    {showCost && <th className="num hide-sm">Margin</th>}
                    <th className="num">Deposit</th>
                    {draft ? edit && <th aria-label="Remove" /> : <th>Client</th>}
                  </tr>
                </thead>
                <tbody>
                  {[...rooms].map(([room, lines]) => (
                    <LineGroup key={room} name={rooms.size > 1 || room ? room || "No room" : ""} columns={columns}>
                      {lines.map((l) => (
                        <tr key={l.id}>
                          <td>{l.imageUrl ? <img className="thumb" src={l.imageUrl} alt="" loading="lazy" /> : <span className="thumb">{initials(l.name)}</span>}</td>
                          <td style={{ minWidth: 200 }}>
                            <div className="item-name">{l.name}</div>
                            <div className="muted small">{[l.finish, l.dimensions].filter(Boolean).join(" · ")}</div>
                            {l.clientNote && <div className="small" style={{ fontStyle: "italic" }}>Client: “{l.clientNote}”</div>}
                          </td>
                          <td className="num">{l.qty}</td>
                          <td className="num">{money(l.unitPriceCents)}</td>
                          <td className="num item-name">{money(l.totalCents)}</td>
                          {showCost && (
                            <td className="num hide-sm">
                              {l.unitCostCents !== undefined && l.unitPriceCents > 0 ? formatPct(Math.round(((l.unitPriceCents - l.unitCostCents) / l.unitPriceCents) * 10_000)) : "—"}
                            </td>
                          )}
                          <td className="num">
                            {pricing ? (
                              <span className="row" style={{ justifyContent: "flex-end", gap: 4, flexWrap: "nowrap" }}>
                                <span style={{ width: 84 }}>
                                  <PercentInput id={`dep-${l.id}`} value={l.depositBps} max={100} onChange={(bps) => run(actions.setLineDeposit, { lineId: l.id, depositBps: bps === p.depositBps ? null : bps })} />
                                </span>
                              </span>
                            ) : (
                              <>
                                {money(l.depositCents)}
                                <div className="muted small">{formatPct(l.depositBps)}</div>
                              </>
                            )}
                          </td>
                          {draft ? (
                            edit && (
                              <td>
                                <button className="btn btn-ghost btn-sm btn-icon" aria-label={`Remove ${l.name}`} onClick={() => run(actions.removeLine, l.id)}>
                                  <Icon name="trash" size={16} />
                                </button>
                              </td>
                            )
                          ) : (
                            <td><span className={`pill status-${l.decision}`}>{l.decision === "pending" ? "Waiting" : l.decision === "approved" ? "Approved" : "Declined"}</span></td>
                          )}
                        </tr>
                      ))}
                    </LineGroup>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="proposal-sum">
            <div><span>Items, delivery and install</span><span>{money(p.totals.subtotalCents)}</span></div>
            <div><span>Sales tax</span><span>{money(p.totals.taxCents)}</span></div>
            <div className="grand"><span>Total</span><span>{money(p.totals.totalCents)}</span></div>
          </div>
        </section>

        <div className="grid-2">
          <section className="panel panel-body stack">
            <h2 style={{ fontSize: 18 }}>Note to the client</h2>
            {edit ? (
              <TextBlock id="p-intro" value={p.intro} placeholder="A short note that opens the proposal" onSave={(intro) => run(actions.update, { intro })} />
            ) : (
              <p className="prewrap muted">{p.intro || "No note."}</p>
            )}
            {pricing && (
              <Labeled label="Default deposit" htmlFor="p-deposit" hint="Lines can override it in the table above">
                <span style={{ maxWidth: 140, display: "block" }}>
                  <PercentInput id="p-deposit" value={p.depositBps} max={100} onChange={(depositBps) => run(actions.update, { depositBps })} />
                </span>
              </Labeled>
            )}
          </section>
          <section className="panel panel-body stack">
            <h2 style={{ fontSize: 18 }}>Terms</h2>
            {edit ? (
              <TextBlock id="p-terms" value={p.terms} rows={6} placeholder="Payment terms, lead times, cancellation and custom-order policies" onSave={(terms) => run(actions.update, { terms })} />
            ) : (
              <p className="prewrap muted small">{p.terms || "No terms."}</p>
            )}
          </section>
        </div>

        {(p.payments.length > 0 || signedOpen) && (
          <section className="panel">
            <div className="panel-head">
              <h2>Payments</h2>
              <span className="spacer" />
              {signedOpen && p.totals.balanceDueCents > 0 && can(me.role, "payments.manage") && (
                <button className="btn btn-sm" onClick={() => setPaying(true)}>Record a check or wire</button>
              )}
            </div>
            {p.payments.length === 0 ? (
              <div className="panel-body muted">{p.totals.balanceDueCents > 0 ? `Waiting on the ${money(p.totals.balanceDueCents)} deposit.` : "No deposit due."}</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Method</th><th>Status</th><th className="num">Amount</th></tr></thead>
                  <tbody>
                    {p.payments.map((x) => (
                      <tr key={x.id}>
                        <td>{formatDateTime(x.paidAt ?? x.createdAt)}</td>
                        <td>{x.method ? PAYMENT_METHOD_LABELS[x.method] : "—"}{x.note && <div className="muted small">{x.note}</div>}</td>
                        <td><span className={`pill status-${x.status}`}>{PAYMENT_STATUS_LABELS[x.status]}</span></td>
                        <td className="num item-name">{money(x.amountCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {draft && can(me.role, "projects.edit") && !p.versions.some((v) => v.status !== "draft") && (
          <div className="row">
            <span className="spacer" />
            <ConfirmButton
              label="Delete draft"
              confirmLabel={`Delete ${formatProposalNumber(p.number)}`}
              onConfirm={() => remove.mutate(p.id, { onSuccess: () => { toast("Draft deleted"); void navigate({ to: "/projects/$projectId", params: { projectId } }); } })}
            />
          </div>
        )}
      </div>

      {adding && (
        <Drawer open title="Add items" onClose={() => setAdding(false)}>
          <AddItems items={notOnProposal} onAdd={(ids) => actions.addItems.mutate(ids, { onSuccess: () => { setAdding(false); toast(`Added ${ids.length} ${ids.length === 1 ? "item" : "items"}`); } })} />
        </Drawer>
      )}
      {paying && <RecordPayment due={p.totals.balanceDueCents} onClose={() => setPaying(false)} onSave={(input) => actions.recordPayment.mutate(input, { onSuccess: () => { setPaying(false); toast("Payment recorded"); }, onError: (e) => toast(errorText(e)) })} />}
    </div>
  );
}

function NextStep({ p, draft, canSend, onSend, onNewVersion, sending }: { p: ProposalDetail; draft: boolean; canSend: boolean; onSend: () => void; onNewVersion: () => void; sending: boolean }) {
  const me = useMe();
  const account = useQuery({ ...paymentAccountQuery, enabled: can(me.role, "payments.manage") });
  const t = p.totals;
  if (!p.latest) return null;

  let title: string;
  let text: React.ReactNode;
  let action: React.ReactNode = null;
  if (draft) {
    title = p.version > 1 ? `Draft of version ${p.version}` : "Draft";
    text = !p.clientName
      ? "Choose a client in project settings before sending."
      : !p.clientEmail
        ? `Add an email for ${p.clientName} on the Clients page before sending.`
        : `Sending emails ${p.clientEmail} a private link to review, approve each item, sign and pay the deposit.`;
    action = canSend && (
      <button className="btn btn-primary" disabled={sending || p.lines.length === 0 || !p.clientEmail} onClick={onSend}>
        {p.version > 1 ? `Send version ${p.version}` : "Send to client"}
      </button>
    );
  } else if (p.status === "sent") {
    const decided = p.lines.filter((l) => l.decision !== "pending").length;
    title = "Waiting on the client";
    text = `${decided} of ${p.lines.length} items decided${p.share?.lastViewedAt ? `, last opened ${formatDateTime(p.share.lastViewedAt)}` : ", not opened yet"}. Need a change? Start a new version; the client's link switches to it when you send.`;
    action = canSend && <button className="btn" onClick={onNewVersion}>New version</button>;
  } else if (t.balanceDueCents > 0) {
    title = "Signed. Deposit due";
    text = `${money(t.balanceDueCents)} still to collect.${account.data?.status !== "enabled" && can(me.role, "payments.manage") ? " Connect Stripe in studio settings so the client can pay by card or bank transfer from the link." : " The client can pay from their link."}`;
    action = account.data && account.data.status !== "enabled" && <Link to="/settings/studio" className="btn btn-sm">Set up payments</Link>;
  } else if (t.processingCents > 0) {
    title = "Bank payment processing";
    text = "ACH transfers take 3 to 5 business days to clear. Approved items move to deposit paid once it settles.";
  } else if (p.status === "approved" || p.status === "partially_approved") {
    title = t.depositCents > 0 ? "Deposit paid" : "Signed";
    text = "Approved items are ready to order.";
  } else {
    return null;
  }
  return (
    <div className="next-step">
      <div style={{ flex: "1 1 320px" }}>
        <h3>{title}</h3>
        <p className="muted small" style={{ margin: 0 }}>{text}</p>
      </div>
      {action}
    </div>
  );
}

function ShareBox({ p, canSend, onReplace, onRevoke }: { p: ProposalDetail; canSend: boolean; onReplace: () => void; onRevoke: () => void }) {
  const toast = useToast();
  return (
    <div className="panel panel-body stack" style={{ gap: 8 }}>
      <span className="section-label" style={{ paddingTop: 0 }}>Client link</span>
      <div className="invite-link">
        <code>{p.share!.url}</code>
        <button className="btn btn-sm" onClick={() => void navigator.clipboard.writeText(p.share!.url).then(() => toast("Link copied"))}>Copy</button>
      </div>
      <div className="row muted small">
        <span>{p.share!.lastViewedAt ? `Last opened ${formatDateTime(p.share!.lastViewedAt)}` : "Not opened yet"}</span>
        <span className="spacer" />
        {canSend && (
          <>
            <button className="link-btn small" onClick={onReplace}>New link</button>
            <ConfirmButton label="Turn off" confirmLabel="Turn off link" onConfirm={onRevoke} />
          </>
        )}
      </div>
    </div>
  );
}

function LineGroup({ name, columns, children }: { name: string; columns: number; children: React.ReactNode }) {
  return (
    <>
      {name && <tr className="room-row"><td colSpan={columns}>{name}</td></tr>}
      {children}
    </>
  );
}

function TitleInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      className="title-input"
      aria-label="Proposal title"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v.trim() && v !== value ? onSave(v.trim()) : setV(value)}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

function TextBlock({ id, value, onSave, placeholder, rows = 4 }: { id: string; value: string; onSave: (v: string) => void; placeholder: string; rows?: number }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <textarea className="textarea" id={id} rows={rows} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} />;
}

function AddItems({ items, onAdd }: { items: ProjectDetail["items"]; onAdd: (ids: string[]) => void }) {
  const [picked, setPicked] = useState(new Set<string>());
  if (items.length === 0) return <p className="muted">Every item in this project is already on the proposal.</p>;
  return (
    <div className="stack">
      {items.map((i) => (
        <label key={i.id} className="pick-row" htmlFor={`add-${i.id}`}>
          <input type="checkbox" id={`add-${i.id}`} checked={picked.has(i.id)} onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); return n; })} />
          {i.imageUrl ? <img className="thumb" src={i.imageUrl} alt="" /> : <span className="thumb">{initials(i.name)}</span>}
          <span className="item-name" style={{ flex: 1 }}>{i.name}</span>
          <span className="num">{money(i.totalCents)}</span>
        </label>
      ))}
      <button className="btn btn-primary" disabled={picked.size === 0} onClick={() => onAdd([...picked])}>Add {picked.size || ""} to proposal</button>
    </div>
  );
}

function RecordPayment({ due, onClose, onSave }: { due: number; onClose: () => void; onSave: (input: ManualPaymentInput) => void }) {
  const [amount, setAmount] = useState<number | null>(due);
  const [method, setMethod] = useState<ManualPaymentInput["method"]>("check");
  const [note, setNote] = useState("");
  return (
    <Drawer
      open
      title="Record a payment"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-primary" disabled={!amount || amount > due} onClick={(e) => { onSave({ amountCents: amount!, method, note }); confetti({ x: e.clientX, y: e.clientY }); }}>Record {amount ? money(amount) : ""}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </>
      }
    >
      <p className="muted small" style={{ margin: 0 }}>For deposits paid outside Coord. {money(due)} is still due.</p>
      <Labeled label="Amount" htmlFor="pay-amount" error={amount && amount > due ? "More than the balance due" : undefined}>
        <MoneyInput id="pay-amount" value={amount} onChange={setAmount} />
      </Labeled>
      <label className="field" htmlFor="pay-method">
        <span>Method</span>
        <select className="select" id="pay-method" value={method} onChange={(e) => setMethod(e.target.value as ManualPaymentInput["method"])}>
          {MANUAL_PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
        </select>
      </label>
      <label className="field" htmlFor="pay-note">
        <span>Note</span>
        <input className="input" id="pay-note" placeholder="Check number, reference" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
    </Drawer>
  );
}
