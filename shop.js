// =====================================================================
// shop.js - showroom tools added on top of the inventory app
//   🧮 Tile calculator (everyone; the owner can add the result to a quotation)
//   📊 Shop reports (owner): reorder list, dead stock, stock by godown,
//      customer credit ledger (udhaar), end-of-day report, working hours /
//      overtime / late arrivals, and the shop settings used by all of them.
// =====================================================================
import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc, getDocs, query, where, onSnapshot, serverTimestamp, deleteField
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* <shoppure> */
export const SHOP_DEFAULTS = { shiftStart: "10:00", shiftEnd: "20:00", lunchStart: "", lunchEnd: "", graceMin: 15, otRate: 0, lateFine: 0, closingTime: "20:30",
  ownerPhone: "", reminderDays: 7, deadDays: 90, wastage: 10 };
const SQM_TO_SQFT = 10.7639;
const MM2_PER_SQFT = 92903.04;
const DAY = 86400000;

export const hm = (s) => { const m = String(s || "").match(/^(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : null; };
export const dayKey = (d) => { d = new Date(d); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const fmtMins = (m) => { m = Math.max(0, Math.round(m || 0)); return Math.floor(m / 60) + "h " + (m % 60) + "m"; };

// tile size from the item's own fields, or guessed from its "Size" text ("600x600", "2x2", "12x18")
export function tileInfo(item) {
  const it = item || {};
  let L = Number(it.tileL) || 0, W = Number(it.tileW) || 0, guessed = false;
  if (!(L > 0 && W > 0)) {
    const m = String(it.size || "").match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/i);
    if (m) {
      let a = +m[1], b = +m[2];
      if (a <= 4 && b <= 4) { a *= 304.8; b *= 304.8; }       // feet
      else if (a <= 48 && b <= 48) { a *= 25.4; b *= 25.4; }  // inches
      L = Math.round(a); W = Math.round(b); guessed = true;
    }
  }
  const pcs = Number(it.pcsPerBox) || 0;
  const tileSqft = L > 0 && W > 0 ? (L * W) / MM2_PER_SQFT : 0;
  const boxSqft = Number(it.boxSqft) > 0 ? Number(it.boxSqft) : (tileSqft && pcs ? tileSqft * pcs : 0);
  return { L, W, pcs, tileSqft, boxSqft, guessed };
}

// areas: [{l, w, unit:'ft'|'m', qty}]  minus: sq ft of doors / windows to leave out
export function calcTiles({ areas, minus, wastage, boxSqft, tileSqft, pcs }) {
  let area = 0;
  (areas || []).forEach((a) => {
    const l = Number(a.l) || 0, w = Number(a.w) || 0, n = Number(a.qty) || 1;
    if (l > 0 && w > 0) area += l * w * n * (a.unit === "m" ? SQM_TO_SQFT : 1);
  });
  area = Math.max(0, area - (Number(minus) || 0));
  const waste = Math.max(0, Number(wastage) || 0);
  const need = area * (1 + waste / 100);
  let boxes = 0, pieces = 0;
  if (boxSqft > 0) { boxes = need > 0 ? Math.ceil(need / boxSqft - 1e-9) : 0; pieces = pcs > 0 ? boxes * pcs : (tileSqft > 0 ? Math.ceil(need / tileSqft - 1e-9) : 0); }
  else if (tileSqft > 0) pieces = need > 0 ? Math.ceil(need / tileSqft - 1e-9) : 0;
  return { area: Math.round(area * 100) / 100, need: Math.round(need * 100) / 100, boxes, pieces, coverage: boxSqft > 0 ? boxSqft * boxes : 0 };
}

// "general" stock = stock that is not in any shade / batch
export function lotSummary(item) {
  const lots = item && item.lots ? item.lots : {};
  let q = 0, h = 0;
  Object.values(lots).forEach((l) => { q += Number(l.qty) || 0; h += Number(l.hold) || 0; });
  return { genQty: Math.max(0, (Number(item.qty) || 0) - q), genHold: Math.max(0, (Number(item.hold) || 0) - h), lotQty: q, lotHold: h };
}
// "Shade A, Batch B1, 🏬 Main" - the words are shown in the reader's language; en = true keeps English (for the audit history)
const tw = (w) => (typeof window !== "undefined" && window.I18N && window.I18N.t ? window.I18N.t(w) : w);
export const lotLabel = (l, en) => { const T = en ? (w) => w : tw;
  return [l.shade && T("Shade") + " " + l.shade, l.batch && T("Batch") + " " + l.batch, l.godown && "🏬 " + l.godown].filter(Boolean).join(", ") || T("No shade"); };

// when was this item last sold / taken out?
export function lastSold(item, history) {
  let t = Number(item.lastOutAt) || 0;
  (history || []).forEach((h) => {
    const out = /^(STOCK OUT|FINAL OUT)/.test(h.action || "");
    if (out && (h.itemId === item.id || (!h.itemId && h.item === item.name))) t = Math.max(t, h.ms || 0);
  });
  return t;
}
export function deadStock(items, history, days, now) {
  return (items || []).filter((i) => (Number(i.qty) || 0) + (Number(i.hold) || 0) > 0).map((i) => {
    const sold = lastSold(i, history), since = sold || Number(i.createdMs) || 0;
    return { item: i, sold, days: since ? Math.floor((now - since) / DAY) : null };
  }).filter((r) => r.days === null || r.days >= days).sort((a, b) => (b.days ?? 1e9) - (a.days ?? 1e9));
}
export function reorderList(items) {
  return (items || []).filter((i) => (Number(i.minQty) || 0) > 0 && (Number(i.qty) || 0) <= (Number(i.minQty) || 0))
    .map((i) => ({ item: i, suggest: Math.max(1, (Number(i.minQty) || 0) * 2 - (Number(i.qty) || 0)) }));
}

// one customer = same 10-digit mobile number (or the same name when there is no number)
export const custKey = (name, phone) => { const d = String(phone || "").replace(/\D/g, "").slice(-10); return d.length === 10 ? "p" + d : "n:" + String(name || "").trim().toLowerCase(); };
export function ledger(invoices, credits) {
  const map = {};
  const get = (name, phone) => {
    const k = custKey(name, phone);
    if (!map[k]) map[k] = { key: k, name: name || "", phone: phone || "", invDue: 0, manual: 0, invoices: [], entries: [], lastPay: 0, oldest: 0 };
    const c = map[k];
    if (!c.name && name) c.name = name; if (!c.phone && phone) c.phone = phone;
    return c;
  };
  (invoices || []).forEach((d) => {
    const bal = Math.round(((Number(d.total) || 0) - (Number(d.paid) || 0)) * 100) / 100;
    const c = get(d.cName, d.cPhone);
    c.invoices.push(d);
    (d.payments || []).forEach((p) => { c.lastPay = Math.max(c.lastPay, p.at || 0); });
    if (bal > 0.005) { c.invDue += bal; c.oldest = c.oldest ? Math.min(c.oldest, d.date || 0) : (d.date || 0); }
  });
  (credits || []).forEach((e) => {
    const c = get(e.name, e.phone);
    c.entries.push(e);
    if (e.type === "PAYMENT") { c.manual -= Number(e.amount) || 0; c.lastPay = Math.max(c.lastPay, e.at || 0); }
    else { c.manual += Number(e.amount) || 0; c.oldest = c.oldest ? Math.min(c.oldest, e.at || 0) : (e.at || 0); }
  });
  return Object.values(map).map((c) => ({ ...c, manual: Math.round(c.manual * 100) / 100, due: Math.round((c.invDue + c.manual) * 100) / 100 }))
    .sort((a, b) => b.due - a.due);
}

// the shift of one employee: their own times (set by the owner in Shop settings) or the shop shift
//   lunch: a break inside the shift that is not counted as working time (empty = no lunch break)
export function shiftFor(set, uid) {
  const s = { ...SHOP_DEFAULTS, ...(set || {}) };
  const o = (s.empShifts && uid && s.empShifts[uid]) || {};
  const r = { shiftStart: s.shiftStart, shiftEnd: s.shiftEnd, lunchStart: s.lunchStart || "", lunchEnd: s.lunchEnd || "", graceMin: Number(s.graceMin) || 0, own: false };
  if (o.shiftStart && hm(o.shiftStart) !== null) { r.shiftStart = o.shiftStart; r.own = true; }
  if (o.shiftEnd && hm(o.shiftEnd) !== null) { r.shiftEnd = o.shiftEnd; r.own = true; }
  if (o.lunchStart && hm(o.lunchStart) !== null) { r.lunchStart = o.lunchStart; r.own = true; }
  if (o.lunchEnd && hm(o.lunchEnd) !== null) { r.lunchEnd = o.lunchEnd; r.own = true; }
  if (o.graceMin !== undefined && o.graceMin !== null && o.graceMin !== "" && !isNaN(Number(o.graceMin))) { r.graceMin = Math.max(0, Number(o.graceMin)); r.own = true; }
  const ls = hm(r.lunchStart), le = hm(r.lunchEnd);
  r.lunch = ls !== null && le !== null && le > ls ? [ls, le] : null;
  r.lunchMin = r.lunch ? r.lunch[1] - r.lunch[0] : 0;
  const a = hm(r.shiftStart), b = hm(r.shiftEnd);
  // working minutes of the shift, without the lunch break
  r.workMin = a !== null && b !== null && b > a ? (b - a) - overlapMin(a, b, r.lunch) : 0;
  return r;
}
// the 🍱 Lunch button gives the employee a 1-hour break
export const LUNCH_MIN = 60;
// minutes of the lunch break that fall between from and to (minutes of the day)
export function overlapMin(from, to, lunch) {
  if (!lunch) return 0;
  return Math.max(0, Math.min(to, lunch[1]) - Math.max(from, lunch[0]));
}
// attendance records -> one row per employee per day with In / Out / hours / late / overtime
//   late and overtime use each employee's own shift when the owner has set one; lunch time is not counted
export function attDays(records, set) {
  const s = { ...SHOP_DEFAULTS, ...(set || {}) };
  const days = {};
  (records || []).forEach((a) => {
    const t = a.ms; if (!t) return;
    const k = a.uid + "|" + (a.date || dayKey(t));
    const d = days[k] || (days[k] = { uid: a.uid, name: a.name || "", date: a.date || dayKey(t), inMs: 0, outMs: 0, lunchAt: 0 });
    if (a.type === "OUT") d.outMs = t; else if (a.type === "LUNCH") d.lunchAt = t; else d.inMs = t;
    if (a.name) d.name = a.name;
  });
  const dayMin = (ms) => { const dt = new Date(ms); return dt.getHours() * 60 + dt.getMinutes(); };
  return Object.values(days).map((d) => {
    const sh = shiftFor(s, d.uid);
    // the lunch the employee really took (🍱 button, 1 hour) replaces the planned lunch time of that day
    const took = d.lunchAt ? [dayMin(d.lunchAt), dayMin(d.lunchAt) + LUNCH_MIN] : null, lunchWin = took || sh.lunch;
    const start = hm(sh.shiftStart), end = hm(sh.shiftEnd);
    const shiftLen = took ? (start !== null && end !== null && end > start ? (end - start) - overlapMin(start, end, took) : 0) : sh.workMin;
    let lateMin = 0, mins = null, otMin = 0, lunchMin = 0;
    if (d.inMs && start !== null) {
      const inMin = dayMin(d.inMs);
      if (inMin > start + sh.graceMin) lateMin = inMin - start;
    }
    if (d.inMs && d.outMs && d.outMs > d.inMs) {
      const span = Math.round((d.outMs - d.inMs) / 60000);
      // the lunch break inside In .. Out is not working time (Out on the same day)
      if (lunchWin && new Date(d.inMs).toDateString() === new Date(d.outMs).toDateString()) lunchMin = overlapMin(dayMin(d.inMs), dayMin(d.outMs), lunchWin);
      mins = Math.max(0, span - lunchMin);
      if (shiftLen) otMin = Math.max(0, mins - shiftLen);
    }
    return { ...d, late: lateMin > 0, lateMin, mins, otMin, lunchMin, shiftStart: sh.shiftStart, shiftEnd: sh.shiftEnd, ownShift: sh.own };
  }).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.name.localeCompare(b.name)));
}
export function attMonth(rows) {
  const per = {};
  rows.forEach((r) => {
    const p = per[r.uid] || (per[r.uid] = { uid: r.uid, name: r.name, days: 0, mins: 0, otMin: 0, lateDays: 0, lateMin: 0, noOut: 0 });
    if (r.inMs) p.days++;
    if (r.mins !== null) p.mins += r.mins; else if (r.inMs) p.noOut++;
    p.otMin += r.otMin; if (r.late) { p.lateDays++; p.lateMin += r.lateMin; }
  });
  return per;
}
// ₹ per overtime hour: the rate set by the owner, or the salary per working hour
export function otRateFor(set, monthly, workingDays, uid) {
  const s = { ...SHOP_DEFAULTS, ...(set || {}) }, sh = shiftFor(s, uid);
  if (Number(s.otRate) > 0) return Number(s.otRate);
  const len = sh.workMin;
  if (!(len > 0) || !(monthly > 0) || !(workingDays > 0)) return 0;
  return Math.round((monthly / workingDays / (len / 60)) * 100) / 100;
}
/* </shoppure> */

