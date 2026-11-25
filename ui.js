// =====================================================================
// ui.js - Pro Inventory 2.0 interface: sidebar / top bar / pages, the
// dashboard (cards and charts from the real Firebase data), the
// transactions page, employee cards, attendance summary, exports and theme.
// No business logic lives here: every action calls the existing functions.
// =====================================================================

import { initTheme } from "./theme.js?v=20261125-8";
/* <uipure> */
const DAYMS = 86400000;
export const isIn = (a) => /^STOCK IN/.test(a || "");
export const isOut = (a) => /^(STOCK OUT|FINAL OUT)/.test(a || "");
export function stockStatus(i) {
  const q = Number(i.qty) || 0, min = i.minQty ?? 5;
  if (q <= 0) return "out";
  if (q <= min) return "low";
  if ((Number(i.hold) || 0) > 0) return "hold";
  return "ok";
}
// stock in / out per day (or per week for long ranges) from the audit history
export function movementSeries(history, days, now) {
  const end = new Date(now); end.setHours(0, 0, 0, 0);
  const start = end.getTime() - (days - 1) * DAYMS;
  const weekly = days > 45, step = weekly ? 7 : 1, n = Math.ceil(days / step);
  const buckets = Array.from({ length: n }, (_, i) => ({ t: start + i * step * DAYMS, in: 0, out: 0 }));
  (history || []).forEach((h) => {
    const t = h.ms || 0;
    if (t < start || t >= end.getTime() + DAYMS) return;
    const b = buckets[Math.min(n - 1, Math.floor((t - start) / (step * DAYMS)))];
    const q = Number(h.qty) || 0;
    if (isIn(h.action)) b.in += q; else if (isOut(h.action)) b.out += q;
  });
  return { buckets, weekly };
}
export function stats(items, history, now) {
  const s = { products: items.length, stock: 0, low: 0, out: 0, hold: 0, broken: 0, value: 0, today: 0, yesterday: 0 };
  items.forEach((i) => {
    const q = Number(i.qty) || 0, h = Number(i.hold) || 0;
    s.stock += q; s.hold += h; s.broken += Number(i.broken) || 0; s.value += (q + h) * (Number(i.price) || 0);
    if (q <= (i.minQty ?? 5)) s.low++;
    if (q <= 0) s.out++;
  });
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  (history || []).forEach((h) => {
    if (!(isIn(h.action) || isOut(h.action) || /^(HOLD|RELEASE|BROKEN|MOVE)/.test(h.action || ""))) return;
    if (h.ms >= d0.getTime()) s.today++; else if (h.ms >= d0.getTime() - DAYMS) s.yesterday++;
  });
  return s;
}
/* </uipure> */

const ic = (n, cls) => `<svg class="ic ${cls || ""}" aria-hidden="true"><use href="#i-${n}"/></svg>`;

