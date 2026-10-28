import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  can,
  formatMoney,
  formatPct,
  PROJECT_COLOR_LABELS,
  PROJECT_COLORS,
  PROJECT_PHASE_LABELS,
  PROJECT_PHASES,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  type ProjectDetail,
  type ProjectStatus,
} from "@coord/shared";
import { clientsQuery, projectQuery, useDeleteProject, useUpdateProject } from "../data/catalog.ts";
import { useMe } from "../data/queries.ts";
import { confetti } from "../ui/confetti.ts";
import { Icon, type IconName } from "../ui/icons.tsx";
import { ConfirmButton, Drawer, Labeled, MoneyInput, PercentInput } from "../ui/inputs.tsx";
import { useToast } from "../ui/kit.tsx";
import { ItemsSection } from "./Items.tsx";
import { ProposalsPanel } from "./Proposals.tsx";
import { proposalsQuery } from "../data/proposals.ts";

const money = (c: number) => formatMoney(c).replace(/\.00$/, "");

export function ProjectPage({ projectId }: { projectId: string }) {
  const me = useMe();
  const project = useQuery(projectQuery(projectId));
  const update = useUpdateProject(projectId);
  const toast = useToast();
  const [settings, setSettings] = useState(false);
  const [picking, setPicking] = useState(false);
  const edit = can(me.role, "projects.edit");

  if (project.isPending) return <div className="page"><div className="shimmer" style={{ height: 160 }} /></div>;
  if (project.error) return <div className="page"><p className="muted">{project.error.message}</p></div>;
  const p = project.data;
  const phaseIndex = PROJECT_PHASES.indexOf(p.phase);

  const setPhase = (phase: (typeof PROJECT_PHASES)[number], e: React.MouseEvent) => {
    if (!edit || phase === p.phase) return;
    update.mutate({ phase });
    if (phase === "closed") {
      confetti({ x: e.clientX, y: e.clientY });
      toast(`${p.name} is wrapped. Beautiful work.`);
    } else toast(`Moved to ${PROJECT_PHASE_LABELS[phase].toLowerCase()}`);
  };

  return (
    <div className={`paint-${p.color}`}>
      <section className="project-hero">
        <div className="project-hero-inner">
          <div className="row">
            <Link to="/projects" className="crumb">← All projects</Link>
            <span className="spacer" />
            {edit && <button className="btn btn-sm" onClick={() => setSettings(true)}>Project settings</button>}
          </div>
          <div className="row" style={{ alignItems: "flex-end", gap: 14 }}>
            <div className="stack" style={{ gap: 6, minWidth: 0, flex: "1 1 320px" }}>
              <h1>{p.name}</h1>
              <div className="row muted" style={{ gap: 10 }}>
                {p.clientName ? <span className="item-name" style={{ color: "var(--ink)" }}>{p.clientName}</span> : <span>No client yet</span>}
                {p.address && <span>· {p.address.split("\n")[0]}</span>}
                {p.status !== "active" && <span className="pill">{PROJECT_STATUS_LABELS[p.status]}</span>}
              </div>
            </div>
            <div className="menu">
              <button className="color-dot" aria-label={`Project color: ${PROJECT_COLOR_LABELS[p.color]}`} title={PROJECT_COLOR_LABELS[p.color]} disabled={!edit} onClick={() => setPicking((x) => !x)} />
              {picking && (
                <div className="menu-pop">
                  <span className="small muted" style={{ padding: "4px 12px" }}>Project color</span>
                  <div className="color-picker">
                    {PROJECT_COLORS.map((c) => (
                      <button key={c} className={`paint-${c}`} aria-label={PROJECT_COLOR_LABELS[c]} aria-pressed={p.color === c} onClick={() => { update.mutate({ color: c }); setPicking(false); }} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="phases" role="group" aria-label="Project phase">
            {PROJECT_PHASES.map((ph, i) => (
              <button
                key={ph}
                className={`phase-step ${i < phaseIndex ? "done" : i === phaseIndex ? "current" : "later"}`}
                aria-current={i === phaseIndex ? "step" : undefined}
                disabled={!edit}
                onClick={(e) => setPhase(ph, e)}
                title={edit ? `Move to ${PROJECT_PHASE_LABELS[ph]}` : PROJECT_PHASE_LABELS[ph]}
              >
                <div className="bar" />
                <span>{PROJECT_PHASE_LABELS[ph]}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="page">
        <Tools p={p} />
        <ProposalsPanel project={p} />
        <ItemsSection project={p} />
      </div>

      {settings && <ProjectSettings p={p} onClose={() => setSettings(false)} />}
    </div>
  );
}

function Tools({ p }: { p: ProjectDetail }) {
  const me = useMe();
  const budgetPct = p.budgetCents ? Math.round((p.proposedCents / p.budgetCents) * 100) : null;
  const soon: { title: string; icon: IconName; text: string }[] = [
    { title: "Orders", icon: "box", text: "Purchase orders and tracking, vendor by vendor. Coming in M3." },
    { title: "Schedules", icon: "schedule", text: "Lighting, plumbing and finish schedules for the contractor. Coming in M5." },
    { title: "To-dos", icon: "check", text: "Phase checklists tied to items. Coming in M6." },
  ];
  return (
    <div className="tools">
      <a className="tool" href="#items" onClick={(e) => { e.preventDefault(); document.getElementById("items")?.scrollIntoView({ behavior: "smooth" }); }}>
        <span className="icon-badge"><Icon name="sofa" /></span>
        <h3>Rooms and items</h3>
        <span className="big">{p.items.length}</span>
        <span className="muted small">across {p.rooms.length} rooms</span>
      </a>
      <div className="tool">
        <span className="icon-badge"><Icon name="sparkle" /></span>
        <h3>Budget</h3>
        <span className="big">{money(p.proposedCents)}</span>
        {p.budgetCents ? (
          <>
            <div className={`meter${p.proposedCents > p.budgetCents ? " over" : ""}`}><span style={{ width: `${Math.min(100, budgetPct!)}%` }} /></div>
            <span className="muted small">{budgetPct}% of {money(p.budgetCents)}{p.proposedCents > p.budgetCents ? " · over budget" : ""}</span>
          </>
        ) : (
          <span className="muted small">No budget set</span>
        )}
      </div>
      {p.totals && can(me.role, "cost.view") && (
        <div className="tool">
          <span className="icon-badge"><Icon name="sparkle" /></span>
          <h3>Product margin</h3>
          <span className="big">{formatPct(p.totals.marginBps)}</span>
          <span className="muted small">{money(p.totals.profitCents)} on {money(p.totals.priceCents)} of product</span>
        </div>
      )}
      <ProposalsTool p={p} />
      {soon.map((s) => (
        <div key={s.title} className="tool soon">
          <span className="icon-badge" style={{ background: "var(--surface-2)", color: "var(--muted)" }}><Icon name={s.icon} /></span>
          <h3>{s.title}</h3>
          <span className="small">{s.text}</span>
        </div>
      ))}
    </div>
  );
}

function ProposalsTool({ p }: { p: ProjectDetail }) {
  const list = useQuery(proposalsQuery(p.id));
  const paid = (list.data ?? []).reduce((s, x) => s + x.paidCents, 0);
  const waiting = (list.data ?? []).filter((x) => x.status === "sent").length;
  return (
    <a className="tool" href="#proposals" onClick={(e) => { e.preventDefault(); document.getElementById("proposals")?.scrollIntoView({ behavior: "smooth" }); }}>
      <span className="icon-badge"><Icon name="proposal" /></span>
      <h3>Proposals</h3>
      <span className="big">{list.data?.length ?? 0}</span>
      <span className="muted small">
        {waiting ? `${waiting} waiting on the client` : list.data?.length ? "Nothing waiting on the client" : "Send items for approval"}
        {paid ? ` · ${money(paid)} in deposits` : ""}
      </span>
    </a>
  );
}

function ProjectSettings({ p, onClose }: { p: ProjectDetail; onClose: () => void }) {
  const me = useMe();
  const update = useUpdateProject(p.id);
  const remove = useDeleteProject();
  const clients = useQuery(clientsQuery);
  const navigate = useNavigate();
  const toast = useToast();
  const pricing = can(me.role, "pricing.edit");
  const [draft, setDraft] = useState({
    name: p.name,
    clientId: p.clientId,
    address: p.address,
    status: p.status,
    budgetCents: p.budgetCents,
    taxRateBps: p.taxRateBps,
    taxCharges: p.taxCharges,
    defaultMarkupBps: p.defaultMarkupBps,
  });
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => nameRef.current?.focus(), []);

  const save = () => {
    const patch = pricing
      ? draft
      : { name: draft.name, clientId: draft.clientId, address: draft.address, status: draft.status };
    update.mutate(patch, { onSuccess: () => { toast("Project saved"); onClose(); } });
  };

  return (
    <Drawer
      open
      title="Project settings"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-primary" onClick={save} disabled={update.isPending || !draft.name.trim()}>Save</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <span className="spacer" />
          <ConfirmButton
            label="Delete project"
            confirmLabel={`Delete ${p.name} and its items`}
            onConfirm={() => remove.mutate(p.id, { onSuccess: () => { toast(`Deleted ${p.name}`); void navigate({ to: "/projects" }); } })}
          />
        </>
      }
    >
      <label className="field" htmlFor="ps-name">
        <span>Name</span>
        <input ref={nameRef} className="input" id="ps-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </label>
      <div className="grid-2">
        <label className="field" htmlFor="ps-client">
          <span>Client</span>
          <select className="select" id="ps-client" value={draft.clientId ?? ""} onChange={(e) => setDraft({ ...draft, clientId: e.target.value || null })}>
            <option value="">No client</option>
            {clients.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="field" htmlFor="ps-status">
          <span>Status</span>
          <select className="select" id="ps-status" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as ProjectStatus })}>
            {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABELS[s]}</option>)}
          </select>
        </label>
      </div>
      <label className="field" htmlFor="ps-address">
        <span>Site address</span>
        <textarea className="textarea" id="ps-address" rows={2} value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
      </label>
      {pricing && (
        <>
          <span className="section-label">Money</span>
          <div className="grid-2">
            <Labeled label="Furnishings budget" htmlFor="ps-budget">
              <MoneyInput id="ps-budget" value={draft.budgetCents} allowEmpty onChange={(v) => setDraft({ ...draft, budgetCents: v })} />
            </Labeled>
            <Labeled label="Default markup" htmlFor="ps-markup" hint="Used for new items">
              <PercentInput id="ps-markup" value={draft.defaultMarkupBps} onChange={(v) => setDraft({ ...draft, defaultMarkupBps: v })} />
            </Labeled>
            <Labeled label="Sales tax rate" htmlFor="ps-tax" hint={p.clientTaxExempt ? "This client is tax exempt" : "Where the goods are delivered"}>
              <PercentInput id="ps-tax" value={draft.taxRateBps} max={20} onChange={(v) => setDraft({ ...draft, taxRateBps: v })} />
            </Labeled>
          </div>
          <label className="check" htmlFor="ps-tax-charges">
            <input type="checkbox" id="ps-tax-charges" checked={draft.taxCharges} onChange={(e) => setDraft({ ...draft, taxCharges: e.target.checked })} />
            This state taxes freight, delivery and install
          </label>
        </>
      )}
    </Drawer>
  );
}
