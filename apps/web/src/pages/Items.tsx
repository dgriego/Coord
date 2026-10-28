import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  can,
  formatMoney,
  formatPct,
  ITEM_STATUS_LABELS,
  ITEM_STATUSES,
  PRICING_MODE_LABELS,
  PRICING_MODES,
  priceItem,
  type ComponentInput,
  type Item,
  type ItemPatch,
  type ItemStatus,
  type PricingMode,
  type ProjectDetail,
} from "@coord/shared";
import { ApiError } from "../api.ts";
import { useAddItem, useAddRoom, useClip, useDeleteItem, useUpdateItem, vendorsQuery } from "../data/catalog.ts";
import { useMe } from "../data/queries.ts";
import { confetti } from "../ui/confetti.ts";
import { Icon } from "../ui/icons.tsx";
import { ConfirmButton, Drawer, Labeled, MoneyInput, PercentInput } from "../ui/inputs.tsx";
import { EmptyState, initials, useToast } from "../ui/kit.tsx";

const money = (c: number) => formatMoney(c);
const looksLikeUrl = (s: string) => /^https?:\/\/\S+\.\S+/i.test(s.trim());

export function ItemsSection({ project }: { project: ProjectDetail }) {
  const me = useMe();
  const showCost = can(me.role, "cost.view");
  const edit = can(me.role, "projects.edit");
  const [room, setRoom] = useState<string | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [clipping, setClipping] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [newRoom, setNewRoom] = useState<string | null>(null);
  const add = useAddItem(project.id);
  const clip = useClip();
  const addRoom = useAddRoom(project.id);
  const update = useUpdateItem(project.id);
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => {
    const m = new Map<string | null, number>();
    for (const i of project.items) m.set(i.roomId, (m.get(i.roomId) ?? 0) + 1);
    return m;
  }, [project.items]);

  const visible = room === "all" ? project.items : project.items.filter((i) => i.roomId === room);
  const targetRoom = room === "all" ? (project.rooms[0]?.id ?? null) : room;

  const created = (item: Item, message: string) => {
    setFlashId(item.id);
    setTimeout(() => setFlashId(null), 1500);
    toast(message);
  };

  const addFromUrl = async (url: string) => {
    setClipping(url);
    try {
      const c = await clip.mutateAsync(url);
      const item = await add.mutateAsync({
        name: c.name,
        description: c.description,
        imageUrl: c.imageUrl,
        sourceUrl: c.sourceUrl,
        sku: c.sku,
        roomId: targetRoom,
        ...(c.msrpCents ? { msrpCents: c.msrpCents } : {}),
        ...(showCost ? { components: [{ vendorId: c.vendorId, description: c.name }] } : { vendorId: c.vendorId }),
      });
      const site = new URL(c.sourceUrl).hostname.replace(/^www\./, "");
      created(item, c.vendorName ? `Clipped from ${c.vendorName}` : `Clipped from ${site}`);
      if (showCost) setOpenId(item.id); // straight to adding the trade cost
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't read that page. Add the item by hand.");
    } finally {
      setClipping(null);
    }
  };

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    setText("");
    if (looksLikeUrl(value)) return void addFromUrl(value);
    add.mutate(
      { name: value, roomId: targetRoom },
      { onSuccess: (item) => created(item, `Added to ${project.rooms.find((r) => r.id === targetRoom)?.name ?? "the project"}`) },
    );
  };

  // Paste a product link anywhere on the page (outside a text box) to clip it.
  useEffect(() => {
    if (!edit) return;
    const onPaste = (e: ClipboardEvent) => {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable)) return;
      const pasted = e.clipboardData?.getData("text") ?? "";
      if (looksLikeUrl(pasted)) {
        e.preventDefault();
        void addFromUrl(pasted.trim());
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  const setStatus = (item: Item, status: ItemStatus, e: React.ChangeEvent<HTMLSelectElement>) => {
    update.mutate({ id: item.id, patch: { status } });
    if (status === "approved") {
      const r = e.target.getBoundingClientRect();
      confetti({ x: r.left + r.width / 2, y: r.top });
      toast(`${item.name} approved`);
    }
  };

  const rowsByRoom = useMemo(() => {
    if (room !== "all") return [{ id: room, name: "", items: visible }];
    const groups = project.rooms.map((r) => ({ id: r.id, name: r.name, items: project.items.filter((i) => i.roomId === r.id) }));
    const loose = project.items.filter((i) => !i.roomId);
    if (loose.length) groups.push({ id: "none", name: "No room", items: loose });
    return groups.filter((g) => g.items.length > 0);
  }, [project.items, project.rooms, room, visible]);

  const open = project.items.find((i) => i.id === openId) ?? null;
  const columns = 6 + (showCost ? 2 : 0);

  return (
    <section className="stack" id="items" style={{ scrollMarginTop: 80 }}>
      <div className="row" style={{ alignItems: "flex-end" }}>
        <h2 style={{ fontSize: 26 }}>Rooms and items</h2>
        <span className="spacer" />
        {edit && <span className="paste-hint hide-sm">Tip: paste a product link anywhere on this page</span>}
      </div>

      {showCost && project.totals && (
        <div className="totals">
          <div><span>Product cost</span><b>{money(project.totals.costCents)}</b></div>
          <div><span>Client price</span><b>{money(project.totals.priceCents)}</b></div>
          <div><span>Freight and install</span><b>{money(project.totals.chargesCents)}</b></div>
          <div><span>Sales tax</span><b>{money(project.totals.taxCents)}</b></div>
          <div><span>Margin</span><b>{formatPct(project.totals.marginBps)}</b></div>
        </div>
      )}

      <div className="room-tabs" role="tablist" aria-label="Rooms">
        <button className="room-tab" role="tab" aria-selected={room === "all"} onClick={() => setRoom("all")}>
          All rooms<span className="count">{project.items.length}</span>
        </button>
        {project.rooms.map((r) => (
          <button key={r.id} className="room-tab" role="tab" aria-selected={room === r.id} onClick={() => setRoom(r.id)}>
            {r.name}<span className="count">{counts.get(r.id) ?? 0}</span>
          </button>
        ))}
        {edit &&
          (newRoom === null ? (
            <button className="room-tab" onClick={() => setNewRoom("")} aria-label="Add a room">+ Room</button>
          ) : (
            <input
              className="input"
              id="new-room"
              autoFocus
              placeholder="Room name"
              style={{ width: 170, height: 36, borderRadius: 999 }}
              value={newRoom}
              onChange={(e) => setNewRoom(e.target.value)}
              onBlur={() => setNewRoom(null)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setNewRoom(null);
                if (e.key === "Enter" && newRoom.trim()) {
                  addRoom.mutate(newRoom.trim(), { onSuccess: (r) => { setRoom(r.id); toast(`Added ${r.name}`); } });
                  setNewRoom(null);
                }
              }}
            />
          ))}
      </div>

      <div className="panel">
        {edit && (
          <form className="add-bar" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <Icon name={looksLikeUrl(text) ? "link" : "plus"} />
            <input
              ref={inputRef}
              className="input"
              id="add-item"
              placeholder={`Paste a product link, or type an item for ${project.rooms.find((r) => r.id === targetRoom)?.name ?? "this project"}`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label="Add an item"
            />
            <button className="btn btn-primary" disabled={!text.trim() || add.isPending}>
              {looksLikeUrl(text) ? "Clip it" : "Add item"}
            </button>
          </form>
        )}

        {project.items.length === 0 && !clipping ? (
          <EmptyState title="An empty room, full of possibility">
            {edit ? "Paste a product link from any vendor's site and the photo, name and price fill in for you. Or type a name to add it by hand." : "Items your team adds show up here."}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 64 }} aria-label="Photo" />
                  <th>Item</th>
                  <th className="num">Qty</th>
                  {showCost && <th className="num hide-sm">Unit cost</th>}
                  <th className="num">Unit price</th>
                  <th className="num">Total</th>
                  {showCost && <th className="num hide-sm">Margin</th>}
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {clipping && (
                  <tr className="ghost">
                    <td><div className="thumb shimmer" /></td>
                    <td colSpan={columns - 1}>
                      <div className="item-name">Clipping that product…</div>
                      <div className="muted small" style={{ overflowWrap: "anywhere" }}>{clipping}</div>
                    </td>
                  </tr>
                )}
                {rowsByRoom.map((g) => (
                  <RoomRows key={g.id} name={room === "all" ? g.name : ""} columns={columns}>
                    {g.items.map((i) => (
                      <tr key={i.id} className={`clickable${flashId === i.id ? " flash" : ""}`} onClick={() => setOpenId(i.id)}>
                        <td>
                          {i.imageUrl ? <img className="thumb" src={i.imageUrl} alt="" loading="lazy" /> : <span className="thumb">{initials(i.name)}</span>}
                        </td>
                        <td style={{ minWidth: 200 }}>
                          <div className="item-name">{i.name}{i.tag && <span className="pill" style={{ marginLeft: 8 }}>{i.tag}</span>}</div>
                          <div className="muted small">{[i.vendorNames.join(" + "), i.finish, i.dimensions].filter(Boolean).join(" · ") || "Add vendor and details"}</div>
                        </td>
                        <td className="num" onClick={(e) => e.stopPropagation()}>
                          <QtyCell item={i} disabled={!edit} onChange={(qty) => update.mutate({ id: i.id, patch: { qty } })} />
                        </td>
                        {showCost && <td className="num hide-sm">{i.pricing ? money(i.pricing.unitCostCents) : ""}</td>}
                        <td className="num">{money(i.unitPriceCents)}</td>
                        <td className="num item-name">{money(i.totalCents)}</td>
                        {showCost && (
                          <td className="num hide-sm" style={{ color: i.pricing?.warnings.length ? "var(--danger)" : undefined }}>
                            {i.pricing ? formatPct(i.pricing.marginBps) : ""}
                          </td>
                        )}
                        <td onClick={(e) => e.stopPropagation()}>
                          <select
                            className={`status-select status-${i.status}`}
                            aria-label={`Status of ${i.name}`}
                            value={i.status}
                            disabled={!edit}
                            onChange={(e) => setStatus(i, e.target.value as ItemStatus, e)}
                          >
                            {ITEM_STATUSES.map((s) => <option key={s} value={s}>{ITEM_STATUS_LABELS[s]}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </RoomRows>
                ))}
                {room !== "all" && visible.length === 0 && !clipping && (
                  <tr><td colSpan={columns} className="muted" style={{ textAlign: "center", padding: 32 }}>Nothing in this room yet. Paste a link or type an item above.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && <ItemDrawer key={open.id} item={open} project={project} onClose={() => setOpenId(null)} />}
    </section>
  );
}

function RoomRows({ name, columns, children }: { name: string; columns: number; children: React.ReactNode }) {
  return (
    <>
      {name && <tr className="room-row"><td colSpan={columns}>{name}</td></tr>}
      {children}
    </>
  );
}

function QtyCell({ item, disabled, onChange }: { item: Item; disabled: boolean; onChange: (qty: number) => void }) {
  const [v, setV] = useState(String(item.qty));
  useEffect(() => setV(String(item.qty)), [item.qty]);
  const commit = () => {
    const n = parseInt(v, 10);
    if (Number.isFinite(n) && n >= 0 && n !== item.qty) onChange(n);
    else setV(String(item.qty));
  };
  return (
    <input
      className="cell-input"
      id={`qty-${item.id}`}
      aria-label={`Quantity of ${item.name}`}
      inputMode="numeric"
      value={v}
      disabled={disabled}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "ArrowUp") { e.preventDefault(); setV(String((parseInt(v, 10) || 0) + 1)); }
        if (e.key === "ArrowDown") { e.preventDefault(); setV(String(Math.max(0, (parseInt(v, 10) || 0) - 1))); }
      }}
    />
  );
}

type Draft = {
  name: string;
  roomId: string | null;
  description: string;
  dimensions: string;
  finish: string;
  sku: string;
  qty: number;
  unit: string;
  tag: string;
  procured: boolean;
  specified: boolean;
  sourceUrl: string;
  imageUrl: string;
  notes: string;
  pricingMode: PricingMode;
  markupBps: number;
  marginBps: number;
  msrpCents: number;
  msrpDiscountBps: number;
  fixedPriceCents: number;
  components: Required<ComponentInput>[];
  vendorId: string | null;
};

const blankPart = (description = ""): Required<ComponentInput> => ({
  vendorId: null, description, netCostCents: 0, qty: 1, freightCents: 0, cratingCents: 0, receivingCents: 0, installCents: 0, shipTo: "",
});

function ItemDrawer({ item, project, onClose }: { item: Item; project: ProjectDetail; onClose: () => void }) {
  const me = useMe();
  const showCost = can(me.role, "cost.view");
  const pricingEdit = can(me.role, "pricing.edit");
  const edit = can(me.role, "projects.edit");
  const vendors = useQuery(vendorsQuery);
  const update = useUpdateItem(project.id);
  const remove = useDeleteItem(project.id);
  const toast = useToast();

  const [d, setD] = useState<Draft>(() => ({
    name: item.name,
    roomId: item.roomId,
    description: item.description,
    dimensions: item.dimensions,
    finish: item.finish,
    sku: item.sku,
    qty: item.qty,
    unit: item.unit,
    tag: item.tag,
    procured: item.procured,
    specified: item.specified,
    sourceUrl: item.sourceUrl,
    imageUrl: item.imageUrl,
    notes: item.notes,
    pricingMode: item.pricingMode ?? "markup",
    markupBps: item.markupBps ?? project.defaultMarkupBps,
    marginBps: item.marginBps ?? 0,
    msrpCents: item.msrpCents,
    msrpDiscountBps: item.msrpDiscountBps ?? 0,
    fixedPriceCents: item.fixedPriceCents ?? 0,
    components: (item.components ?? []).map((c) => ({ ...c, vendorId: c.vendorId })),
    vendorId: null,
  }));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((cur) => ({ ...cur, [k]: v }));
  const setPart = (i: number, patch: Partial<ComponentInput>) =>
    setD((cur) => ({ ...cur, components: cur.components.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));

  // The same engine the server uses, so the preview always matches what's saved.
  const preview = useMemo(
    () =>
      priceItem({
        qty: d.qty,
        mode: d.pricingMode,
        markupBps: d.markupBps,
        marginBps: d.marginBps,
        msrpCents: d.msrpCents,
        msrpDiscountBps: d.msrpDiscountBps,
        fixedPriceCents: d.fixedPriceCents,
        components: d.components,
        taxRateBps: project.taxRateBps,
        taxCharges: project.taxCharges,
        taxExempt: project.clientTaxExempt,
      }),
    [d, project.taxRateBps, project.taxCharges, project.clientTaxExempt],
  );

  const save = () => {
    const patch: ItemPatch = {
      name: d.name, roomId: d.roomId, description: d.description, dimensions: d.dimensions, finish: d.finish, sku: d.sku,
      qty: d.qty, unit: d.unit, tag: d.tag, procured: d.procured, specified: d.specified, sourceUrl: d.sourceUrl,
      imageUrl: d.imageUrl, notes: d.notes,
    };
    if (pricingEdit) {
      Object.assign(patch, {
        pricingMode: d.pricingMode, markupBps: d.markupBps, marginBps: d.marginBps, msrpCents: d.msrpCents,
        msrpDiscountBps: d.msrpDiscountBps, fixedPriceCents: d.fixedPriceCents, components: d.components,
      });
    } else if (d.vendorId !== null) {
      patch.vendorId = d.vendorId;
    }
    update.mutate({ id: item.id, patch }, { onSuccess: () => { toast("Saved"); onClose(); } });
  };

  const vendorOptions = vendors.data ?? [];

  return (
    <Drawer
      open
      wide
      title={item.name}
      onClose={onClose}
      footer={
        edit && (
          <>
            <button className="btn btn-primary" onClick={save} disabled={update.isPending || !d.name.trim()}>{update.isPending ? "Saving…" : "Save item"}</button>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <span className="spacer" />
            {showCost && <span className="item-name">{money(preview.productPriceCents + preview.chargesCents)}</span>}
            <ConfirmButton label="Delete" confirmLabel="Delete item" onConfirm={() => remove.mutate(item.id, { onSuccess: () => { toast(`Deleted ${item.name}`); onClose(); } })} />
          </>
        )
      }
    >
      <fieldset disabled={!edit} className="stack">
        <div className="grid-2" style={{ alignItems: "start" }}>
          {d.imageUrl ? <img className="preview-img" src={d.imageUrl} alt="" /> : <div className="preview-img thumb" style={{ width: "100%", height: 180, fontSize: 40 }}>{initials(d.name)}</div>}
          <div className="stack" style={{ gap: 12 }}>
            <label className="field" htmlFor="it-name"><span>Name</span><input className="input" id="it-name" value={d.name} onChange={(e) => set("name", e.target.value)} /></label>
            <label className="field" htmlFor="it-room">
              <span>Room</span>
              <select className="select" id="it-room" value={d.roomId ?? ""} onChange={(e) => set("roomId", e.target.value || null)}>
                <option value="">No room</option>
                {project.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
            <div className="grid-3">
              <label className="field" htmlFor="it-qty"><span>Qty</span><input className="input num" id="it-qty" inputMode="numeric" value={d.qty} onChange={(e) => set("qty", Math.max(0, parseInt(e.target.value, 10) || 0))} /></label>
              <label className="field" htmlFor="it-tag"><span>Tag</span><input className="input" id="it-tag" placeholder="L-1" value={d.tag} onChange={(e) => set("tag", e.target.value)} /></label>
            </div>
          </div>
        </div>

        <div className="grid-2">
          <label className="field" htmlFor="it-dims"><span>Dimensions</span><input className="input" id="it-dims" placeholder='84"W x 38"D x 32"H' value={d.dimensions} onChange={(e) => set("dimensions", e.target.value)} /></label>
          <label className="field" htmlFor="it-finish"><span>Finish or fabric</span><input className="input" id="it-finish" placeholder="Performance linen, Oat" value={d.finish} onChange={(e) => set("finish", e.target.value)} /></label>
          <label className="field" htmlFor="it-sku"><span>SKU or model</span><input className="input" id="it-sku" value={d.sku} onChange={(e) => set("sku", e.target.value)} /></label>
          <label className="field" htmlFor="it-source"><span>Product link</span><input className="input" id="it-source" value={d.sourceUrl} onChange={(e) => set("sourceUrl", e.target.value)} /></label>
        </div>
        <label className="field" htmlFor="it-desc"><span>Description</span><textarea className="textarea" id="it-desc" rows={2} value={d.description} onChange={(e) => set("description", e.target.value)} /></label>
        <div className="row">
          <label className="check" htmlFor="it-procured"><input type="checkbox" id="it-procured" checked={d.procured} onChange={(e) => set("procured", e.target.checked)} />We buy it (proposal and PO)</label>
          <label className="check" htmlFor="it-specified"><input type="checkbox" id="it-specified" checked={d.specified} onChange={(e) => set("specified", e.target.checked)} />On a contractor schedule</label>
        </div>

        {!showCost && (
          <>
            <span className="section-label">Vendor</span>
            <select className="select" id="it-vendor" aria-label="Vendor" value={d.vendorId ?? ""} onChange={(e) => set("vendorId", e.target.value || null)}>
              <option value="">{item.vendorNames.join(" + ") || "Choose a vendor"}</option>
              {vendorOptions.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <p className="muted small">Client price: {money(item.unitPriceCents)} each. Your role doesn't include cost and markup.</p>
          </>
        )}

        {showCost && (
          <>
            <span className="section-label">Pricing</span>
            <fieldset disabled={!pricingEdit} className="stack" style={{ gap: 12 }}>
              <div className="seg" role="group" aria-label="Pricing mode">
                {PRICING_MODES.map((m) => (
                  <button type="button" key={m} aria-pressed={d.pricingMode === m} onClick={() => set("pricingMode", m)}>{PRICING_MODE_LABELS[m]}</button>
                ))}
              </div>
              <div className="grid-3">
                {d.pricingMode === "markup" && <Labeled label="Markup" htmlFor="it-markup"><PercentInput id="it-markup" value={d.markupBps} onChange={(v) => set("markupBps", v)} /></Labeled>}
                {d.pricingMode === "margin" && <Labeled label="Target margin" htmlFor="it-margin"><PercentInput id="it-margin" value={d.marginBps} max={99.99} onChange={(v) => set("marginBps", v)} /></Labeled>}
                {d.pricingMode === "msrp_discount" && <Labeled label="Client discount off retail" htmlFor="it-disc"><PercentInput id="it-disc" value={d.msrpDiscountBps} max={100} onChange={(v) => set("msrpDiscountBps", v)} /></Labeled>}
                {d.pricingMode === "fixed" && <Labeled label="Client price each" htmlFor="it-fixed"><MoneyInput id="it-fixed" value={d.fixedPriceCents} onChange={(v) => set("fixedPriceCents", v ?? 0)} /></Labeled>}
                <Labeled label="Retail (MSRP) each" htmlFor="it-msrp"><MoneyInput id="it-msrp" value={d.msrpCents} onChange={(v) => set("msrpCents", v ?? 0)} /></Labeled>
              </div>

              <div className="row">
                <span className="item-name">Parts and vendors</span>
                <span className="muted small">A COM sofa has two: the frame from the workroom and the fabric shipped to them.</span>
              </div>
              {d.components.map((c, i) => (
                <div className="component" key={i}>
                  <div className="row" style={{ flexWrap: "nowrap" }}>
                    <select className="select" id={`part-vendor-${i}`} aria-label="Vendor" value={c.vendorId ?? ""} onChange={(e) => setPart(i, { vendorId: e.target.value || null })}>
                      <option value="">Choose a vendor</option>
                      {vendorOptions.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                    <button type="button" className="btn btn-ghost btn-icon" aria-label="Remove part" onClick={() => set("components", d.components.filter((_, j) => j !== i))}><Icon name="trash" /></button>
                  </div>
                  <div className="grid-3">
                    <label className="field" htmlFor={`part-desc-${i}`} style={{ gridColumn: "span 2" }}><span>What it is</span><input className="input" id={`part-desc-${i}`} placeholder="Frame and labor" value={c.description} onChange={(e) => setPart(i, { description: e.target.value })} /></label>
                    <label className="field" htmlFor={`part-qty-${i}`}><span>Qty per item</span><input className="input num" id={`part-qty-${i}`} inputMode="decimal" value={c.qty} onChange={(e) => setPart(i, { qty: Math.max(0, Number(e.target.value) || 0) })} /></label>
                    <Labeled label="Net cost each" htmlFor={`part-cost-${i}`}><MoneyInput id={`part-cost-${i}`} value={c.netCostCents} onChange={(v) => setPart(i, { netCostCents: v ?? 0 })} /></Labeled>
                    <Labeled label="Freight" htmlFor={`part-freight-${i}`}><MoneyInput id={`part-freight-${i}`} value={c.freightCents} onChange={(v) => setPart(i, { freightCents: v ?? 0 })} /></Labeled>
                    <Labeled label="Crating" htmlFor={`part-crating-${i}`}><MoneyInput id={`part-crating-${i}`} value={c.cratingCents} onChange={(v) => setPart(i, { cratingCents: v ?? 0 })} /></Labeled>
                    <Labeled label="Receiving" htmlFor={`part-receiving-${i}`}><MoneyInput id={`part-receiving-${i}`} value={c.receivingCents} onChange={(v) => setPart(i, { receivingCents: v ?? 0 })} /></Labeled>
                    <Labeled label="Install" htmlFor={`part-install-${i}`}><MoneyInput id={`part-install-${i}`} value={c.installCents} onChange={(v) => setPart(i, { installCents: v ?? 0 })} /></Labeled>
                    <label className="field" htmlFor={`part-ship-${i}`}><span>Ship to</span><input className="input" id={`part-ship-${i}`} placeholder="Receiving warehouse" value={c.shipTo} onChange={(e) => setPart(i, { shipTo: e.target.value })} /></label>
                  </div>
                </div>
              ))}
              <div className="row">
                <button type="button" className="btn btn-sm" onClick={() => set("components", [...d.components, blankPart()])}>+ Add a part</button>
                <button type="button" className="btn btn-sm" onClick={() => set("components", [...d.components, { ...blankPart("COM fabric"), qty: 12, shipTo: vendorOptions.find((v) => v.id === d.components[0]?.vendorId)?.name ?? "" }])}>+ COM fabric</button>
              </div>
            </fieldset>

            <div className="breakdown" aria-live="polite">
              <span>Cost each</span><span className="right">{money(preview.unitCostCents)}</span>
              <span>Client price each</span><span className="right">{money(preview.unitPriceCents)}</span>
              <span>Product × {d.qty}</span><span className="right">{money(preview.productPriceCents)}</span>
              <span>Freight, crating, receiving, install</span><span className="right">{money(preview.chargesCents)}</span>
              <span>Sales tax{project.clientTaxExempt ? " (client exempt)" : ""}</span><span className="right">{money(preview.taxCents)}</span>
              <hr />
              <span className="strong">Client pays</span><span className="right strong">{money(preview.totalCents)}</span>
              <span>Profit · margin</span><span className="right">{money(preview.profitCents)} · {formatPct(preview.marginBps)}</span>
            </div>
            {preview.warnings.map((w) => <div key={w} className="warning">{w}</div>)}
          </>
        )}

        <label className="field" htmlFor="it-image"><span>Image link</span><input className="input" id="it-image" value={d.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} /></label>
        <label className="field" htmlFor="it-notes"><span>Notes</span><textarea className="textarea" id="it-notes" value={d.notes} onChange={(e) => set("notes", e.target.value)} /></label>
      </fieldset>
    </Drawer>
  );
}