export function initShop(ctx) {
  const { db, $, toast, askConfirm, loading, esc, fmtDT, fmtD, pushAlert } = ctx;
  const st = () => ctx.getState();
  const C = (n) => collection(db, "companies", st().companyID, n);
  const D = (n, id) => doc(db, "companies", st().companyID, n, id);
  const isAdmin = () => st().role === "ADMIN";
  const inr = (n) => "₹" + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-IN");
  const num = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-IN");
  const dstr = (ms) => (ms ? fmtD(new Date(ms)) : "-");
  const tstr = (ms) => (ms ? new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true }) : "-");
  const waDigits = (p) => { const d = String(p || "").replace(/\D/g, ""); return d.length === 10 ? "91" + d : d; };
  const waOpen = (phone, text) => window.open(`https://wa.me/${waDigits(phone)}?text=${encodeURIComponent(text)}`, "_blank");
  const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const metaId = (k) => String(k).replace(/\//g, "_");
  const errText = (e) => (e && e.code === "permission-denied" ? "The owner must publish the latest firestore.rules in Firebase first" : (e && e.message) || String(e));

  let settings = { ...SHOP_DEFAULTS };
  let credits = [], creditMeta = {};
  let lunches = []; // 🍱 lunch breaks of the last 30 days (owner)
  let unsub = [];
  const V = { tab: "reorder", deadDays: null, credFilter: "", credKey: null, dayMs: Date.now(), hoursY: new Date().getFullYear(), hoursM: new Date().getMonth() + 1,
    hoursUid: null, dayData: null, hoursData: null, reorder: {} };
  const calc = { itemId: "", areas: [{ l: "", w: "", unit: "ft", qty: 1, kind: "Floor" }], minus: "", wastage: null, L: "", W: "", unit: "mm", pcs: "", boxSqft: "", price: "" };

  /* ---------------- start / stop with the dashboard ---------------- */
  function start() {
    unsub.forEach((f) => { try { f(); } catch (e) {} });
    unsub = [];
    settings = { ...SHOP_DEFAULTS }; lunches = []; credits = []; creditMeta = {}; notes = []; recentEnq = [];
    if ($("noteBody")) $("noteBody").dataset.seen = "";
    V.dayData = null; V.hoursData = null;
    const keep = (f) => { unsub.push(f); ctx.addUnsub(f); };
    keep(onSnapshot(D("settings", "shop"), (s) => { settings = { ...SHOP_DEFAULTS, ...(s.exists() ? s.data() : {}) }; myShift(); render(); }, (e) => console.warn("Shop settings", e)));
    if (isAdmin()) {
      keep(onSnapshot(C("credit"), (snap) => { credits = snap.docs.map((d) => ({ id: d.id, ...d.data() })); render(); bump(); }, (e) => console.warn("Credit ledger", e)));
      keep(onSnapshot(C("creditMeta"), (snap) => { creditMeta = {}; snap.docs.forEach((d) => (creditMeta[d.id] = d.data())); render(); bump(); }, (e) => console.warn("Credit reminders", e)));
      keep(onSnapshot(query(C("notifications"), where("at", ">=", new Date(Date.now() - 30 * DAY))), (snap) => { notes = snap.docs.map((d) => ({ id: d.id, ...d.data() })); bump(); }, (e) => console.warn("Notifications", e)));
      // 🍱 lunch breaks: a notification to the owner as soon as an employee starts lunch
      let lunchSeen = null;
      keep(onSnapshot(query(C("lunches"), where("time", ">=", new Date(Date.now() - 30 * DAY))), (snap) => {
        lunches = snap.docs.map((d) => { const a = d.data(); return { id: d.id, ...a, ms: tms(a.time) || Date.now() }; });
        if (lunchSeen) lunches.filter((l) => !lunchSeen.has(l.id) && Date.now() - l.ms < 2 * 3600000).forEach((l) =>
          ctx.pushAlert && ctx.pushAlert(`<b>🍱 <span>Lunch break</span>: <span class="notr">${esc(l.name || "")}</span></b><br><small><span>Started</span> ${tstr(l.ms)} · <span>Back by</span> ${tstr(l.ms + LUNCH_MIN * 60000)} (<span>1 hour</span>)</small>`, "enter"));
        lunchSeen = new Set(lunches.map((l) => l.id));
        V.hoursData = null; bump(); render(); if (ctx.onLunch) ctx.onLunch();
      }, (e) => console.warn("Lunch breaks", e)));
      keep(onSnapshot(query(C("enquiries"), where("createdAt", ">=", new Date(Date.now() - 30 * DAY))), (snap) => { recentEnq = snap.docs.map((d) => ({ id: d.id, ...d.data() })); bump(); }, (e) => console.warn("Enquiries for notifications", e)));
      const h = setInterval(tick, 60000);
      keep(() => clearInterval(h));
      setTimeout(tick, 8000);
    }
  }
  const getSettings = () => settings;
  // the employee sees their own shift on the attendance card
  function myShift() {
    const el = $("myShift"); if (!el) return;
    const u = st().user;
    if (isAdmin() || !u) { el.classList.add("hidden"); return; }
    const sh = shiftFor(settings, u.uid);
    el.innerHTML = `⏱ <span>Your shift</span>: <b class="notr">${esc(sh.shiftStart)} – ${esc(sh.shiftEnd)}</b> · <span>Late after ${sh.graceMin} min</span>${sh.lunch ? ` · 🍱 <span>Lunch</span> <b class="notr">${lunchTxt(sh)}</b>` : ""}`;
    el.classList.remove("hidden");
  }

  /* ---------------- owner reminders while the app is open ---------------- */
  function tick() {
    if (!isAdmin()) return;
    updateBell();
    const now = Date.now(), today = dayKey(now), cid = st().companyID;
    const flag = (k) => { try { const key = "pi_shop_" + cid + "_" + k; if (localStorage.getItem(key) === today) return false; localStorage.setItem(key, today); return true; } catch (e) { return false; } };
    const close = hm(settings.closingTime), d = new Date(now);
    if (close !== null && d.getHours() * 60 + d.getMinutes() >= close && flag("day"))
      alertBox(`<b>📊 Today's report is ready</b><br><small>Tap to see sales, payments, enquiries and attendance</small>`, () => open("day"));
    const due = remindersDue().length;
    if (due && flag("rem"))
      alertBox(`<b>💬 Payment reminders due: ${due}</b><br><small>Tap to open the udhaar ledger</small>`, () => { V.credFilter = "due"; open("credit"); });
    const low = reorderList(st().inventory).length;
    if (low && flag("low"))
      alertBox(`<b>🔁 Items to reorder: ${low}</b><br><small>Tap to send the order to suppliers</small>`, () => open("reorder"));
  }
  function alertBox(html, onTap) {
    pushAlert(html, "enter");
    const card = document.querySelector("#alertStack .move-alert");
    if (card) card.onclick = () => { card.remove(); onTap(); };
  }

  /* =====================================================================
     🧮 TILE CALCULATOR
     ===================================================================== */
  function openCalc(itemId) {
    if (itemId !== undefined) pickCalcItem(itemId, true);
    if (calc.wastage === null) calc.wastage = Number(settings.wastage) || 10;
    $("tileModal").classList.add("open");
    renderCalc();
  }
  const closeCalc = () => $("tileModal").classList.remove("open");
  function calcTile() {
    const L = Number(calc.L) || 0, W = Number(calc.W) || 0, f = calc.unit === "inch" ? 25.4 : calc.unit === "ft" ? 304.8 : 1;
    const tileSqft = L > 0 && W > 0 ? (L * f) * (W * f) / MM2_PER_SQFT : 0, pcs = Number(calc.pcs) || 0;
    const boxSqft = Number(calc.boxSqft) > 0 ? Number(calc.boxSqft) : (tileSqft && pcs ? tileSqft * pcs : 0);
    return { tileSqft, pcs, boxSqft };
  }
  function pickCalcItem(id, silent) {
    calc.itemId = id || "";
    const it = st().inventory.find((x) => x.id === id);
    if (it) {
      const t = tileInfo(it);
      calc.L = t.L || ""; calc.W = t.W || ""; calc.unit = "mm"; calc.pcs = t.pcs || ""; calc.boxSqft = Number(it.boxSqft) > 0 ? it.boxSqft : "";
      calc.price = Number(it.price) || "";
      if (!silent && !t.pcs && !(Number(it.boxSqft) > 0)) toast("Pieces per box is not set for this item. Type it below (or set it in the item's details)");
    }
    if (!silent) renderCalc();
  }
  const cset = (k, v) => { calc[k] = v; renderCalcResult(); };
  const careaSet = (i, k, v) => { calc.areas[i][k] = v; renderCalcResult(); };
  const caddArea = (kind) => { calc.areas.push({ l: "", w: "", unit: calc.areas[0]?.unit || "ft", qty: 1, kind: kind || "Floor" }); renderCalc(); };
  const cdelArea = (i) => { calc.areas.splice(i, 1); if (!calc.areas.length) calc.areas.push({ l: "", w: "", unit: "ft", qty: 1, kind: "Floor" }); renderCalc(); };
  function calcResult() {
    const t = calcTile();
    return { t, r: calcTiles({ areas: calc.areas, minus: calc.minus, wastage: calc.wastage, boxSqft: t.boxSqft, tileSqft: t.tileSqft, pcs: t.pcs }) };
  }
  function renderCalc() {
    const el = $("tileBody");
    if (!el) return;
    const inv = st().inventory.slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    el.innerHTML = `
      <label class="task-label">Tile from your stock (optional)</label>
      <select style="width:95%" onchange="SH.cpick(this.value)"><option value="">Type the tile size myself</option>${inv.map((x) =>
        `<option value="${esc(x.id)}" ${calc.itemId === x.id ? "selected" : ""}>${esc(x.name)}${x.size && x.size !== "-" ? " · " + esc(x.size) : ""} (${Number(x.qty) || 0} in stock)</option>`).join("")}</select>
      <label class="task-label">Tile size (length × width)</label>
      <div class="calc-row"><input type="number" min="0" step="any" placeholder="Length" value="${esc(calc.L)}" oninput="SH.cset('L',this.value)">
        <span>×</span><input type="number" min="0" step="any" placeholder="Width" value="${esc(calc.W)}" oninput="SH.cset('W',this.value)">
        <select onchange="SH.cset('unit',this.value)">${[["mm", "mm"], ["inch", "inch"], ["ft", "ft"]].map(([v, l]) => `<option value="${v}" ${calc.unit === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="calc-row"><label>Pieces per box <input type="number" min="0" step="1" value="${esc(calc.pcs)}" oninput="SH.cset('pcs',this.value)"></label>
        <label>or sq ft per box <input type="number" min="0" step="any" value="${esc(calc.boxSqft)}" placeholder="auto" oninput="SH.cset('boxSqft',this.value)"></label>
        <label>Price per box ₹ <input type="number" min="0" step="any" value="${esc(calc.price)}" oninput="SH.cset('price',this.value)"></label></div>
      <h4 style="margin:12px 0 4px">Areas to tile</h4>
      <p class="hint">Floor: length × width. Wall: wall height × total wall length. Use "Count" for several equal rooms or walls.</p>
      ${calc.areas.map((a, i) => `<div class="calc-row area-row">
        <select onchange="SH.carea(${i},'kind',this.value)">${["Floor", "Wall"].map((k) => `<option ${a.kind === k ? "selected" : ""}>${k}</option>`).join("")}</select>
        <input type="number" min="0" step="any" placeholder="${a.kind === "Wall" ? "Height" : "Length"}" value="${esc(a.l)}" oninput="SH.carea(${i},'l',this.value)">
        <span>×</span><input type="number" min="0" step="any" placeholder="${a.kind === "Wall" ? "Wall length" : "Width"}" value="${esc(a.w)}" oninput="SH.carea(${i},'w',this.value)">
        <select onchange="SH.carea(${i},'unit',this.value)">${[["ft", "ft"], ["m", "metre"]].map(([v, l]) => `<option value="${v}" ${a.unit === v ? "selected" : ""}>${l}</option>`).join("")}</select>
        <label class="cnt">Count <input type="number" min="1" step="1" value="${esc(a.qty)}" oninput="SH.carea(${i},'qty',this.value)"></label>
        <button class="bin btn-sm" onclick="SH.cdel(${i})">✖</button></div>`).join("")}
      <button class="auth-btn" onclick="SH.cadd('Floor')">➕ Floor</button> <button class="auth-btn" onclick="SH.cadd('Wall')">➕ Wall</button>
      <div class="calc-row" style="margin-top:8px"><label>Leave out (doors, windows) sq ft <input type="number" min="0" step="any" value="${esc(calc.minus)}" oninput="SH.cset('minus',this.value)"></label>
        <label>Extra for cutting / breakage % <input type="number" min="0" step="any" value="${esc(calc.wastage)}" oninput="SH.cset('wastage',this.value)"></label></div>
      <div id="calcResult" class="calc-result"></div>`;
    renderCalcResult();
  }
  function renderCalcResult() {
    const el = $("calcResult");
    if (!el) return;
    const { t, r } = calcResult();
    const it = st().inventory.find((x) => x.id === calc.itemId);
    const price = Number(calc.price) || 0;
    let h = `<div>Area: <b>${num(r.area)} sq ft</b> · With ${num(calc.wastage)}% extra: <b>${num(r.need)} sq ft</b></div>`;
    if (t.boxSqft > 0) {
      h += `<div class="calc-big">📦 Boxes needed: <b>${r.boxes}</b></div>
        <div>One box covers ${num(t.boxSqft)} sq ft${r.pieces ? " · Tiles: " + r.pieces + " pieces" : ""}${price ? " · Estimate: <b>" + inr(price * r.boxes) + "</b>" : ""}</div>`;
      if (it) {
        const s = lotSummary(it), lots = Object.values(it.lots || {}).filter((l) => (Number(l.qty) || 0) > 0);
        const best = Math.max(s.genQty, ...lots.map((l) => Number(l.qty) || 0), 0);
        if ((Number(it.qty) || 0) < r.boxes) h += `<div class="calc-warn">⚠ Only ${Number(it.qty) || 0} boxes in stock</div>`;
        else if (lots.length && best < r.boxes) h += `<div class="calc-warn">⚠ No single shade / batch has ${r.boxes} boxes. Selling from two batches will mix shades</div>`;
      }
    } else if (t.tileSqft > 0) {
      h += `<div class="calc-big">🔲 Tiles needed: <b>${r.pieces}</b> pieces</div><div class="hint">Enter pieces per box (or sq ft per box) to get the number of boxes.</div>`;
    } else h += `<div class="hint">Enter the tile size to see how many boxes are needed.</div>`;
    h += `<div class="calc-actions">${isAdmin() && r.boxes ? `<button class="role-btn" style="background:var(--primary)" onclick="SH.ctoQuote()">➕ Add to quotation</button>` : ""}
      ${r.boxes || r.pieces ? `<button class="auth-btn" style="background:#25D366" onclick="SH.cshare()">💬 Share on WhatsApp</button>` : ""}</div>`;
    el.innerHTML = h;
  }
  function calcText() {
    const { t, r } = calcResult();
    const it = st().inventory.find((x) => x.id === calc.itemId), price = Number(calc.price) || 0;
    const lines = [`🧮 Tile estimate – ${st().companyName || ""}`];
    if (it) lines.push(`Tile: ${it.name}${it.size && it.size !== "-" ? " (" + it.size + ")" : ""}`);
    calc.areas.filter((a) => Number(a.l) > 0 && Number(a.w) > 0).forEach((a) => lines.push(`${a.kind}: ${a.l} × ${a.w} ${a.unit === "m" ? "m" : "ft"}${Number(a.qty) > 1 ? " × " + a.qty : ""}`));
    lines.push(`Area: ${num(r.area)} sq ft (+${num(calc.wastage)}% extra = ${num(r.need)} sq ft)`);
    if (r.boxes) lines.push(`Boxes needed: ${r.boxes}${r.pieces ? " (" + r.pieces + " tiles)" : ""}`); else if (r.pieces) lines.push(`Tiles needed: ${r.pieces}`);
    if (price && r.boxes) lines.push(`Estimate: ${inr(price * r.boxes)}`);
    return lines.join("\n");
  }
  const cshare = () => waOpen("", calcText());
  function ctoQuote() {
    const { r } = calcResult();
    if (!r.boxes) return toast("Enter the sizes first");
    const it = st().inventory.find((x) => x.id === calc.itemId);
    const name = it ? it.name + (it.size && it.size !== "-" ? " " + it.size : "") : `Tiles ${calc.L}×${calc.W} ${calc.unit}`;
    ctx.addBillLine({ desc: `${name} – for ${num(r.area)} sq ft (+${num(calc.wastage)}%)`, qty: r.boxes, price: Number(calc.price) || 0, itemId: it ? it.id : "", lotId: "" });
    closeCalc();
  }

  /* =====================================================================
     📊 SHOP REPORTS (owner)
     ===================================================================== */
  const TABS = [["reorder", "🔁 Reorder"], ["dead", "💤 Dead stock"], ["godown", "🏬 Godowns"], ["credit", "📒 Udhaar"], ["day", "📊 Day report"], ["hours", "⏱ Hours & late"], ["settings", "⚙ Shop settings"]];
  function open(tab) {
    if (!isAdmin()) return;
    if (tab) V.tab = tab;
    $("shopModal").classList.add("open");
    render(true);
  }
  const close = () => $("shopModal").classList.remove("open");
  const go = (tab) => { V.tab = tab; V.credKey = null; V.hoursUid = null; render(true); };
  let editing = false; // a form inside the window is being typed in: do not redraw under the owner's fingers
  function render(force) {
    const el = $("shopBody");
    if (!el || !$("shopModal").classList.contains("open")) return;
    if (editing && !force) return;
    editing = false;
    $("shopTabs").innerHTML = TABS.map(([k, l]) => `<button class="stab ${V.tab === k ? "on" : ""}" onclick="SH.go('${k}')">${l}${k === "credit" && remindersDue().length ? ` <span class="badge-low">${remindersDue().length}</span>` : ""}${k === "reorder" && reorderList(st().inventory).length ? ` <span class="badge-low">${reorderList(st().inventory).length}</span>` : ""}</button>`).join("");
    const views = { reorder: viewReorder, dead: viewDead, godown: viewGodown, credit: viewCredit, day: viewDay, hours: viewHours, settings: viewSettings };
    el.innerHTML = (views[V.tab] || viewReorder)();
    if (V.tab === "day" && !V.dayData) loadDay();
    if (V.tab === "hours" && !V.hoursData) loadHours();
  }
  const refresh = () => render();

  /* ---------- 🔁 reorder ---------- */
  function viewReorder() {
    const list = reorderList(st().inventory);
    if (!list.length) return `<p class="hint">Nothing to reorder. Items appear here when their stock is at or below their "Min Alert" level.</p>`;
    const groups = {};
    list.forEach((r) => { const k = (r.item.supplier || "").trim() || "—"; (groups[k] = groups[k] || []).push(r); });
    return `<p class="hint">Items at or below their Min Alert level, grouped by supplier. Change the quantities, then send the order on WhatsApp. Set the supplier in each item's details (Update → Supplier).</p>` +
      Object.entries(groups).map(([sup, rows]) => {
        const phone = rows.find((r) => r.item.supplierPhone)?.item.supplierPhone || "";
        return `<div class="task-card" style="flex-direction:column; align-items:stretch">
          <div class="task-title">🏭 ${sup === "—" ? "No supplier set" : `<span class="notr">${esc(sup)}</span>`}${phone ? ` · 📞 <span class="notr">${esc(phone)}</span>` : ""}</div>
          <table class="stable"><thead><tr><th>Item</th><th>In stock</th><th>Min</th><th>Order qty</th></tr></thead><tbody>${rows.map((r) => {
            const v = V.reorder[r.item.id] !== undefined ? V.reorder[r.item.id] : r.suggest;
            return `<tr><td class="notr">${esc(r.item.name)}${r.item.size && r.item.size !== "-" ? " · " + esc(r.item.size) : ""}</td><td><b>${Number(r.item.qty) || 0}</b></td><td>${Number(r.item.minQty) || 0}</td>
              <td><input type="number" min="0" step="1" value="${v}" style="width:80px" onfocus="SH.typing()" oninput="SH.rqty('${esc(r.item.id)}',this.value)"></td></tr>`; }).join("")}</tbody></table>
          <div style="display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap; margin-top:8px">
            <button class="auth-btn" style="background:#25D366" onclick="SH.rsend('${esc(sup)}')">💬 Send order on WhatsApp</button>
            <button class="auth-btn" onclick="SH.rcopy('${esc(sup)}')">📋 Copy</button></div></div>`;
      }).join("");
  }
  const rqty = (id, v) => { V.reorder[id] = Math.max(0, Math.round(Number(v) || 0)); };
  function orderText(sup) {
    const rows = reorderList(st().inventory).filter((r) => ((r.item.supplier || "").trim() || "—") === sup);
    const lines = rows.map((r, i) => { const q = V.reorder[r.item.id] !== undefined ? V.reorder[r.item.id] : r.suggest; return q > 0 ? `${i + 1}. ${r.item.name}${r.item.size && r.item.size !== "-" ? " (" + r.item.size + ")" : ""} – ${q} ${r.item.unit && r.item.unit !== "-" ? r.item.unit : "boxes"}` : null; }).filter(Boolean);
    return { text: `Namaste${sup !== "—" ? " " + sup : ""} ji,\nPlease send the following order for ${st().companyName || "our shop"}:\n\n${lines.join("\n")}\n\nPlease confirm the rate and delivery date. Thank you.`,
      phone: rows.find((r) => r.item.supplierPhone)?.item.supplierPhone || "", n: lines.length };
  }
  function rsend(sup) { const o = orderText(sup); if (!o.n) return toast("Set an order quantity first"); editing = false; waOpen(o.phone, o.text); }
  function rcopy(sup) { const o = orderText(sup); copy(o.text); }
  function copy(t) {
    const done = () => toast("Copied");
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done).catch(() => fb());
    else fb();
    function fb() { const a = document.createElement("textarea"); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand("copy"); done(); } catch (e) {} a.remove(); }
  }

  /* ---------- 💤 dead stock ---------- */
  function viewDead() {
    const days = V.deadDays || Number(settings.deadDays) || 90;
    const list = deadStock(st().inventory, st().history, days, Date.now());
    const value = list.reduce((s, r) => s + ((Number(r.item.qty) || 0) + (Number(r.item.hold) || 0)) * (Number(r.item.price) || 0), 0);
    return `<div class="suite-bar">Not sold for <select onchange="SH.deadDays(this.value)">${[30, 60, 90, 180, 365].map((d) => `<option value="${d}" ${d === days ? "selected" : ""}>${d}</option>`).join("")}</select> days or more
      ${list.length ? `<span class="chip chip-red">Items: ${list.length}</span> <span class="chip">Stock value: ${inr(value)}</span>
      <button class="auth-btn" style="background:#25D366" onclick="SH.deadShare()">📣 Share offer list on WhatsApp</button>` : ""}</div>` +
      (list.length ? `<div class="table-wrap"><table class="stable"><thead><tr><th>Item</th><th>Stock</th><th>Value</th><th>Last sold</th><th>Days</th></tr></thead><tbody>${list.map((r) =>
        `<tr><td class="notr">${esc(r.item.name)}${r.item.size && r.item.size !== "-" ? " · " + esc(r.item.size) : ""}</td><td>${(Number(r.item.qty) || 0) + (Number(r.item.hold) || 0)}</td>
        <td>${inr(((Number(r.item.qty) || 0) + (Number(r.item.hold) || 0)) * (Number(r.item.price) || 0))}</td><td>${r.sold ? dstr(r.sold) : "Never"}</td><td><b>${r.days === null ? "-" : r.days}</b></td></tr>`).join("")}</tbody></table></div>
        <p class="hint">"Last sold" comes from STOCK OUT / FINAL OUT and invoice stock deductions. Put these items on offer to free up the money.</p>`
        : `<p class="hint">No dead stock. Every item in stock was sold in the last ${days} days.</p>`);
  }
  const deadDays = (v) => { V.deadDays = +v; render(true); };
  function deadShare() {
    const days = V.deadDays || Number(settings.deadDays) || 90;
    const list = deadStock(st().inventory, st().history, days, Date.now());
    const text = `🏷 Special offer at ${st().companyName || "our showroom"}!\n\n` + list.slice(0, 30).map((r, i) => `${i + 1}. ${r.item.name}${r.item.size && r.item.size !== "-" ? " (" + r.item.size + ")" : ""}`).join("\n") + `\n\nLimited stock. Visit us or reply for the offer price.`;
    waOpen("", text);
  }

  /* ---------- 🏬 stock by godown ---------- */
  function viewGodown() {
    const rows = [];
    st().inventory.forEach((it) => {
      const s = lotSummary(it);
      Object.values(it.lots || {}).forEach((l) => { if ((Number(l.qty) || 0) + (Number(l.hold) || 0) > 0) rows.push({ g: (l.godown || "").trim() || "Not set", it, l, q: Number(l.qty) || 0, h: Number(l.hold) || 0 }); });
      if (s.genQty + s.genHold > 0) rows.push({ g: "Not set", it, l: null, q: s.genQty, h: s.genHold });
    });
    if (!rows.length) return `<p class="hint">No stock yet.</p>`;
    const g = {};
    rows.forEach((r) => (g[r.g] = g[r.g] || []).push(r));
    const names = Object.keys(g).sort((a, b) => (a === "Not set") - (b === "Not set") || a.localeCompare(b));
    return `<p class="hint">Stock in each godown, by shade and batch. Set the godown when you do Stock IN for a new shade / batch, or use "Move" in the item window.</p>` +
      names.map((n) => `<div class="task-card" style="flex-direction:column; align-items:stretch"><div class="task-title">🏬 ${n === "Not set" ? "Godown not set" : `<span class="notr">${esc(n)}</span>`} <span class="chip">${g[n].reduce((s, r) => s + r.q, 0)} in stock</span></div>
        <table class="stable"><thead><tr><th>Item</th><th>Shade / batch</th><th>Stock</th><th>Hold</th></tr></thead><tbody>${g[n].sort((a, b) => (a.it.name || "").localeCompare(b.it.name || "")).map((r) =>
          `<tr><td class="notr">${esc(r.it.name)}${r.it.size && r.it.size !== "-" ? " · " + esc(r.it.size) : ""}</td><td class="notr">${r.l ? esc(lotLabel({ shade: r.l.shade, batch: r.l.batch }).replace(tw("No shade"), "-")) : "-"}</td><td><b>${r.q}</b></td><td>${r.h}</td></tr>`).join("")}</tbody></table></div>`).join("");
  }

  /* ---------- 📒 udhaar (customer credit ledger) ---------- */
  const customers = () => ledger(ctx.getDocs().filter((d) => d.type === "INVOICE"), credits);
  function remindersDue() {
    if (!isAdmin()) return [];
    const every = Math.max(1, Number(settings.reminderDays) || 7) * DAY, now = Date.now();
    return customers().filter((c) => c.due > 0.005 && (now - ((creditMeta[metaId(c.key)] && creditMeta[metaId(c.key)].lastReminderAt) || c.oldest || 0)) >= every);
  }
  function viewCredit() {
    if (V.credKey) return viewStatement();
    const all = customers().filter((c) => c.due > 0.005 || c.entries.length);
    const dueKeys = new Set(remindersDue().map((c) => c.key));
    const q = (V.credSearch || "").toLowerCase();
    const list = all.filter((c) => (V.credFilter !== "due" || dueKeys.has(c.key)) && (!q || (c.name || "").toLowerCase().includes(q) || (c.phone || "").includes(q)));
    const total = all.reduce((s, c) => s + Math.max(0, c.due), 0);
    return `<div class="suite-bar"><button class="auth-btn" style="background:#dc3545" onclick="SH.cgive()">➕ Give udhaar</button>
        <button class="auth-btn" style="background:var(--primary)" onclick="SH.creceive()">💵 Receive payment</button>
        <span class="chip chip-red">Total to collect: ${inr(total)}</span>
        <button class="auth-btn ${V.credFilter === "due" ? "on" : ""}" onclick="SH.cfilter()">💬 Reminders due: ${dueKeys.size}</button>
        <input placeholder="🔍 Name or mobile" value="${esc(V.credSearch || "")}" onfocus="SH.typing()" oninput="SH.csearch(this.value)" style="min-width:160px"></div>
      <p class="hint">Unpaid invoice balances are included automatically. A reminder is due every ${Number(settings.reminderDays) || 7} day(s) for customers who still owe money (change this in ⚙ Shop settings). WhatsApp opens with the message ready; tap Send there.</p>
      <div id="credList">${credRows(list, dueKeys)}</div>`;
  }
  function credRows(list, dueKeys) {
    return list.length ? list.map((c) => `<div class="task-card" style="flex-wrap:wrap">
        <div class="task-info"><div class="task-title"><span class="notr">${esc(c.name || "Customer")}</span> ${c.due > 0.005 ? `<span class="chip chip-red">Due ${inr(c.due)}</span>` : `<span class="chip chip-green">Nothing due</span>`}${dueKeys.has(c.key) ? ' <span class="chip chip-yellow">💬 Reminder due</span>' : ""}</div>
        <div class="task-meta">${c.phone ? `📞 <span class="notr">${esc(c.phone)}</span> · ` : ""}Invoices: ${inr(c.invDue)} · Udhaar: ${inr(c.manual)}${c.lastPay ? " · Last payment: " + dstr(c.lastPay) : ""}${creditMeta[metaId(c.key)]?.lastReminderAt ? " · Last reminder: " + dstr(creditMeta[metaId(c.key)].lastReminderAt) : ""}</div></div>
        <div class="decide-col" style="flex-wrap:wrap; gap:6px">
          ${c.due > 0.005 ? `<button class="edit-btn" style="background:var(--primary)" onclick="SH.creceive('${esc(c.key)}')">💵 Payment</button><button class="edit-btn" style="background:#25D366" onclick="SH.cremind('${esc(c.key)}')">💬 Remind</button>` : ""}
          <button class="edit-btn" onclick="SH.cgive('${esc(c.key)}')">➕ Udhaar</button><button class="edit-btn" onclick="SH.cstate('${esc(c.key)}')">📜 Statement</button></div></div>`).join("")
      : `<p class="hint">${V.credFilter === "due" ? "No reminders are due." : "No customer owes money. Use ➕ Give udhaar to record a credit sale."}</p>`;
  }
  const cfilter = () => { V.credFilter = V.credFilter === "due" ? "" : "due"; render(true); };
  const csearch = (v) => {
    V.credSearch = v;
    const all = customers().filter((c) => c.due > 0.005 || c.entries.length), dueKeys = new Set(remindersDue().map((c) => c.key)), q = v.toLowerCase();
    const el = $("credList");
    if (el) el.innerHTML = credRows(all.filter((c) => (V.credFilter !== "due" || dueKeys.has(c.key)) && (!q || (c.name || "").toLowerCase().includes(q) || (c.phone || "").includes(q))), dueKeys);
  };
  const cstate = (k) => { V.credKey = k; render(true); };
  function viewStatement() {
    const c = customers().find((x) => x.key === V.credKey);
    if (!c) { V.credKey = null; return viewCredit(); }
    const rows = [];
    c.invoices.forEach((d) => {
      rows.push({ at: d.date || 0, what: `🧾 Invoice ${esc(d.number || "")}`, debit: Number(d.total) || 0 });
      (d.payments || []).forEach((p) => rows.push({ at: p.at || 0, what: `💵 Payment (${esc(p.method || "")}) – ${esc(d.number || "")}`, credit: Number(p.amount) || 0 }));
    });
    c.entries.forEach((e) => rows.push({ at: e.at || 0, what: e.type === "PAYMENT" ? `💵 Payment (${esc(e.method || "")})` : `📒 Udhaar`, note: e.note, debit: e.type === "PAYMENT" ? 0 : Number(e.amount) || 0, credit: e.type === "PAYMENT" ? Number(e.amount) || 0 : 0, id: e.id }));
    rows.sort((a, b) => a.at - b.at);
    let bal = 0;
    const body = rows.map((r) => { bal += (r.debit || 0) - (r.credit || 0);
      return `<tr><td>${dstr(r.at)}</td><td>${r.what}${r.note ? `<br><small class="notr">${esc(r.note)}</small>` : ""}</td><td>${r.debit ? inr(r.debit) : ""}</td><td>${r.credit ? inr(r.credit) : ""}</td><td><b>${inr(bal)}</b></td>
        <td>${r.id ? `<button class="bin btn-sm" onclick="SH.cdelEntry('${r.id}')">🗑</button>` : ""}</td></tr>`; }).join("");
    return `<h3 style="margin-top:0">📜 <span class="notr">${esc(c.name || "Customer")}</span>${c.phone ? ` · <span class="notr">${esc(c.phone)}</span>` : ""}</h3>
      <div class="suite-bar"><span class="chip ${c.due > 0.005 ? "chip-red" : "chip-green"}">Due ${inr(c.due)}</span>
        ${c.due > 0.005 ? `<button class="auth-btn" style="background:var(--primary)" onclick="SH.creceive('${esc(c.key)}')">💵 Receive payment</button><button class="auth-btn" style="background:#25D366" onclick="SH.cremind('${esc(c.key)}')">💬 Remind</button>` : ""}
        <button class="auth-btn" onclick="SH.cgive('${esc(c.key)}')">➕ Give udhaar</button></div>
      <div class="table-wrap"><table class="stable"><thead><tr><th>Date</th><th>Details</th><th>Given</th><th>Received</th><th>Balance</th><th></th></tr></thead><tbody>${body || '<tr><td colspan="6">No entries</td></tr>'}</tbody></table></div>
      <button class="auth-btn" style="background:#666; margin-top:10px" onclick="SH.cstate('')">← Back</button>`;
  }
  // small form inside the shop window
  function miniForm(title, fields, onSave) {
    editing = true;
    $("shopBody").innerHTML = `<h3 style="margin-top:0">${title}</h3>` + fields.map((f) => `<label class="task-label">${f.label}${f.req ? " *" : ""}</label>` +
      (f.type === "select" ? `<select id="sf_${f.k}" style="width:95%">${f.opts.map((o) => `<option ${o === f.v ? "selected" : ""}>${o}</option>`).join("")}</select>`
        : `<input id="sf_${f.k}" type="${f.type || "text"}" ${f.type === "number" ? 'min="0" step="any"' : ""} value="${esc(f.v ?? "")}" placeholder="${esc(f.ph || "")}" style="width:95%">`)).join("") +
      `<button class="role-btn" style="background:var(--primary)" id="sfSave">💾 Save</button><button class="auth-btn" style="background:#666" onclick="SH.cancelForm()">Cancel</button>`;
    $("sfSave").onclick = async () => {
      const v = {};
      for (const f of fields) {
        let x = ($("sf_" + f.k).value || "").trim();
        if (f.type === "number") x = x === "" ? 0 : Number(x);
        if (f.req && (x === "" || (f.type === "number" && !(x > 0)))) return toast(`"${f.label}" is required`);
        v[f.k] = x;
      }
      try { loading(true); await onSave(v); editing = false; render(true); }
      catch (e) { console.error(e); toast(errText(e)); }
      finally { loading(false); }
    };
  }
  const cancelForm = () => { editing = false; render(true); };
  function cgive(key) {
    const c = key ? customers().find((x) => x.key === key) : null;
    miniForm("➕ Give udhaar (credit sale)", [
      { k: "name", label: "Customer name", req: true, v: c ? c.name : "" }, { k: "phone", label: "Mobile number", type: "tel", v: c ? c.phone : "" },
      { k: "amount", label: "Amount (₹)", type: "number", req: true }, { k: "note", label: "Note (what was given)", ph: "e.g. 20 boxes floor tiles" }],
      async (v) => {
        await addDoc(C("credit"), { type: "CREDIT", name: v.name, phone: v.phone, key: custKey(v.name, v.phone), amount: v.amount, note: v.note, at: Date.now(), by: st().name || "Owner", createdAt: serverTimestamp() });
        toast("Udhaar recorded");
      });
  }
  function creceive(key) {
    const c = key ? customers().find((x) => x.key === key) : null;
    const list = customers().filter((x) => x.due > 0.005);
    if (!c && !list.length) return toast("No customer owes money");
    miniForm("💵 Receive payment", [
      c ? { k: "who", label: "Customer", type: "select", opts: [c.name + (c.phone ? " · " + c.phone : "")], v: c.name + (c.phone ? " · " + c.phone : "") }
        : { k: "who", label: "Customer", type: "select", opts: list.map((x) => x.name + (x.phone ? " · " + x.phone : "") + " – " + inr(x.due)) },
      { k: "amount", label: "Amount (₹)" + (c ? " – due " + inr(c.due) : ""), type: "number", req: true, v: c ? c.due : "" },
      { k: "method", label: "Method", type: "select", opts: ["Cash", "UPI", "Bank transfer", "Card", "Cheque"], v: "Cash" }, { k: "note", label: "Note" }],
      async (v) => {
        const cust = c || list[$("sf_who").selectedIndex];
        if (!cust) throw new Error("Choose a customer");
        await receivePayment(cust, v.amount, v.method, v.note);
      });
  }
  // the oldest unpaid invoices are paid first; the rest reduces the udhaar balance
  async function receivePayment(c, amount, method, note) {
    amount = Math.round((Number(amount) || 0) * 100) / 100;
    if (!(amount > 0)) throw new Error("Enter the amount");
    if (amount > c.due + 0.005) throw new Error("The amount is more than the balance due");
    let rest = amount;
    const at = Date.now();
    const unpaid = c.invoices.filter((d) => (Number(d.total) || 0) - (Number(d.paid) || 0) > 0.005).sort((a, b) => (a.date || 0) - (b.date || 0));
    for (const d of unpaid) {
      if (rest <= 0.005) break;
      const pay = Math.min(rest, Math.round(((Number(d.total) || 0) - (Number(d.paid) || 0)) * 100) / 100);
      const payments = [...(d.payments || []), { amount: pay, at, method, note: note || "Udhaar ledger" }];
      await updateDoc(D("docs", d.id), { payments, paid: Math.round(payments.reduce((s, p) => s + (Number(p.amount) || 0), 0) * 100) / 100, updatedAt: serverTimestamp() });
      rest = Math.round((rest - pay) * 100) / 100;
    }
    if (rest > 0.005) await addDoc(C("credit"), { type: "PAYMENT", name: c.name, phone: c.phone, key: c.key, amount: rest, method, note: note || "", at, by: st().name || "Owner", createdAt: serverTimestamp() });
    toast("Payment recorded: " + inr(amount));
  }
  async function cremind(key) {
    const c = customers().find((x) => x.key === key);
    if (!c) return;
    if (!c.phone) toast("No mobile number saved for this customer. Choose the chat in WhatsApp");
    const text = `Namaste ${c.name || ""} ji,\nThis is a gentle reminder from ${st().companyName || "our shop"} that ${inr(c.due)} is pending in your account.${c.oldest ? " (since " + dstr(c.oldest) + ")" : ""}\nPlease clear it at your convenience. UPI / cash both accepted.\n\nThank you 🙏`;
    waOpen(c.phone, text);
    try { await setDoc(D("creditMeta", metaId(key)), { lastReminderAt: Date.now(), name: c.name }, { merge: true }); } catch (e) { console.warn(e); }
  }
  async function cdelEntry(id) {
    if (!(await askConfirm("Delete this entry?"))) return;
    try { await deleteDoc(D("credit", id)); toast("Deleted"); } catch (e) { toast(errText(e)); }
  }

  /* ---------- 📊 end-of-day report ---------- */
  function dayPicker() {
    const d = new Date(V.dayMs), opts = [];
    for (let i = 0; i < 31; i++) { const x = startOfDay(Date.now()) - i * DAY; opts.push(`<option value="${x}" ${startOfDay(V.dayMs) === x ? "selected" : ""}>${dstr(x)}${i === 0 ? " (today)" : ""}</option>`); }
    return `<select onchange="SH.dayAt(this.value)">${opts.join("")}</select>`;
  }
  const dayAt = (v) => { V.dayMs = +v; V.dayData = null; render(true); };
  async function loadDay() {
    const from = startOfDay(V.dayMs), to = from + DAY, key = dayKey(from);
    V.dayData = { loading: true };
    try {
      const [att0, lun, enq] = await Promise.all([
        getDocs(query(C("attendance"), where("date", "==", key))).catch(() => ({ docs: [] })),
        getDocs(query(C("lunches"), where("date", "==", key))).catch(() => ({ docs: [] })),
        getDocs(query(C("enquiries"), where("createdAt", ">=", new Date(from)), where("createdAt", "<", new Date(to)))).catch(() => ({ docs: [] }))
      ]);
      const att = { docs: [...att0.docs, ...lun.docs] };
      V.dayData = { from, to, att: att.docs.map((d) => { const a = d.data(); return { ...a, ms: a.time && a.time.toDate ? a.time.toDate().getTime() : 0 }; }), enq: enq.docs.map((d) => ({ id: d.id, ...d.data() })) };
    } catch (e) { console.error(e); V.dayData = { error: e.message }; }
    render(true);
  }
  function dayFigures() {
    const { from, to } = V.dayData, inDay = (t) => t >= from && t < to;
    const docs = ctx.getDocs();
    const inv = docs.filter((d) => d.type === "INVOICE" && inDay(d.date || 0)), quo = docs.filter((d) => d.type === "QUOTATION" && inDay(d.date || 0));
    const recv = {};
    docs.filter((d) => d.type === "INVOICE").forEach((d) => (d.payments || []).forEach((p) => { if (inDay(p.at || 0)) recv[p.method || "Other"] = (recv[p.method || "Other"] || 0) + (Number(p.amount) || 0); }));
    credits.forEach((e) => { if (e.type === "PAYMENT" && inDay(e.at || 0)) recv[e.method || "Other"] = (recv[e.method || "Other"] || 0) + (Number(e.amount) || 0); });
    const given = credits.filter((e) => e.type !== "PAYMENT" && inDay(e.at || 0));
    const outs = (st().history || []).filter((h) => inDay(h.ms || 0) && /^(STOCK OUT|FINAL OUT)/.test(h.action || ""));
    const ins = (st().history || []).filter((h) => inDay(h.ms || 0) && /^STOCK IN/.test(h.action || ""));
    const rows = attDays(V.dayData.att, settings);
    const present = new Set(rows.map((r) => r.uid));
    const absent = (st().staff || []).filter((s) => !present.has(s.uid));
    return { inv, quo, recv, given, outs, ins, rows, absent, enq: V.dayData.enq,
      sales: inv.reduce((s, d) => s + (Number(d.total) || 0), 0), received: Object.values(recv).reduce((s, v) => s + v, 0),
      outQty: outs.reduce((s, h) => s + (Number(h.qty) || 0), 0), inQty: ins.reduce((s, h) => s + (Number(h.qty) || 0), 0),
      low: reorderList(st().inventory).length, toCollect: customers().reduce((s, c) => s + Math.max(0, c.due), 0) };
  }
  function viewDay() {
    const head = `<div class="suite-bar">Day: ${dayPicker()} <button class="auth-btn" onclick="SH.dayAt(${startOfDay(V.dayMs)})">🔄 Refresh</button></div>`;
    if (!V.dayData || V.dayData.loading) return head + `<p class="hint">Loading...</p>`;
    if (V.dayData.error) return head + `<p class="hint">Could not load: ${esc(V.dayData.error)}</p>`;
    const f = dayFigures();
    const card = (label, val, color) => `<div class="scard" style="border-top:4px solid ${color}"><div class="hint">${label}</div><div class="sval">${val}</div></div>`;
    return head + `<div class="sgrid">${card("Sales (invoices)", inr(f.sales), "var(--primary-ink)")}${card("Money received", inr(f.received), "#0056b3")}${card("Udhaar given", inr(f.given.reduce((s, e) => s + (Number(e.amount) || 0), 0)), "#dc3545")}
        ${card("Enquiries", f.enq.length, "#c0392b")}${card("Boxes out", f.outQty, "#e67e22")}${card("Staff present", f.rows.length + " / " + (st().staff || []).length, "#6f42c1")}</div>
      <h4>💵 Money received</h4>${Object.keys(f.recv).length ? `<table class="stable"><tbody>${Object.entries(f.recv).map(([m, v]) => `<tr><td>${esc(m)}</td><td><b>${inr(v)}</b></td></tr>`).join("")}</tbody></table>` : `<p class="hint">No payments recorded.</p>`}
      <h4>🧾 Invoices (${f.inv.length}) · Quotations (${f.quo.length})</h4>${f.inv.length ? f.inv.map((d) => `<div class="task-meta">${esc(d.number)} · <span class="notr">${esc(d.cName)}</span> · ${inr(d.total)}</div>`).join("") : `<p class="hint">No invoices.</p>`}
      <h4>📝 Enquiries (${f.enq.length})</h4>${f.enq.length ? f.enq.map((e) => `<div class="task-meta">#${esc(e.no || "-")} · <span class="notr">${esc(e.cName || "-")}</span>${e.createdByName ? ` · <span class="notr">${esc(e.createdByName)}</span>` : ""}</div>`).join("") : `<p class="hint">No enquiries.</p>`}
      <h4>👥 Attendance</h4>${attTable(f.rows)}${f.absent.length ? `<p>Absent: <span class="notr">${f.absent.map((s) => esc(s.name)).join(", ")}</span></p>` : ""}
      <h4>📦 Stock</h4><p>Boxes out: <b>${f.outQty}</b> · Boxes in: <b>${f.inQty}</b> · Items to reorder: <b>${f.low}</b> · Total udhaar to collect: <b>${inr(f.toCollect)}</b></p>
      <div style="display:flex; gap:8px; flex-wrap:wrap"><button class="auth-btn" style="background:#25D366" onclick="SH.dayShare()">💬 Send on WhatsApp</button><button class="auth-btn" onclick="SH.dayPrint()">🖨 Print</button></div>
      <p class="hint">At closing time (${esc(settings.closingTime)}) the app reminds you that the report is ready, when the app is open. Change the time in ⚙ Shop settings.</p>`;
  }
  function attTable(rows) {
    if (!rows.length) return `<p class="hint">Nobody marked Attendance In.</p>`;
    return `<div class="table-wrap"><table class="stable"><thead><tr><th>Employee</th><th>In</th><th>Out</th><th>Hours</th><th>Overtime</th><th>Late</th></tr></thead><tbody>${rows.map((r) =>
      `<tr><td class="notr">${esc(r.name)}</td><td>${tstr(r.inMs)}</td><td>${r.outMs ? tstr(r.outMs) : "-"}</td><td>${r.mins !== null ? fmtMins(r.mins) : "-"}</td><td>${r.otMin ? fmtMins(r.otMin) : "-"}</td>
      <td>${r.late ? `<span class="chip chip-red">⚠ Late ${fmtMins(r.lateMin)}</span>` : "-"}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function dayText() {
    const f = dayFigures();
    const L = [`📊 Day report – ${st().companyName || ""} – ${dstr(V.dayData.from)}`, "",
      `🧾 Sales: ${inr(f.sales)} (${f.inv.length} invoices, ${f.quo.length} quotations)`,
      `💵 Received: ${inr(f.received)}` + (Object.keys(f.recv).length ? " – " + Object.entries(f.recv).map(([m, v]) => `${m} ${inr(v)}`).join(", ") : ""),
      `📒 Udhaar given: ${inr(f.given.reduce((s, e) => s + (Number(e.amount) || 0), 0))} · To collect: ${inr(f.toCollect)}`,
      `📝 Enquiries: ${f.enq.length}`, `📦 Boxes out: ${f.outQty} · in: ${f.inQty} · Items to reorder: ${f.low}`,
      `👥 Present: ${f.rows.length}/${(st().staff || []).length}` + (f.rows.filter((r) => r.late).length ? ` · Late: ${f.rows.filter((r) => r.late).map((r) => r.name).join(", ")}` : "") + (f.absent.length ? ` · Absent: ${f.absent.map((s) => s.name).join(", ")}` : "")];
    return L.join("\n");
  }
  const dayShare = () => waOpen(settings.ownerPhone || "", dayText());
  function dayPrint() {
    const w = window.open("", "_blank");
    if (!w) return toast("Allow pop-ups to print");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Day report</title><style>body{font-family:Segoe UI,Arial,sans-serif;margin:30px;white-space:pre-wrap;font-size:15px}</style></head><body>${esc(dayText())}</body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 400);
  }

  /* ---------- ⏱ hours, overtime and late arrivals ---------- */
  function monthSel() {
    const y0 = new Date().getFullYear();
    return `<select onchange="SH.hm('m',this.value)">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${V.hoursM === i + 1 ? "selected" : ""}>${String(i + 1).padStart(2, "0")}</option>`).join("")}</select> /
      <select onchange="SH.hm('y',this.value)">${[y0 - 1, y0].map((y) => `<option ${V.hoursY === y ? "selected" : ""}>${y}</option>`).join("")}</select>`;
  }
  const hmSet = (k, v) => { if (k === "m") V.hoursM = +v; else V.hoursY = +v; V.hoursData = null; V.hoursUid = null; render(true); };
  async function loadHours() {
    V.hoursData = { loading: true };
    try { V.hoursData = { rows: attDays(await monthAttendance(V.hoursY, V.hoursM), settings) }; }
    catch (e) { console.error(e); V.hoursData = { error: e.message }; }
    render(true);
  }
  async function monthAttendance(y, m) {
    const range = (n) => getDocs(query(C(n), where("time", ">=", new Date(y, m - 1, 1)), where("time", "<", new Date(y, m, 1))));
    const [snap, lsnap] = await Promise.all([range("attendance"), range("lunches").catch(() => ({ docs: [] }))]);
    return [...snap.docs, ...lsnap.docs].map((d) => { const a = d.data(); return { ...a, ms: a.time && a.time.toDate ? a.time.toDate().getTime() : 0 }; });
  }
  const ownShifts = () => (st().staff || []).filter((x) => shiftFor(settings, x.uid).own).length;
  const shiftTxt = (sh) => `${esc(sh.shiftStart)} – ${esc(sh.shiftEnd)}`;
  function viewHours() {
    const own = ownShifts();
    const head = `<div class="suite-bar">Month: ${monthSel()} <span class="chip">Shop shift ${esc(settings.shiftStart)} – ${esc(settings.shiftEnd)}</span><span class="chip">Late after ${Number(settings.graceMin) || 0} min</span>${settings.lunchStart && settings.lunchEnd ? `<span class="chip">🍱 Lunch ${esc(settings.lunchStart)} – ${esc(settings.lunchEnd)}</span>` : ""}${own ? `<span class="chip">👤 Own shift: ${own}</span>` : ""}</div>`;
    if (!V.hoursData || V.hoursData.loading) return head + `<p class="hint">Loading...</p>`;
    if (V.hoursData.error) return head + `<p class="hint">Could not load: ${esc(V.hoursData.error)}</p>`;
    const rows = V.hoursData.rows;
    if (V.hoursUid) {
      const mine = rows.filter((r) => r.uid === V.hoursUid), sh = shiftFor(settings, V.hoursUid);
      return head + `<h4 class="notr">${esc(mine[0]?.name || "")}</h4><p class="hint">${sh.own ? "Own shift" : "Shop shift"}: <span class="notr">${shiftTxt(sh)}</span> · Late after ${sh.graceMin} min${sh.lunch ? ` · <span>Lunch</span> <span class="notr">${lunchTxt(sh)}</span>` : ""}</p><div class="table-wrap"><table class="stable"><thead><tr><th>Date</th><th>In</th><th>Lunch</th><th>Out</th><th>Hours</th><th>Overtime</th><th>Late</th></tr></thead><tbody>${mine.map((r) =>
        `<tr><td>${dstr(new Date(r.date + "T00:00:00").getTime())}</td><td>${tstr(r.inMs)}</td><td>${r.lunchAt ? `🍱 ${tstr(r.lunchAt)} – ${tstr(r.lunchAt + LUNCH_MIN * 60000)}` : "-"}</td><td>${r.outMs ? tstr(r.outMs) : "-"}</td><td>${r.mins !== null ? fmtMins(r.mins) : "No Out"}</td><td>${r.otMin ? fmtMins(r.otMin) : "-"}</td><td>${r.late ? `<span class="chip chip-red">⚠ ${fmtMins(r.lateMin)}</span>` : "-"}</td></tr>`).join("")}</tbody></table></div>
        <button class="auth-btn" style="background:#666; margin-top:10px" onclick="SH.hu('')">← Back</button>`;
    }
    const per = attMonth(rows);
    const list = Object.values(per).sort((a, b) => a.name.localeCompare(b.name));
    return head + (list.length ? `<div class="table-wrap"><table class="stable"><thead><tr><th>Employee</th><th>Shift</th><th>Days</th><th>Hours</th><th>Overtime</th><th>Late days</th><th>No Out</th><th></th></tr></thead><tbody>${list.map((p) => {
      const sh = shiftFor(settings, p.uid);
      return `<tr><td class="notr">${esc(p.name)}</td><td><span class="notr">${shiftTxt(sh)}</span>${sh.own ? ` <span class="chip">👤 Own</span>` : ""}${sh.lunch ? `<div class="hint">🍱 <span class="notr">${lunchTxt(sh)}</span></div>` : ""}</td><td>${p.days}</td><td>${fmtMins(p.mins)}</td><td>${p.otMin ? fmtMins(p.otMin) : "-"}</td><td>${p.lateDays ? `<span class="chip chip-red">${p.lateDays}</span>` : "0"}</td><td>${p.noOut || 0}</td>
      <td><button class="edit-btn" onclick="SH.hu('${esc(p.uid)}')">📅 Days</button></td></tr>`; }).join("")}</tbody></table></div>
      <p class="hint">Hours count from Attendance In to Attendance Out. Overtime is time beyond each employee's shift (their own shift, or the shop shift ${esc(settings.shiftStart)} – ${esc(settings.shiftEnd)}). "No Out" = days without Attendance Out (no hours counted).
</p><p class="hint">Lunch time is not counted as working time. When an employee presses 🍱 Lunch time, that 1 hour is used instead of the planned lunch.</p><p class="hint">Overtime pay and any late fine are added when you run payroll (Business Suite → Payroll).</p><p class="hint">Set a different shift for an employee in ⚙ Shop settings → Individual shift times.</p>` : `<p class="hint">No attendance this month.</p>`);
  }
  const hu = (uid) => { V.hoursUid = uid || null; render(true); };

  /* ---------- ⚙ shop settings ---------- */
  function viewSettings() {
    const s = settings;
    editing = true;
    const f = (k, label, type, extra) => `<label class="task-label">${label}</label><input id="ss_${k}" type="${type || "text"}" value="${esc(s[k] ?? "")}" ${extra || ""} style="width:95%">`;
    return `<h4 style="margin-top:0">⏱ Shift and attendance</h4>
      <div class="grid2">${f("shiftStart", "Shift starts", "time")}${f("shiftEnd", "Shift ends", "time")}</div>
      <div class="grid2">${f("lunchStart", "Lunch from (empty = no lunch break)", "time")}${f("lunchEnd", "Lunch to", "time")}</div>
      <div class="grid2">${f("graceMin", "Late after (minutes after shift start)", "number", 'min="0"')}${f("lateFine", "Late fine per late day (₹, 0 = none)", "number", 'min="0"')}</div>
      ${f("otRate", "Overtime pay per hour (₹, 0 = salary per hour)", "number", 'min="0" step="any"')}
      ${empShiftRows()}
      <h4>📊 Day report</h4><div class="grid2">${f("closingTime", "Closing time (report reminder)", "time")}${f("ownerPhone", "Send the report to WhatsApp number", "tel")}</div>
      <h4>📒 Udhaar and stock</h4><div class="grid2">${f("reminderDays", "Payment reminder every (days)", "number", 'min="1"')}${f("deadDays", "Dead stock after (days)", "number", 'min="7"')}</div>
      ${f("wastage", "Tile calculator: extra for cutting (%)", "number", 'min="0" step="any"')}
      <button class="role-btn" style="background:var(--primary); margin-top:12px" onclick="SH.saveSet()">💾 Save settings</button>`;
  }
  // lunch: both times or none, ends after it starts, inside the shift
  function lunchErr(ls, lend, ss, se) {
    if (!ls && !lend) return "";
    if (!ls || !lend) return "Set both lunch times (from and to), or leave both empty";
    if (hm(lend) <= hm(ls)) return "Lunch must end after it starts";
    if (hm(ls) < hm(ss) || hm(lend) > hm(se)) return "Lunch time must be inside the shift";
    return "";
  }
  const lunchTxt = (sh) => (sh.lunch ? `${esc(sh.lunchStart)} – ${esc(sh.lunchEnd)}` : "");
  /* 👤 individual shift times: a different shift for any employee (empty boxes = the shop shift) */
  function empShiftRows() {
    const staff = [...(st().staff || [])].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    const map = settings.empShifts || {};
    const rows = staff.map((x, i) => {
      const o = map[x.uid] || {}, sh = shiftFor(settings, x.uid);
      return `<tr id="esr_${i}" data-uid="${esc(x.uid)}"><td class="notr"><b>${esc(x.name || "")}</b></td>
        <td><input id="es_s_${i}" type="time" value="${esc(o.shiftStart || "")}" oninput="SH.typing()" style="width:135px"></td>
        <td><input id="es_e_${i}" type="time" value="${esc(o.shiftEnd || "")}" oninput="SH.typing()" style="width:135px"></td>
        <td><input id="es_ls_${i}" type="time" value="${esc(o.lunchStart || "")}" oninput="SH.typing()" style="width:135px"></td>
        <td><input id="es_le_${i}" type="time" value="${esc(o.lunchEnd || "")}" oninput="SH.typing()" style="width:135px"></td>
        <td><input id="es_g_${i}" type="number" min="0" value="${o.graceMin === undefined || o.graceMin === null ? "" : esc(o.graceMin)}" placeholder="${Number(settings.graceMin) || 0}" oninput="SH.typing()" style="width:70px"></td>
        <td>${sh.own ? `<span class="chip">👤 Own: <span class="notr">${esc(sh.shiftStart)} – ${esc(sh.shiftEnd)}</span></span>` : `<span class="hint">Shop shift</span>`}${sh.lunch ? `<div class="hint">🍱 <span>Lunch</span> <span class="notr">${lunchTxt(sh)}</span></div>` : ""}</td>
        <td>${sh.own ? `<button class="edit-btn" onclick="SH.esReset('${esc(x.uid)}')">↺ Use shop shift</button>` : ""}</td></tr>`;
    }).join("");
    return `<h4>👤 Individual shift times</h4>
      <p class="hint">Give any employee a different shift. Leave a box empty to use the shop shift for it. Late, overtime and payroll use each employee's own shift.</p><p class="hint">Lunch time is not counted as working time.</p>
      ${staff.length ? `<div class="table-wrap"><table class="stable"><thead><tr><th>Employee</th><th>Shift starts</th><th>Shift ends</th><th>Lunch from</th><th>Lunch to</th><th>Late after (min)</th><th>Now</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
        : `<p class="hint">No employees have joined yet.</p>`}`;
  }
  // read the individual shift boxes -> { map to save, local copy, error }
  function readEmpShifts(shop) {
    const old = settings.empShifts || {}, save = {}, local = {};
    Object.keys(old).forEach((u) => { save[u] = old[u]; local[u] = old[u]; });
    const staff = [...(st().staff || [])].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    for (let i = 0; i < staff.length; i++) {
      const row = $("esr_" + i); if (!row) continue;
      const uid = row.dataset.uid, name = staff.find((x) => x.uid === uid)?.name || "";
      const a = ($("es_s_" + i)?.value || "").trim(), b = ($("es_e_" + i)?.value || "").trim(), g = ($("es_g_" + i)?.value || "").trim();
      const la = ($("es_ls_" + i)?.value || "").trim(), lb = ($("es_le_" + i)?.value || "").trim();
      const o = {};
      if (a) o.shiftStart = a;
      if (b) o.shiftEnd = b;
      if (la) o.lunchStart = la;
      if (lb) o.lunchEnd = lb;
      if (g !== "") o.graceMin = Math.max(0, Number(g) || 0);
      if (!Object.keys(o).length) { if (uid in save) { save[uid] = deleteField(); delete local[uid]; } continue; }
      const sh = shiftFor({ ...shop, empShifts: { [uid]: o } }, uid);
      if ((hm(sh.shiftEnd) || 0) <= (hm(sh.shiftStart) || 0)) return { error: `${name}: the shift must end after it starts` };
      if ((la || lb) && !(la && lb) && !(shop.lunchStart && shop.lunchEnd)) return { error: `${name}: set both lunch times (from and to)` };
      const le = la || lb ? lunchErr(sh.lunchStart, sh.lunchEnd, sh.shiftStart, sh.shiftEnd) : "";
      if (le) return { error: `${name}: ${le}` };
      save[uid] = o; local[uid] = o;
    }
    return { save, local };
  }
  async function esReset(uid) {
    const old = settings.empShifts || {}, save = {}, local = {};
    Object.keys(old).forEach((u) => { if (u === uid) save[u] = deleteField(); else { save[u] = old[u]; local[u] = old[u]; } });
    try { loading(true); await setDoc(D("settings", "shop"), { empShifts: save, updatedAt: serverTimestamp() }, { merge: true }); settings = { ...settings, empShifts: local }; toast("Shop shift will be used"); editing = false; V.hoursData = null; render(true); }
    catch (e) { console.error(e); toast(errText(e)); }
    finally { loading(false); }
  }
  // the Employees page "⏱ Shift" button: open Shop settings at that employee's row
  function empShift(uid) {
    open("settings");
    setTimeout(() => {
      const row = document.querySelector(`#shopBody tr[data-uid="${CSS.escape(uid)}"]`) || [...document.querySelectorAll("tr[data-uid]")].find((r) => r.dataset.uid === uid);
      if (!row) return;
      row.scrollIntoView({ block: "center" });
      row.style.outline = "2px solid var(--primary)";
      const inp = row.querySelector("input"); if (inp) inp.focus();
    }, 60);
  }
  async function saveSet() {
    const g = (k) => ($("ss_" + k)?.value || "").trim(), n = (k, min) => Math.max(min || 0, Number(g(k)) || 0);
    const v = { shiftStart: g("shiftStart") || "10:00", shiftEnd: g("shiftEnd") || "20:00", lunchStart: g("lunchStart"), lunchEnd: g("lunchEnd"), graceMin: n("graceMin"), lateFine: n("lateFine"), otRate: n("otRate"),
      closingTime: g("closingTime") || "20:30", ownerPhone: g("ownerPhone"), reminderDays: n("reminderDays", 1) || 7, deadDays: n("deadDays", 7) || 90, wastage: n("wastage") };
    if ((hm(v.shiftEnd) || 0) <= (hm(v.shiftStart) || 0)) return toast("The shift must end after it starts");
    const le = lunchErr(v.lunchStart, v.lunchEnd, v.shiftStart, v.shiftEnd);
    if (le) return toast(le);
    const es = readEmpShifts(v);
    if (es.error) return toast(es.error);
    try { loading(true); await setDoc(D("settings", "shop"), { ...v, empShifts: es.save, updatedAt: serverTimestamp() }, { merge: true }); toast("Settings saved"); settings = { ...settings, ...v, empShifts: es.local }; editing = false; V.hoursData = null; V.dayData = null; render(true); }
    catch (e) { console.error(e); toast(errText(e)); }
    finally { loading(false); }
  }

  /* =====================================================================
     🔔 NOTIFICATIONS (owner): everything that happened, newest first, with date and time
     ===================================================================== */
  let notes = [], recentEnq = [];
  const withLunch = (att) => [...(att || []), ...lunches];
  const NV = { kind: "all" };
  const seenKey = () => "pi_notes_seen_" + st().companyID;
  const getSeen = () => { try { return Number(localStorage.getItem(seenKey())) || 0; } catch (e) { return 0; } };
  const setSeen = (t) => { try { localStorage.setItem(seenKey(), String(t)); } catch (e) {} };
  const tms = (v) => (v && v.toDate ? v.toDate().getTime() : typeof v === "number" ? v : 0);
  const KINDS = [["all", "All"], ["stock", "📦 Stock"], ["att", "👥 Attendance"], ["move", "🚶 Movement"], ["task", "📋 Tasks"], ["enq", "📝 Enquiries"], ["leave", "🏖 Leave"], ["pay", "💬 Payments"]];
  function noteList() {
    const S = st(), since = Date.now() - 30 * DAY, out = [];
    const add = (kind, at, title, meta, html) => { if (at && at >= since) out.push({ kind, at, title, meta: meta || "", html: html || "" }); };
    notes.forEach((n) => add("stock", tms(n.at), n.type === "OUT" ? "⛔ Out of stock" : "📉 Low stock",
      [`Item: ${n.item || ""}`, `Left: ${Number(n.qty) || 0}`, n.type !== "OUT" ? `Min: ${Number(n.min) || 0}` : "", n.byName ? `By: ${n.byName}` : ""].filter(Boolean).join(" · ")));
    (S.movements || []).forEach((m) => add("move", tms(m.time), m.type === "LEFT" ? "🚶 Left the shop radius" : "🏪 Came inside the shop radius",
      [`Employee: ${m.name || ""}`, m.place && m.place !== "Shop" ? `Place: ${m.place}` : "", `Distance: ${Math.round(m.distance ?? 0)} m`].filter(Boolean).join(" · ")));
    const flags = {};
    attDays(withLunch((S.attendance || []).map((a) => ({ ...a, ms: a.ms || tms(a.time) }))), settings).forEach((r) => (flags[r.uid + "_" + r.date] = r));
    lunches.forEach((l) => add("att", l.ms, "🍱 Lunch break", [`Employee: ${l.name || ""}`, `Started: ${tstr(l.ms)}`, `Back by: ${tstr(l.ms + LUNCH_MIN * 60000)}`].join(" · ")));
    (S.attendance || []).forEach((a) => {
      const f = flags[a.uid + "_" + a.date], out = a.type === "OUT";
      add("att", a.ms || tms(a.time), out ? "🚪 Attendance Out" : (f && f.late ? "⚠ Attendance In (late)" : "✅ Attendance In"),
        [`Employee: ${a.name || ""}`, !out && f && f.late ? `Late: ${fmtMins(f.lateMin)}` : "", out && f && f.mins !== null ? `Hours: ${fmtMins(f.mins)}` : "", out && f && f.otMin ? `Overtime: ${fmtMins(f.otMin)}` : ""].filter(Boolean).join(" · "));
    });
    (S.tasks || []).forEach((t) => {
      const title = ctx.userHTML ? ctx.userHTML(t.title || "", t.tr) : esc(t.title || "");
      if (t.byEmployee) add("task", tms(t.createdAt) || t.startAt, "📤 Task given by an employee", [`By: ${t.createdByName || ""}`, `For: ${t.scope === "ALL" ? "everyone" : Object.values(t.assignees || {})[0] || ""}`].join(" · "), title);
      Object.values(t.completions || {}).forEach((c) => {
        if (c.submittedAt) add("task", c.submittedAt, c.status === "SUBMITTED" ? "📨 Task completed – waiting for your approval" : c.status === "APPROVED" ? "✅ Task completed and approved" : "❌ Task completed – declined", `Employee: ${c.name || ""}`, title);
      });
    });
    recentEnq.forEach((e) => add("enq", tms(e.createdAt), "📝 New enquiry", [`Enquiry: #${e.no || "-"}`, `Customer: ${e.cName || "-"}`, e.createdByName ? `By: ${e.createdByName}` : ""].filter(Boolean).join(" · ")));
    (ctx.getLeaves ? ctx.getLeaves() : []).forEach((l) => add("leave", tms(l.createdAt) || l.from, "🏖 Leave request", [`Employee: ${l.name || ""}`, `Type: ${tw(l.type || "")}`, `From: ${dstr(l.from)}`, `To: ${dstr(l.to)}`, `Status: ${tw(({ PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected" })[l.status] || l.status || "")}`].join(" · ")));
    remindersDue().forEach((c) => add("pay", Date.now(), "💬 Payment reminder due", [`Customer: ${c.name || ""}`, `Due: ${inr(c.due)}`].join(" · ")));
    return out.sort((a, b) => b.at - a.at).slice(0, 400);
  }
  function updateBell() {
    const b = $("noteBadge");
    if (!b || !isAdmin()) return;
    const seen = getSeen(), n = noteList().filter((x) => x.at > seen && x.kind !== "pay").length + remindersDue().length;
    b.innerText = n > 99 ? "99+" : n;
    b.classList.toggle("hidden", !n);
  }
  function openNotes() {
    if (!isAdmin()) return;
    $("noteModal").classList.add("open");
    renderNotes();
    setSeen(Date.now());
    setTimeout(updateBell, 50);
  }
  const closeNotes = () => { $("noteModal").classList.remove("open"); $("noteBody").dataset.seen = ""; updateBell(); };
  const noteKind = (k) => { NV.kind = k; renderNotes(); };
  function renderNotes() {
    const el = $("noteBody");
    if (!el || !$("noteModal").classList.contains("open")) return;
    const seen = Number(el.dataset.seen || 0) || getSeen();
    if (!el.dataset.seen) el.dataset.seen = String(seen);
    const all = noteList(), list = all.filter((n) => NV.kind === "all" || n.kind === NV.kind);
    const low = reorderList(st().inventory);
    const today = dayKey(Date.now()), yest = dayKey(Date.now() - DAY);
    let lastDay = "", h = `<div class="suite-bar">${KINDS.map(([k, l]) => `<button class="auth-btn ${NV.kind === k ? "on" : ""}" onclick="SH.noteKind('${k}')">${l}${k !== "all" ? ` <span class="chip">${all.filter((n) => n.kind === k).length}</span>` : ""}</button>`).join("")}</div>`;
    if (low.length && (NV.kind === "all" || NV.kind === "stock"))
      h += `<div class="task-card note-pin"><div class="task-info"><div class="task-title">📉 Items low right now: ${low.length}</div><div class="task-meta"><span class="notr">${low.slice(0, 12).map((r) => esc(r.item.name) + " (" + (Number(r.item.qty) || 0) + ")").join(", ")}${low.length > 12 ? " …" : ""}</span></div></div>
        <div class="decide-col"><button class="edit-btn" onclick="SH.closeNotes(); SH.open('reorder')">🔁 Reorder</button></div></div>`;
    h += list.length ? list.map((n) => {
      const dk = dayKey(n.at);
      const head = dk !== lastDay ? `<h4 class="task-sec">${dk === today ? "Today" : dk === yest ? "Yesterday" : dstr(n.at)}</h4>` : "";
      lastDay = dk;
      return head + `<div class="task-card note ${n.at > seen && n.kind !== "pay" ? "note-new" : ""}"><div class="task-info"><div class="task-title">${n.title}</div>
        ${n.html ? `<div class="task-meta">${n.html}</div>` : ""}<div class="task-meta">${esc(n.meta)}</div></div><div class="note-time">${tstr(n.at)}</div></div>`;
    }).join("") : `<p class="hint">No notifications in the last 30 days.</p>`;
    el.innerHTML = h;
  }
  const bump = () => { updateBell(); renderNotes(); };

  window.SH = {
    open, close, go, openCalc, closeCalc, cpick: (v) => pickCalcItem(v), cset, carea: (i, k, v) => { careaSet(i, k, v); if (k === "kind" || k === "unit") renderCalc(); },
    cadd: caddArea, cdel: cdelArea, ctoQuote, cshare,
    typing: () => { editing = true; }, rqty, rsend, rcopy, deadDays, deadShare,
    cgive, creceive, cremind, cstate, cfilter, csearch, cdelEntry, cancelForm,
    dayAt, dayShare, dayPrint, hm: hmSet, hu, saveSet, esReset, empShift,
    openNotes, closeNotes, noteKind
  };
  const getLunches = () => lunches;
  return { start, getSettings, getLunches, refresh, monthAttendance, openCalc, bump };
}
