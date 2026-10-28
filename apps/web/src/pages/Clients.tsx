import { useMemo, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { can, PROJECT_PHASE_LABELS, type Client } from "@coord/shared";
import { clientsQuery, projectsQuery, useDeleteClient, useSaveClient } from "../data/catalog.ts";
import { useMe } from "../data/queries.ts";
import { ConfirmButton, Drawer } from "../ui/inputs.tsx";
import { EmptyState, Field, formErrors, useToast } from "../ui/kit.tsx";

export function ClientsPage() {
  const me = useMe();
  const edit = can(me.role, "projects.edit");
  const clients = useQuery(clientsQuery);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Client | "new" | null>(null);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (clients.data ?? []).filter((c) => !s || `${c.name} ${c.email} ${c.address}`.toLowerCase().includes(s));
  }, [clients.data, q]);

  return (
    <div className="page">
      <div className="page-head">
        <div className="stack" style={{ gap: 4 }}>
          <span className="label">{me.studio.name}</span>
          <h1 className="display">Clients</h1>
        </div>
        <span className="spacer" />
        {edit && <button className="btn btn-primary" onClick={() => setOpen("new")}>New client</button>}
      </div>

      <div className="toolbar">
        <input id="client-search" className="input search" type="search" placeholder="Search clients" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="muted small">{shown.length} of {clients.data?.length ?? 0}</span>
      </div>

      <section className="panel">
        {clients.data?.length === 0 ? (
          <EmptyState title="No clients yet">Add your first client, then start a project for them.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th className="hide-sm">Email</th><th className="hide-sm">Phone</th><th className="num">Projects</th><th>Tax</th></tr>
              </thead>
              <tbody>
                {clients.isPending && <tr><td colSpan={5} className="muted">Loading clients…</td></tr>}
                {shown.map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => setOpen(c)}>
                    <td>
                      <button className="link-btn item-name" onClick={(e) => { e.stopPropagation(); setOpen(c); }}>{c.name}</button>
                      <div className="muted small">{c.address.split("\n")[0]}</div>
                    </td>
                    <td className="hide-sm">{c.email}</td>
                    <td className="hide-sm">{c.phone}</td>
                    <td className="num">{c.projectCount}</td>
                    <td>{c.taxExempt ? <span className="pill">Exempt</span> : <span className="muted small">Taxable</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {open && <ClientDrawer client={open === "new" ? null : open} canEdit={edit} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ClientDrawer({ client, canEdit, onClose }: { client: Client | null; canEdit: boolean; onClose: () => void }) {
  const save = useSaveClient();
  const remove = useDeleteClient();
  const projects = useQuery(projectsQuery);
  const toast = useToast();
  const { fields, message } = formErrors(save.error);
  const theirs = (projects.data ?? []).filter((p) => client && p.clientId === client.id);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    save.mutate(
      {
        id: client?.id,
        name: String(f.get("name")),
        email: String(f.get("email")),
        phone: String(f.get("phone")),
        address: String(f.get("address")),
        notes: String(f.get("notes")),
        taxExempt: f.get("taxExempt") === "on",
      },
      { onSuccess: (c) => { toast(client ? `Saved ${c.name}` : `Added ${c.name}`); onClose(); } },
    );
  };

  return (
    <Drawer
      open
      title={client ? client.name : "New client"}
      onClose={onClose}
      footer={
        canEdit && (
          <>
            <button className="btn btn-primary" type="submit" form="client-form" disabled={save.isPending}>{save.isPending ? "Saving…" : client ? "Save" : "Add client"}</button>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <span className="spacer" />
            {client && (
              <ConfirmButton label="Delete" confirmLabel={`Delete ${client.name}`} onConfirm={() => remove.mutate(client.id, { onSuccess: () => { toast(`Deleted ${client.name}`); onClose(); } })} />
            )}
          </>
        )
      }
    >
      <form id="client-form" className="stack" onSubmit={onSubmit} noValidate>
        {message && <div className="form-error" role="alert">{message}</div>}
        <fieldset disabled={!canEdit} className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <Field label="Name" name="name" id="client-name" defaultValue={client?.name} placeholder="The Hendersons" error={fields.name} autoFocus={!client} />
          <div className="grid-2">
            <Field label="Email" name="email" id="client-email" type="email" defaultValue={client?.email} error={fields.email} />
            <Field label="Phone" name="phone" id="client-phone" defaultValue={client?.phone} />
          </div>
          <label className="field" htmlFor="client-address">
            <span>Billing address</span>
            <textarea className="textarea" id="client-address" name="address" defaultValue={client?.address} rows={3} />
          </label>
          <label className="check" htmlFor="client-exempt">
            <input type="checkbox" id="client-exempt" name="taxExempt" defaultChecked={client?.taxExempt} />
            Tax exempt (resale certificate on file)
          </label>
          <label className="field" htmlFor="client-notes">
            <span>Notes</span>
            <textarea className="textarea" id="client-notes" name="notes" defaultValue={client?.notes} />
          </label>
        </fieldset>
      </form>
      {client && (
        <div className="stack" style={{ gap: 8 }}>
          <span className="section-label">Projects</span>
          {theirs.length === 0 && <span className="muted small">No projects yet.</span>}
          {theirs.map((p) => (
            <Link key={p.id} to="/projects/$projectId" params={{ projectId: p.id }} className="row" style={{ textDecoration: "none" }}>
              <span className="item-name">{p.name}</span>
              <span className="phase">{PROJECT_PHASE_LABELS[p.phase]}</span>
            </Link>
          ))}
        </div>
      )}
    </Drawer>
  );
}
