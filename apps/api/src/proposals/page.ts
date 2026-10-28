import { formatMoney, formatPct, formatProposalNumber, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, type SharedProposal } from "@coord/shared";

// The client's proposal page (PLAN.md 8: share pages are server-rendered,
// lightweight HTML with very little JS, so they open fast on a phone).
// Rendered only from SharedProposal, the allow-listed client view, so no
// cost data can reach this HTML. It doubles as the printable PDF.

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
const money = (c: number) => esc(formatMoney(c));
const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
const paragraphs = (s: string) => s.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
/** Only http(s) images, so a stored URL can't become a script. */
const safeImage = (url: string) => (/^https?:\/\//i.test(url) || url.startsWith("/samples/") ? esc(url) : "");

export function renderProposalPage(p: SharedProposal, token: string, notice?: "paid" | "canceled"): string {
  const signed = p.signature !== null;
  const rooms = new Map<string, SharedProposal["lines"]>();
  for (const l of p.lines) rooms.set(l.roomName, [...(rooms.get(l.roomName) ?? []), l]);
  const decide = p.canDecide && p.verified;

  const lineHtml = (l: SharedProposal["lines"][number]) => {
    const img = safeImage(l.imageUrl);
    const details = [l.finish, l.dimensions].filter(Boolean).map(esc).join(" · ");
    const state = l.decision === "approved" ? "Approved" : l.decision === "rejected" ? "Declined" : "";
    return `
      <article class="line ${l.decision}" data-line="${esc(l.id)}">
        ${img ? `<img src="${img}" alt="" loading="lazy">` : `<div class="noimg"></div>`}
        <div class="line-main">
          <h3>${esc(l.name)}</h3>
          ${details ? `<div class="muted">${details}</div>` : ""}
          ${l.description ? `<div class="desc">${esc(l.description)}</div>` : ""}
          <div class="nums">
            <span>${l.qty}${l.unit ? ` ${esc(l.unit)}` : ""} × ${money(l.unitPriceCents)}</span>
            ${l.chargesCents ? `<span>Delivery and install ${money(l.chargesCents)}</span>` : ""}
            ${l.taxCents ? `<span>Tax ${money(l.taxCents)}</span>` : ""}
            <span>Deposit ${esc(formatPct(l.depositBps))}</span>
          </div>
          ${l.clientNote ? `<div class="note">Your note: ${esc(l.clientNote)}</div>` : ""}
        </div>
        <div class="line-side">
          <b class="total">${money(l.totalCents)}</b>
          ${
            decide
              ? `<div class="choice" role="group" aria-label="Decision for ${esc(l.name)}">
                   <button class="btn sm ${l.decision === "approved" ? "on-yes" : ""}" data-decide="approved" aria-pressed="${l.decision === "approved"}">Approve</button>
                   <button class="btn sm ${l.decision === "rejected" ? "on-no" : ""}" data-decide="rejected" aria-pressed="${l.decision === "rejected"}">Decline</button>
                 </div>`
              : state
                ? `<span class="tag ${l.decision}">${state}</span>`
                : ""
          }
        </div>
      </article>`;
  };

  const t = p.totals;
  const statusBanner =
    p.status === "superseded"
      ? `<div class="banner warn">This version was replaced. Ask ${esc(p.studio.name)} for the latest link.</div>`
      : notice === "paid"
        ? `<div class="banner ok">Thank you. Your payment is being confirmed and will show here shortly.</div>`
        : notice === "canceled"
          ? `<div class="banner">Payment was canceled. You can try again whenever you're ready.</div>`
          : "";

  const verifyBox =
    p.canDecide && !p.verified
      ? `<section class="card action" id="verify">
          <h2>Ready to review?</h2>
          <p class="muted">To approve items and sign, confirm it's you. We'll email a 6-digit code to ${esc(p.maskedEmail)}.</p>
          <div class="row"><button class="btn primary" id="send-code">Email me a code</button></div>
          <form class="row hidden" id="code-form">
            <input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit code" aria-label="Code">
            <button class="btn primary">Continue</button>
          </form>
          <p class="muted small" id="code-msg" role="status"></p>
        </section>`
      : "";

  const signBox = p.canSign
    ? `<section class="card action" id="sign">
        <h2>Sign and approve</h2>
        <p class="muted">You're approving ${p.lines.filter((l) => l.decision === "approved").length} of ${p.lines.length} items, ${money(t.approvedCents)} in total, with a deposit of ${money(t.depositCents)}.</p>
        <form id="sign-form" class="stack">
          <label>Type your full name<input id="sign-name" autocomplete="name" required></label>
          <label class="check"><input type="checkbox" id="sign-agree" required> I agree to sign electronically and accept the terms of this proposal.</label>
          <button class="btn primary">Sign and approve</button>
          <p class="muted small" id="sign-msg" role="status"></p>
        </form>
      </section>`
    : decide && !p.canSign
      ? `<section class="card action"><p class="muted">Approve or decline each item above. Once every item has a decision and at least one is approved, you can sign.</p></section>`
      : "";

  const processing = p.payments.some((x) => x.status === "processing");
  const payBox = p.canPay
    ? `<section class="card action" id="pay">
        <h2>Pay your deposit</h2>
        <p class="big">${money(t.balanceDueCents)}</p>
        <p class="muted">Pay by card, or by bank transfer (ACH) at no extra cost. Bank transfers take 3 to 5 business days to clear.</p>
        ${p.verified ? `<button class="btn primary" id="pay-btn">Continue to secure payment</button>` : `<p class="muted">Confirm it's you to pay: <button class="btn sm" id="send-code-pay">Email me a code</button></p>
          <form class="row hidden" id="code-form"><input id="code" inputmode="numeric" maxlength="6" placeholder="6-digit code" aria-label="Code"><button class="btn primary">Continue</button></form>
          <p class="muted small" id="code-msg" role="status"></p>`}
        ${p.paymentMode === "simulated" ? `<p class="muted small">Local development: payments are simulated, no money moves.</p>` : ""}
        <p class="muted small" id="pay-msg" role="status"></p>
      </section>`
    : signed && t.depositCents > 0 && t.balanceDueCents === 0 && t.paidCents >= t.depositCents
      ? `<section class="card action ok-card"><h2>Deposit received</h2><p class="muted">Thank you. ${esc(p.studio.name)} will place your orders.</p></section>`
      : signed && processing
        ? `<section class="card action"><h2>Payment processing</h2><p class="muted">Your bank transfer is on its way. It usually clears in 3 to 5 business days.</p></section>`
        : signed && t.balanceDueCents > 0 && !p.paymentMode
          ? `<section class="card action"><p class="muted">${esc(p.studio.name)} will be in touch about your deposit of ${money(t.balanceDueCents)}.</p></section>`
          : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(p.title)} · ${esc(p.studio.name)}</title>
<style>
:root{--bg:#f7f6f3;--surface:#fff;--ink:#1d1b19;--muted:#6b6761;--rule:#e6e3dc;--accent:#2f54eb;--ok:#1f9d55;--ok-soft:#e2f6e9;--no:#d4381c;--no-soft:#fdebe6;--warn:#fff4dc}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:860px;margin:0 auto;padding:24px 16px 64px}
header.doc{display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between;align-items:flex-start;padding:24px 0 16px;border-bottom:3px solid var(--ink)}
.studio{font-weight:800;font-size:22px;letter-spacing:-.01em}.muted{color:var(--muted)}.small{font-size:13px}
h1{font-size:30px;line-height:1.15;margin:20px 0 4px;letter-spacing:-.02em}h2{font-size:20px;margin:0 0 8px}h3{font-size:16px;margin:0}
.meta{display:flex;flex-wrap:wrap;gap:6px 18px;color:var(--muted);font-size:14px}
.card{background:var(--surface);border:1px solid var(--rule);border-radius:14px;padding:18px;margin:18px 0}.card>p:first-child{margin-top:0}.card>p:last-child{margin-bottom:0}.stack>.btn{justify-self:start}
.room{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:28px 0 8px}
.line{display:grid;grid-template-columns:72px 1fr auto;gap:14px;background:var(--surface);border:1px solid var(--rule);border-radius:12px;padding:12px;margin:8px 0}
.line img,.noimg{width:72px;height:72px;border-radius:8px;object-fit:cover;background:#f1efea}
.line.rejected{opacity:.6}.line.approved{border-color:var(--ok)}
.nums{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:13px;color:var(--muted);margin-top:6px}.desc{font-size:14px;margin-top:4px}.note{font-size:13px;margin-top:6px;font-style:italic}
.line-side{display:flex;flex-direction:column;align-items:flex-end;gap:8px}.total{font-size:17px;white-space:nowrap}
.choice{display:flex;gap:6px}.tag{font-size:12px;font-weight:700;padding:2px 10px;border-radius:999px}.tag.approved{background:var(--ok-soft);color:var(--ok)}.tag.rejected{background:var(--no-soft);color:var(--no)}
.btn{font:inherit;font-weight:600;border:1px solid var(--rule);background:var(--surface);color:var(--ink);border-radius:999px;padding:10px 18px;cursor:pointer;min-height:44px}
.btn.sm{padding:6px 12px;font-size:14px;min-height:36px}.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.btn.on-yes{background:var(--ok);border-color:var(--ok);color:#fff}.btn.on-no{background:var(--no);border-color:var(--no);color:#fff}
.btn:disabled{opacity:.6;cursor:default}
.totals{display:grid;gap:6px}.totals div{display:flex;justify-content:space-between;gap:12px}.totals .grand{font-size:20px;font-weight:800;border-top:1px solid var(--rule);padding-top:8px}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.stack{display:grid;gap:12px}.hidden{display:none}
input:not([type=checkbox]){font:inherit;border:1px solid var(--rule);border-radius:10px;padding:10px 12px;min-height:44px;width:100%;max-width:320px;display:block;margin-top:4px}
#code{max-width:160px;letter-spacing:.3em;font-variant-numeric:tabular-nums}
label{font-weight:600;font-size:14px}.check{display:flex;gap:10px;align-items:flex-start;font-weight:400}.check input{margin-top:4px;width:18px;height:18px}
.banner{padding:12px 16px;border-radius:12px;margin:16px 0;background:#e8edff}.banner.ok{background:var(--ok-soft)}.banner.warn{background:var(--warn)}
.action{border-width:2px;border-color:var(--accent)}.ok-card{border-color:var(--ok)}.big{font-size:32px;font-weight:800;margin:0}
.sig{font-family:"Segoe Script","Brush Script MT",cursive;font-size:28px}
.terms{font-size:14px;color:var(--muted)}.terms p{margin:0 0 10px}
.toolbar{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
@media (max-width:560px){.line{grid-template-columns:56px 1fr}.line img,.noimg{width:56px;height:56px}.line-side{grid-column:1/-1;flex-direction:row;justify-content:space-between;align-items:center}h1{font-size:25px}}
@media print{body{background:#fff}main{padding:0}.action,.toolbar,.banner,.choice{display:none!important}.line,.card{break-inside:avoid;border-color:#ccc}}
</style>
</head>
<body>
<main>
  <header class="doc">
    <div>
      <div class="studio">${esc(p.studio.name)}</div>
      <div class="muted small">${[p.studio.address, p.studio.email, p.studio.phone].filter(Boolean).map((x) => esc(x).replace(/\n/g, ", ")).join(" · ")}</div>
    </div>
    <div class="muted small" style="text-align:right">${esc(formatProposalNumber(p.number))}${p.version > 1 ? `, version ${p.version}` : ""}<br>${p.sentAt ? esc(date(p.sentAt)) : ""}</div>
  </header>
  ${statusBanner}
  <h1>${esc(p.title)}</h1>
  <div class="meta"><span>Prepared for ${esc(p.clientName)}</span><span>${esc(p.project.name)}</span>${p.project.address ? `<span>${esc(p.project.address.split("\n")[0]!)}</span>` : ""}</div>
  <div class="toolbar"><button class="btn sm" onclick="print()">Print or save as PDF</button></div>
  ${p.intro ? `<section class="card">${paragraphs(p.intro)}</section>` : ""}
  ${verifyBox}
  ${[...rooms].map(([room, lines]) => `${room ? `<div class="room">${esc(room)}</div>` : ""}${lines.map(lineHtml).join("")}`).join("")}

  <section class="card totals" aria-label="Totals">
    <div><span>Items, delivery and install</span><span>${money(t.subtotalCents)}</span></div>
    <div><span>Sales tax</span><span>${money(t.taxCents)}</span></div>
    <div class="grand"><span>Total</span><span>${money(t.totalCents)}</span></div>
    ${signed ? `<div><span>Approved</span><b>${money(t.approvedCents)}</b></div>` : ""}
    <div><span>Deposit${signed ? "" : p.lines.some((l) => l.decision === "rejected") ? " on items not declined" : " if everything is approved"}</span><b>${money(t.depositCents)}</b></div>
    ${p.payments
      .map((x) => `<div class="muted"><span>${esc(x.method ? PAYMENT_METHOD_LABELS[x.method] : "Payment")} · ${esc(PAYMENT_STATUS_LABELS[x.status])}${x.paidAt ? `, ${esc(date(x.paidAt))}` : ""}</span><span>${money(x.amountCents)}</span></div>`)
      .join("")}
    ${signed && t.paidCents ? `<div><span>Deposit still due</span><b>${money(t.balanceDueCents)}</b></div>` : ""}
  </section>

  ${signBox}
  ${payBox}
  ${p.terms ? `<section class="card terms"><h2 style="color:var(--ink)">Terms</h2>${paragraphs(p.terms)}</section>` : ""}
  ${
    p.signature
      ? `<section class="card"><div class="muted small">Signed electronically</div><div class="sig">${esc(p.signature.name)}</div><div class="muted small">${esc(date(p.signature.signedAt))} · document fingerprint ${esc(p.signature.documentHash.slice(0, 16))}</div></section>`
      : ""
  }
</main>
<script>
(() => {
  const base = "/api/share/" + ${JSON.stringify(token)};
  const post = async (path, body) => {
    const res = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data.error && data.error.message) || "Something went wrong. Try again.");
    return data;
  };
  const msg = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  const sendCode = async (btn) => {
    btn.disabled = true;
    try {
      const r = await post("/code");
      document.getElementById("code-form").classList.remove("hidden");
      msg("code-msg", "Code sent to " + r.maskedEmail + "." + (r.devCode ? " Local development code: " + r.devCode : ""));
      document.getElementById("code").focus();
    } catch (e) { msg("code-msg", e.message); btn.disabled = false; }
  };
  for (const id of ["send-code", "send-code-pay"]) { const b = document.getElementById(id); if (b) b.onclick = () => sendCode(b); }
  const codeForm = document.getElementById("code-form");
  if (codeForm) codeForm.onsubmit = async (e) => {
    e.preventDefault();
    try { await post("/verify", { code: document.getElementById("code").value }); location.reload(); }
    catch (err) { msg("code-msg", err.message); }
  };
  document.querySelectorAll("[data-decide]").forEach((b) => b.onclick = async () => {
    const line = b.closest("[data-line]").dataset.line;
    const decision = b.getAttribute("aria-pressed") === "true" ? "pending" : b.dataset.decide;
    b.disabled = true;
    try { await post("/lines/" + line, { decision }); location.reload(); } catch (e) { alert(e.message); b.disabled = false; }
  });
  const signForm = document.getElementById("sign-form");
  if (signForm) signForm.onsubmit = async (e) => {
    e.preventDefault();
    try { await post("/sign", { name: document.getElementById("sign-name").value, agree: document.getElementById("sign-agree").checked }); location.reload(); }
    catch (err) { msg("sign-msg", err.message); }
  };
  const pay = document.getElementById("pay-btn");
  if (pay) pay.onclick = async () => {
    pay.disabled = true;
    try { const r = await post("/checkout"); location.href = r.url; } catch (e) { msg("pay-msg", e.message); pay.disabled = false; }
  };
})();
</script>
</body>
</html>`;
}
