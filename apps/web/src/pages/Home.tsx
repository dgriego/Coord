import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  can,
  formatMoney,
  PROJECT_COLOR_LABELS,
  PROJECT_COLORS,
  PROJECT_PHASE_LABELS,
  PROJECT_PHASES,
  type ProjectColor,
  type ProjectPhase,
  type ProjectSummary,
} from "@coord/shared";
import { clientsQuery, projectsQuery, useCreateProject, useSaveClient } from "../data/catalog.ts";
import { useMe } from "../data/queries.ts";
import { Drawer, Labeled, MoneyInput } from "../ui/inputs.tsx";
import { EmptyState, Field, formErrors, useToast } from "../ui/kit.tsx";

const COMMON_ROOMS = [
  "Living Room", "Kitchen", "Dining Room", "Primary Bedroom", "Primary Bath", "Guest Bedroom", "Powder Room",
  "Entry", "Family Room", "Office", "Kids' Room", "Laundry", "Mudroom", "Outdoor",
];

function greeting(name: string) {
  const h = new Date().getHours();
  const first = name.split(" ")[0];
  if (h < 5) return `Burning the midnight oil, ${first}?`;
  if (h < 12) return `Good morning, ${first}`;
  if (h < 17) return `Good afternoon, ${first}`;
  return `Good evening, ${first}`;
}

function summary(projects: ProjectSummary[]): string {
  const active = projects.filter((p) => p.status === "active");
  if (projects.length === 0) return "A fresh start. Let's set up your first project.";
  const inDD = active.filter((p) => p.phase === "design_development").length;
  const inCA = active.filter((p) => p.phase === "construction_admin").length;
  const parts = [`${active.length} active ${active.length === 1 ? "project" : "projects"}`];
  if (inDD) parts.push(`${inDD} in design development`);
  if (inCA) parts.push(`${inCA} under construction`);
  return parts.join(" · ");
}

export function HomePage({ openNew }: { openNew?: boolean }) {
  const me = useMe();
  const projects = useQuery(projectsQuery);
  const [creating, setCreating] = useState(Boolean(openNew));
  const [show, setShow] = useState<"active" | "all">("active");
  const edit = can(me.role, "projects.edit");

  const list = useMemo(
    () => (projects.data ?? []).filter((p) => show === "all" || p.status !== "complete"),
    [projects.data, show],
  );

  return (
    <div className="page">
      <div className="page-head">
        <div className="greeting">
          <span className="label">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</span>
          <h1>{greeting(me.user.name)}</h1>
          <p>{projects.data ? summary(projects.data) : " "}</p>
        </div>
        <span className="spacer" />
        <div className="seg" role="group" aria-label="Which projects">
          <button aria-pressed={show === "active"} onClick={() => setShow("active")}>Current</button>
          <button aria-pressed={show === "all"} onClick={() => setShow("all")}>All</button>
        </div>
      </div>

      {projects.data?.length === 0 && !edit ? (
        <section className="panel"><EmptyState title="No projects yet">When your studio starts a project, it shows up here.</EmptyState></section>
      ) : (
        <div className="project-grid">
          {list.map((p) => <ProjectCard key={p.id} p={p} />)}
          {edit && (
            <button className="chip-card add" onClick={() => setCreating(true)}>
              <span className="plus">+</span>
              Start a project
            </button>
          )}
        </div>
      )}

      {creating && <NewProjectDrawer onClose={() => setCreating(false)} />}
    </div>
  );
}

