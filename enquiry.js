// =====================================================================
// enquiry.js - ENQUIRY (the "ESTIMATE - MEMO" form) for owner and employees
//  - every field is optional, an enquiry can be saved empty
//  - employees see / edit only their own enquiries
//  - the owner sees all, edits them, and ticks (-> becomes a quotation) or crosses them
// =====================================================================
import {
  collection, doc, addDoc, setDoc, getDoc, updateDoc, deleteDoc, query, where, onSnapshot, serverTimestamp, runTransaction
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

// ---- mobile numbers ----
const eqDigits = (p) => String(p || "").replace(/\D/g, "");
function eqMobile(p) { // Indian numbers come back as 10 digits
  let d = eqDigits(p);
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
}
const eqIntl = (p) => { const d = eqMobile(p); return d.length === 10 ? "91" + d : d; };
const eqWaLink = (p, msg) => "https://wa.me/" + eqIntl(p) + "?text=" + encodeURIComponent(msg);
const eqSmsLink = (p, msg) => "sms:+" + eqIntl(p) + "?&body=" + encodeURIComponent(msg);

// ---- reading the AI answer for a memo photo ----
function eqParseDate(v) {
  const m = String(v || "").match(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{2,4})/);
  if (!m) return null;
  const d = +m[1], mo = +m[2]; let y = +m[3]; if (y < 100) y += 2000;
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d ? dt.getTime() : null;
}
function eqParseTime(v) {
  const t = String(v || "").trim().toLowerCase();
  let m = t.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*([ap])\.?\s*m\.?$/), h, mi;
  if (m) { h = +m[1] % 12 + (m[3] === "p" ? 12 : 0); mi = +(m[2] || 0); if (+m[1] > 12) return ""; }
  else if ((m = t.match(/^(\d{1,2})[:.](\d{2})$/))) { h = +m[1]; mi = +m[2]; }
  else return "";
  return h < 24 && mi < 60 ? String(h).padStart(2, "0") + ":" + String(mi).padStart(2, "0") : "";
}
function eqJson(text) {
  const t = String(text || ""), a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; }
}
// turns the AI's JSON into form values; stock items are matched by name so the price and item link fill in too
function eqScanPatch(text, stock) {
  const j = eqJson(text);
  if (!j || typeof j !== "object") return null;
  const str = (v) => (v === null || v === undefined ? "" : String(v).trim());
  const p = {};
  [["cName", "customerName"], ["cAddress", "address"], ["mistriName", "mistriName"], ["artName", "artName"], ["salesman", "salesman"], ["note", "notes"]]
    .forEach(([k, from]) => { const v = str(j[from]); if (v) p[k] = v; });
  const m1 = eqMobile(j.mobile), m2 = eqMobile(j.mistriMobile);
  if (m1) p.cPhone = m1;
  if (m2) p.mistriPhone = m2;
  const d = eqParseDate(j.date); if (d) { p.date = d; p.dateOn = true; }
  const t = eqParseTime(j.time); if (t) p.time = t;
  const norm = (x) => str(x).toLowerCase().replace(/\s+/g, " ");
  const byName = {}; (stock || []).forEach((x) => { if (x && x.name) byName[norm(x.name)] = x; });
  const items = (Array.isArray(j.requirements) ? j.requirements : []).map((r) => {
    if (typeof r === "string") r = { item: r };
    const desc = str(r && (r.item || r.desc || r.name)), q = Number(r && r.qty), pr = Number(r && r.price), hit = byName[norm(desc)];
    return { desc, qty: q > 0 ? q : "", price: pr > 0 ? pr : hit && hit.price ? hit.price : "", itemId: hit ? hit.id : "" };
  }).filter((r) => r.desc);
  if (items.length) p.items = items;
  return p;
}

// ---- customer messages ----
const EQ_WELCOME = "Namaste {name} 🙏\nThank you for visiting {business}! We have noted your requirement{enquiry}. Our team will get back to you shortly.\n\n" +
  "📍 Showroom location: {maps}\n📸 Instagram: {instagram}\n👍 Facebook: {facebook}\n🎥 Showroom video: {video}\n🪪 Visiting card: {card}\n🏬 Showroom photo: {showroom}";
