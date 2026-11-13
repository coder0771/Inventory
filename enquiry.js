// =====================================================================
// enquiry.js - ENQUIRY (the "ESTIMATE - MEMO" form) for owner and employees
//  - every field is optional, an enquiry can be saved empty
//  - employees see / edit only their own enquiries
//  - the owner sees all, edits them, and ticks (-> becomes a quotation) or crosses them
// =====================================================================
import {
  collection, doc, addDoc, updateDoc, deleteDoc, query, where, onSnapshot, serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* <eqpure> */
// keep only the requirement lines that have some text; quantity defaults to 1, price to 0
const eqCleanItems = (items) => (items || [])
  .filter((i) => String(i.desc || "").trim())
  .map((i) => ({ desc: String(i.desc).trim(), qty: Number(i.qty) > 0 ? Number(i.qty) : 1, price: Number(i.price) > 0 ? Number(i.price) : 0, itemId: i.itemId || "" }));
const eqTotal = (items) => Math.round(items.reduce((s, i) => s + i.qty * i.price, 0) * 100) / 100;
const eqNotes = (e) => ["From enquiry #" + (e.no || ""),
  e.mistriName ? "Mistri/Plumber: " + e.mistriName + (e.mistriPhone ? " (" + e.mistriPhone + ")" : "") : "",
  e.artName ? "Art: " + e.artName : "", e.salesman ? "Sales man: " + e.salesman : "", e.note || ""].filter(Boolean).join(". ");
/* </eqpure> */

export function initEnquiry(ctx) {
  const { db, $, toast, askConfirm, loading, esc, fmtD, dtPicker, readDT, pushAlert } = ctx;
  const st = () => ctx.getState();
  const C = (n) => collection(db, "companies", st().companyID, n);
  const D = (n, id) => doc(db, "companies", st().companyID, n, id);
  const isAdmin = () => st().role === "ADMIN";
  const inr = (n) => "₹" + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-IN");
  const line = () => ({ desc: "", qty: "", price: "", itemId: "" });

  let E = [];
  let busy = false;
  const V = { tab: "list", form: null, filter: "ALL", q: "" };

  /* ---------------- data ---------------- */
  function start() {
    E = []; V.tab = "list"; V.form = null; busy = false;
    const s = st(), admin = s.role === "ADMIN";
    const q = admin ? C("enquiries") : query(C("enquiries"), where("createdBy", "==", s.user.uid)); // employees only get their own
    let first = true;
    const prev = {};
    ctx.addUnsub(onSnapshot(q, (snap) => {
      E = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      snap.docChanges().forEach((c) => {
        const d = c.doc.data();
        if (!first && !c.doc.metadata.hasPendingWrites) {
          if (admin && c.type === "added" && d.createdBy !== s.user.uid)
            pushAlert(`<b>📝 New enquiry</b><br><small>#${esc(d.no)} ${esc(d.cName || "")} · by ${esc(d.createdByName || "")}</small>`, "enter");
          if (!admin && c.type === "modified" && prev[c.doc.id] !== d.status && d.status !== "PENDING")
            pushAlert(d.status === "APPROVED" ? `<b>✅ Enquiry approved</b><br><small>#${esc(d.no)} ${esc(d.cName || "")}</small>` : `<b>❌ Enquiry rejected</b><br><small>#${esc(d.no)} ${esc(d.cName || "")}</small>`,
              d.status === "APPROVED" ? "enter" : "left");
        }
        prev[c.doc.id] = d.status;
      });
      first = false;
      badge();
      if (V.tab !== "form") render();
    }, (e) => console.error("Enquiry listener:", e)));
  }
  function badge() {
    const b = $("eqBadge");
    if (!b) return;
    const n = isAdmin() ? E.filter((e) => (e.status || "PENDING") === "PENDING").length : 0;
    b.innerText = n; b.classList.toggle("hidden", n <= 0);
  }
  async function nextCounter(name, key) {
    return runTransaction(db, async (tx) => {
      const ref = D("counters", name), s = await tx.get(ref);
      const n = ((s.exists() && s.data()[key]) || 0) + 1;
      tx.set(ref, { [key]: n }, { merge: true });
      return n;
    });
  }

  /* ---------------- window ---------------- */
  function open() {
    V.tab = "list"; V.form = null;
    $("enquiryModal").classList.add("open");
    render();
  }
  const close = () => { $("enquiryModal").classList.remove("open"); V.form = null; };
  const back = () => { if ($("enquiryModal").classList.contains("open") && V.tab === "form") { goList(); return true; } return false; };
  function goList() { V.tab = "list"; V.form = null; render(); }

  function render() {
    const body = $("eqBody");
    if (!body || !$("enquiryModal").classList.contains("open")) return;
    $("eqTabs").innerHTML = `<button class="stab ${V.tab === "form" && !V.form.id ? "on" : ""}" onclick="EQ.newForm()">➕ New Enquiry</button>
      <button class="stab ${V.tab === "list" ? "on" : ""}" onclick="EQ.list()">📋 ${isAdmin() ? "All Enquiries" : "My Enquiries"} (${E.length})</button>`;
    body.innerHTML = V.tab === "form" ? formHTML() : listHTML();
  }

  /* ---------------- the form (same layout as the paper memo) ---------------- */
  function newForm() {
    const s = st();
    V.form = { id: null, no: null, cName: "", cPhone: "", cAddress: "", dateOn: false, date: Date.now(), time: "", mistriName: "", mistriPhone: "", artName: "",
      salesman: s.role === "ADMIN" ? "" : s.name || "", items: [line(), line(), line()], note: "" };
    V.tab = "form"; render();
  }
  function edit(id) {
    const e = E.find((x) => x.id === id);
    if (!e) return;
    if (!isAdmin() && (e.status || "PENDING") !== "PENDING") return toast("This enquiry was already decided and can't be edited");
    V.form = { id, no: e.no, cName: e.cName || "", cPhone: e.cPhone || "", cAddress: e.cAddress || "", dateOn: !!e.date, date: e.date || Date.now(), time: e.time || "",
      mistriName: e.mistriName || "", mistriPhone: e.mistriPhone || "", artName: e.artName || "", salesman: e.salesman || "",
      items: (e.items && e.items.length ? e.items : [line()]).map((i) => ({ desc: i.desc || "", qty: i.qty || "", price: i.price || "", itemId: i.itemId || "" })), note: e.note || "" };
    V.tab = "form"; render();
  }
  const inp = (label, key, type = "text", extra = "") => `<div class="memo-field"><label>${label}</label>
    <input type="${type}" value="${esc(V.form[key])}" oninput="EQ.set('${key}', this.value)" ${extra}></div>`;
  const linesHTML = () => V.form.items.map((it, i) => `<div class="bill-row">
    <select onchange="EQ.pick(${i}, this.value)"><option value="">Item from stock (optional)</option>${st().inventory.map((x) => `<option value="${esc(x.id)}" ${it.itemId === x.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>
    <input placeholder="Requirement ${i + 1}" value="${esc(it.desc)}" oninput="EQ.setItem(${i},'desc',this.value)">
    <input type="number" min="0" placeholder="Qty" value="${esc(it.qty)}" style="width:70px" oninput="EQ.setItem(${i},'qty',this.value)">
    <input type="number" min="0" placeholder="Price" value="${esc(it.price)}" style="width:90px" oninput="EQ.setItem(${i},'price',this.value)">
    <button class="bin" onclick="EQ.delLine(${i})">✖</button></div>`).join("");
  function formHTML() {
    const f = V.form;
    return `<div class="memo-box">
      <div class="memo-head"><span>ESTIMATE - MEMO</span><span>No. ${f.no ? "<b>" + esc(f.no) + "</b>" : "<i>(automatic)</i>"}</span></div>
      <p class="hint" style="margin:0 0 8px">Everything is optional. Fill in what you know and save, you can come back and complete it later.</p>
      <div class="grid2">${inp("Customer Name", "cName")}${inp("Mobile No.", "cPhone", "tel")}</div>
      <div class="grid2">
        <div class="memo-field"><label>Date (DD / MM / YYYY)</label>
          <label class="task-radio"><input type="checkbox" ${f.dateOn ? "checked" : ""} onchange="EQ.dateOn(this.checked)"> Set a date</label>
          <div id="eqDateBox" class="${f.dateOn ? "" : "hidden"}">${dtPicker("eqDate", f.date, true)}</div></div>
        ${inp("Time", "time", "time")}</div>
      ${inp("Address", "cAddress")}
      <div class="grid2">${inp("Mistri / Plumber Name", "mistriName")}${inp("Mob No. (Mistri / Plumber)", "mistriPhone", "tel")}</div>
      <div class="grid2">${inp("Art Name", "artName")}${inp("Sales Man", "salesman")}</div>
      <label class="task-label">Requirement</label>
      <div id="eqLines">${linesHTML()}</div>
      <button class="auth-btn" onclick="EQ.addLine()">➕ Add line</button>
      <div class="memo-field" style="margin-top:8px"><label>Extra notes</label><textarea class="task-input" rows="2" oninput="EQ.set('note', this.value)">${esc(f.note)}</textarea></div>
    </div>
    <button class="role-btn" style="background:#28a745" onclick="EQ.save()">💾 Save Enquiry</button>
    <button class="auth-btn" style="background:#666" onclick="EQ.list()">Cancel</button>`;
  }
  const set = (k, v) => { V.form[k] = v; };
  const setItem = (i, k, v) => { V.form.items[i][k] = v; };
  const refreshLines = () => { $("eqLines").innerHTML = linesHTML(); };
  const addLine = () => { V.form.items.push(line()); refreshLines(); };
  const delLine = (i) => { V.form.items.splice(i, 1); if (!V.form.items.length) V.form.items.push(line()); refreshLines(); };
  function pick(i, id) {
    const x = st().inventory.find((z) => z.id === id), it = V.form.items[i];
    it.itemId = id || "";
    if (x) { it.desc = x.name + (x.size && x.size !== "-" ? " " + x.size + (x.unit && x.unit !== "-" ? x.unit : "") : ""); if (!it.qty) it.qty = 1; it.price = x.price || ""; }
    refreshLines();
  }
  const dateOn = (on) => { V.form.dateOn = on; $("eqDateBox").classList.toggle("hidden", !on); };

  async function save() {
    const f = V.form;
    const date = f.dateOn ? readDT("eqDate") : null;
    if (f.dateOn && isNaN(date)) return toast("Enter a valid date");
    const data = { cName: f.cName.trim(), cPhone: f.cPhone.trim(), cAddress: f.cAddress.trim(), date, time: f.time || "", mistriName: f.mistriName.trim(),
      mistriPhone: f.mistriPhone.trim(), artName: f.artName.trim(), salesman: f.salesman.trim(), items: f.items.filter((i) => String(i.desc).trim() || i.qty || i.price).map((i) => ({
        desc: String(i.desc).trim(), qty: Number(i.qty) || 0, price: Number(i.price) || 0, itemId: i.itemId || "" })), note: f.note.trim(), updatedAt: serverTimestamp() };
    try {
      loading(true);
      if (f.id) { await updateDoc(D("enquiries", f.id), data); toast("Enquiry saved"); }
      else {
        const no = await nextCounter("enquiry", "n");
        await addDoc(C("enquiries"), { ...data, no, status: "PENDING", quotationId: "", quotationNumber: "", createdBy: st().user.uid, createdByName: st().name || "", createdAt: serverTimestamp() });
        toast("Enquiry #" + no + " saved");
      }
      goList();
    } catch (err) { console.error(err); toast("Could not save: " + err.message); }
    finally { loading(false); }
  }

  /* ---------------- list ---------------- */
  const statusChip = (s) => s === "APPROVED" ? '<span class="chip chip-green">Approved</span>' : s === "REJECTED" ? '<span class="chip chip-red">Rejected</span>' : '<span class="chip chip-yellow">Waiting</span>';
  function listHTML() {
    const admin = isAdmin(), q = V.q.trim().toLowerCase();
    let list = [...E].sort((a, b) => (b.no || 0) - (a.no || 0));
    if (V.filter !== "ALL") list = list.filter((e) => (e.status || "PENDING") === V.filter);
    if (q) list = list.filter((e) => [e.no, e.cName, e.cPhone, e.mistriName, e.artName, e.salesman, e.cAddress].join(" ").toLowerCase().includes(q));
    const count = (s) => E.filter((e) => (e.status || "PENDING") === s).length;
    const bar = `<div class="suite-bar">
      ${["ALL", "PENDING", "APPROVED", "REJECTED"].map((s) => `<button class="auth-btn ${V.filter === s ? "on" : ""}" onclick="EQ.filter('${s}')">${s === "ALL" ? "All (" + E.length + ")" : s === "PENDING" ? "Waiting (" + count(s) + ")" : s === "APPROVED" ? "Approved (" + count(s) + ")" : "Rejected (" + count(s) + ")"}</button>`).join("")}
      <input id="eqSearch" placeholder="🔍 Search name, mobile, number..." value="${esc(V.q)}" oninput="EQ.search(this.value)" style="min-width:210px; margin:0"></div>`;
    return bar + (list.length ? list.map((e) => card(e, admin)).join("") : `<p class="hint">${E.length ? "No enquiry matches." : "No enquiries yet. Tap New Enquiry to add one."}</p>`);
  }
  function card(e, admin) {
    const s = e.status || "PENDING", items = e.items || [];
    const shown = items.slice(0, 6).map((i) => `• ${esc(i.desc)}${i.qty ? " × " + esc(i.qty) : ""}`).join("<br>");
    const canEdit = admin || s === "PENDING";
    return `<div class="task-card" style="flex-wrap:wrap"><div class="task-info">
      <div class="task-title">#${esc(e.no || "-")} · ${esc(e.cName || "(no name)")} ${statusChip(s)} ${e.quotationNumber ? `<span class="chip chip-green">→ ${esc(e.quotationNumber)}</span>` : ""}</div>
      <div class="task-meta">${e.cPhone ? "📞 " + esc(e.cPhone) + " · " : ""}${e.cAddress ? "📍 " + esc(e.cAddress) + " · " : ""}${e.date ? "📅 " + fmtD(new Date(e.date)) : ""}${e.time ? " " + esc(e.time) : ""}
        ${e.mistriName || e.artName || e.salesman ? "<br>" : ""}${e.mistriName ? "Mistri/Plumber: " + esc(e.mistriName) + (e.mistriPhone ? " (" + esc(e.mistriPhone) + ")" : "") + " · " : ""}${e.artName ? "Art: " + esc(e.artName) + " · " : ""}${e.salesman ? "Sales man: " + esc(e.salesman) : ""}
        ${shown ? "<br><b>Requirement:</b><br>" + shown + (items.length > 6 ? "<br>+ " + (items.length - 6) + " more" : "") : ""}
        ${admin && e.createdByName ? "<br>Written by: " + esc(e.createdByName) : ""}${e.note ? "<br>📝 " + esc(e.note) : ""}</div></div>
      <div class="decide-col" style="flex-wrap:wrap; gap:8px">
        ${admin ? `<div class="decide"><div class="dlabel ok">✔</div><div class="dbox ${s === "APPROVED" ? "on-ok" : ""}" title="Approve: moves it to Quotations" onclick="EQ.tick('${e.id}')">${s === "APPROVED" ? "✔" : ""}</div></div>
          <div class="decide"><div class="dlabel no">✖</div><div class="dbox ${s === "REJECTED" ? "on-no" : ""}" title="Reject" onclick="EQ.cross('${e.id}')">${s === "REJECTED" ? "✖" : ""}</div></div>` : ""}
        ${canEdit ? `<button class="edit-btn" onclick="EQ.edit('${e.id}')">✏ Edit</button>` : ""}
        <button class="edit-btn" style="background:#6c757d" onclick="EQ.print('${e.id}')">🖨 Print</button>
        ${admin ? `<button class="bin" onclick="EQ.del('${e.id}')">🗑</button>` : ""}</div></div>`;
  }
  const setFilter = (f) => { V.filter = f; render(); };
  function search(v) { // only the list refreshes, so typing is not interrupted
    V.q = v; const body = $("eqBody"); if (!body) return;
    body.innerHTML = listHTML(); const i = $("eqSearch"); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); }
  }

  /* ---------------- owner decisions ---------------- */
  async function tick(id) {
    const e = E.find((x) => x.id === id);
    if (!e || !isAdmin() || busy) return;
    if (e.quotationId) { // already transferred once: never create a second quotation
      if (e.status !== "APPROVED") await updateDoc(D("enquiries", id), { status: "APPROVED", decidedAt: Date.now() }).catch((er) => toast(er.message));
      return toast("Already in Quotations as " + e.quotationNumber);
    }
    busy = true;
    try {
      loading(true);
      const number = "QUO-" + String(await nextCounter("main", "quotation")).padStart(4, "0");
      const items = eqCleanItems(e.items);
      const total = eqTotal(items);
      const ref = await addDoc(C("docs"), { type: "QUOTATION", number, status: "Draft", cName: e.cName || "Customer (enquiry #" + e.no + ")", cPhone: e.cPhone || "", cEmail: "",
        cAddress: e.cAddress || "", date: e.date || Date.now(), dueAt: null, items, taxPct: 0, discount: 0, subtotal: total, tax: 0, total, notes: eqNotes(e), leadId: "",
        enquiryId: id, enquiryNo: e.no || 0, payments: [], paid: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      await updateDoc(D("enquiries", id), { status: "APPROVED", quotationId: ref.id, quotationNumber: number, decidedAt: Date.now(), updatedAt: serverTimestamp() });
      toast("Enquiry #" + e.no + " moved to Quotations as " + number);
    } catch (err) { console.error(err); toast("Could not move it to Quotations: " + err.message); }
    finally { busy = false; loading(false); }
  }
  async function cross(id) {
    const e = E.find((x) => x.id === id);
    if (!e || !isAdmin()) return;
    if (e.status === "REJECTED") return;
    try {
      await updateDoc(D("enquiries", id), { status: "REJECTED", decidedAt: Date.now(), updatedAt: serverTimestamp() });
      toast(e.quotationNumber ? "Marked rejected. Its quotation " + e.quotationNumber + " was kept" : "Enquiry marked as rejected");
    } catch (err) { toast(err.message); }
  }
  async function del(id) {
    if (!isAdmin() || !(await askConfirm("Are you sure you want to delete this enquiry?"))) return;
    try { await deleteDoc(D("enquiries", id)); toast("Enquiry deleted"); } catch (err) { toast(err.message); }
  }

  /* ---------------- print in the paper memo layout ---------------- */
  function print(id) {
    const e = E.find((x) => x.id === id);
    if (!e) return;
    const rows = [...(e.items || [])];
    while (rows.length < 12) rows.push(null);
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Estimate Memo ${esc(e.no)}</title><style>
      body{font-family:Arial,sans-serif;margin:24px;color:#222} .box{border:2px solid #c0392b;border-radius:14px;padding:16px} .head{display:flex;justify-content:space-between;color:#c0392b;font-weight:bold;font-size:1.15em;margin-bottom:10px}
      .row{display:flex;gap:18px;margin:10px 0;color:#c0392b} .f{flex:1;border-bottom:1.5px solid #c0392b;min-height:22px;color:#222;padding:0 4px} .l{white-space:nowrap}
      .line{border-bottom:1.5px solid #c0392b;min-height:30px;padding:4px;color:#222;display:flex;justify-content:space-between}</style></head><body>
      <div class="head"><span style="flex:1;text-align:center">ESTIMATE - MEMO</span><span>No. ${esc(e.no || "")}</span></div><div class="box">
      <div class="row"><span class="l">Customer Name :</span><span class="f">${esc(e.cName || "")}</span><span class="l">Date :</span><span class="f" style="max-width:150px">${e.date ? fmtD(new Date(e.date)) : ""}</span></div>
      <div class="row"><span class="l">Mobile No. :</span><span class="f">${esc(e.cPhone || "")}</span><span class="l">Time :</span><span class="f" style="max-width:150px">${esc(e.time || "")}</span></div>
      <div class="row"><span class="l">Address :</span><span class="f">${esc(e.cAddress || "")}</span></div>
      <div class="row"><span class="l">Mistri/Plumber Name :</span><span class="f">${esc(e.mistriName || "")}</span><span class="l">Art Name :</span><span class="f">${esc(e.artName || "")}</span></div>
      <div class="row"><span class="l">Mob No. :</span><span class="f">${esc(e.mistriPhone || "")}</span></div>
      <div class="row"><span class="l">Sales Man :</span><span class="f">${esc(e.salesman || "")}</span></div>
      <div class="row"><span class="l">Requirement :</span><span class="f"></span></div>
      ${rows.map((i) => `<div class="line"><span>${i ? esc(i.desc) : ""}</span><span>${i && i.qty ? "× " + esc(i.qty) : ""}${i && i.price ? " &nbsp; ₹" + esc(i.price) : ""}</span></div>`).join("")}</div></body></html>`;
    const w = window.open("", "_blank");
    if (!w) return toast("Allow pop-ups to print");
    w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => w.print(), 400);
  }

  window.EQ = { open, close, back, newForm, list: goList, edit, set, setItem, addLine, delLine, pick, dateOn, save, tick, cross, del, print, filter: setFilter, search };
  return { start };
}