function ProjectCard({ p }: { p: ProjectSummary }) {
  const phaseIndex = PROJECT_PHASES.indexOf(p.phase);
  const pct = p.budgetCents ? Math.min(100, Math.round((p.proposedCents / p.budgetCents) * 100)) : null;
  return (
    <Link to="/projects/$projectId" params={{ projectId: p.id }} className={`chip-card paint-${p.color}`}>
      <div className="swatch">
        {p.previewImages.map((src) => <img key={src} src={src} alt="" loading="lazy" />)}
        <span className="swatch-name">{PROJECT_COLOR_LABELS[p.color]}</span>
      </div>
      <div className="body">
        <h3>{p.name}</h3>
        <span className="muted small">{p.clientName ?? "No client yet"}{p.status !== "active" ? ` · ${p.status === "on_hold" ? "On hold" : "Complete"}` : ""}</span>
        <span className="spacer" />
        <div className="phase-dots" title={PROJECT_PHASE_LABELS[p.phase]}>
          {PROJECT_PHASES.map((ph, i) => <i key={ph} className={i <= phaseIndex ? "on" : ""} />)}
          <span className="small muted" style={{ marginLeft: 6 }}>{PROJECT_PHASE_LABELS[p.phase]}</span>
        </div>
        <div className="stat-row">
          <span><b>{p.itemCount}</b> items in <b>{p.roomCount}</b> rooms</span>
          <span><b>{formatMoney(p.proposedCents).replace(/\.00$/, "")}</b></span>
        </div>
        {pct !== null && (
          <div className={`meter${p.proposedCents > (p.budgetCents ?? 0) ? " over" : ""}`} title={`${pct}% of ${formatMoney(p.budgetCents!)} budget`}>
            <span style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </Link>
  );
}

function NewProjectDrawer({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const create = useCreateProject();
  const saveClient = useSaveClient();
  const clients = useQuery(clientsQuery);
  const toast = useToast();
  const [color, setColor] = useState<ProjectColor>(PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)]!);
  const [rooms, setRooms] = useState<string[]>(["Living Room", "Kitchen", "Primary Bedroom"]);
  const [customRoom, setCustomRoom] = useState("");
  const [clientMode, setClientMode] = useState<"existing" | "new">("existing");
  const [budget, setBudget] = useState<number | null>(null);
  const { fields, message } = formErrors(create.error ?? saveClient.error);

  const toggle = (r: string) => setRooms((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    let clientId = (f.get("clientId") as string) || null;
    if (clientMode === "new" && String(f.get("clientName")).trim()) {
      const c = await saveClient.mutateAsync({ name: String(f.get("clientName")) }).catch(() => null);
      if (!c) return;
      clientId = c.id;
    }
    create.mutate(
      {
        name: String(f.get("name")),
        clientId,
        color,
        phase: f.get("phase") as ProjectPhase,
        budgetCents: budget,
        rooms,
      },
      {
        onSuccess: ({ id }) => {
          toast("Project started. Time to fill those rooms.");
          onClose();
          void navigate({ to: "/projects/$projectId", params: { projectId: id } });
        },
      },
    );
  };

  return (
    <Drawer
      open
      title="Start a project"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-primary" type="submit" form="project-form" disabled={create.isPending}>{create.isPending ? "Starting…" : "Start project"}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </>
      }
    >
      <form id="project-form" className="stack" onSubmit={onSubmit} noValidate>
        {message && <div className="form-error" role="alert">{message}</div>}
        <Field label="Project name" name="name" id="project-name" placeholder="Henderson Residence" error={fields.name} autoFocus />

        <div className="field">
          <span>Client</span>
          <div className="seg" role="group" aria-label="Client">
            <button type="button" aria-pressed={clientMode === "existing"} onClick={() => setClientMode("existing")}>Existing client</button>
            <button type="button" aria-pressed={clientMode === "new"} onClick={() => setClientMode("new")}>New client</button>
          </div>
          {clientMode === "existing" ? (
            <select className="select" id="project-client" name="clientId" aria-label="Client" defaultValue="">
              <option value="">No client yet</option>
              {clients.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          ) : (
            <input className="input" id="project-client-name" name="clientName" placeholder="The Hendersons" aria-label="New client's name" />
          )}
        </div>

        <div className="field">
          <span>Color · <span className="muted">{PROJECT_COLOR_LABELS[color]}</span></span>
          <div className="color-picker" style={{ padding: 0 }}>
            {PROJECT_COLORS.map((c) => (
              <button type="button" key={c} className={`paint-${c}`} aria-label={PROJECT_COLOR_LABELS[c]} aria-pressed={color === c} onClick={() => setColor(c)} />
            ))}
          </div>
        </div>

        <div className="field">
          <span>Rooms · <span className="muted">tap to add or remove</span></span>
          <div className="chips">
            {[...new Set([...COMMON_ROOMS, ...rooms])].map((r) => (
              <button type="button" key={r} className="chip" aria-pressed={rooms.includes(r)} onClick={() => toggle(r)}>{r}</button>
            ))}
          </div>
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <input
              className="input"
              id="project-custom-room"
              placeholder="Another room, like Wine Cellar"
              value={customRoom}
              onChange={(e) => setCustomRoom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && customRoom.trim()) {
                  e.preventDefault();
                  setRooms((cur) => [...cur, customRoom.trim()]);
                  setCustomRoom("");
                }
              }}
            />
            <button type="button" className="btn" disabled={!customRoom.trim()} onClick={() => { setRooms((cur) => [...cur, customRoom.trim()]); setCustomRoom(""); }}>Add</button>
          </div>
        </div>

        <div className="grid-2">
          <label className="field" htmlFor="project-phase">
            <span>Phase</span>
            <select className="select" id="project-phase" name="phase" defaultValue="consultation">
              {PROJECT_PHASES.filter((p) => p !== "closed").map((p) => <option key={p} value={p}>{PROJECT_PHASE_LABELS[p]}</option>)}
            </select>
          </label>
          <Labeled label="Furnishings budget" htmlFor="project-budget" hint="Optional">
            <MoneyInput id="project-budget" value={budget} onChange={setBudget} allowEmpty placeholder="85,000" />
          </Labeled>
        </div>
      </form>
    </Drawer>
  );
}