const EQ_FOLLOW = "Namaste {name} 🙏\nThis is {business}. Just checking on your enquiry{enquiry}. Do you need any more details, prices or samples? " +
  "We would be happy to help. You are welcome to visit our showroom anytime.\n\n📍 {maps}\n📸 {instagram}";
function eqKit(k, company) {
  k = k || {};
  const num = (v, d) => (v === undefined || v === null || v === "" || isNaN(Number(v)) ? d : Math.max(0, Number(v)));
  return { bizName: k.bizName || company || "", instagram: k.instagram || "", facebook: k.facebook || "", maps: k.maps || "", video: k.video || "",
    cardUrl: k.cardUrl || "", showUrl: k.showUrl || "", welcomeTpl: k.welcomeTpl || EQ_WELCOME, followTpl: k.followTpl || EQ_FOLLOW,
    followDays: num(k.followDays, 3), maxFollow: num(k.maxFollow, 3), autoWelcome: k.autoWelcome !== false, hasCard: !!k.hasCard, hasShow: !!k.hasShow };
}
// a line that holds a link nobody filled in is left out, so the message never shows an empty "Instagram:" line
function eqMessage(tpl, kit, e) {
  const vars = { name: String(e.cName || "").trim(), business: kit.bizName, enquiry: e.no ? " (No. " + e.no + ")" : "", maps: kit.maps, instagram: kit.instagram,
    facebook: kit.facebook, video: kit.video, card: kit.cardUrl, showroom: kit.showUrl };
  const LINKS = ["maps", "instagram", "facebook", "video", "card", "showroom"];
  return String(tpl || "").split("\n")
    .filter((ln) => !LINKS.some((k) => ln.includes("{" + k + "}") && !String(vars[k] || "").trim()))
    .map((ln) => ln.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? "{" + k + "}" : String(vars[k]))).replace(/ {2,}/g, " ").replace(/ ([!,.])/g, "$1"))
    .join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
const eqMs = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : typeof v === "number" ? v : 0);
// "incomplete" = still waiting for a decision; a follow-up is due every N days after the last message, up to the maximum
function eqFollowDue(e, kit, now) {
  if ((e.status || "PENDING") !== "PENDING" || eqMobile(e.cPhone).length < 10) return false;
  if (!(kit.followDays > 0) || (e.followUps || 0) >= kit.maxFollow) return false;
  const last = Math.max(eqMs(e.lastContactAt), eqMs(e.welcomeSentAt), eqMs(e.createdAt));
  return last > 0 && now - last >= kit.followDays * 86400000;
}
/* </eqpure> */