export function initUI(ctx) {
  const { $, esc, fmtD, fmtDT } = ctx;
  const st = () => ctx.getState();
  const isAdmin = () => st().role === "ADMIN";
  const inr = (n) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
  const short = (n) => { n = Number(n) || 0; return n >= 1e7 ? "₹" + (n / 1e7).toFixed(2).replace(/\.?0+$/, "") + "Cr" : n >= 1e5 ? "₹" + (n / 1e5).toFixed(1).replace(/\.0$/, "") + "L" : inr(n); };
  const num = (n) => (Number(n) || 0).toLocaleString("en-IN");
  const V = { emp: { q: "", st: "ALL" }, page: "dashboard", range: 7, tx: { q: "", type: "ALL", from: "", to: "" } };
  // windows that are shown as pages inside the layout (their own code is unchanged)
  const PAGE_MODALS = ["appearanceModal", "historyModal", "staffModal", "movementModal", "attendanceModal", "shopModal", "enquiryModal", "taskModal", "empTaskModal", "suiteModal", "myWorkModal", "mktModal", "settingsModal"];
  const W = (f) => () => { const fn = f(); if (typeof fn === "function") fn(); };
  const CLOSERS = { suiteModal: W(() => window.SU && SU.close), myWorkModal: W(() => window.SU && SU.closeMy), shopModal: W(() => window.SH && SH.close), mktModal: W(() => window.MK && MK.close),
    enquiryModal: W(() => window.EQ && EQ.close), historyModal: W(() => window.closeHistoryModal), staffModal: W(() => window.closeStaffModal), movementModal: W(() => window.closeMovementModal),
    attendanceModal: W(() => window.closeAttendanceModal), taskModal: W(() => window.closeTaskModal), empTaskModal: W(() => window.closeEmpTaskModal), settingsModal: W(() => window.closeSettingsModal) };

  /* ---------------- layout: pages, sidebar, theme ---------------- */
  function closePageModals(except) {
    PAGE_MODALS.forEach((id) => {
      const m = $(id);
      if (!m || id === except || !m.classList.contains("open")) return;
      try { if (CLOSERS[id]) CLOSERS[id](); } catch (e) {}
      m.classList.remove("open");
    });
  }
  function go(page) {
    closePageModals();
    V.page = page;
    if (page === "location" && !isAdmin()) page = "dashboard";
    V.page = page;
    ["dashboard", "inventory", "location"].forEach((p) => $("pg-" + p) && $("pg-" + p).classList.toggle("hidden", p !== page));
    drawer(false);
    markActive();
    if (page === "dashboard") renderDashboard();
    renderGeo();
    const main = document.querySelector(".pages"); if (main) main.scrollTop = 0;
    window.scrollTo(0, 0);
  }
  // a menu item that opens one of the existing windows as a page
  function open(fn) { closePageModals(); drawer(false); try { fn(); } finally { setTimeout(markActive, 0); } }
  function markActive() {
    const openModal = PAGE_MODALS.find((id) => $(id) && $(id).classList.contains("open"));
    // the theme panel lives in Settings (owner) and in Appearance (everyone)
    const inSet = $("settingsModal") && $("settingsModal").classList.contains("open"), inApp = $("appearanceModal") && $("appearanceModal").classList.contains("open");
    if (inApp && $("themeHostPage") && !$("themeHostPage").innerHTML) TH.render("themeHostPage");
    else if (inSet && !inApp && $("themeHostSettings") && !$("themeHostSettings").innerHTML) TH.render("themeHostSettings");
    if (!inSet && !inApp && (($("themeHostPage") && $("themeHostPage").innerHTML) || ($("themeHostSettings") && $("themeHostSettings").innerHTML))) {
      TH.leftPanel(); $("themeHostPage").innerHTML = ""; $("themeHostSettings").innerHTML = "";
    }
    document.querySelectorAll("[data-go],[data-modal]").forEach((el) => {
      const on = openModal ? el.dataset.modal === openModal || (el.dataset.modal2 === openModal) : el.dataset.go === V.page;
      el.classList.toggle("active", !!on);
    });
    document.body.classList.toggle("page-modal-open", !!openModal);
  }
  const drawer = (on) => document.body.classList.toggle("drawer-open", !!on);
  function collapse() {
    const on = !document.body.classList.contains("side-collapsed");
    document.body.classList.toggle("side-collapsed", on);
    try { localStorage.setItem("pi_side", on ? "1" : "0"); } catch (e) {}
  }
  // 🎨 Appearance & Theme Settings (theme.js): per person and per company
  const TH = initTheme({ $, esc, toast: ctx.toast, askConfirm: ctx.askConfirm, db: ctx.db, doc: ctx.doc, getDoc: ctx.getDoc, setDoc: ctx.setDoc });
  const setTheme = (mode) => TH.quick(mode);
  const theme = () => TH.quick();
  function prof(on) {
    const m = $("profMenu"); if (!m) return;
    const show = on === undefined ? m.classList.contains("hidden") : on;
    m.classList.toggle("hidden", !show);
  }
  document.addEventListener("click", (e) => { if (!e.target.closest || !e.target.closest(".profile")) prof(false); });
  // a window shown as a page opened or closed (also by its own Close button): update the menu highlight
  const mo = new MutationObserver(() => markActive());
  PAGE_MODALS.forEach((id) => $(id) && mo.observe($(id), { attributes: true, attributeFilter: ["class"] }));
  // phone: a dot on "More" when any menu item has a number waiting
  function badges() {
    const d = $("moreBadge"); if (!d) return;
    const any = [...document.querySelectorAll(".sb-nav .nav-badge")].some((b) => !b.classList.contains("hidden") && b.closest(".nav-item") && !b.closest(".nav-item").classList.contains("hidden") && b.innerText.trim() !== "0");
    d.classList.toggle("hidden", !any);
  }
  const bo = new MutationObserver(() => badges());
  document.querySelectorAll(".sb-nav .nav-badge").forEach((b) => bo.observe(b, { attributes: true, attributeFilter: ["class"], childList: true, characterData: true, subtree: true }));
  // global search: the inventory search
  function search(v) {
    if (V.page !== "inventory" || document.body.classList.contains("page-modal-open")) go("inventory");
    const s = $("search"); if (s) s.value = v; if (window.filterInventory) window.filterInventory();
  }
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K") && $("globalSearch") && !$("app").classList.contains("hidden")) { e.preventDefault(); $("globalSearch").focus(); }

  });

  // called when the dashboard opens (after login) and on logout
  function start() {
    const S = st(), admin = isAdmin();
    document.body.classList.toggle("is-admin", admin);
    document.body.classList.toggle("is-emp", !admin);
    let side = "0"; try { side = localStorage.getItem("pi_side") || "0"; } catch (e) {}
    document.body.classList.toggle("side-collapsed", side === "1" && window.innerWidth > 900);
    const u = S.user || {}, nm = (admin ? (u.displayName || S.name) : S.name) || u.email || u.phoneNumber || "User";
    $("uiName").innerText = nm; $("uiAvatar").innerText = String(nm).trim().charAt(0).toUpperCase() || "U";
    $("sbAvatar").innerText = $("uiAvatar").innerText; $("sbName").innerText = nm;
    $("sbRole").innerText = admin ? "Owner (Admin)" : "Employee";
    $("pmName").innerText = nm; $("pmMail").innerText = u.email || u.phoneNumber || "";
    $("pmCompany").innerText = S.companyName || "";
    if ($("empAttCard")) $("empAttCard").classList.toggle("hidden", admin);
    go("dashboard");
    TH.load(u.uid, S.companyID);
  }

  /* ---------------- dashboard ---------------- */
  let timer = null;
  function refresh() { clearTimeout(timer); timer = setTimeout(() => { renderGeo(); badges();
    const sd = $("staffDisplay"), sn = $("staffNames"); if (sd && sn) sd.title = "Employees: " + sn.innerText; if (V.page === "dashboard" && !$("app").classList.contains("hidden")) renderDashboard(); renderTx(); renderAttSummary(); renderStaffCards(); }, 120); }
  const card = (icon, tone, label, value, sub, trend) => `<div class="stat-card tone-${tone}">
      <div class="stat-ic">${ic(icon)}</div>
      <div class="stat-body"><div class="stat-label">${label}</div><div class="stat-val">${value}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ""}
      ${trend ? `<div class="stat-trend ${trend.up ? "up" : "down"}">${ic(trend.up ? "trending-up" : "trending-down")}<span>${trend.text}</span></div>` : ""}</div></div>`;
  function renderDashboard() {
    const el = $("dashBody"); if (!el) return;
    const S = st(), admin = isAdmin(), now = Date.now(), s = stats(S.inventory, S.history, now);
    $("dashDate").innerText = fmtD(new Date(now));
    let trend = null;
    if (admin && s.yesterday > 0) { const p = Math.round(((s.today - s.yesterday) / s.yesterday) * 100); trend = { up: p >= 0, text: "vs yesterday: " + (p >= 0 ? "+" : "") + p + "%" }; }
    $("dashStats").innerHTML = card("package", "green", "Total Products", num(s.products), "items in the list")
      + card("boxes", "teal", "Total Stock", num(s.stock), "available to sell")
      + card("triangle-alert", "orange", "Low Stock", num(s.low), s.out ? s.out + " out of stock" : "at or below min alert")
      + card("circle-pause", "amber", "Stock on Hold", num(s.hold), "kept for customers")
      + card("package-x", "red", "Broken Stock", num(s.broken), "damaged boxes")
      + card("indian-rupee", "dark", "Total Inventory Value", short(s.value), "stock + hold × price")
      + (admin ? card("refresh-cw", "blue", "Today's Transactions", num(s.today), "stock movements today", trend) : "");
    // charts
    const mv = $("chartMove");
    if (mv) mv.innerHTML = admin ? moveChart(S.history, V.range, now) : `<p class="hint">Stock movement is visible to the owner.</p>`;
    $("chartHealth").innerHTML = healthChart(s);
    $("chartCats").innerHTML = catChart(S.inventory);
    $("recentBox").innerHTML = admin ? recentTable(S.history, S.inventory) : lowTable(S.inventory);
    document.querySelectorAll("[data-range]").forEach((b) => b.classList.toggle("on", Number(b.dataset.range) === V.range));
    // employee: attendance card
    const ea = $("empAttCard"); if (ea) ea.classList.toggle("hidden", admin);
    renderGeo();
  }
  function smooth(pts) {
    if (pts.length < 2) return "";
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  }
  function moveChart(history, days, now) {
    const { buckets, weekly } = movementSeries(history, days, now);
    const totIn = buckets.reduce((a, b) => a + b.in, 0), totOut = buckets.reduce((a, b) => a + b.out, 0);
    const box = $("chartMove"), W = Math.max(300, Math.min(900, (box && box.clientWidth) || 640)), H = W < 500 ? 210 : 240, L = 40, R = 12, T = 14, B = 34, max = Math.max(4, ...buckets.map((b) => Math.max(b.in, b.out)));
    const nice = Math.ceil(max / 4) * 4, x = (i) => L + (buckets.length === 1 ? 0 : (i * (W - L - R)) / (buckets.length - 1)), y = (v) => T + (H - T - B) * (1 - v / nice);
    const pin = buckets.map((b, i) => [x(i), y(b.in)]), pout = buckets.map((b, i) => [x(i), y(b.out)]);
    const grid = [0, 1, 2, 3, 4].map((k) => { const v = (nice / 4) * k; return `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 8}" y="${y(v) + 4}" class="axis" text-anchor="end">${Math.round(v)}</text>`; }).join("");
    const every = Math.ceil(buckets.length / (W < 500 ? 5 : 7));
    const labels = buckets.map((b, i) => (i % every === 0 || i === buckets.length - 1) ? `<text x="${x(i)}" y="${H - 12}" class="axis" text-anchor="middle">${fmtD(new Date(b.t)).slice(0, 5)}</text>` : "").join("");
    const area = (p) => smooth(p) + ` L${x(buckets.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
    const dots = (p, cls, key) => p.map((pt, i) => `<circle cx="${pt[0]}" cy="${pt[1]}" r="${buckets.length > 31 ? 2.5 : 4}" class="${cls}"><title>${fmtD(new Date(buckets[i].t))}${weekly ? " (week)" : ""}: ${key} ${buckets[i][key === "In" ? "in" : "out"]}</title></circle>`).join("");
    return `<div class="chart-legend"><span class="lg in"></span>Stock In <b>${num(totIn)}</b><span class="lg out"></span>Stock Out <b>${num(totOut)}</b>${weekly ? '<span class="hint">per week</span>' : ""}</div>
      <svg viewBox="0 0 ${W} ${H}" class="chart-svg notr" role="img" aria-label="Stock in and out">
        <defs><linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--secondary)" stop-opacity=".28"/><stop offset="1" stop-color="var(--secondary)" stop-opacity="0"/></linearGradient>
        <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--warning)" stop-opacity=".25"/><stop offset="1" stop-color="var(--warning)" stop-opacity="0"/></linearGradient></defs>
        ${grid}<path d="${area(pin)}" fill="url(#gIn)"/><path d="${area(pout)}" fill="url(#gOut)"/>
        <path d="${smooth(pin)}" class="ln in"/><path d="${smooth(pout)}" class="ln out"/>${dots(pin, "dot in", "In")}${dots(pout, "dot out", "Out")}${labels}</svg>
      ${totIn + totOut === 0 ? `<p class="hint" style="text-align:center">No stock in / out recorded in this period.</p>` : ""}`;
  }
  function healthChart(s) {
    const total = s.stock + s.hold + s.broken;
    const parts = [["Available", s.stock, "var(--secondary)"], ["On Hold", s.hold, "var(--warning)"], ["Broken", s.broken, "var(--danger)"]];
    const r = 54, c = 2 * Math.PI * r;
    let off = 0;
    const rings = total ? parts.map(([, v, col]) => { const len = (v / total) * c; const out = `<circle r="${r}" cx="70" cy="70" fill="none" stroke="${col}" stroke-width="18" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"/>`; off += len; return out; }).join("")
      : `<circle r="${r}" cx="70" cy="70" fill="none" stroke="var(--border)" stroke-width="18"/>`;
    const pct = total ? Math.round((s.stock / total) * 100) : 0;
    return `<div class="donut-wrap"><svg viewBox="0 0 140 140" class="donut">${rings}<text x="70" y="68" text-anchor="middle" class="donut-num">${pct}%</text><text x="70" y="88" text-anchor="middle" class="donut-lbl">Healthy stock</text></svg>
      <div class="donut-legend">${parts.map(([l, v, col]) => `<div><span class="lg" style="background:${col}"></span><div><div class="hint">${l}</div><b>${num(v)}</b> <small>(${total ? Math.round((v / total) * 100) : 0}%)</small></div></div>`).join("")}</div></div>`;
  }
  function catChart(items) {
    const cats = {};
    let byValue = false;
    items.forEach((i) => { if (Number(i.price) > 0) byValue = true; });
    items.forEach((i) => { const c = i.category || "General", v = byValue ? ((Number(i.qty) || 0) + (Number(i.hold) || 0)) * (Number(i.price) || 0) : (Number(i.qty) || 0); cats[c] = (cats[c] || 0) + v; });
    const list = Object.entries(cats).sort((a, b) => b[1] - a[1]);
    if (!list.length) return `<p class="hint">Add products to see the category split.</p>`;
    const top = list.slice(0, 6), rest = list.slice(6).reduce((a, b) => a + b[1], 0);
    if (rest > 0) top.push(["Others", rest]);
    const max = Math.max(...top.map((x) => x[1]), 1);
    return `<div class="hint" style="margin-bottom:6px">${byValue ? "By stock value" : "By quantity in stock"}</div>` + top.map(([c, v], k) => `<div class="cat-row"><div class="cat-name notr" title="${esc(c)}">${esc(c)}</div>
      <div class="cat-bar"><span style="width:${Math.max(2, (v / max) * 100)}%; background:var(--c${k % 6})"></span></div><div class="cat-val">${byValue ? short(v) : num(v)}</div></div>`).join("");
  }
  const thumb = (i) => i && (i.photo || i.photoUrl) ? `<img src="${esc(i.photo || i.photoUrl)}" alt="" class="tb-thumb">` : `<span class="tb-thumb ph">${ic("package")}</span>`;
  const statusChip = (i) => ({ out: `<span class="st st-out">Out of Stock</span>`, low: `<span class="st st-low">Low Stock</span>`, hold: `<span class="st st-hold">On Hold</span>`, ok: `<span class="st st-ok">In Stock</span>` })[stockStatus(i)];
  function recentTable(history, items) {
    const list = (history || []).slice(0, 7);
    if (!list.length) return `<p class="hint">No stock movements yet. They appear here as soon as stock goes in or out.</p>`;
    return `<div class="table-wrap"><table class="ptable"><thead><tr><th>Product</th><th>Action</th><th>Qty</th><th>By</th><th>Time</th><th></th></tr></thead><tbody>${list.map((h) => {
      const it = items.find((x) => x.id === h.itemId) || items.find((x) => x.name === h.item);
      const tone = isIn(h.action) ? "st-ok" : isOut(h.action) ? "st-low" : /HOLD|RELEASE/.test(h.action) ? "st-hold" : "st-info";
      return `<tr><td data-l="Product"><div class="prod-cell">${thumb(it)}<span class="notr">${esc(h.item || "")}</span></div></td><td data-l="Action"><span class="st ${tone}">${esc(String(h.action || "").replace(/\s*\[.*$/, ""))}</span></td>
        <td data-l="Qty"><b>${esc(h.qty ?? "")}</b></td><td data-l="By" class="notr">${esc(h.user || "")}</td><td data-l="Time">${h.ms ? fmtDT(new Date(h.ms)) : ""}</td>
        <td>${it ? `<button class="icon-btn sm" title="Update" onclick="editItem('${esc(it.id)}')">${ic("pencil")}</button>` : ""}</td></tr>`; }).join("")}</tbody></table></div>`;
  }
  function lowTable(items) {
    const list = items.filter((i) => stockStatus(i) === "low" || stockStatus(i) === "out").slice(0, 7);
    if (!list.length) return `<p class="hint">All items are above their min alert level.</p>`;
    return `<div class="table-wrap"><table class="ptable"><thead><tr><th>Product</th><th>Available</th><th>Min</th><th>Status</th><th></th></tr></thead><tbody>${list.map((i) =>
      `<tr><td data-l="Product"><div class="prod-cell">${thumb(i)}<span class="notr">${esc(i.name)}</span></div></td><td data-l="Available"><b>${num(i.qty)}</b></td><td data-l="Min">${i.minQty ?? 5}</td><td data-l="Status">${statusChip(i)}</td>
      <td><button class="icon-btn sm" title="Update" onclick="editItem('${esc(i.id)}')">${ic("pencil")}</button></td></tr>`).join("")}</tbody></table></div>`;
  }
  const range = (d) => { V.range = d; renderDashboard(); };
  let rz = null, lastW = window.innerWidth;
  window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (Math.abs(window.innerWidth - lastW) > 40 && V.page === "dashboard") { lastW = window.innerWidth; renderDashboard(); } }, 250); });

  /* ---------------- attendance location (owner) ---------------- */
  function renderGeo() {
    const S = st(), admin = isAdmin(), g = S.geo, sg = S.shopGeo;
    const w = $("geoWarn");
    if (w) {
      const show = admin && V.page === "dashboard";
      w.classList.toggle("hidden", !show);
      w.classList.toggle("ok", !!g);
      if (show) w.innerHTML = g
        ? `<div class="warn-txt"><span class="stat-ic tone-green">${ic("map-pin")}</span><div><h3>Attendance by location is on</h3>
          <p class="page-sub"><span>Geo-fence: ${esc(g.radius)} m</span> · <span>${sg ? "Shop radius tracking: " + esc(sg.radius) + " m" : "Shop radius tracking is off"}</span></p></div></div>
          <button class="btn btn-ghost" onclick="UI.go('location')">${ic("settings")}Location settings</button>`
        : `<div class="warn-txt"><span class="stat-ic tone-amber">${ic("map-pin")}</span><div><h3>Attendance location is not set</h3>
          <p class="page-sub">Save the shop's location (geo-fence) so employees can mark Attendance In / Out from the shop.</p></div></div>
          <button class="btn btn-primary" onclick="UI.go('location')">${ic("map-pin")}Set location</button>`;
    }
    const el = $("geoStatus"); if (!el) return;
    const line = (on, title, txt) => `<div class="loc-chip ${on ? "on" : "off"}">${ic(on ? "circle-check" : "triangle-alert")}<div><b>${title}</b><div class="hint notr">${txt}</div></div></div>`;
    el.innerHTML = line(!!g, g ? "Attendance geo-fence is on" : "Attendance geo-fence is not set", g ? `${Number(g.lat).toFixed(5)}, ${Number(g.lng).toFixed(5)} · ${g.radius} m` : "-")
      + line(!!sg, sg ? "Shop radius tracking is on" : "Shop radius tracking is off", sg ? `${Number(sg.lat).toFixed(5)}, ${Number(sg.lng).toFixed(5)} · ${sg.radius} m` : "-");
  }

  /* ---------------- quick actions ---------------- */
  function quick(kind) {
    if (kind === "add") { addPanel(true); setTimeout(() => $("itemName") && $("itemName").focus(), 50); return; }
    if (kind === "enquiry") return open(() => { EQ.open(); if (EQ.newForm) EQ.newForm(); });
    if (kind === "tile") return SH.openCalc();
    pickItem({ in: "Stock In – choose the product", out: "Stock Out – choose the product", hold: "Hold / Release – choose the product" }[kind] || "Choose the product");
  }
  function pickItem(title) {
    $("pickTitle").innerText = title;
    $("pickSearch").value = "";
    renderPick("");
    $("pickModal").classList.add("open");
    setTimeout(() => $("pickSearch").focus(), 50);
  }
  function renderPick(q) {
    q = String(q || "").toLowerCase();
    const list = st().inventory.filter((i) => !q || (i.name || "").toLowerCase().includes(q) || (i.category || "").toLowerCase().includes(q)).sort((a, b) => (a.name || "").localeCompare(b.name || "")).slice(0, 60);
    $("pickList").innerHTML = list.length ? list.map((i) => `<button class="pick-row" onclick="UI.picked('${esc(i.id)}')">${thumb(i)}<span class="notr">${esc(i.name)}${i.size && i.size !== "-" ? " · " + esc(i.size) : ""}</span><b>${num(i.qty)}</b></button>`).join("") : `<p class="hint">No product found.</p>`;
  }
  function picked(id) { $("pickModal").classList.remove("open"); if (window.editItem) window.editItem(id); }
  function addPanel(on) {
    const p = $("addPanel"); if (!p) return;
    const show = on === undefined ? p.classList.contains("hidden") : on;
    if (show && (V.page !== "inventory" || document.body.classList.contains("page-modal-open"))) go("inventory");
    p.classList.toggle("hidden", !show);
  }

  /* ---------------- product details ---------------- */
  function details(id) {
    const S = st(), i = S.inventory.find((x) => x.id === id); if (!i) return;
    const q = Number(i.qty) || 0, h = Number(i.hold) || 0, b = Number(i.broken) || 0, p = Number(i.price) || 0;
    const lots = Object.values(i.lots || {});
    const hist = isAdmin() ? (S.history || []).filter((x) => x.itemId === id || (!x.itemId && x.item === i.name)).slice(0, 8) : [];
    const row = (l, v) => v === "" || v === undefined || v === null ? "" : `<div class="kv"><span>${l}</span><b class="notr">${v}</b></div>`;
    const tile = i.tileL && i.tileW ? `${i.tileL} × ${i.tileW} mm` + (i.pcsPerBox ? ` · ${i.pcsPerBox} pcs/box` : "") : "";
    $("detailBody").innerHTML = `<div class="card-head"><div class="prod-cell">${i.photo || i.photoUrl ? `<img src="${esc(i.photo || i.photoUrl)}" alt="" class="tb-thumb lg" onclick="viewPhoto('${esc(id)}')">` : `<span class="tb-thumb lg ph">${ic("package")}</span>`}
        <div><h3 style="margin:0" class="notr">${esc(i.name || "")}</h3><div class="code notr">#${esc(id.slice(0, 6).toUpperCase())} · ${esc(i.category || "General")}</div>${statusChip(i)}</div></div>
        <button class="icon-btn" onclick="UI.closeDetails()" title="Close">${ic("x")}</button></div>
      <div class="mini-grid"><div><span>Available</span><b>${num(q)}</b></div><div><span>On Hold</span><b class="txt-amber">${num(h)}</b></div><div><span>Broken</span><b class="txt-red">${num(b)}</b></div><div><span>Total Value</span><b>${inr((q + h) * p)}</b></div></div>
      <div class="kv-grid">${row("Size", i.size && i.size !== "-" ? esc(i.size) : "")}${row("Unit", i.unit && i.unit !== "-" ? esc(i.unit) : "")}${row("Price", inr(p))}${row("Min alert", i.minQty ?? 5)}
        ${row("Tile", esc(tile))}${row("Supplier", esc(i.supplier || ""))}${row("Supplier phone", esc(i.supplierPhone || ""))}${row("Added", i.createdMs ? fmtD(new Date(i.createdMs)) : "")}${row("Last stock out", i.lastOutAt ? fmtD(new Date(i.lastOutAt)) : "")}</div>
      ${lots.length ? `<h4 class="task-sec">Shades / batches / godowns</h4><div class="table-wrap"><table class="ptable"><thead><tr><th>Shade / batch</th><th>Available</th><th>Hold</th></tr></thead><tbody>${lots.map((l) =>
        `<tr><td data-l="Shade / batch">${esc(ctx.lotLabel ? ctx.lotLabel(l) : [l.shade, l.batch, l.godown].filter(Boolean).join(", "))}</td><td data-l="Available"><b>${num(l.qty)}</b></td><td data-l="Hold">${num(l.hold)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      ${hist.length ? `<h4 class="task-sec">Recent movements</h4><div class="table-wrap"><table class="ptable"><thead><tr><th>Time</th><th>Action</th><th>Qty</th><th>By</th></tr></thead><tbody>${hist.map((x) =>
        `<tr><td data-l="Time">${x.ms ? fmtDT(new Date(x.ms)) : ""}</td><td data-l="Action">${esc(x.action || "")}</td><td data-l="Qty"><b>${esc(x.qty ?? "")}</b></td><td data-l="By" class="notr">${esc(x.user || "")}</td></tr>`).join("")}</tbody></table></div>` : ""}
      <div class="dlg-btns">${isAdmin() ? `<button class="btn btn-danger" onclick="UI.closeDetails(); deleteItemById('${esc(id)}')">${ic("trash-2")}Delete</button>` : ""}
        <button class="btn btn-ghost" onclick="UI.closeDetails(); SH.openCalc('${esc(id)}')">${ic("calculator")}Calculator</button>
        <button class="btn btn-primary" onclick="UI.closeDetails(); editItem('${esc(id)}')">${ic("arrow-left-right")}Update stock</button></div>`;
    $("detailModal").classList.add("open");
  }
  const closeDetails = () => $("detailModal").classList.remove("open");

  /* ---------------- transactions page (audit history) ---------------- */
  const TX_TYPES = [["ALL", "All"], ["IN", "Stock In"], ["OUT", "Stock Out"], ["HOLD", "Hold / Release"], ["BROKEN", "Broken"], ["MOVE", "Godown moves"], ["OTHER", "Other changes"]];
  function txMatch(h) {
    const a = h.action || "", t = V.tx.type;
    if (t === "IN" && !isIn(a)) return false;
    if (t === "OUT" && !isOut(a)) return false;
    if (t === "HOLD" && !/^(HOLD|RELEASE)/.test(a)) return false;
    if (t === "BROKEN" && !/^BROKEN/.test(a)) return false;
    if (t === "MOVE" && !/^MOVE/.test(a)) return false;
    if (t === "OTHER" && (isIn(a) || isOut(a) || /^(HOLD|RELEASE|BROKEN|MOVE)/.test(a))) return false;
    if (V.tx.from && h.ms < new Date(V.tx.from + "T00:00:00").getTime()) return false;
    if (V.tx.to && h.ms >= new Date(V.tx.to + "T00:00:00").getTime() + DAYMS) return false;
    const q = V.tx.q.toLowerCase();
    return !q || (h.item || "").toLowerCase().includes(q) || (h.user || "").toLowerCase().includes(q) || a.toLowerCase().includes(q);
  }
  const txList = () => (st().history || []).filter(txMatch);
  function renderTx() {
    const el = $("txBody"); if (!el) return;
    const list = txList(), shown = list.slice(0, 300);
    let inQ = 0, outQ = 0; list.forEach((h) => { if (isIn(h.action)) inQ += Number(h.qty) || 0; else if (isOut(h.action)) outQ += Number(h.qty) || 0; });
    $("txSum").innerHTML = `<span class="chip">Records: ${num(list.length)}</span><span class="chip chip-green">In: ${num(inQ)}</span><span class="chip chip-red">Out: ${num(outQ)}</span>`;
    el.innerHTML = shown.length ? shown.map((h) => {
      const tone = isIn(h.action) ? "st-ok" : isOut(h.action) ? "st-low" : /HOLD|RELEASE/.test(h.action) ? "st-hold" : "st-info";
      return `<tr><td data-l="Time">${h.ms ? fmtDT(new Date(h.ms)) : ""}</td><td data-l="User" class="notr">${esc(h.user || "")}</td><td data-l="Action"><span class="st ${tone}">${esc(h.action || "")}</span></td>
        <td data-l="Item" class="notr">${esc(h.item || "")}</td><td data-l="Qty"><b>${esc(h.qty ?? "")}</b></td></tr>`; }).join("")
      : `<tr><td colspan="5" class="hint">No transactions match.</td></tr>`;
    if (list.length > 300) el.innerHTML += `<tr><td colspan="5" class="hint">Showing the latest 300 – export to Excel for all ${num(list.length)}.</td></tr>`;
  }
  function txSet(k, v) { V.tx[k] = v; renderTx(); }
  function txReset() { V.tx = { q: "", type: "ALL", from: "", to: "" }; ["txQ", "txFrom", "txTo"].forEach((i) => $(i) && ($(i).value = "")); if ($("txType")) $("txType").value = "ALL"; renderTx(); }

  /* ---------------- employees (cards) and attendance summary ---------------- */
  function todayAtt() {
    const S = st(), d = new Date(), key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const rows = ctx.attDays((S.attendance || []).filter((a) => a.date === key), ctx.shopSettings());
    return rows;
  }
  function renderStaffCards() {
    const el = $("staffCards"); if (!el || !isAdmin()) return;
    const S = st(), att = {}; todayAtt().forEach((r) => (att[r.uid] = r));
    const q = (V.emp.q || "").toLowerCase(), want = V.emp.st;
    const stOf = (a) => (a ? (a.outMs ? "out" : a.late ? "late" : "present") : "absent");
    const list = (S.staff || []).filter((s) => (!q || (s.name || "").toLowerCase().includes(q) || (s.email || "").toLowerCase().includes(q)) && (want === "ALL" || stOf(att[s.uid]) === want));
    if ($("empCount")) $("empCount").innerText = (S.staff || []).length ? `${list.length} / ${S.staff.length}` : "";
    el.innerHTML = !(S.staff || []).length ? `<p class="hint">No employees have joined yet. Share the company name and join code with them.</p>`
      : !list.length ? `<p class="hint">No employee matches the search.</p>` : list.map((s) => {
      const a = att[s.uid];
      const status = a ? (a.outMs ? `<span class="st st-info">Checked out</span>` : a.late ? `<span class="st st-hold">Late today</span>` : `<span class="st st-ok">Present today</span>`) : `<span class="st st-out">Not in today</span>`;
      const where = s.presence === "OUT" ? `<span class="st st-low">Outside shop</span>` : s.presence === "IN" ? `<span class="st st-ok">Inside shop</span>` : "";
      return `<div class="emp-card"><div class="emp-top"><span class="avatar lg">${esc(String(s.name || "?").charAt(0).toUpperCase())}</span>
        <div class="emp-id"><b class="notr">${esc(s.name || "")}</b><div class="hint notr">${esc(s.email || "-")}</div><span class="role-chip">Employee</span></div></div>
        <div class="emp-meta">${status} ${where}<div class="hint">Joined: ${s.joinedAt && s.joinedAt.toDate ? fmtD(s.joinedAt.toDate()) : "-"}${a && a.inMs ? " · In: " + new Date(a.inMs).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true }) : ""}</div></div>
        <div class="emp-act"><button class="btn-ghost danger" onclick="removeEmployee('${esc(s.uid)}')">${ic("user-x")} Remove</button></div></div>`;
    }).join("");
  }
  function renderAttSummary() {
    const el = $("attSummary"); if (!el || !isAdmin()) return;
    const S = st(), rows = todayAtt(), staff = (S.staff || []).length;
    const present = rows.filter((r) => r.inMs).length, late = rows.filter((r) => r.late).length, out = rows.filter((r) => r.outMs).length;
    el.innerHTML = card("user-check", "green", "Present today", num(present), staff ? "of " + staff + " employees" : "")
      + card("clock", "amber", "Late today", num(late), "after the shift start")
      + card("log-out", "blue", "Checked out", num(out), "Attendance Out marked")
      + card("user-x", "red", "Absent", num(Math.max(0, staff - present)), "no Attendance In");
  }

  /* ---------------- exports: Excel and PDF ---------------- */
  function xlsx(rows, sheet, file) {
    if (!window.XLSX) return ctx.toast("Excel export is still loading. Try again in a moment");
    const ws = XLSX.utils.json_to_sheet(rows), wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheet);
    XLSX.writeFile(wb, file + ".xlsx");
  }
  function pdf(title, head, rows) {
    const w = window.open("", "_blank");
    if (!w) return ctx.toast("Allow pop-ups to save the PDF");
    const company = esc(st().companyName || "");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      body{font-family:Inter,Segoe UI,Arial,sans-serif;margin:28px;color:#17251D} h1{margin:0;color:#073B25;font-size:22px} .sub{color:#718078;margin:4px 0 16px}
      table{width:100%;border-collapse:collapse;font-size:12px} th{background:#126B3A;color:#fff;text-align:left;padding:8px} td{padding:7px 8px;border-bottom:1px solid #E3EAE5} tr:nth-child(even) td{background:#F5F7F5}
      @media print{button{display:none}}</style></head><body><h1>${company}</h1><div class="sub">${esc(title)} · ${esc(fmtDT(new Date()))}</div>
      <table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>
      <p style="margin-top:20px"><button onclick="print()">Print / Save as PDF</button></p></body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 400);
  }
  const day = () => fmtD(new Date()).replace(/\//g, "-");
  function exportInv(kind) {
    const items = ctx.visibleItems ? ctx.visibleItems() : st().inventory;
    const label = { ok: "In Stock", low: "Low Stock", out: "Out of Stock", hold: "On Hold" };
    const rows = items.map((i) => ({ Code: i.id.slice(0, 6).toUpperCase(), Name: i.name || "", Category: i.category || "General", Size: i.size || "", Unit: i.unit || "", Available: Number(i.qty) || 0,
      Hold: Number(i.hold) || 0, Broken: Number(i.broken) || 0, "Min Alert": i.minQty ?? 5, Price: Number(i.price) || 0, "Total Value": ((Number(i.qty) || 0) + (Number(i.hold) || 0)) * (Number(i.price) || 0), Status: label[stockStatus(i)] }));
    if (kind === "xlsx") return xlsx(rows, "Inventory", "inventory-" + day());
    pdf("Inventory", Object.keys(rows[0] || { Name: "" }), rows.map((r) => Object.values(r).map((v) => (typeof v === "number" && v > 999 ? v.toLocaleString("en-IN") : v))));
  }
  function exportTx(kind) {
    const rows = txList().map((h) => ({ Time: h.ms ? fmtDT(new Date(h.ms)) : "", User: h.user || "", Action: h.action || "", Item: h.item || "", Qty: h.qty ?? "" }));
    if (kind === "xlsx") return xlsx(rows, "Transactions", "transactions-" + day());
    pdf("Stock transactions", ["Time", "User", "Action", "Item", "Qty"], rows.map((r) => Object.values(r)));
  }
  function exportAtt(kind) {
    const rows = ctx.attDays((st().attendance || []), ctx.shopSettings()).map((r) => ({ Date: fmtD(new Date(r.date + "T00:00:00")), Employee: r.name,
      In: r.inMs ? new Date(r.inMs).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "", Out: r.outMs ? new Date(r.outMs).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "",
      Hours: r.mins !== null ? (Math.round(r.mins / 6) / 10) : "", "Late (min)": r.lateMin || 0, "Overtime (min)": r.otMin || 0 }));
    if (kind === "xlsx") return xlsx(rows, "Attendance", "attendance-" + day());
    pdf("Attendance", Object.keys(rows[0] || { Date: "" }), rows.map((r) => Object.values(r)));
  }

  // Escape: first close an open menu or the side menu (returns true when something was closed)
  window.__uiEscape = () => {
    const menus = [...document.querySelectorAll(".drop-menu:not(.hidden)")];
    if (menus.length) { menus.forEach((m) => m.classList.add("hidden")); return true; }
    if ($("profMenu") && !$("profMenu").classList.contains("hidden")) { prof(false); return true; }
    if (document.body.classList.contains("drawer-open")) { drawer(false); return true; }
    return false;
  };
  // BACK / Escape inside the app with no window open: Inventory / Attendance Location -> Dashboard
  window.__uiBack = () => {
    if ($("app").classList.contains("hidden") || document.body.classList.contains("page-modal-open")) return false;
    if (V.page !== "dashboard") { go("dashboard"); return true; }
    return false;
  };
  // login / logout: the 🌐 language switch sits in the top bar inside the app
  function page(id) {
    const lb = $("langBox"), tb = document.querySelector(".tb-right");
    document.body.classList.toggle("in-app", id === "app");
    if (id === "app") { if (lb && tb && lb.parentNode !== tb) tb.insertBefore(lb, tb.firstChild); }
    else {
      if (lb && lb.parentNode !== document.body) document.body.appendChild(lb); closePageModals(); drawer(false); prof(false);
      if (id !== "boot") TH.load(null); // start screens and the developer console: the original colours
      if (window.STUDIO && window.STUDIO.isOpen()) window.STUDIO.close(true);
      // leaving the app (logout, developer console): no window of the app stays open
      document.querySelectorAll(".modal-overlay.open").forEach((m) => { if (m.id !== "confirmModal" && m.id !== "promptModal") m.classList.remove("open"); });
    }
  }

  window.UI = { empSet: (k, v) => { V.emp[k] = v; renderStaffCards(); }, openAppearance: () => open(() => $("appearanceModal").classList.add("open")), details, closeDetails, go, open, drawer, collapse, theme, setTheme, prof, search, range, quick, picked, renderPick, addPanel, txSet, txReset, exportInv, exportTx, exportAtt };
  return { start, refresh, go, markActive, page };
}
