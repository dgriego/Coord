import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  can,
  formatPct,
  VENDOR_CATEGORIES,
  VENDOR_CATEGORY_LABELS,
  type Vendor,
  type VendorCategory,
  type VendorImportResult,
} from "@coord/shared";
import { useDeleteVendor, useImportVendors, useSaveVendor, vendorsQuery } from "../data/catalog.ts";
import { useMe } from "../data/queries.ts";
import { ConfirmButton, Drawer, PercentInput } from "../ui/inputs.tsx";
import { EmptyState, Field, formErrors, useToast } from "../ui/kit.tsx";

export function VendorsPage() {
  const me = useMe();
  const edit = can(me.role, "projects.edit");
  const vendors = useQuery(vendorsQuery);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<VendorCategory | null>(null);
  const [open, setOpen] = useState<Vendor | "new" | null>(null);
  const [importing, setImporting] = useState(false);

  // Only show category chips that some vendor uses.
  const used = useMemo(() => {
    const counts = new Map<VendorCategory, number>();
    for (const v of vendors.data ?? []) for (const c of v.categories) counts.set(c, (counts.get(c) ?? 0) + 1);
    return VENDOR_CATEGORIES.filter((c) => counts.has(c)).map((c) => [c, counts.get(c)!] as const);
  }, [vendors.data]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (vendors.data ?? []).filter(
      (v) =>
        (!category || v.categories.includes(category)) &&
        (!s || `${v.name} ${v.repName} ${v.city} ${v.state} ${v.accountNumber}`.toLowerCase().includes(s)),
    );
  }, [vendors.data, q, category]);

  return (
    <div className="page">
      <div className="page-head">
        <div className="stack" style={{ gap: 4 }}>
          <span className="label">{me.studio.name}</span>
          <h1 className="display">Vendors</h1>
        </div>
        <span className="spacer" />
        {edit && <button className="btn" onClick={() => setImporting(true)}>Import spreadsheet</button>}
        {edit && <button className="btn btn-primary" onClick={() => setOpen("new")}>New vendor</button>}
      </div>

      <div className="stack" style={{ gap: 10 }}>
        <div className="toolbar">
          <input id="vendor-search" className="input search" type="search" placeholder="Search by name, rep, city or account #" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="muted small">{shown.length} of {vendors.data?.length ?? 0}</span>
        </div>
        {used.length > 0 && (
          <div className="chips" role="group" aria-label="Filter by category">
            <button className="chip" aria-pressed={category === null} onClick={() => setCategory(null)}>All</button>
            {used.map(([c, n]) => (
              <button key={c} className="chip" aria-pressed={category === c} onClick={() => setCategory(category === c ? null : c)}>
                {VENDOR_CATEGORY_LABELS[c]} <span className="muted">{n}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <section className="panel">
        {vendors.data?.length === 0 ? (
          <EmptyState title="No vendors yet">Add vendors one at a time, or import the spreadsheet you already keep.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Categories</th>
                  <th className="hide-sm">Rep</th>
                  <th className="num hide-sm">Lead time</th>
                  {can(me.role, "cost.view") && <th className="num hide-sm">Discount</th>}
                  <th className="num">Items</th>
                </tr>
              </thead>
              <tbody>
                {vendors.isPending && <tr><td colSpan={6} className="muted">Loading vendors…</td></tr>}
                {shown.map((v) => (
                  <tr key={v.id} className="clickable" onClick={() => setOpen(v)}>
                    <td>
                      <button className="link-btn item-name" onClick={(e) => { e.stopPropagation(); setOpen(v); }}>{v.name}</button>
                      <div className="muted small">{[v.city, v.state].filter(Boolean).join(", ")}</div>
                    </td>
                    <td><div className="tags">{v.categories.map((c) => <span key={c} className="pill">{VENDOR_CATEGORY_LABELS[c]}</span>)}</div></td>
                    <td className="hide-sm">{v.repName}<div className="muted small">{v.repEmail}</div></td>
                    <td className="num hide-sm">{v.leadTimeWeeks !== null ? `${v.leadTimeWeeks} wk` : "—"}</td>
                    {can(me.role, "cost.view") && <td className="num hide-sm">{v.discountBps ? formatPct(v.discountBps) : "—"}</td>}
                    <td className="num">{v.itemCount}</td>
                  </tr>
                ))}
                {vendors.data && shown.length === 0 && <tr><td colSpan={6} className="muted">No vendors match.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {open && <VendorDrawer vendor={open === "new" ? null : open} canEdit={edit} onClose={() => setOpen(null)} />}
      {importing && <ImportDrawer onClose={() => setImporting(false)} />}
    </div>
  );
}

function VendorDrawer({ vendor, canEdit, onClose }: { vendor: Vendor | null; canEdit: boolean; onClose: () => void }) {
  const me = useMe();
  const save = useSaveVendor();
  const remove = useDeleteVendor();
  const toast = useToast();
  const [categories, setCategories] = useState<VendorCategory[]>(vendor?.categories ?? []);
  const [discount, setDiscount] = useState(vendor?.discountBps ?? 0);
  const { fields, message } = formErrors(save.error);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "");
    const lead = s("leadTimeWeeks");
    save.mutate(
      {
        id: vendor?.id,
        name: s("name"),
        categories,
        website: s("website"),
        email: s("email"),
        phone: s("phone"),
        accountNumber: s("accountNumber"),
        repName: s("repName"),
        repEmail: s("repEmail"),
        city: s("city"),
        state: s("state"),
        paymentTerms: s("paymentTerms"),
        notes: s("notes"),
        leadTimeWeeks: lead === "" ? null : Number(lead),
        ...(can(me.role, "cost.view") ? { discountBps: discount } : {}),
      },
      { onSuccess: (v) => { toast(vendor ? `Saved ${v.name}` : `Added ${v.name}`); onClose(); } },
    );
  };

  return (
    <Drawer
      open
      title={vendor ? vendor.name : "New vendor"}
      onClose={onClose}
      footer={
        canEdit && (
          <>
            <button className="btn btn-primary" type="submit" form="vendor-form" disabled={save.isPending}>{save.isPending ? "Saving…" : vendor ? "Save" : "Add vendor"}</button>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <span className="spacer" />
            {vendor && <ConfirmButton label="Delete" confirmLabel={`Delete ${vendor.name}`} onConfirm={() => remove.mutate(vendor.id, { onSuccess: () => { toast(`Deleted ${vendor.name}`); onClose(); } })} />}
          </>
        )
      }
    >
      <form id="vendor-form" className="stack" onSubmit={onSubmit} noValidate>
        {message && <div className="form-error" role="alert">{message}</div>}
        <fieldset disabled={!canEdit} className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <Field label="Name" name="name" id="vendor-name" defaultValue={vendor?.name} error={fields.name} autoFocus={!vendor} />
          <div className="field">
            <span>Categories</span>
            <div className="chips">
              {VENDOR_CATEGORIES.map((c) => (
                <button
                  type="button"
                  key={c}
                  className="chip"
                  aria-pressed={categories.includes(c)}
                  onClick={() => setCategories((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]))}
                >
                  {VENDOR_CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
          </div>
          <div className="grid-2">
            <Field label="Website" name="website" id="vendor-website" defaultValue={vendor?.website} placeholder="ashbyupholstery.com" />
            <Field label="Trade account #" name="accountNumber" id="vendor-account" defaultValue={vendor?.accountNumber} />
            <Field label="Order email" name="email" id="vendor-email" type="email" defaultValue={vendor?.email} error={fields.email} />
            <Field label="Phone" name="phone" id="vendor-phone" defaultValue={vendor?.phone} />
            <Field label="Rep name" name="repName" id="vendor-rep" defaultValue={vendor?.repName} />
            <Field label="Rep email" name="repEmail" id="vendor-rep-email" type="email" defaultValue={vendor?.repEmail} error={fields.repEmail} />
            <Field label="City" name="city" id="vendor-city" defaultValue={vendor?.city} />
            <Field label="State" name="state" id="vendor-state" defaultValue={vendor?.state} />
          </div>
          <div className="grid-3">
            {can(me.role, "cost.view") && (
              <label className="field" htmlFor="vendor-discount">
                <span>Trade discount</span>
                <PercentInput id="vendor-discount" value={discount} onChange={setDiscount} max={100} />
              </label>
            )}
            <Field label="Lead time (weeks)" name="leadTimeWeeks" id="vendor-lead" type="number" min={0} defaultValue={vendor?.leadTimeWeeks ?? ""} />
            <Field label="Payment terms" name="paymentTerms" id="vendor-terms" defaultValue={vendor?.paymentTerms} placeholder="50% deposit, net 30" />
          </div>
          <label className="field" htmlFor="vendor-notes">
            <span>Notes</span>
            <textarea className="textarea" id="vendor-notes" name="notes" defaultValue={vendor?.notes} />
          </label>
        </fieldset>
      </form>
    </Drawer>
  );
}

const SAMPLE = "Vendor,Category,Website,Account #,Rep name,Trade discount,Lead time (weeks),City,State";

function ImportDrawer({ onClose }: { onClose: () => void }) {
  const run = useImportVendors();
  const toast = useToast();
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<VendorImportResult | null>(null);
  const { message } = formErrors(run.error);

  const check = () => run.mutate({ csv, dryRun: true }, { onSuccess: setPreview });
  const commit = () =>
    run.mutate({ csv, dryRun: false }, { onSuccess: (r) => { toast(`Imported ${r.created} vendors`); onClose(); } });

  return (
    <Drawer
      open
      wide
      title="Import vendors"
      onClose={onClose}
      footer={
        <>
          {preview && preview.preview.length > 0 ? (
            <button className="btn btn-primary" onClick={commit} disabled={run.isPending}>Import {preview.preview.length} vendors</button>
          ) : (
            <button className="btn btn-primary" onClick={check} disabled={!csv.trim() || run.isPending}>Preview</button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </>
      }
    >
      <p className="muted">
        Paste from a spreadsheet saved as CSV, or choose the file. The first row should name the columns. Recognized columns: {SAMPLE}.
      </p>
      <input
        id="vendor-csv-file"
        type="file"
        accept=".csv,text/csv"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) { setCsv(await file.text()); setPreview(null); }
        }}
      />
      <textarea id="vendor-csv" className="textarea" rows={8} placeholder={SAMPLE} value={csv} onChange={(e) => { setCsv(e.target.value); setPreview(null); }} style={{ fontFamily: "ui-monospace, Consolas, monospace", fontSize: 13 }} />
      {message && <div className="form-error" role="alert">{message}</div>}
      {preview && (
        <div className="stack" style={{ gap: 8 }}>
          <span className="section-label">{preview.preview.length} ready · {preview.skipped.length} skipped</span>
          {preview.skipped.map((s) => (
            <div key={s.row} className="warning">Row {s.row}{s.name ? ` (${s.name})` : ""}: {s.reason}</div>
          ))}
          <div className="table-wrap">
            <table>
              <thead><tr><th>Vendor</th><th>Categories</th><th>Account #</th></tr></thead>
              <tbody>
                {preview.preview.map((v) => (
                  <tr key={v.name}>
                    <td>{v.name}</td>
                    <td>{(v.categories ?? []).map((c) => VENDOR_CATEGORY_LABELS[c]).join(", ")}</td>
                    <td>{v.accountNumber}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Drawer>
  );
}