/* ---------------- pictures: shrink before saving (Firestore allows at most 1 MB per record) ---------------- */
export async function compressImage(file, maxSide, quality, maxChars) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("This file is not a picture that can be opened")); i.src = url; });
    let side = maxSide, q = quality, out = "";
    for (let k = 0; k < 8; k++) {
      const sc = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * sc)), h = Math.max(1, Math.round(img.naturalHeight * sc));
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
      out = c.toDataURL("image/jpeg", q);
      if (!maxChars || out.length <= maxChars) return out;
      q = Math.max(0.4, q - 0.1); side = Math.round(side * 0.8);
    }
    return out;
  } finally { URL.revokeObjectURL(url); }
}
async function dataUrlToFile(dataUrl, name) {
  const b = await (await fetch(dataUrl)).blob();
  return new File([b], name, { type: b.type || "image/jpeg" });
}

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
  const V = { tab: "list", form: null, filter: "ALL", q: "", kit: null, ai: undefined, send: null, alerted: false };
  const K = () => eqKit(V.kit, st().companyName);

  /* ---------------- data ---------------- */
  function start() {
    E = []; V.tab = "list"; V.form = null; V.send = null; V.ai = undefined; V.alerted = false; busy = false;
    const s = st(), admin = s.role === "ADMIN";
    // links, photos and message texts the owner saved once (Enquiry > Messages & scan)
    ctx.addUnsub(onSnapshot(D("brand", "kit"), (k) => { V.kit = k.exists() ? k.data() : null; badge(); if (V.tab === "list" || V.tab === "follow") render(); },
      (e) => console.error("Message settings listener:", e)));
    const h = setInterval(() => { badge(); if (V.tab === "follow") render(); }, 600000); // follow-ups become due with time
    ctx.addUnsub(() => clearInterval(h));
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
      if (V.tab === "list" || V.tab === "follow") render();
      if (!V.alerted) { // remind once after login
        V.alerted = true;
        setTimeout(() => { const n = dueList().length; if (n) pushAlert(`<b>🔔 ${n} follow-up message${n > 1 ? "s" : ""} due</b><br><small>Open Enquiry > Follow-ups to send them</small>`, "left"); }, 3000);
      }
    }, (e) => console.error("Enquiry listener:", e)));
  }
  function badge() {
    const b = $("eqBadge");
    if (!b) return;
    const n = (isAdmin() ? E.filter((e) => (e.status || "PENDING") === "PENDING").length : 0) + dueList().length;
    b.innerText = n; b.classList.toggle("hidden", n <= 0);
  }
  const dueList = () => E.filter((e) => eqFollowDue(e, K(), Date.now()));
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
  const back = () => {
    if (!$("enquiryModal").classList.contains("open") || V.tab === "list") return false;
    if (V.tab === "send" && V.send && V.send.from === "follow") { V.tab = "follow"; V.send = null; render(); } else goList();
    return true;
  };
  function goList() { V.tab = "list"; V.form = null; V.send = null; render(); }

  function render() {
    const body = $("eqBody");
    if (!body || !$("enquiryModal").classList.contains("open")) return;
    $("eqTabs").innerHTML = `<button class="stab ${V.tab === "form" && !V.form.id ? "on" : ""}" onclick="EQ.newForm()">➕ New Enquiry</button>
      <button class="stab ${V.tab === "list" ? "on" : ""}" onclick="EQ.list()">📋 ${isAdmin() ? "All Enquiries" : "My Enquiries"} (${E.length})</button>
      <button class="stab ${V.tab === "follow" ? "on" : ""}" onclick="EQ.follows()">🔔 Follow-ups${dueList().length ? ` <span class="badge-low">${dueList().length}</span>` : ""}</button>
      ${isAdmin() ? `<button class="stab" onclick="EQ.openKit()">⚙ Messages & scan</button>` : ""}`;
    body.innerHTML = V.tab === "form" ? formHTML() : V.tab === "send" ? sendHTML() : V.tab === "follow" ? followHTML() : listHTML();
    if (V.tab === "form" && !V.form.id && !V.focused) { V.focused = true; setTimeout(() => { const f = body.querySelector("input:not([type=file]):not([type=checkbox])"); if (f) f.focus(); }, 50); }
  }

  /* ---------------- the form (same layout as the paper memo) ---------------- */
  function newForm() {
    const s = st();
    V.form = { id: null, no: null, cName: "", cPhone: "", cAddress: "", dateOn: false, date: Date.now(), time: "", mistriName: "", mistriPhone: "", artName: "",
      salesman: s.role === "ADMIN" ? "" : s.name || "", items: [line(), line(), line()], note: "" };
    V.tab = "form"; V.focused = false; render();
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
      <div class="scan-bar"><b>📷 Fill from a photo of the paper memo</b>
        <button class="btn-sm" style="background:#8e44ad" onclick="document.getElementById('eqScanCam').click()">📷 Take photo</button>
        <button class="btn-sm" style="background:#6f42c1" onclick="document.getElementById('eqScanFile').click()">🖼 Upload photo</button>
        <input id="eqScanCam" type="file" accept="image/*" capture="environment" hidden onchange="EQ.scan(this)">
        <input id="eqScanFile" type="file" accept="image/*" hidden onchange="EQ.scan(this)"></div>
      <p class="hint" style="margin:0 0 8px">Everything is optional. Fill in what you know and save, you can come back and complete it later. Use ↑ ↓ arrow keys to move between boxes.</p>
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
  // redraw the requirement lines but keep the cursor in the same box (so arrow keys keep working)
  function refreshLines() {
    const box = $("eqLines"), a = document.activeElement;
    let row = -1, idx = -1;
    if (box && a && box.contains(a)) {
      const r = a.closest(".bill-row"), rows = [...box.querySelectorAll(".bill-row")];
      row = rows.indexOf(r); idx = [...r.querySelectorAll("select, input, button")].indexOf(a);
    }
    box.innerHTML = linesHTML();
    if (row >= 0) {
      const r = box.querySelectorAll(".bill-row")[Math.min(row, box.querySelectorAll(".bill-row").length - 1)];
      const t = r && r.querySelectorAll("select, input, button")[idx];
      if (t) t.focus();
    }
  }
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
        const full = { ...data, no, status: "PENDING", quotationId: "", quotationNumber: "", createdBy: st().user.uid, createdByName: st().name || "", createdAt: serverTimestamp() };
        const ref = await addDoc(C("enquiries"), full);
        toast("Enquiry #" + no + " saved");
        // a new customer with a mobile number gets the welcome message (with your links and photos)
        if (K().autoWelcome && eqMobile(data.cPhone).length >= 10) return openSend(ref.id, "welcome", "list", { ...full, id: ref.id, createdAt: Date.now() });
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
      <div class="task-title">#${esc(e.no || "-")} · ${esc(e.cName || "(no name)")} ${statusChip(s)} ${e.quotationNumber ? `<span class="chip chip-green">→ ${esc(e.quotationNumber)}</span>` : ""}${eqFollowDue(e, K(), Date.now()) ? ' <span class="chip chip-red">🔔 follow-up due</span>' : ""}${e.welcomeSentAt ? ' <span class="chip">📨 welcomed</span>' : ""}${e.followUps ? ` <span class="chip">🔔 ${e.followUps} follow-up${e.followUps > 1 ? "s" : ""}</span>` : ""}</div>
      <div class="task-meta">${e.cPhone ? "📞 " + esc(e.cPhone) + " · " : ""}${e.cAddress ? "📍 " + esc(e.cAddress) + " · " : ""}${e.date ? "📅 " + fmtD(new Date(e.date)) : ""}${e.time ? " " + esc(e.time) : ""}
        ${e.mistriName || e.artName || e.salesman ? "<br>" : ""}${e.mistriName ? "Mistri/Plumber: " + esc(e.mistriName) + (e.mistriPhone ? " (" + esc(e.mistriPhone) + ")" : "") + " · " : ""}${e.artName ? "Art: " + esc(e.artName) + " · " : ""}${e.salesman ? "Sales man: " + esc(e.salesman) : ""}
        ${shown ? "<br><b>Requirement:</b><br>" + shown + (items.length > 6 ? "<br>+ " + (items.length - 6) + " more" : "") : ""}
        ${admin && e.createdByName ? "<br>Written by: " + esc(e.createdByName) : ""}${e.note ? "<br>📝 " + esc(e.note) : ""}</div></div>
      <div class="decide-col" style="flex-wrap:wrap; gap:8px">
        ${admin ? `<div class="decide"><div class="dlabel ok">✔</div><div class="dbox ${s === "APPROVED" ? "on-ok" : ""}" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}" title="Approve: moves it to Quotations" onclick="EQ.tick('${e.id}')">${s === "APPROVED" ? "✔" : ""}</div></div>
          <div class="decide"><div class="dlabel no">✖</div><div class="dbox ${s === "REJECTED" ? "on-no" : ""}" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}" title="Reject" onclick="EQ.cross('${e.id}')">${s === "REJECTED" ? "✖" : ""}</div></div>` : ""}
        ${canEdit ? `<button class="edit-btn" onclick="EQ.edit('${e.id}')">✏ Edit</button>` : ""}
        ${eqMobile(e.cPhone).length >= 10 ? `<button class="edit-btn" style="background:#25D366" onclick="EQ.message('${e.id}')">📨 Message</button>` : ""}
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


  /* ---------------- 📷 fill the form from a photo of the memo (Claude AI reads the handwriting) ---------------- */
  async function aiCfg() {
    if (V.ai !== undefined) return V.ai;
    try { const a = await getDoc(D("aiConfig", "main")); V.ai = a.exists() ? a.data() : null; } catch (e) { V.ai = null; }
    return V.ai;
  }
  async function readMemo(dataUrl) {
    const cfg = await aiCfg();
    if (!cfg || !cfg.key) throw new Error(isAdmin() ? "Photo scan is not set up yet. Add the AI key in Enquiry > ⚙ Messages & scan." : "Photo scan is not set up yet. Ask the owner to add the AI key.");
    const stock = st().inventory.map((i) => i.name).filter(Boolean).slice(0, 400);
    const prompt = 'This is a photo of a handwritten "ESTIMATE - MEMO" enquiry slip from an Indian tiles, ceramics, sanitaryware and hardware showroom. ' +
      "Read every field. Correct spelling mistakes in people's names, places and product words (for example \"Ramsh Patl\" becomes \"Ramesh Patil\", \"wall tils\" becomes \"wall tiles\"). " +
      "Copy numbers exactly as written. Never guess: use an empty string for a field that is blank or unreadable.\n" +
      "Fields on the slip: Customer Name, Mobile No., Date, Time, Address, Mistri/Plumber Name, Art Name, Mob No. (of the mistri/plumber), Sales Man, " +
      "and Requirement (one item per line, often with a quantity and sometimes a price).\n" +
      (stock.length ? "Products in our stock (use these exact names when a requirement clearly means one of them): " + stock.join("; ") + "\n" : "") +
      'Reply with ONLY this JSON, no other text:\n{"customerName":"","mobile":"","date":"DD/MM/YYYY","time":"HH:MM","address":"","mistriName":"","mistriMobile":"","artName":"","salesman":"",' +
      '"requirements":[{"item":"","qty":"","price":""}],"notes":""}';
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": cfg.key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify({ model: cfg.model || "claude-sonnet-5-5", max_tokens: 1500, messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: dataUrl.split(",")[1] } }, { type: "text", text: prompt }] }] })
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error("The AI could not read the photo: " + ((err.error && err.error.message) || "error " + res.status)); }
    const data = await res.json();
    return (data.content || []).map((b) => b.text || "").join("");
  }
  async function scan(input) {
    const file = input.files && input.files[0];
    input.value = "";
    if (!file || !V.form) return;
    try {
      loading(true);
      toast("Reading the memo… this takes a few seconds");
      const img = await compressImage(file, 1600, 0.85, 4000000);
      const p = eqScanPatch(await readMemo(img), st().inventory);
      if (!p || !Object.keys(p).length) return toast("Could not read any details. Take a clear, straight photo in good light and try again.");
      Object.entries(p).forEach(([k, v]) => {
        if (k !== "items") { V.form[k] = v; return; }
        const empty = V.form.items.every((i) => !String(i.desc).trim());
        V.form.items = empty ? v : V.form.items.filter((i) => String(i.desc).trim()).concat(v);
      });
      render();
      toast("Details filled from the photo. Please check them, then Save.");
    } catch (err) { console.error(err); toast(err.message); }
    finally { loading(false); }
  }

  /* ---------------- 📨 welcome and 🔔 follow-up messages (WhatsApp / SMS) ---------------- */
  function openSend(id, kind, from, rec) {
    const e = rec || E.find((x) => x.id === id);
    if (!e) return;
    const kit = K();
    V.send = { id, kind, from: from || "list", e, msg: eqMessage(kind === "follow" ? kit.followTpl : kit.welcomeTpl, kit, e), marked: false };
    V.tab = "send"; V.form = null; render();
  }
  const message = (id) => { const e = E.find((x) => x.id === id); if (e) openSend(id, eqFollowDue(e, K(), Date.now()) ? "follow" : "welcome", "list"); };
  function sendHTML() {
    const s = V.send, e = s.e, kit = K(), follow = s.kind === "follow";
    const photos = kit.hasCard || kit.hasShow;
    return `<h4 style="margin-top:0">${follow ? "🔔 Follow-up message" : "📨 Welcome message"} to ${esc(e.cName || "the customer")} · 📞 ${esc(e.cPhone || "")}</h4>
      <textarea id="eqMsg" class="task-input" rows="11" oninput="EQ.msgEdit(this.value)">${esc(s.msg)}</textarea>
      <div class="suite-bar">
        <button class="btn-wa" onclick="EQ.sendWa()">💬 Send on WhatsApp</button>
        <button style="background:#0056b3" onclick="EQ.sendSms()">✉ Send SMS</button>
        ${photos ? `<button style="background:#8e44ad" onclick="EQ.sharePhotos()">📎 Send visiting card & showroom photo</button>` : ""}
        <button class="auth-btn" onclick="EQ.sendDone()">Done</button></div>
      <p class="hint">WhatsApp and SMS open with this message ready, tap Send there. ${photos ? "For the photos: send the message first, then tap “Send visiting card & showroom photo” and pick the same chat (it is at the top of the list)." : "Add your visiting card and showroom photos in ⚙ Messages & scan to send them too."}
      ${follow ? `<br>This is follow-up ${(e.followUps || 0) + 1} of ${kit.maxFollow}.` : e.welcomeSentAt ? "<br>A welcome message was already sent on " + fmtD(new Date(eqMs(e.welcomeSentAt))) + "." : ""}</p>`;
  }
  const msgEdit = (v) => { if (V.send) V.send.msg = v; };
  async function markSent() {
    const s = V.send;
    if (!s || s.marked) return;
    s.marked = true;
    const t = Date.now();
    const upd = s.kind === "follow" ? { followUps: (s.e.followUps || 0) + 1, lastContactAt: t } : { welcomeSentAt: t, lastContactAt: t };
    try { await updateDoc(D("enquiries", s.id), upd); } catch (err) { console.error(err); s.marked = false; }
  }
  function sendWa() { const s = V.send; if (!s) return; window.open(eqWaLink(s.e.cPhone, s.msg), "_blank"); markSent(); }
  function sendSms() { const s = V.send; if (!s) return; window.location.href = eqSmsLink(s.e.cPhone, s.msg); markSent(); }
  async function sharePhotos() {
    const kit = K();
    try {
      loading(true);
      const files = [];
      for (const [id, name] of [["card", "visiting-card.jpg"], ["showroom", "showroom.jpg"]]) {
        const d = await getDoc(D("brand", id));
        if (d.exists() && d.data().img) files.push(await dataUrlToFile(d.data().img, name));
      }
      if (!files.length) return toast("No photos saved yet. Add them in ⚙ Messages & scan.");
      const text = kit.bizName + (kit.maps ? "\n📍 " + kit.maps : "");
      if (navigator.canShare && navigator.canShare({ files })) await navigator.share({ files, text });
      else toast("This browser can't send photos directly. Open the website on your phone in Chrome or Safari to send them.");
    } catch (err) { if (err && err.name !== "AbortError") toast("Could not share the photos: " + err.message); }
    finally { loading(false); }
  }
  function sendDone() { const from = V.send && V.send.from; V.send = null; if (from === "follow") { V.tab = "follow"; render(); } else goList(); }

  function follows() { V.tab = "follow"; V.form = null; V.send = null; render(); }
  function followHTML() {
    const kit = K(), list = dueList().sort((a, b) => (a.no || 0) - (b.no || 0));
    const head = `<p class="hint">Customers whose enquiry is still waiting get a reminder every <b>${kit.followDays}</b> day${kit.followDays === 1 ? "" : "s"} after the last message, up to <b>${kit.maxFollow}</b> times.${isAdmin() ? " Change this in ⚙ Messages & scan." : ""}</p>`;
    if (!(kit.followDays > 0)) return head + "<p>Follow-up reminders are switched off.</p>";
    return head + (list.length ? list.map((e) => `<div class="task-card"><div class="task-info">
        <div class="task-title">#${esc(e.no || "-")} · ${esc(e.cName || "(no name)")}</div>
        <div class="task-meta">📞 ${esc(e.cPhone)} · last message ${fmtD(new Date(Math.max(eqMs(e.lastContactAt), eqMs(e.welcomeSentAt), eqMs(e.createdAt))))} · follow-ups sent: ${e.followUps || 0}${isAdmin() && e.createdByName ? " · by " + esc(e.createdByName) : ""}</div></div>
        <button class="btn-wa" onclick="EQ.followSend('${e.id}')">🔔 Send follow-up</button></div>`).join("")
      : "<p>No follow-ups due right now. 👍</p>");
  }
  const followSend = (id) => openSend(id, "follow", "follow");

  /* ---------------- ⚙ message settings: links, photos, texts, follow-up timing, AI key (owner) ---------------- */
  const KIT_FIELDS = [["kitBiz", "bizName"], ["kitInsta", "instagram"], ["kitFb", "facebook"], ["kitMaps", "maps"], ["kitVideo", "video"], ["kitCardUrl", "cardUrl"], ["kitShowUrl", "showUrl"],
    ["kitWelcome", "welcomeTpl"], ["kitFollow", "followTpl"], ["kitDays", "followDays"], ["kitMax", "maxFollow"]];
  async function openKit() {
    if (!isAdmin()) return;
    const kit = K();
    KIT_FIELDS.forEach(([el, k]) => { if ($(el)) $(el).value = kit[k]; });
    $("kitAuto").checked = kit.autoWelcome;
    $("aiKey").value = ""; $("aiModel").value = "";
    $("kitModal").classList.add("open");
    for (const [id, el] of [["card", "kitCardImg"], ["showroom", "kitShowImg"]]) {
      $(el).src = ""; $(el).classList.add("hidden");
      try { const d = await getDoc(D("brand", id)); if (d.exists() && d.data().img) { $(el).src = d.data().img; $(el).classList.remove("hidden"); } } catch (e) {}
    }
    try { const a = await getDoc(D("aiConfig", "main")); const ok = a.exists() && a.data().key;
      $("aiStatus").innerText = ok ? "✅ Photo scan is on (key ending …" + a.data().key.slice(-4) + ", model " + (a.data().model || "claude-sonnet-5-5") + ")" : "Photo scan is off: no key saved yet.";
      if (ok) $("aiModel").value = a.data().model || ""; } catch (e) { $("aiStatus").innerText = ""; }
  }
  const closeKit = () => $("kitModal").classList.remove("open");
  async function saveKit() {
    const out = {};
    KIT_FIELDS.forEach(([el, k]) => { out[k] = ($(el).value || "").trim(); });
    out.followDays = Math.max(0, Number(out.followDays) || 0);
    out.maxFollow = Math.max(0, Number(out.maxFollow) || 0);
    out.autoWelcome = $("kitAuto").checked;
    for (const k of ["instagram", "facebook", "maps", "video", "cardUrl", "showUrl"]) {
      if (out[k] && !/^https?:\/\//i.test(out[k])) out[k] = "https://" + out[k];
    }
    try { loading(true); await setDoc(D("brand", "kit"), { ...out, updatedAt: serverTimestamp() }, { merge: true }); toast("Message settings saved"); }
    catch (err) { console.error(err); toast("Could not save: " + err.message); }
    finally { loading(false); }
  }
  async function kitPhoto(kind, input) {
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    try {
      loading(true);
      const img = await compressImage(file, 1280, 0.8, 900000);
      await setDoc(D("brand", kind), { img, updatedAt: serverTimestamp() });
      await setDoc(D("brand", "kit"), { [kind === "card" ? "hasCard" : "hasShow"]: true }, { merge: true });
      const el = $(kind === "card" ? "kitCardImg" : "kitShowImg"); el.src = img; el.classList.remove("hidden");
      toast(kind === "card" ? "Visiting card photo saved" : "Showroom photo saved");
    } catch (err) { console.error(err); toast("Could not save the photo: " + err.message); }
    finally { loading(false); }
  }
  async function kitPhotoRemove(kind) {
    if (!(await askConfirm("Remove this photo?"))) return;
    try {
      await deleteDoc(D("brand", kind));
      await setDoc(D("brand", "kit"), { [kind === "card" ? "hasCard" : "hasShow"]: false }, { merge: true });
      const el = $(kind === "card" ? "kitCardImg" : "kitShowImg"); el.src = ""; el.classList.add("hidden");
      toast("Photo removed");
    } catch (err) { toast(err.message); }
  }
  async function saveAi() {
    const key = ($("aiKey").value || "").trim(), model = ($("aiModel").value || "").trim();
    try {
      loading(true);
      const cur = await getDoc(D("aiConfig", "main"));
      if (!key && !(cur.exists() && cur.data().key)) return toast("Paste the API key first");
      await setDoc(D("aiConfig", "main"), { ...(key ? { key } : {}), model, updatedAt: serverTimestamp() }, { merge: true });
      V.ai = undefined; $("aiKey").value = "";
      $("aiStatus").innerText = "✅ Photo scan is on" + (model ? " (model " + model + ")" : "");
      toast("Photo scan settings saved");
    } catch (err) { console.error(err); toast("Could not save: " + err.message); }
    finally { loading(false); }
  }
  async function removeAi() {
    if (!(await askConfirm("Turn off photo scan and delete the saved key?"))) return;
    try { await deleteDoc(D("aiConfig", "main")); V.ai = undefined; $("aiStatus").innerText = "Photo scan is off: no key saved yet."; toast("Key removed"); }
    catch (err) { toast(err.message); }
  }

  /* ---------------- ⌨ arrow keys move between the boxes and buttons of the Enquiry window ---------------- */
  function arrowNav(ev) {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(ev.key) || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const m = $("enquiryModal");
    if (!m || !m.classList.contains("open")) return;
    const top = ["confirmModal", "kitModal"].some((id) => $(id) && $(id).classList.contains("open"));
    if (top) return;
    const items = [...m.querySelectorAll('button, input:not([type=file]), select, textarea, [tabindex="0"], a[href]')]
      .filter((x) => !x.disabled && x.offsetParent !== null);
    if (!items.length) return;
    const el = document.activeElement, i = items.indexOf(el);
    const go = (step) => { ev.preventDefault(); const t = items[(i + step + items.length) % items.length]; t.focus(); if (t.select && t.tagName === "INPUT" && t.type !== "checkbox") try { t.select(); } catch (e) {} };
    if (i === -1) { // nothing in the window has focus yet: ↓ → start at the first box, ↑ ← at the last
      ev.preventDefault();
      items[ev.key === "ArrowUp" || ev.key === "ArrowLeft" ? items.length - 1 : 0].focus();
      return;
    }
    const down = ev.key === "ArrowDown", up = ev.key === "ArrowUp", right = ev.key === "ArrowRight", left = ev.key === "ArrowLeft";
    const tag = el.tagName, type = (el.type || "").toLowerCase();
    if (tag === "SELECT") { // ↑ ↓ move between boxes, ← → change the choice
      if (up || down) return go(down ? 1 : -1);
      ev.preventDefault();
      const n = el.selectedIndex + (right ? 1 : -1);
      if (n >= 0 && n < el.options.length) { el.selectedIndex = n; el.dispatchEvent(new Event("change", { bubbles: true })); }
      return;
    }
    const caretBox = tag === "TEXTAREA" || (tag === "INPUT" && ["text", "tel", "search", "email", "password", "url", ""].includes(type));
    if (caretBox) {
      let a = null, b = null, len = (el.value || "").length;
      try { a = el.selectionStart; b = el.selectionEnd; } catch (e) {}
      const atStart = a === null || (a === 0 && b === 0), atEnd = a === null || (a === len && b === len) || (a === 0 && b === len);
      if (tag === "TEXTAREA") { if ((up && atStart) || (down && atEnd)) return go(down ? 1 : -1); return; }
      if (up || down) return go(down ? 1 : -1);
      if ((right && atEnd) || (left && atStart)) return go(right ? 1 : -1);
      return;
    }
    if (tag === "INPUT" && (type === "number" || type === "time")) { if (up || down) return go(down ? 1 : -1); return; } // ← → stay inside the box
    return go(down || right ? 1 : -1); // buttons, tick boxes, links
  }
  document.addEventListener("keydown", arrowNav);

  window.EQ = { open, close, back, newForm, list: goList, edit, set, setItem, addLine, delLine, pick, dateOn, save, tick, cross, del, print, filter: setFilter, search,
    scan, message, msgEdit, sendWa, sendSms, sharePhotos, sendDone, follows, followSend,
    openKit, closeKit, saveKit, kitPhoto, kitPhotoRemove, saveAi, removeAi };
  return { start };
}
