// =====================================================================
// studio.js - 🎨 AI MARKETING STUDIO (owner)
// A Canva-style editor inside Pro Inventory: templates, text, shapes, icons, photos,
// QR codes, price / discount badges, Brand Kit, media library, My Designs, AI poster
// generator, AI copywriter, design review and PNG / JPG / PDF export.
//   • editor: Fabric.js (open source, MIT), downloaded only when the Studio opens
//   • QR codes: qrcode-generator (MIT), downloaded only when a QR code is used
//   • AI text: Claude, with the photo-reading key the developer sets in the developer console
//   • AI images: Google Imagen / Gemini, with the Google Gemini key saved in Marketing → Settings
// Stored per company in Firestore (images are compressed; each record stays under 1 MB):
//   mktAssets / mktAssetData   uploaded and AI images (small preview + full image)
//   mktDesigns / mktDesignData saved designs (name, folder, preview + the design)
//   mktTemplates               the owner's own saved templates
// =====================================================================
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { SIZES, FONTS, FONT_URL, fontStack, PALETTES, brandPalette, STYLES, CATEGORIES, TEMPLATES, buildTemplate, tText, READY, WRITING_STYLES, contrast, lum, mix, orientationOf } from "./studio-templates.js?v=20261125-8";

const FABRIC_URL = "https://cdn.jsdelivr.net/npm/fabric@5.3.0/dist/fabric.min.js";
const QR_URL = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";
const GEM = "https://generativelanguage.googleapis.com/v1beta";
const PROPS = ["name", "isBg", "srcKey", "kind", "ph", "qrData", "itemId", "locked", "selectable", "evented", "lockMovementX", "lockMovementY", "lockScalingX", "lockScalingY", "lockRotation", "hasControls", "phW", "phH"];
const EMOJI = ["🪔", "✨", "🎉", "🎊", "🌸", "🌼", "🌺", "🪷", "⭐", "🌟", "🎁", "🏷️", "🔥", "💥", "🎈", "🎆", "🙏", "🕉️", "🌙", "🎄", "🇮🇳", "🏠", "🛁", "🚿", "🧱", "🚚", "💎", "✅", "👉", "📞", "📍", "🌐"];
const ICON_PATHS = {
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5"/>'
};
const SPRITE_ICONS = ["map-pin", "clock", "store", "house", "sparkles", "zap", "shield-check", "circle-check", "indian-rupee", "package", "boxes", "megaphone", "building-2", "layers", "user-round", "wallet", "calculator"];

export function initStudio(ctx) {
  const { db, $, toast, askConfirm, loading, esc, fmtD } = ctx;
  const st = () => ctx.getState();
  const C = (n) => collection(db, "companies", st().companyID, n);
  const D = (n, id) => doc(db, "companies", st().companyID, n, id);
  const isAdmin = () => st().role === "ADMIN";
  const M = () => ctx.mkt(); // { set, kit, secrets } of the Marketing module (this company)
  const S = { open: false, cv: null, W: 1080, H: 1350, sizeKey: "ig_portrait", zoom: 0.5, hist: [], hi: -1, clip: null, id: null, name: "Untitled design", folder: "",
    dirty: false, panel: "templates", sheet: false, grid: false, snap: true, gridSize: 20, guides: [], restoring: false, exporting: false, assets: null, designs: null, mytpl: null,
    products: [], disc: 0, lang: "hi", tplFilter: { cat: "", style: "", color: "", orient: "", q: "" }, assetFilter: { folder: "", q: "" }, designFilter: { folder: "", q: "" }, cid: null, writer: null, review: null, itemPhoto: {} };
  const SRC = {}; // image key -> image data (so undo / redo and saving never copy big images around)
  const thumbs = {}; // template previews

  /* ================= loading the editor ================= */
  const scripts = {};
  function loadScript(src, ok) {
    if (ok()) return Promise.resolve();
    if (scripts[src]) return scripts[src];
    return (scripts[src] = new Promise((res, rej) => {
      const sc = document.createElement("script"); sc.src = src;
      sc.onload = () => res(); sc.onerror = () => { delete scripts[src]; rej(new Error("Could not download the editor. Check the internet connection and try again.")); };
      document.head.appendChild(sc);
    }));
  }
  let fontsReady = null;
  function loadFonts() {
    if (fontsReady) return fontsReady;
    if (!document.getElementById("stFonts")) { const l = document.createElement("link"); l.id = "stFonts"; l.rel = "stylesheet"; l.href = FONT_URL; document.head.appendChild(l); }
    fontsReady = Promise.all(FONTS.map((f) => (document.fonts && document.fonts.load ? document.fonts.load(`700 40px "${f}"`, f.includes("Devanagari") || ["Mukta", "Hind", "Rozha One", "Yatra One"].includes(f) ? "टाइल Tile" : "Tile").catch(() => {}) : null)))
      .then(() => new Promise((r) => setTimeout(r, 50)));
    return fontsReady;
  }

  /* ================= the screen ================= */
  const RAIL = [["templates", "🧩", "Templates"], ["ai", "🤖", "AI Poster"], ["uploads", "🖼", "Uploads"], ["text", "🔤", "Text"], ["elements", "⭐", "Elements"],
    ["backgrounds", "🎨", "Background"], ["products", "📦", "Products"], ["writer", "✍️", "AI Writer"], ["brand", "🏷", "Brand Kit"], ["designs", "📁", "My Designs"]];
  function ensureDom() {
    if ($("studio")) return;
    const el = document.createElement("div");
    el.id = "studio"; el.className = "studio hidden";
    el.innerHTML = `
      <div class="st-top">
        <button class="st-ib" onclick="STUDIO.close()" title="Back to Marketing">←</button>
        <div class="st-brand notr">🎨 <b>AI Marketing Studio</b></div>
        <input id="stName" class="st-name notr" value="Untitled design" oninput="STUDIO.rename(this.value)" title="Design name">
        <span id="stSaved" class="st-saved"></span>
        <div class="st-tools">
          <button class="st-ib" onclick="STUDIO.undo()" title="Undo (Ctrl+Z)">↶</button><button class="st-ib" onclick="STUDIO.redo()" title="Redo (Ctrl+Y)">↷</button>
          <span class="st-sep"></span>
          <button class="st-ib" onclick="STUDIO.zoomBy(0.8)" title="Zoom out">−</button><span id="stZoom" class="st-zoom">100%</span><button class="st-ib" onclick="STUDIO.zoomBy(1.25)" title="Zoom in">+</button>
          <button class="st-tb" onclick="STUDIO.fit()" title="Fit to screen">Fit</button>
          <button id="stGridBtn" class="st-tb" onclick="STUDIO.toggle('grid')" title="Show the grid">Grid</button>
          <button id="stSnapBtn" class="st-tb on" onclick="STUDIO.toggle('snap')" title="Snap to the grid and guides">Snap</button>
          <span class="st-sep"></span>
          <button class="st-tb" onclick="STUDIO.reviewOpen()" title="Check the design">✔ Review</button>
          <button class="st-tb" onclick="STUDIO.preview()" title="See it full size">👁 Preview</button>
          <button class="st-tb st-primary" onclick="STUDIO.save()">💾 Save</button>
          <button class="st-tb st-primary" onclick="STUDIO.exportOpen()">⬇ Download</button>
        </div>
      </div>
      <div class="st-body">
        <nav class="st-rail">${RAIL.map(([k, i, l]) => `<button data-p="${k}" onclick="STUDIO.panel('${k}')"><span>${i}</span>${l}</button>`).join("")}</nav>
        <aside id="stPanel" class="st-panel"></aside>
        <main id="stStage" class="st-stage"><div id="stPage" class="st-page"><canvas id="stCanvas"></canvas></div></main>
        <aside id="stProps" class="st-props"></aside>
      </div>
      <div id="stDialog" class="st-dialog hidden"></div>
      <input id="stFile" type="file" accept="image/*" multiple hidden onchange="STUDIO.uploadFiles(this)">
      <input id="stFile1" type="file" accept="image/*" hidden onchange="STUDIO.replaceFile(this)">
      <input id="stLogoFile" type="file" accept="image/png,image/*" hidden onchange="STUDIO.logoFile(this)">
      <input id="stItemFile" type="file" accept="image/*" hidden onchange="STUDIO.itemFile(this)">`;
    document.body.appendChild(el);
    window.addEventListener("resize", () => { if (S.open) { clearTimeout(S.rz); S.rz = setTimeout(fit, 150); } });
    document.addEventListener("keydown", keys, true);
  }

  async function open(opts) {
    if (!isAdmin()) return toast("Only the owner can use the Marketing Studio");
    ensureDom();
    // a different company: forget everything cached from the last one (no mixing of brands)
    if (S.cid !== st().companyID) { Object.keys(SRC).forEach((k) => delete SRC[k]); Object.keys(thumbs).forEach((k) => delete thumbs[k]); S.assets = S.designs = S.mytpl = null; S.products = []; S.itemPhoto = {}; S.cid = st().companyID; S.cv && S.cv.dispose(); S.cv = null; }
    $("studio").classList.remove("hidden"); $("studio").classList.add("open"); S.open = true; document.body.classList.add("studio-on");
    loading(true);
    try { await loadScript(FABRIC_URL, () => !!window.fabric); await loadFonts(); }
    catch (e) { loading(false); close(true); return toast(e.message); }
    loading(false);
    if (!S.cv) setupCanvas();
    S.lang = (M().set && M().set.studioLang) || S.lang;
    try { S.claude = ctx.aiOn ? await ctx.aiOn() : false; } catch (e) { S.claude = false; }
    await loadLogo();
    if (opts && opts.content) { await fromContent(opts.content); }
    else if (opts && opts.designId) await openDesign(opts.designId);
    else if (!S.cv.getObjects().some((o) => !o.isBg)) await applyTemplate(TEMPLATES.find((t) => t.id === "promotion"), true);
    panel(opts && opts.panel ? opts.panel : S.panel);
    setTimeout(fit, 30);
  }
  async function close(force) {
    if (!S.open) return;
    if (!force && S.dirty && !(await askConfirm("Close the Studio? Changes since the last save will be lost."))) return;
    S.open = false; $("studio").classList.add("hidden"); $("studio").classList.remove("open"); document.body.classList.remove("studio-on"); dialog(null);
  }

  /* ================= canvas ================= */
  function setupCanvas() {
    const F = window.fabric;
    F.Object.prototype.transparentCorners = false; F.Object.prototype.cornerColor = "#2563EB"; F.Object.prototype.cornerStyle = "circle";
    F.Object.prototype.borderColor = "#2563EB"; F.Object.prototype.cornerSize = 12; F.Object.prototype.padding = 4;
    S.cv = new F.Canvas("stCanvas", { preserveObjectStacking: true, backgroundColor: "#FFFFFF", selection: true, stopContextMenu: true, fireRightClick: false, enableRetinaScaling: true });
    const cv = S.cv;
    const changed = () => { if (!S.restoring) { S.dirty = true; savedMark(); schedHist(); } };
    cv.on("object:modified", () => { S.guides = []; changed(); }); cv.on("object:added", changed); cv.on("object:removed", changed);
    cv.on("text:changed", () => { changed(); });
    cv.on("selection:created", props); cv.on("selection:updated", props); cv.on("selection:cleared", props);
    cv.on("object:moving", (e) => snapMove(e.target));
    cv.on("object:scaling", () => { S.guides = []; });
    cv.on("mouse:up", () => { if (S.guides.length) { S.guides = []; cv.requestRenderAll(); } });
    cv.on("mouse:dblclick", (e) => { if (e.target && e.target.ph) pickReplace(); });
    cv.on("after:render", (e) => overlay(e.ctx));
    setSize(S.W, S.H, S.sizeKey, true);
  }
  const F = () => window.fabric;
  const objs = () => S.cv.getObjects().filter((o) => !o.isBg);
  const bgObj = () => S.cv.getObjects().find((o) => o.isBg);
  function setSize(w, h, key, silent) {
    const old = { W: S.W, H: S.H };
    S.W = Math.round(w); S.H = Math.round(h); S.sizeKey = key || "custom";
    const b = bgObj();
    if (b) {
      if (b.type === "image") coverImage(b, S.W, S.H); else b.set({ width: S.W, height: S.H, left: 0, top: 0 });
      if (b.fill && b.fill.coords) b.set("fill", gradient(b.fill.colorStops.map((c) => c.color), b._angle || 160, S.W, S.H));
    } else setBg({ type: "color", colors: ["#FFFFFF"] }, true);
    // keep the design: move everything proportionally
    if (!silent && old.W && (old.W !== S.W || old.H !== S.H)) {
      const k = Math.min(S.W / old.W, S.H / old.H);
      objs().forEach((o) => { o.set({ left: o.left * (S.W / old.W), top: o.top * (S.H / old.H), scaleX: o.scaleX * k, scaleY: o.scaleY * k }); o.setCoords(); });
    }
    fit();
    if (!silent) pushHist();
  }
  function applyZoom() {
    const cv = S.cv, z = S.zoom;
    cv.setDimensions({ width: Math.round(S.W * z), height: Math.round(S.H * z) });
    cv.setZoom(z);
    if ($("stZoom")) $("stZoom").innerText = Math.round(z * 100) + "%";
    cv.requestRenderAll();
  }
  function fit() {
    if (!S.cv) return;
    const box = $("stStage"); if (!box) return;
    const cs = getComputedStyle(box), padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom), padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const bw = Math.max(120, box.clientWidth - padX - 8), bh = Math.max(120, box.clientHeight - padY - 8);
    S.zoom = Math.max(0.05, Math.min(2, bw / S.W, bh / S.H));
    applyZoom();
  }
  const zoomBy = (k) => { S.zoom = Math.max(0.05, Math.min(4, S.zoom * k)); applyZoom(); };

  // grid and alignment guides (drawn on the screen only, never exported)
  function overlay(c) {
    if (S.exporting || !c || c !== S.cv.contextContainer) return;
    const z = S.zoom;
    c.save();
    if (S.grid) {
      c.strokeStyle = "rgba(37,99,235,0.12)"; c.lineWidth = 1;
      const g = S.gridSize * z;
      for (let x = g; x < S.W * z; x += g) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, S.H * z); c.stroke(); }
      for (let y = g; y < S.H * z; y += g) { c.beginPath(); c.moveTo(0, y); c.lineTo(S.W * z, y); c.stroke(); }
    }
    c.strokeStyle = "#EC4899"; c.lineWidth = 1; c.setLineDash([5, 4]);
    S.guides.forEach((gd) => { c.beginPath(); if (gd.x !== undefined) { c.moveTo(gd.x * z, 0); c.lineTo(gd.x * z, S.H * z); } else { c.moveTo(0, gd.y * z); c.lineTo(S.W * z, gd.y * z); } c.stroke(); });
    c.restore();
  }
  function snapMove(o) {
    if (!o) return;
    S.guides = [];
    if (o.locked) return;
    const th = 8 / S.zoom, r = o.getBoundingRect(true, true);
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = 0, dy = 0;
    if (S.snap) {
      // page centre and edges, then the other elements
      // the page centre and edges win; otherwise the nearest edge / centre of another element
      const pxs = [[S.W / 2, cx], [0, r.left], [S.W, r.left + r.width]], pys = [[S.H / 2, cy], [0, r.top], [S.H, r.top + r.height]], xs = [], ys = [];
      objs().filter((x) => x !== o && x.visible !== false).slice(0, 40).forEach((x) => { const b = x.getBoundingRect(true, true); xs.push([b.left, r.left], [b.left + b.width, r.left + r.width], [b.left + b.width / 2, cx]); ys.push([b.top, r.top], [b.top + b.height, r.top + r.height], [b.top + b.height / 2, cy]); });
      let bx = th, by = th;
      const pick = (list, isX) => list.forEach(([t, v]) => { const d = t - v; if (isX ? Math.abs(d) < bx : Math.abs(d) < by) { if (isX) { bx = Math.abs(d); dx = d; S.gx = t; } else { by = Math.abs(d); dy = d; S.gy = t; } } });
      pick(pxs, true); if (bx >= th) pick(xs, true);
      pick(pys, false); if (by >= th) pick(ys, false);
      if (bx < th) S.guides.push({ x: S.gx }); if (by < th) S.guides.push({ y: S.gy });
      if (S.grid && bx >= th) dx = Math.round(r.left / S.gridSize) * S.gridSize - r.left;
      if (S.grid && by >= th) dy = Math.round(r.top / S.gridSize) * S.gridSize - r.top;
      o.set({ left: o.left + dx, top: o.top + dy }); o.setCoords();
    }
  }

  /* ================= history: undo / redo ================= */
  let histT = null;
  const schedHist = () => { clearTimeout(histT); histT = setTimeout(pushHist, 250); };
  function snapshot() { return JSON.stringify(serial(false)); }
  function pushHist() {
    if (!S.cv || S.restoring) return;
    const s = snapshot();
    if (S.hist[S.hi] === s) return;
    S.hist = S.hist.slice(0, S.hi + 1); S.hist.push(s);
    if (S.hist.length > 50) S.hist.shift();
    S.hi = S.hist.length - 1;
  }
  async function restore(snap) {
    S.restoring = true;
    try { await loadData(JSON.parse(snap)); } finally { S.restoring = false; }
    S.dirty = true; savedMark(); props();
  }
  const undo = async () => { if (S.hi > 0) { S.hi--; await restore(S.hist[S.hi]); } };
  const redo = async () => { if (S.hi < S.hist.length - 1) { S.hi++; await restore(S.hist[S.hi]); } };

  /* ================= saving the design as data ================= */
  // images keep only their key; the image itself comes from SRC / the library / the stock photo
  function serial(forSave) {
    const json = S.cv.toJSON(PROPS);
    const strip = (list) => list.forEach((o) => {
      if (o.type === "image" && o.srcKey && (!o.srcKey.startsWith("inline") || o.srcKey === "inline:ph")) o.src = "";
      if (o.objects) strip(o.objects);
      if (o.clipPath && o.clipPath.objects) strip(o.clipPath.objects);
    });
    strip(json.objects || []);
    delete json.background;
    return { v: 1, w: S.W, h: S.H, sizeKey: S.sizeKey, json };
  }
  async function srcFor(key) {
    if (SRC[key]) return SRC[key];
    if (key === "inline:ph") return PLACEHOLDER_IMG();
    let img = "";
    try {
      if (key.startsWith("asset:")) { const d = await getDoc(D("mktAssetData", key.slice(6))); if (d.exists()) img = d.data().img || ""; }
      else if (key.startsWith("item:")) img = await itemPhoto(key.slice(5));
      else if (key === "logo") img = await loadLogo();
    } catch (e) { console.warn("Image not loaded", key, e); }
    if (img) SRC[key] = img;
    return img || PLACEHOLDER_IMG();
  }
  async function loadData(d) {
    const json = JSON.parse(JSON.stringify(d.json || d));
    const fill = async (list) => { for (const o of list || []) { if (o.type === "image" && o.srcKey && !o.src) o.src = await srcFor(o.srcKey); if (o.objects) await fill(o.objects); } };
    await fill(json.objects);
    S.W = d.w || S.W; S.H = d.h || S.H; S.sizeKey = d.sizeKey || S.sizeKey;
    await new Promise((res) => S.cv.loadFromJSON(json, () => { res(); }));
    S.cv.getObjects().forEach((o) => { if (o.isBg) { o.set({ selectable: false, evented: false, hoverCursor: "default" }); S.cv.sendToBack(o); } if (o.locked) lockObj(o, true); });
    if (!bgObj()) setBg({ type: "color", colors: ["#FFFFFF"] }, true);
    applyZoom(); fit();
  }

  /* ================= backgrounds ================= */
  function gradient(colors, angle, w, h) {
    const a = ((angle || 160) - 90) * Math.PI / 180, cx = w / 2, cy = h / 2, len = Math.abs(w * Math.cos(a)) / 2 + Math.abs(h * Math.sin(a)) / 2;
    return new (F().Gradient)({ type: "linear", gradientUnits: "pixels", coords: { x1: cx - Math.cos(a) * len, y1: cy - Math.sin(a) * len, x2: cx + Math.cos(a) * len, y2: cy + Math.sin(a) * len },
      colorStops: colors.map((c, i) => ({ offset: colors.length === 1 ? 0 : i / (colors.length - 1), color: c })) });
  }
  function setBg(b, silent) {
    const cv = S.cv, old = bgObj();
    if (b.type === "image") {
      return new Promise((res) => F().Image.fromURL(b.src, (im) => {
        im.set({ isBg: true, selectable: false, evented: false, srcKey: b.srcKey || "inline", name: "Background photo", hoverCursor: "default" });
        coverImage(im, S.W, S.H); if (old) cv.remove(old); cv.add(im); cv.sendToBack(im); cv.requestRenderAll(); if (!silent) pushHist(); res();
      }, { crossOrigin: "anonymous" }));
    }
    const r = old && old.type === "rect" ? old : new (F().Rect)({ left: 0, top: 0, width: S.W, height: S.H, isBg: true, selectable: false, evented: false, name: "Background", hoverCursor: "default", strokeWidth: 0 });
    r.set({ width: S.W, height: S.H, left: 0, top: 0 });
    r._angle = b.angle || 160;
    r.set("fill", b.type === "gradient" && b.colors.length > 1 ? gradient(b.colors, b.angle, S.W, S.H) : b.colors[0] || "#FFFFFF");
    if (old && old !== r) cv.remove(old);
    if (!r.canvas) { cv.add(r); }
    cv.sendToBack(r); cv.requestRenderAll();
    if (!silent) pushHist();
  }
  function coverImage(im, w, h) {
    const iw = im._element ? im._element.naturalWidth || im.width : im.width, ih = im._element ? im._element.naturalHeight || im.height : im.height;
    const k = Math.max(w / iw, h / ih);
    im.set({ cropX: (iw - w / k) / 2, cropY: (ih - h / k) / 2, width: w / k, height: h / k, scaleX: k, scaleY: k, left: 0, top: 0, originX: "left", originY: "top" });
  }

  /* ================= images ================= */
  const PLACEHOLDER_IMG = () => {
    if (SRC._ph) return SRC._ph;
    const c = document.createElement("canvas"); c.width = 600; c.height = 450; const g = c.getContext("2d");
    g.fillStyle = "#E5E7EB"; g.fillRect(0, 0, 600, 450); g.strokeStyle = "#9CA3AF"; g.setLineDash([16, 12]); g.lineWidth = 6; g.strokeRect(12, 12, 576, 426);
    g.fillStyle = "#6B7280"; g.font = "700 40px Poppins, sans-serif"; g.textAlign = "center"; g.fillText("📷", 300, 200); g.font = "600 30px Poppins, sans-serif"; g.fillText("Double-tap to add a photo", 300, 270);
    return (SRC._ph = c.toDataURL("image/png"));
  };
  async function itemPhoto(id) {
    if (S.itemPhoto[id]) return srcFor(S.itemPhoto[id]);
    try { const d = await getDoc(D("itemPhotos", id)); if (d.exists() && d.data().img) return d.data().img; } catch (e) {}
    const it = st().inventory.find((x) => x.id === id);
    return (it && (it.photo || it.photoUrl)) || "";
  }
  async function loadLogo() {
    if (SRC.logo !== undefined) return SRC.logo;
    try { const d = await getDoc(D("brand", "logo")); SRC.logo = d.exists() ? d.data().img || "" : ""; } catch (e) { SRC.logo = ""; }
    return SRC.logo;
  }
  const imgEl = (src) => new Promise((res) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  function fabricImage(src, opts) { return new Promise((res) => F().Image.fromURL(src, (im) => res(im && im.width ? im : null), { crossOrigin: "anonymous" })).then((im) => { if (im && opts) im.set(opts); return im; }); }
  // put an image into a box: cover (fill and crop) or contain
  function placeIn(im, x, y, w, h, mode, rx) {
    const iw = im._element.naturalWidth || im.width, ih = im._element.naturalHeight || im.height;
    if (mode === "cover") { const k = Math.max(w / iw, h / ih); im.set({ cropX: (iw - w / k) / 2, cropY: (ih - h / k) / 2, width: w / k, height: h / k, scaleX: k, scaleY: k, left: x, top: y }); }
    else { const k = Math.min(w / iw, h / ih); im.set({ cropX: 0, cropY: 0, width: iw, height: ih, scaleX: k, scaleY: k, left: x + (w - iw * k) / 2, top: y + (h - ih * k) / 2 }); }
    if (rx) im.clipPath = new (F().Rect)({ width: im.width, height: im.height, rx: rx / im.scaleX, ry: rx / im.scaleY, originX: "center", originY: "center" });
    im.setCoords();
    return im;
  }

  /* ================= object descriptions -> editable elements ================= */
  async function fromSpec(sp) {
    const Fb = F(), shadow = sp.shadow ? new Fb.Shadow({ color: "rgba(0,0,0,0.25)", blur: 18, offsetX: 0, offsetY: 6 }) : null;
    if (sp.t === "text") return new Fb.Textbox(sp.text || "", { left: sp.left, top: sp.top, width: Math.max(40, sp.w), fontSize: Math.max(8, sp.size), fontWeight: sp.weight || 700, fontFamily: fontStack(sp.font),
      fill: sp.fill || "#111111", textAlign: sp.align || "left", lineHeight: sp.lh || 1.16, name: sp.name || "Text", kind: sp.kind || "", shadow: shadow && lum(sp.fill || "#000") > 0.5 ? new Fb.Shadow({ color: "rgba(0,0,0,0.35)", blur: 12, offsetX: 0, offsetY: 3 }) : null, splitByGrapheme: false });
    if (sp.t === "rect") return new Fb.Rect({ left: sp.left, top: sp.top, width: Math.max(1, sp.w), height: Math.max(1, sp.h), fill: sp.fill === "" ? "" : sp.fill || "#2563EB", rx: sp.rx || 0, ry: sp.rx || 0, stroke: sp.stroke || null, strokeWidth: sp.sw || 0, opacity: sp.opacity ?? 1, name: sp.name || "Rectangle", shadow });
    if (sp.t === "circle") return new Fb.Circle({ left: sp.left, top: sp.top, radius: sp.r, fill: sp.fill, opacity: sp.opacity ?? 1, name: sp.name || "Circle", stroke: sp.stroke || null, strokeWidth: sp.sw || 0 });
    if (sp.t === "poly") return new Fb.Polygon(sp.points.map(([x, y]) => ({ x, y })), { fill: sp.fill, opacity: sp.opacity ?? 1, name: sp.name || "Shape", objectCaching: false });
    if (sp.t === "emoji") return new Fb.Text(sp.text, { left: sp.left, top: sp.top, fontSize: sp.size, fontFamily: "'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif", name: sp.name || "Decoration" });
    if (sp.t === "image") {
      let key = sp.src, src = "";
      if (key === "placeholder") { src = PLACEHOLDER_IMG(); key = "inline:ph"; }
      else src = await srcFor(key);
      if (!src || src === PLACEHOLDER_IMG()) { src = PLACEHOLDER_IMG(); key = "inline:ph"; }
      const im = await fabricImage(src); if (!im) return null;
      placeIn(im, sp.left, sp.top, sp.w, sp.h, sp.fit === "contain" ? "contain" : "cover", sp.rx);
      im.set({ srcKey: key, name: sp.name || "Photo", itemId: sp.itemId || "", ph: key === "inline:ph", phW: sp.w, phH: sp.h });
      return im;
    }
    if (sp.t === "qr") return qrObject(sp.data, sp.left, sp.top, sp.w);
    if (sp.t === "badge") return badgeObj(sp.text, sp.left, sp.top, sp.r, sp.fill, sp.color, sp.angle);
    if (sp.t === "price") return priceObj(sp.text, sp.old, sp.left, sp.top, sp.size, sp.fill, sp.color);
    return null;
  }
  function badgeObj(text, left, top, r, fill, color, angle) {
    const Fb = F();
    const c1 = new Fb.Circle({ radius: r, fill: fill || "#DC2626", originX: "center", originY: "center" });
    const c2 = new Fb.Circle({ radius: r * 0.86, fill: "", stroke: "rgba(255,255,255,0.85)", strokeWidth: Math.max(2, r * 0.035), strokeDashArray: [r * 0.09, r * 0.07], originX: "center", originY: "center" });
    const t = new Fb.Textbox(text, { width: r * 1.45, fontSize: r * (String(text).length > 8 ? 0.28 : 0.38), fontWeight: 900, fontFamily: fontStack("Montserrat"), fill: color || "#FFFFFF", textAlign: "center", originX: "center", originY: "center" });
    return new Fb.Group([c1, c2, t], { left, top, angle: angle || 0, name: "Badge", kind: "badge" });
  }
  function priceObj(text, old, left, top, size, fill, color) {
    const Fb = F(), parts = [];
    const t = new Fb.Text(text, { fontSize: size, fontWeight: 800, fontFamily: fontStack("Poppins"), fill: color || "#111111", originX: "left", originY: "top", left: size * 0.5, top: size * 0.22 });
    const r = new Fb.Rect({ width: t.width + size, height: size * 1.5, rx: size * 0.75, ry: size * 0.75, fill: fill || "#FACC15", left: 0, top: 0 });
    parts.push(r, t);
    if (old) {
      const o = new Fb.Text(old, { fontSize: size * 0.62, fontWeight: 700, fontFamily: fontStack("Poppins"), fill: "#FFFFFF", left: size * 0.45, top: size * 1.62, linethrough: true });
      const ob = new Fb.Rect({ width: o.width + size * 0.6, height: size * 0.95, rx: size * 0.45, ry: size * 0.45, fill: "rgba(0,0,0,0.65)", left: size * 0.15, top: size * 1.55 });
      parts.push(ob, o);
    }
    return new Fb.Group(parts, { left, top, name: "Price", kind: "price" });
  }

  /* ================= QR code ================= */
  function qrTargets() {
    const set = M().set || {}, kit = M().kit || {}, d = String(kit.whatsapp || set.phone || "").replace(/\D/g, "");
    return { whatsapp: d.length >= 10 ? "https://wa.me/" + (d.length === 10 ? "91" + d : d) : "", maps: kit.maps || "", website: kit.website || "", instagram: kit.instagram || "" };
  }
  async function qrDataUrl(text, color) {
    await loadScript(QR_URL, () => !!window.qrcode);
    const q = window.qrcode(0, "M"); q.addData(String(text)); q.make();
    const n = q.getModuleCount(), cell = 12, pad = 3, sz = (n + pad * 2) * cell;
    const c = document.createElement("canvas"); c.width = c.height = sz; const g = c.getContext("2d");
    g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, sz, sz); g.fillStyle = color || "#111111";
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect((k + pad) * cell, (r + pad) * cell, cell, cell);
    return c.toDataURL("image/png");
  }
  async function qrObject(text, left, top, w) {
    if (!text) return null;
    try {
      const im = await fabricImage(await qrDataUrl(text));
      im.set({ left, top, scaleX: w / im.width, scaleY: w / im.width, srcKey: "inline:qr", qrData: text, name: "QR code", kind: "qr" });
      return im;
    } catch (e) { toast(e.message); return null; }
  }

  /* ================= brand ================= */
  function brand() {
    const set = M().set || {}, kit = M().kit || {};
    return { name: kit.bizName || st().companyName || "", tagline: set.tagline || "", phone: set.phone || "", address: [set.address, set.city].filter(Boolean).join(", ").replace(/,\s*,/g, ","),
      website: kit.website || "", hasLogo: !!SRC.logo, fontH: kit.fontH || "", fontB: kit.fontB || "", colors: kit.colors || [] };
  }
  const qrDefault = () => { const k = (M().kit || {}).qr || "whatsapp", t = qrTargets(); return t[k] || t.whatsapp || t.maps || t.website || ""; };

  /* ================= templates ================= */
  function tplPalette(tpl, palKey) {
    if (palKey === "brand") return brandPalette(brand().colors) || PALETTES[tpl.pal];
    return PALETTES[palKey] || PALETTES[tpl.pal];
  }
  function productData(ids) {
    return (ids || []).map((id) => st().inventory.find((x) => x.id === id)).filter(Boolean)
      .map((i) => ({ id: i.id, name: i.name, size: i.size, unit: i.unit, price: Number(i.price) || 0, category: i.category, hasPhoto: !!(i.photo || i.photoUrl || S.itemPhoto[i.id]) }));
  }
  async function applyTemplate(tpl, silent, over) {
    if (!tpl) return;
    if (!silent && objs().length && S.dirty && !(await askConfirm("Replace the current design with this template?"))) return;
    loading(true);
    try {
      const o = over || {};
      const spec = buildTemplate(tpl, { w: S.W, h: S.H, lang: o.lang || S.lang, pal: o.palObj || tplPalette(tpl, S.tplFilter.pal), brand: brand(), products: productData(o.products || S.products), discount: o.disc ?? S.disc, qr: o.qr === undefined ? qrDefault() : o.qr });
      if (o.patch) o.patch(spec);
      S.restoring = true;
      S.cv.discardActiveObject();
      objs().forEach((x) => S.cv.remove(x));
      if (spec.bg) setBg(spec.bg, true);
      for (const sp of spec.objects) { const f = await fromSpec(sp); if (f) S.cv.add(f); }
      if (o.bgImage) { await setBg({ type: "image", src: o.bgImage.src, srcKey: o.bgImage.key }, true); const ov = new (F().Rect)({ left: 0, top: 0, width: S.W, height: S.H, fill: "rgba(0,0,0,0.38)", name: "Photo shade", selectable: true }); S.cv.add(ov); S.cv.moveTo(ov, 1); }
      S.restoring = false;
      S.cv.requestRenderAll();
      S.tplId = tpl.id; if (!S.id) setName(tText(tpl, "title", S.lang) || tpl.name);
      pushHist(); S.dirty = !silent; savedMark(); props();
    } catch (e) { console.error(e); toast("Could not open the template: " + e.message); }
    finally { S.restoring = false; loading(false); }
  }
  // a preview picture of a template at the current size
  async function tplThumb(tpl) {
    const key = [tpl.id, S.W, S.H, S.lang, S.tplFilter.pal || "", !!SRC.logo].join("|");
    if (thumbs[key]) return thumbs[key];
    const Fb = F(), k = 240 / S.W, sc = new Fb.StaticCanvas(null, { width: Math.round(S.W * k), height: Math.round(S.H * k), enableRetinaScaling: false });
    sc.setZoom(k);
    const spec = buildTemplate(tpl, { w: S.W, h: S.H, lang: S.lang, pal: tplPalette(tpl, S.tplFilter.pal), brand: brand(), products: [], discount: 0, qr: "" });
    const bgR = new Fb.Rect({ left: 0, top: 0, width: S.W, height: S.H });
    bgR.set("fill", spec.bg.type === "gradient" ? gradient(spec.bg.colors, spec.bg.angle, S.W, S.H) : spec.bg.colors[0]);
    sc.add(bgR);
    for (const sp of spec.objects) { if (sp.t === "qr") continue; const f = await fromSpec(sp); if (f) sc.add(f); }
    sc.renderAll();
    const url = sc.toDataURL({ format: "jpeg", quality: 0.8, multiplier: 1 });
    sc.dispose();
    return (thumbs[key] = url);
  }

  /* ================= panels (left) ================= */
  function panel(name) {
    S.panel = name || S.panel;
    document.querySelectorAll("#studio .st-rail button").forEach((b) => b.classList.toggle("on", b.dataset.p === S.panel));
    const el = $("stPanel"); if (!el) return;
    el.classList.add("open"); document.getElementById("studio").classList.add("panel-open");
    if (window.innerWidth < 900) setTimeout(fit, 0);
    const head = (t, sub) => `<div class="st-ph"><div><b>${t}</b>${sub ? `<div class="st-hint">${sub}</div>` : ""}</div><button class="st-ib st-close" onclick="STUDIO.hidePanel()" title="Close">✕</button></div>`;
    const P = {
      templates: () => head("Templates", "Every template fits the size you choose and uses your Brand Kit.") + tplPanel(),
      ai: () => head("AI Poster Generator", "Describe the poster. AI writes the text and colours, and makes the picture.") + aiPanel(),
      uploads: () => head("Uploads & media library", "Product photos, logos, business photos and backgrounds. Saved for this company.") + uploadsPanel(),
      text: () => head("Text") + textPanel(),
      elements: () => head("Elements", "Shapes, badges, decorations, icons, QR code and contact details.") + elementsPanel(),
      backgrounds: () => head("Background") + bgPanel(),
      products: () => head("Products from your stock", "Real names, photos and prices from Inventory.") + productsPanel(),
      writer: () => head("AI Copywriter", "Headlines, offers, greetings, captions, WhatsApp messages and hashtags.") + writerPanel(),
      brand: () => head("Brand Kit", "Used automatically in every new design. Saved for this company only.") + brandPanel(),
      designs: () => head("My Designs") + designsPanel()
    };
    el.innerHTML = (P[S.panel] || P.templates)();
    if (S.panel === "templates") fillThumbs();
    if (S.panel === "uploads" || S.panel === "backgrounds") loadAssets().then(() => { if (S.panel === "uploads" || S.panel === "backgrounds") { const g = $("stAssetGrid"); if (g) g.innerHTML = assetGrid(S.panel === "backgrounds"); } });
    if (S.panel === "designs") loadDesigns().then(() => { if (S.panel === "designs" && $("stDesignList")) $("stDesignList").innerHTML = designList(); });
  }
  const hidePanel = () => { $("stPanel").classList.remove("open"); document.getElementById("studio").classList.remove("panel-open"); if (window.innerWidth < 900) setTimeout(fit, 0); };
  const sel = (id, opts, val, on) => `<select id="${id}" onchange="${on}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(val) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  const sizeOptions = () => [...Object.entries(SIZES).map(([k, v]) => [k, `${v.label} · ${v.w}×${v.h}`]), ["custom", "Custom size…"]];

  function tplPanel() {
    const f = S.tplFilter;
    const colours = [...new Set(Object.values(PALETTES).flatMap((p) => p.tags))];
    return `<div class="st-row">${sel("stSize", sizeOptions(), S.sizeKey, "STUDIO.sizePick(this.value)")}</div>
      <div class="st-row st-2">${sel("stLang", [["hi", "हिंदी"], ["mr", "मराठी"], ["en", "English"], ["hien", "हिंदी + English"]], S.lang, "STUDIO.setLang(this.value)")}
        ${sel("stPal", [["", "Template colours"], ["brand", "My brand colours"], ...Object.keys(PALETTES).map((k) => [k, k.replace(/_/g, " & ")])], f.pal || "", "STUDIO.tplSet('pal', this.value)")}</div>
      <input class="st-in" placeholder="Search templates…" value="${esc(f.q)}" oninput="STUDIO.tplSet('q', this.value, true)">
      <div class="st-row st-2">${sel("stCat", [["", "All categories"], ...Object.entries(CATEGORIES)], f.cat, "STUDIO.tplSet('cat', this.value)")}
        ${sel("stSty", [["", "All styles"], ...Object.entries(STYLES)], f.style, "STUDIO.tplSet('style', this.value)")}</div>
      <div class="st-row st-2">${sel("stCol", [["", "All colours"], ...colours.map((c) => [c, c])], f.color, "STUDIO.tplSet('color', this.value)")}
        ${sel("stOri", [["", "Any orientation"], ["portrait", "Portrait"], ["square", "Square"], ["landscape", "Landscape"]], f.orient, "STUDIO.tplSet('orient', this.value)")}</div>
      <div id="stTplGrid" class="st-tgrid">${tplCards()}</div>
      ${S.mytpl && S.mytpl.length ? "" : ""}<div id="stMyTpl"></div>`;
  }
  function tplList() {
    const f = S.tplFilter, q = (f.q || "").toLowerCase();
    return TEMPLATES.filter((t) => (!f.cat || t.cat === f.cat) && (!f.style || t.style === f.style) && (!f.color || (PALETTES[t.pal].tags || []).includes(f.color))
      && (!f.orient || orientationOf(S.W, S.H) === f.orient || t.orient === f.orient)
      && (!q || [t.name, t.occasion, tText(t, "title", "en"), tText(t, "title", "hi"), tText(t, "title", "mr"), CATEGORIES[t.cat]].join(" ").toLowerCase().includes(q)));
  }
  const tplCards = () => {
    const list = tplList();
    return list.length ? list.map((t) => `<button class="st-tcard" onclick="STUDIO.useTpl('${t.id}')" title="${esc(t.name)}"><span class="st-thumb" data-tpl="${t.id}" style="aspect-ratio:${S.W}/${S.H}"></span><span class="st-tname">${esc(t.name)}</span><span class="st-tmeta">${esc(CATEGORIES[t.cat])} · ${esc(STYLES[t.style])}</span></button>`).join("")
      : `<p class="st-hint">No template matches. Clear a filter.</p>`;
  };
  async function fillThumbs() {
    const nodes = [...document.querySelectorAll("#stTplGrid [data-tpl]")];
    for (const n of nodes) {
      if (!S.open || S.panel !== "templates" || !document.body.contains(n)) return;
      const t = TEMPLATES.find((x) => x.id === n.dataset.tpl);
      try { const u = await tplThumb(t); n.style.backgroundImage = `url(${u})`; n.classList.add("ok"); } catch (e) { console.warn(e); }
      await new Promise((r) => setTimeout(r, 0));
    }
    // the owner's own saved templates
    await loadMyTpl();
    const m = $("stMyTpl");
    if (m && S.mytpl.length) m.innerHTML = `<h4 class="st-h">My saved templates</h4><div class="st-tgrid">${S.mytpl.map((t) => `<div class="st-tcard"><button class="st-thumb ok" style="background-image:url(${t.thumb || ""}); aspect-ratio:${t.w}/${t.h}" onclick="STUDIO.useMyTpl('${t.id}')"></button><span class="st-tname notr">${esc(t.name)}</span><button class="st-mini danger" onclick="STUDIO.delMyTpl('${t.id}')">Delete</button></div>`).join("")}</div>`;
  }

  function textPanel() {
    const b = brand(), fH = b.fontH || "Poppins", fB = b.fontB || "Poppins";
    return `<button class="st-text-add" style="font:800 26px '${fH}'" onclick="STUDIO.addText('h')">Add a heading</button>
      <button class="st-text-add" style="font:600 19px '${fB}'" onclick="STUDIO.addText('s')">Add a subheading</button>
      <button class="st-text-add" style="font:400 15px '${fB}'" onclick="STUDIO.addText('b')">Add body text</button>
      <button class="st-text-add" style="font:800 20px 'Noto Sans Devanagari'" onclick="STUDIO.addText('hi')">हिंदी शीर्षक जोड़ें</button>
      <button class="st-text-add" style="font:800 20px 'Mukta'" onclick="STUDIO.addText('mr')">मराठी शीर्षक जोडा</button>
      <h4 class="st-h">Font pairs</h4>
      ${[["Playfair Display", "Poppins", "Luxury"], ["Montserrat", "Inter", "Modern"], ["Bebas Neue", "Roboto Slab", "Bold"], ["Rozha One", "Mukta", "हिंदी"], ["Dancing Script", "Poppins", "Festive"]].map(([a, c, l]) =>
        `<button class="st-pair" onclick="STUDIO.addPair('${a}','${c}')"><b style="font-family:'${a}'">${l}</b><small style="font-family:'${c}'">${a} + ${c}</small></button>`).join("")}`;
  }
  function elementsPanel() {
    const shapes = [["rect", "▭ Rectangle"], ["round", "▢ Rounded"], ["circle", "● Circle"], ["tri", "▲ Triangle"], ["star", "★ Star"], ["line", "— Line"], ["arrow", "➜ Arrow"], ["ribbon", "🎗 Ribbon"], ["frame", "⬚ Page border"]];
    return `<h4 class="st-h">Shapes</h4><div class="st-chips">${shapes.map(([k, l]) => `<button onclick="STUDIO.addShape('${k}')">${l}</button>`).join("")}</div>
      <h4 class="st-h">Price & discount badges</h4><div class="st-chips">
        <button onclick="STUDIO.addBadge('disc')">% Discount badge</button><button onclick="STUDIO.addBadge('new')">NEW</button><button onclick="STUDIO.addBadge('sale')">SALE</button>
        <button onclick="STUDIO.addBadge('price')">₹ Price tag</button><button onclick="STUDIO.addBadge('offer')">Offer ribbon</button></div>
      <h4 class="st-h">Decorations</h4><div class="st-emoji">${EMOJI.map((e) => `<button onclick="STUDIO.addEmoji('${e}')">${e}</button>`).join("")}</div>
      <h4 class="st-h">Icons</h4><div class="st-emoji">${Object.keys(ICON_PATHS).map((k) => `<button onclick="STUDIO.addIcon('${k}')" title="${k}">${svgIcon(ICON_PATHS[k])}</button>`).join("")}${SPRITE_ICONS.map((k) => `<button onclick="STUDIO.addIcon('${k}')" title="${k}"><svg class="ic"><use href="#i-${k}"/></svg></button>`).join("")}</div>
      <h4 class="st-h">Brand</h4><div class="st-chips"><button onclick="STUDIO.addLogo()">🏷 Logo</button><button onclick="STUDIO.addContact()">📞 Contact details</button><button onclick="STUDIO.qrOpen()">▦ QR code</button></div>`;
  }
  const svgIcon = (body) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  function bgPanel() {
    const b = brand();
    const sw = [...(b.colors || []), "#FFFFFF", "#F8FAFC", "#FEF3C7", "#FCE7F3", "#E0F2FE", "#DCFCE7", "#111827", "#0F172A", "#062A1E", "#3B0A12", "#7C2D12", "#1E3A8A"].filter(Boolean);
    return `<h4 class="st-h">Colour</h4><div class="st-sw">${sw.map((c) => `<button style="background:${c}" onclick="STUDIO.bg('color','${c}')" title="${c}"></button>`).join("")}<input type="color" onchange="STUDIO.bg('color', this.value)" title="Any colour"></div>
      <h4 class="st-h">Gradient</h4><div class="st-sw">${Object.values(PALETTES).map((p) => `<button style="background:linear-gradient(160deg, ${p.bg1}, ${p.bg2})" onclick="STUDIO.bg('gradient','${p.bg1}','${p.bg2}')"></button>`).join("")}</div>
      <div class="st-row st-3"><input type="color" id="stG1" value="#0B1B4D"><input type="color" id="stG2" value="#1E3A8A"><input type="number" id="stGA" value="160" min="0" max="360" title="Angle"></div>
      <button class="st-btn" onclick="STUDIO.bg('gradient', document.getElementById('stG1').value, document.getElementById('stG2').value, +document.getElementById('stGA').value)">Use this gradient</button>
      <h4 class="st-h">Photo</h4><div class="st-chips"><button onclick="STUDIO.uploadPick('Backgrounds')">⬆ Upload a background</button><button onclick="STUDIO.panel('ai')">🤖 AI background</button><button onclick="STUDIO.bg('none')">Remove photo</button></div>
      <div id="stAssetGrid" class="st-agrid"><p class="st-hint">Loading the library…</p></div>`;
  }
  function productsPanel() {
    const q = (S.prodQ || "").toLowerCase();
    const list = st().inventory.filter((i) => !q || (i.name || "").toLowerCase().includes(q) || (i.category || "").toLowerCase().includes(q)).sort((a, b) => (a.name || "").localeCompare(b.name || "")).slice(0, 120);
    return `<input class="st-in" placeholder="Search stock…" value="${esc(S.prodQ || "")}" oninput="STUDIO.prodSearch(this.value)">
      <div class="st-row st-2"><label class="st-lab">Discount % (optional)<input type="number" min="0" max="90" value="${S.disc || ""}" placeholder="0" oninput="STUDIO.setDisc(this.value)"></label>
        <label class="st-lab">Selected<b>${S.products.length} / 6</b></label></div>
      <p class="st-hint">Prices come from Inventory. A discount is shown only if you type one here. Nothing is invented.</p>
      <div class="st-chips"><button class="st-primary" onclick="STUDIO.productAd()" ${S.products.length ? "" : "disabled"}>✨ Make product advertisement</button><button onclick="STUDIO.addProducts()" ${S.products.length ? "" : "disabled"}>➕ Add to this design</button></div>
      <div class="st-plist">${list.map((i) => { const on = S.products.includes(i.id), pic = i.photo || i.photoUrl || (S.itemPhoto[i.id] && SRC[S.itemPhoto[i.id]]);
        return `<div class="st-prow ${on ? "on" : ""}"><label><input type="checkbox" ${on ? "checked" : ""} onchange="STUDIO.prodPick('${esc(i.id)}', this.checked)">
          ${pic ? `<img src="${esc(pic)}" alt="">` : `<span class="st-nopic">📷</span>`}<span class="notr"><b>${esc(i.name)}</b><small>${esc(i.category || "")}${i.size && i.size !== "-" ? " · " + esc(i.size) : ""} · ${Number(i.price) > 0 ? "₹" + Number(i.price).toLocaleString("en-IN") + (i.unit && i.unit !== "-" ? "/" + esc(i.unit) : "") : "no price"}</small></span></label>
          ${pic ? "" : `<button class="st-mini" onclick="STUDIO.itemUpload('${esc(i.id)}')">Upload photo</button>`}</div>`; }).join("") || `<p class="st-hint">No products in Inventory yet.</p>`}</div>`;
  }
  function brandPanel() {
    const set = M().set || {}, kit = M().kit || {}, cols = (kit.colors || []).concat(["", "", "", "", "", ""]).slice(0, 6);
    const f = (id, label, val, ph, type) => `<label class="st-lab">${label}<input id="${id}" type="${type || "text"}" value="${esc(val || "")}" placeholder="${esc(ph || "")}"></label>`;
    return `<div class="st-logo">${SRC.logo ? `<img src="${SRC.logo}" alt="">` : `<span class="st-hint">No logo yet</span>`}
        <div><button class="st-btn" onclick="document.getElementById('stLogoFile').click()">⬆ Upload logo (PNG keeps a transparent background)</button>${SRC.logo ? `<button class="st-mini danger" onclick="STUDIO.logoRemove()">Remove</button>` : ""}</div></div>
      ${f("bkName", "Company name", kit.bizName || st().companyName, "Agrawal Ceramic City")}${f("bkTag", "Tagline", set.tagline, "Tiles • Sanitaryware • Fittings")}
      ${f("bkPhone", "Phone", set.phone, "", "tel")}${f("bkAddr", "Address", set.address)}${f("bkCity", "City", set.city)}${f("bkWeb", "Website", kit.website, "https://")}
      ${f("bkInsta", "Instagram link", kit.instagram, "https://instagram.com/…")}${f("bkFb", "Facebook link", kit.facebook, "https://facebook.com/…")}${f("bkYt", "YouTube link", kit.youtube, "https://youtube.com/…")}
      ${f("bkWa", "WhatsApp number (for the QR code)", kit.whatsapp || set.phone, "", "tel")}${f("bkMaps", "Google Maps link", kit.maps, "https://maps.app.goo.gl/…")}
      <label class="st-lab">Brand colours</label><div class="st-sw">${cols.map((c, i) => `<input type="color" id="bkC${i}" value="${c || "#ffffff"}" data-set="${c ? 1 : 0}" oninput="this.dataset.set=1">`).join("")}</div>
      <div class="st-row st-2"><label class="st-lab">Heading font${sel("bkFH", [["", "Template default"], ...FONTS.map((x) => [x, x])], kit.fontH || "", "")}</label>
        <label class="st-lab">Body font${sel("bkFB", [["", "Template default"], ...FONTS.map((x) => [x, x])], kit.fontB || "", "")}</label></div>
      <label class="st-lab">QR code opens${sel("bkQr", [["whatsapp", "WhatsApp chat"], ["maps", "Google Maps location"], ["website", "Website"], ["instagram", "Instagram"]], kit.qr || "whatsapp", "")}</label>
      <button class="st-btn st-primary" onclick="STUDIO.brandSave()">💾 Save Brand Kit</button>
      <p class="st-hint">The same name, links, phone and address are used in WhatsApp messages and in the daily automatic posts.</p>`;
  }
  function designsPanel() {
    const f = S.designFilter, folders = [...new Set((S.designs || []).map((d) => d.folder).filter(Boolean))];
    return `<div class="st-chips"><button class="st-primary" onclick="STUDIO.newDesign()">➕ New design</button><button onclick="STUDIO.saveAsTemplate()">⭐ Save as my template</button></div>
      <input class="st-in" placeholder="Search designs…" value="${esc(f.q)}" oninput="STUDIO.designSet('q', this.value)">
      ${sel("stDF", [["", "All folders"], ...folders.map((x) => [x, "📁 " + x])], f.folder, "STUDIO.designSet('folder', this.value)")}
      <div id="stDesignList" class="st-dlist"><p class="st-hint">Loading…</p></div>`;
  }
  function designList() {
    const f = S.designFilter, q = (f.q || "").toLowerCase();
    const list = (S.designs || []).filter((d) => (!f.folder || d.folder === f.folder) && (!q || (d.name || "").toLowerCase().includes(q))).sort((a, b) => (b.updatedMs || 0) - (a.updatedMs || 0));
    return list.length ? list.map((d) => `<div class="st-dcard ${d.id === S.id ? "on" : ""}"><button class="st-dthumb" style="background-image:url(${d.thumb || ""})" onclick="STUDIO.openDesign('${d.id}')"></button>
      <div class="st-dinfo"><b class="notr">${esc(d.name || "Untitled")}</b><small>${d.folder ? "📁 " + esc(d.folder) + " · " : ""}${d.w}×${d.h}<br>Created ${d.createdMs ? fmtD(new Date(d.createdMs)) : "-"} · Edited ${d.updatedMs ? fmtD(new Date(d.updatedMs)) : "-"}</small>
      <div class="st-dact"><button onclick="STUDIO.openDesign('${d.id}')">Open</button><button onclick="STUDIO.dupDesign('${d.id}')">Duplicate</button><button onclick="STUDIO.renameDesign('${d.id}')">Rename</button>
        <button onclick="STUDIO.moveDesign('${d.id}')">Folder</button><button onclick="STUDIO.quickDownload('${d.id}')">⬇ PNG</button><button class="danger" onclick="STUDIO.delDesign('${d.id}')">Delete</button></div></div></div>`).join("")
      : `<p class="st-hint">${(S.designs || []).length ? "No design matches." : "No saved designs yet. Press 💾 Save to keep this one."}</p>`;
  }
  function uploadsPanel() {
    const f = S.assetFilter, folders = [...new Set(["Products", "Logos", "Business", "Backgrounds", "AI images", ...(S.assets || []).map((a) => a.folder).filter(Boolean)])];
    return `<div class="st-chips"><button class="st-primary" onclick="STUDIO.uploadPick('${esc(f.folder || "Products")}')">⬆ Upload images</button></div>
      <p class="st-hint">JPG, PNG or WebP up to 15 MB. Large photos are made smaller (max 2000 px) to stay sharp and quick. PNG transparency is kept.</p>
      <div class="st-row st-2">${sel("stAF", [["", "All folders"], ...folders.map((x) => [x, "📁 " + x])], f.folder, "STUDIO.assetSet('folder', this.value)")}<input class="st-in" placeholder="Search…" value="${esc(f.q)}" oninput="STUDIO.assetSet('q', this.value)"></div>
      <div id="stAssetGrid" class="st-agrid"><p class="st-hint">Loading the library…</p></div>`;
  }
  function assetGrid(bgMode) {
    const f = S.assetFilter, q = (f.q || "").toLowerCase();
    const list = (S.assets || []).filter((a) => (!f.folder || a.folder === f.folder) && (!q || (a.name || "").toLowerCase().includes(q))).sort((a, b) => (b.createdMs || 0) - (a.createdMs || 0));
    return list.length ? list.map((a) => `<div class="st-acard"><button class="st-athumb" style="background-image:url(${a.thumb})" title="${esc(a.name)}" onclick="STUDIO.${bgMode ? "bgAsset" : "addAsset"}('${a.id}')"></button>
      <small class="notr">${esc(a.name || "")}</small><div class="st-aact">${bgMode ? "" : `<button onclick="STUDIO.bgAsset('${a.id}')" title="Use as background">BG</button>`}<button class="danger" onclick="STUDIO.delAsset('${a.id}')" title="Delete">✕</button></div></div>`).join("")
      : `<p class="st-hint">${(S.assets || []).length ? "Nothing in this folder." : "No images yet. Upload product photos, your logo or backgrounds."}</p>`;
  }

  /* ---------------- AI poster panel ---------------- */
  function keys2() { return { claude: !!S.claude, gemini: !!((M().secrets || {}).geminiKey || "").trim() }; }
  function aiPanel() {
    return `<textarea id="stAiPrompt" class="st-in" rows="5" placeholder="e.g. Create a premium Diwali promotional poster for a tile showroom. Use elegant gold and dark green colours, realistic luxury tile images, festive decorations and a 20% discount badge.">${esc(S.aiPrompt || "")}</textarea>
      <div class="st-row st-2">${sel("stAiLang", [["hi", "हिंदी"], ["mr", "मराठी"], ["en", "English"], ["hien", "हिंदी + English"]], S.lang, "")}${sel("stAiStyle", WRITING_STYLES.map((x) => [x, x]), S.aiStyle || "Premium", "")}</div>
      <label class="st-check"><input id="stAiProd" type="checkbox" ${S.products.length ? "checked" : ""}> Use the products picked in 📦 Products (${S.products.length})</label>
      <label class="st-check"><input id="stAiImg" type="checkbox" checked> Make a background picture with AI (Google)</label>
      <button class="st-btn st-primary" onclick="STUDIO.aiPoster()">✨ Generate poster</button>
      <div id="stAiStatus" class="st-status"></div>
      <h4 class="st-h">Only a picture</h4>
      <textarea id="stImgPrompt" class="st-in" rows="3" placeholder="e.g. luxury marble tile living room, warm light, no text"></textarea>
      <div class="st-chips"><button onclick="STUDIO.aiImage('add')">🖼 Add to design</button><button onclick="STUDIO.aiImage('bg')">🎨 Use as background</button></div>
      <div class="st-keys" id="stKeys">${keyStatus()}</div>`;
  }
  function keyStatus() {
    const k = keys2();
    return `<div>${k.claude ? "✅" : "⚪"} AI text (Claude) – ${k.claude ? "on" : "off: the developer turns it on in the developer console"}</div>
      <div>${k.gemini ? "✅" : "⚪"} AI pictures (Google) – ${k.gemini ? "on (model " + esc(imageModel()) + "). Google charges per picture." : "off: add your Google Gemini API key in 🎬 Marketing → ⚙ Settings"}</div>`;
  }
  const imageModel = () => ((M().set || {}).imageModel || "imagen-4.0-generate-001").trim();

  /* ---------------- AI writer panel ---------------- */
  function writerPanel() {
    const w = S.writer || {};
    return `<div class="st-row st-2">${sel("wrWhat", [["product", "Product advertisement"], ["discount", "Discount announcement"], ["festival", "Festival greeting"], ["arrivals", "New arrivals"], ["promotion", "Business promotion"], ["custom", "Something else"]], w.what || "product", "")}
        ${sel("wrLang", [["hi", "हिंदी"], ["mr", "मराठी"], ["en", "English"]], w.lang || (S.lang === "hien" ? "hi" : S.lang), "")}</div>
      ${sel("wrStyle", WRITING_STYLES.map((x) => [x, x]), w.style || "Attractive", "")}
      <textarea id="wrInfo" class="st-in" rows="3" placeholder="Details, e.g. Diwali, 20% off on Kajaria floor tiles till 30 Nov">${esc(w.info || "")}</textarea>
      <p class="st-hint">Uses the ${S.products.length} product(s) picked in 📦 Products with their real prices.</p>
      <button class="st-btn st-primary" onclick="STUDIO.write()">✍️ ${w.res ? "Write again" : "Write with AI"}</button>
      <div id="wrOut">${w.res ? writerOut(w.res, w.ai) : ""}</div>`;
  }
  function writerOut(r, ai) {
    const group = (k, label, items) => !items || !items.length ? "" : `<h4 class="st-h">${label}</h4>${items.map((t, i) => `<div class="st-wr"><textarea class="st-in notr" rows="${Math.min(6, Math.max(2, Math.ceil(String(t).length / 38)))}" id="wr_${k}_${i}">${esc(t)}</textarea>
      <div class="st-chips"><button onclick="STUDIO.wrUse('${k}', ${i}, 'add')">➕ Add</button><button onclick="STUDIO.wrUse('${k}', ${i}, 'replace')">↺ Replace selected</button><button onclick="STUDIO.wrUse('${k}', ${i}, 'copy')">⧉ Copy</button></div></div>`).join("")}`;
    return `${ai ? "" : `<p class="st-hint">⚪ AI writing is off (the developer turns it on). These are ready-made lines, not written by AI.</p>`}` +
      group("head", "Headlines", r.headlines) + group("slogan", "Slogans", r.slogans) + group("desc", "Descriptions", r.descriptions) + group("hl", "Product highlights", r.highlights) +
      group("greet", "Greeting", r.greeting ? [r.greeting] : []) + group("disc", "Discount announcement", r.discount ? [r.discount] : []) + group("cta", "Call to action", r.cta) +
      group("ig", "Instagram caption", r.instagram ? [r.instagram] : []) + group("wa", "WhatsApp message", r.whatsapp ? [r.whatsapp] : []) + group("tags", "Hashtags", r.hashtags && r.hashtags.length ? [r.hashtags.join(" ")] : []);
  }

  /* ================= properties (right) ================= */
  function props() {
    const el = $("stProps"); if (!el || !S.cv) return;
    const o = S.cv.getActiveObject();
    const stEl = document.getElementById("studio"), had = stEl.classList.contains("has-sel");
    stEl.classList.toggle("has-sel", !!o);
    if (window.innerWidth < 900 && had !== !!o) setTimeout(fit, 0); // phones: keep the design above the bottom sheet
    if (!o) {
      const b = bgObj();
      el.innerHTML = `<div class="st-ph"><b>Page</b></div>
        <label class="st-lab">Size${sel("stPSize", sizeOptions(), S.sizeKey, "STUDIO.sizePick(this.value)")}</label>
        <div class="st-row st-2"><label class="st-lab">Width px<input type="number" id="stPW" value="${S.W}" min="100" max="5000"></label><label class="st-lab">Height px<input type="number" id="stPH" value="${S.H}" min="100" max="5000"></label></div>
        <button class="st-btn" onclick="STUDIO.customSize(+document.getElementById('stPW').value, +document.getElementById('stPH').value)">Apply size</button>
        <label class="st-lab">Background colour<input type="color" value="${b && typeof b.fill === "string" ? b.fill : "#ffffff"}" onchange="STUDIO.bg('color', this.value)"></label>
        <label class="st-lab">Grid size<input type="number" value="${S.gridSize}" min="5" max="200" onchange="STUDIO.gridSize(this.value)"></label>
        <p class="st-hint">Tap an element to edit it. Drag to move, use the corners to resize and the top handle to rotate. Double-tap text to type.</p>
        <div class="st-keys"><b>Shortcuts</b><br>Ctrl+Z undo · Ctrl+Y redo · Ctrl+C / Ctrl+V copy & paste · Ctrl+D duplicate · Delete · Arrows move (Shift = 10 px)</div>`;
      return;
    }
    const multi = o.type === "activeSelection", isText = /text/i.test(o.type) && o.type !== "activeSelection", isImg = o.type === "image", isGroup = o.type === "group";
    const v = (x) => Math.round(Number(x) || 0);
    const common = `<div class="st-row st-4"><button class="st-mini" onclick="STUDIO.act('dup')" title="Duplicate (Ctrl+D)">⧉ Copy</button><button class="st-mini" onclick="STUDIO.act('lock')">${o.locked ? "🔓 Unlock" : "🔒 Lock"}</button>
        <button class="st-mini" onclick="STUDIO.act('front')" title="Bring forward">⬆ Forward</button><button class="st-mini" onclick="STUDIO.act('back')" title="Send backward">⬇ Back</button></div>
      <div class="st-row st-4"><button class="st-mini" onclick="STUDIO.act('top')">⇈ To front</button><button class="st-mini" onclick="STUDIO.act('bottom')">⇊ To back</button><button class="st-mini" onclick="STUDIO.act('copy')">Copy</button><button class="st-mini danger" onclick="STUDIO.act('del')">🗑 Delete</button></div>
      <label class="st-lab">Align on the page</label><div class="st-row st-6">${[["l", "⇤"], ["c", "↔"], ["r", "⇥"], ["t", "⤒"], ["m", "↕"], ["b", "⤓"]].map(([k, l]) => `<button class="st-mini" onclick="STUDIO.align('${k}')" title="${k}">${l}</button>`).join("")}</div>
      ${multi ? `<div class="st-row st-2"><button class="st-mini" onclick="STUDIO.act('group')">Group</button><button class="st-mini" onclick="STUDIO.act('spread')">Space evenly</button></div>` : ""}
      ${isGroup ? `<button class="st-mini" onclick="STUDIO.act('ungroup')">Ungroup</button>` : ""}
      <label class="st-lab">Transparency <span id="stOpV">${v((o.opacity ?? 1) * 100)}%</span><input type="range" min="0" max="100" value="${v((o.opacity ?? 1) * 100)}" oninput="STUDIO.set('opacity', this.value / 100); document.getElementById('stOpV').innerText = this.value + '%'"></label>
      <div class="st-row st-2"><label class="st-check"><input type="checkbox" ${o.shadow ? "checked" : ""} onchange="STUDIO.shadow(this.checked)"> Shadow</label>
        <label class="st-lab">Rotate°<input type="number" value="${v(o.angle)}" onchange="STUDIO.set('angle', +this.value)"></label></div>
      <div class="st-row st-4"><label class="st-lab">X<input type="number" value="${v(o.left)}" onchange="STUDIO.set('left', +this.value)"></label><label class="st-lab">Y<input type="number" value="${v(o.top)}" onchange="STUDIO.set('top', +this.value)"></label>
        <label class="st-lab">W<input type="number" value="${v(o.getScaledWidth())}" onchange="STUDIO.sizeTo('w', +this.value)"></label><label class="st-lab">H<input type="number" value="${v(o.getScaledHeight())}" onchange="STUDIO.sizeTo('h', +this.value)"></label></div>`;
    let body = "";
    if (isText) {
      const fam = String(o.fontFamily || "").split(",")[0].replace(/['"]/g, "").trim();
      body = `<label class="st-lab">Text<textarea class="st-in notr" rows="3" oninput="STUDIO.set('text', this.value)">${esc(o.text || "")}</textarea></label>
        <label class="st-lab">Font${sel("stFont", FONTS.map((x) => [x, x]), fam, "STUDIO.set('fontFamily', STUDIO.stack(this.value))")}</label>
        <div class="st-row st-2"><label class="st-lab">Size<input type="number" min="6" max="600" value="${v(o.fontSize)}" oninput="STUDIO.set('fontSize', +this.value)"></label>
          <label class="st-lab">Weight${sel("stWt", [[300, "Light"], [400, "Regular"], [500, "Medium"], [600, "Semi-bold"], [700, "Bold"], [800, "Extra bold"], [900, "Black"]], o.fontWeight === "bold" ? 700 : o.fontWeight || 400, "STUDIO.set('fontWeight', +this.value)")}</label></div>
        <div class="st-row st-4">${[["left", "⯇"], ["center", "≡"], ["right", "⯈"], ["justify", "☰"]].map(([a, l]) => `<button class="st-mini ${o.textAlign === a ? "on" : ""}" onclick="STUDIO.set('textAlign','${a}'); STUDIO.refresh()">${l}</button>`).join("")}</div>
        <div class="st-row st-3"><button class="st-mini ${o.fontStyle === "italic" ? "on" : ""}" onclick="STUDIO.set('fontStyle', '${o.fontStyle === "italic" ? "normal" : "italic"}'); STUDIO.refresh()"><i>I</i> Italic</button>
          <button class="st-mini ${o.underline ? "on" : ""}" onclick="STUDIO.set('underline', ${!o.underline}); STUDIO.refresh()"><u>U</u> Underline</button>
          <button class="st-mini" onclick="STUDIO.set('text', STUDIO.upper())">Aa CAPS</button></div>
        <div class="st-row st-2"><label class="st-lab">Colour<input type="color" value="${typeof o.fill === "string" && o.fill.startsWith("#") ? o.fill : "#111111"}" oninput="STUDIO.set('fill', this.value)"></label>
          <label class="st-lab">Highlight<input type="color" value="${o.textBackgroundColor || "#ffffff"}" oninput="STUDIO.set('textBackgroundColor', this.value)"></label></div>
        <div class="st-row st-2"><label class="st-lab">Line height<input type="number" step="0.05" min="0.6" max="3" value="${o.lineHeight || 1.16}" oninput="STUDIO.set('lineHeight', +this.value)"></label>
          <label class="st-lab">Letter spacing<input type="number" step="10" min="-200" max="1000" value="${o.charSpacing || 0}" oninput="STUDIO.set('charSpacing', +this.value)"></label></div>
        <div class="st-row st-2"><label class="st-lab">Outline<input type="color" value="${o.stroke || "#000000"}" oninput="STUDIO.set('stroke', this.value)"></label>
          <label class="st-lab">Outline width<input type="number" min="0" max="20" value="${o.strokeWidth || 0}" oninput="STUDIO.set('strokeWidth', +this.value)"></label></div>
        <button class="st-mini" onclick="STUDIO.set('textBackgroundColor', ''); STUDIO.refresh()">No highlight</button>`;
    } else if (isImg) {
      body = (o.ph ? `<div class="st-ph-box">📷 This is a photo space.<div class="st-chips"><button class="st-primary" onclick="STUDIO.pickReplace()">⬆ Upload a photo</button><button onclick="STUDIO.panel('uploads')">From library</button><button onclick="STUDIO.panel('products')">From stock</button></div></div>` : "")
        + (o.kind === "qr" ? `<label class="st-lab">QR code opens<input class="st-in notr" value="${esc(o.qrData || "")}" onchange="STUDIO.qrSet(this.value)"></label>` : "")
        + `<div class="st-chips"><button onclick="STUDIO.pickReplace()">⇄ Replace image</button>${o.kind === "qr" ? "" : `<button onclick="STUDIO.cropOpen()">✂ Crop</button><button onclick="STUDIO.removeBgOpen()">🪄 Remove background</button>`}
          <button onclick="STUDIO.flip('x')">⇋ Flip</button><button onclick="STUDIO.flip('y')">⇵ Flip</button><button onclick="STUDIO.bgFromSel()">Make background</button></div>
        <div class="st-row st-2"><label class="st-lab">Border colour<input type="color" value="${o.stroke || "#ffffff"}" oninput="STUDIO.set('stroke', this.value)"></label><label class="st-lab">Border width<input type="number" min="0" max="80" value="${o.strokeWidth || 0}" oninput="STUDIO.set('strokeWidth', +this.value)"></label></div>
        <label class="st-lab">Rounded corners<input type="range" min="0" max="50" value="${o.clipPath && o.clipPath.rx ? Math.round(o.clipPath.rx / (o.width / 2) * 100) : 0}" oninput="STUDIO.round(+this.value)"></label>
        ${imgQuality(o)}`;
    } else if (isGroup && (o.kind === "badge" || o.kind === "price")) {
      const texts = o.getObjects().filter((x) => /text/i.test(x.type));
      body = texts.map((t, i) => `<label class="st-lab">${i === 0 ? "Text" : "Old price"}<input class="st-in notr" value="${esc(t.text)}" oninput="STUDIO.groupText(${i}, this.value)"></label>`).join("")
        + `<div class="st-row st-2"><label class="st-lab">Colour<input type="color" value="${colorOf(o.getObjects()[0].fill)}" oninput="STUDIO.groupFill(this.value)"></label><label class="st-lab">Text colour<input type="color" value="${colorOf(texts[0] && texts[0].fill)}" oninput="STUDIO.groupTextFill(this.value)"></label></div>`;
    } else if (!multi && !isGroup) {
      const isLine = o.type === "line";
      body = `${isLine ? "" : `<label class="st-lab">Fill<input type="color" value="${colorOf(o.fill)}" oninput="STUDIO.set('fill', this.value)"></label>
        <div class="st-row st-3"><input type="color" id="stF1" value="${colorOf(o.fill && o.fill.colorStops ? o.fill.colorStops[0].color : o.fill)}"><input type="color" id="stF2" value="#ffffff"><button class="st-mini" onclick="STUDIO.fillGrad(document.getElementById('stF1').value, document.getElementById('stF2').value)">Gradient</button></div>
        <button class="st-mini" onclick="STUDIO.set('fill', ''); STUDIO.refresh()">No fill</button>`}
        <div class="st-row st-2"><label class="st-lab">${isLine ? "Line colour" : "Border colour"}<input type="color" value="${colorOf(o.stroke)}" oninput="STUDIO.set('stroke', this.value)"></label>
          <label class="st-lab">${isLine ? "Thickness" : "Border width"}<input type="number" min="0" max="100" value="${o.strokeWidth || 0}" oninput="STUDIO.set('strokeWidth', +this.value)"></label></div>
        ${o.type === "rect" ? `<label class="st-lab">Rounded corners<input type="number" min="0" max="1000" value="${v(o.rx)}" oninput="STUDIO.set('rx', +this.value); STUDIO.set('ry', +this.value)"></label>` : ""}
        <label class="st-check"><input type="checkbox" ${o.strokeDashArray ? "checked" : ""} onchange="STUDIO.set('strokeDashArray', this.checked ? [18, 12] : null)"> Dashed border</label>`;
    }
    el.innerHTML = `<div class="st-ph"><b class="notr">${esc(multi ? o.getObjects().length + " elements" : o.name || o.type)}</b><button class="st-ib st-close" onclick="STUDIO.deselect()" title="Done">✓</button></div>${o.locked ? `<p class="st-hint">🔒 Locked: unlock to move or resize it.</p>` : ""}${body}<h4 class="st-h">Arrange</h4>${common}`;
  }
  const colorOf = (f) => (typeof f === "string" && /^#[0-9a-f]{6}$/i.test(f) ? f : typeof f === "string" && /^#[0-9a-f]{3}$/i.test(f) ? "#" + f.slice(1).split("").map((c) => c + c).join("") : "#ffffff");
  function imgQuality(o) {
    const nat = o._element ? o._element.naturalWidth : 0, shown = o.getScaledWidth(), k = nat ? shown / (o.width || nat) : 1;
    return k > 1.6 ? `<p class="st-warn">⚠ This photo is enlarged ${k.toFixed(1)}× – it may look blurry when printed. Use a bigger photo.</p>` : "";
  }

  /* ================= editing actions ================= */
  const active = () => S.cv.getActiveObject();
  function set(k, val) {
    const o = active(); if (!o) return;
    if (o.locked && ["left", "top", "angle"].includes(k)) return toast("Unlock it first");
    if (o.type === "activeSelection" && k !== "opacity") { o.getObjects().forEach((x) => x.set(k, val)); }
    else o.set(k, val);
    if (k === "fontFamily" || k === "fontSize" || k === "text" || k === "fontWeight" || k === "charSpacing" || k === "lineHeight") { o.initDimensions && o.initDimensions(); }
    o.setCoords(); S.cv.requestRenderAll(); S.dirty = true; savedMark(); schedHist();
  }
  const refresh = () => props();
  function sizeTo(dim, val) {
    const o = active(); if (!o || !(val > 0)) return;
    if (dim === "w") { const k = val / o.getScaledWidth(); o.set({ scaleX: o.scaleX * k, scaleY: o.scaleY * k }); } else { const k = val / o.getScaledHeight(); o.set({ scaleX: o.scaleX * k, scaleY: o.scaleY * k }); }
    o.setCoords(); S.cv.requestRenderAll(); pushHist(); props();
  }
  function shadow(on) { set("shadow", on ? new (F().Shadow)({ color: "rgba(0,0,0,0.35)", blur: 20, offsetX: 0, offsetY: 8 }) : null); }
  function lockObj(o, on) {
    o.locked = on;
    o.set({ lockMovementX: on, lockMovementY: on, lockScalingX: on, lockScalingY: on, lockRotation: on, hasControls: !on, hoverCursor: on ? "default" : "move" });
  }
  function center(o) { const r = o.getBoundingRect(true, true); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r }; }
  function align(k) {
    const o = active(); if (!o) return;
    const { r } = center(o);
    const dx = { l: -r.left, c: S.W / 2 - (r.left + r.width / 2), r: S.W - (r.left + r.width) }[k], dy = { t: -r.top, m: S.H / 2 - (r.top + r.height / 2), b: S.H - (r.top + r.height) }[k];
    o.set({ left: o.left + (dx || 0), top: o.top + (dy || 0) }); o.setCoords(); S.cv.requestRenderAll(); pushHist(); props();
  }
  async function act(a) {
    const cv = S.cv, o = active();
    if (a === "paste") return paste();
    if (!o) return;
    if (a === "del") { if (o.type === "activeSelection") o.getObjects().forEach((x) => cv.remove(x)); else cv.remove(o); cv.discardActiveObject(); cv.requestRenderAll(); pushHist(); return props(); }
    if (a === "dup") return clone(o, 24);
    if (a === "copy") { o.clone((c) => { S.clip = c; toast("Copied"); }, PROPS); return; }
    if (a === "lock") { const list = o.type === "activeSelection" ? o.getObjects() : [o]; const on = !o.locked; list.forEach((x) => lockObj(x, on)); o.locked = on; cv.requestRenderAll(); pushHist(); return props(); }
    if (a === "front") cv.bringForward(o); if (a === "back") { cv.sendBackwards(o); keepBgBottom(); }
    if (a === "top") cv.bringToFront(o); if (a === "bottom") { cv.sendToBack(o); keepBgBottom(); }
    if (a === "group" && o.type === "activeSelection") { o.toGroup(); }
    if (a === "ungroup" && o.type === "group") { o.toActiveSelection(); }
    if (a === "spread" && o.type === "activeSelection") {
      const list = o.getObjects().slice().sort((p, q) => p.left - q.left); cv.discardActiveObject();
      const rs = list.map((x) => x.getBoundingRect(true, true)), first = rs[0].left, last = rs[rs.length - 1].left + rs[rs.length - 1].width, total = rs.reduce((s, r) => s + r.width, 0), gap = (last - first - total) / Math.max(1, list.length - 1);
      let x = first; list.forEach((it, i) => { it.set({ left: it.left + (x - rs[i].left) }); it.setCoords(); x += rs[i].width + gap; });
      cv.setActiveObject(new (F().ActiveSelection)(list, { canvas: cv }));
    }
    cv.requestRenderAll(); pushHist(); props();
  }
  const keepBgBottom = () => { const b = bgObj(); if (b) S.cv.sendToBack(b); };
  function clone(o, off) {
    o.clone((c) => {
      S.cv.discardActiveObject();
      c.set({ left: c.left + off, top: c.top + off, evented: true });
      if (c.type === "activeSelection") { c.canvas = S.cv; c.forEachObject((x) => S.cv.add(x)); c.setCoords(); } else S.cv.add(c);
      S.cv.setActiveObject(c); S.cv.requestRenderAll(); pushHist();
    }, PROPS);
  }
  function paste() { if (!S.clip) return toast("Nothing copied yet"); clone(S.clip, 30); S.clip.set({ left: S.clip.left + 30, top: S.clip.top + 30 }); }
  function deselect() { S.cv.discardActiveObject(); S.cv.requestRenderAll(); props(); }
  function addObj(o, keepPos) {
    if (!o) return;
    if (!keepPos) { const r = o.getBoundingRect(true, true); o.set({ left: S.W / 2 - r.width / 2 + (o.left - r.left), top: S.H / 2 - r.height / 2 + (o.top - r.top) }); }
    S.cv.add(o); S.cv.setActiveObject(o); o.setCoords(); S.cv.requestRenderAll(); pushHist(); props();
    if (window.innerWidth < 900) hidePanel();
  }
  async function addText(k) {
    const b = brand(), W = S.W, s = W / 1080;
    const P = { h: [b.fontH || "Poppins", 84, 800, "Add a heading"], s: [b.fontB || "Poppins", 46, 600, "Add a subheading"], b: [b.fontB || "Poppins", 30, 400, "Add your text here"], hi: ["Noto Sans Devanagari", 80, 800, "अपना शीर्षक यहाँ लिखें"], mr: ["Mukta", 80, 800, "तुमचे शीर्षक येथे लिहा"] }[k];
    addObj(await fromSpec({ t: "text", text: P[3], left: 0, top: 0, w: W * 0.8, size: P[1] * s, weight: P[2], font: P[0], fill: darkPage() ? "#FFFFFF" : "#111827", align: "center", name: k === "h" || k === "hi" || k === "mr" ? "Heading" : k === "s" ? "Subheading" : "Text" }));
  }
  async function addPair(a, c) {
    const s = S.W / 1080, col = darkPage() ? "#FFFFFF" : "#111827";
    const t1 = await fromSpec({ t: "text", text: "Your Heading", left: S.W * 0.1, top: S.H * 0.4, w: S.W * 0.8, size: 88 * s, weight: 800, font: a, fill: col, align: "center", name: "Heading" });
    const t2 = await fromSpec({ t: "text", text: "A short line about your offer", left: S.W * 0.1, top: S.H * 0.4 + 120 * s, w: S.W * 0.8, size: 38 * s, weight: 400, font: c, fill: col, align: "center", name: "Subheading" });
    S.cv.add(t1); S.cv.add(t2); S.cv.setActiveObject(new (F().ActiveSelection)([t1, t2], { canvas: S.cv })); S.cv.requestRenderAll(); pushHist(); props();
  }
  function darkPage() { const b = bgObj(); if (!b) return false; const f = b.fill; const c = typeof f === "string" ? f : f && f.colorStops ? f.colorStops[0].color : b.type === "image" ? "#000000" : "#FFFFFF"; return lum(colorOf(c)) < 0.4; }
  async function addShape(k) {
    const Fb = F(), s = S.W / 1080, col = brand().colors[0] || "#2563EB";
    let o;
    if (k === "rect") o = new Fb.Rect({ width: 400 * s, height: 260 * s, fill: col, name: "Rectangle" });
    if (k === "round") o = new Fb.Rect({ width: 400 * s, height: 260 * s, rx: 40 * s, ry: 40 * s, fill: col, name: "Rounded rectangle" });
    if (k === "circle") o = new Fb.Circle({ radius: 160 * s, fill: col, name: "Circle" });
    if (k === "tri") o = new Fb.Triangle({ width: 320 * s, height: 280 * s, fill: col, name: "Triangle" });
    if (k === "star") { const pts = []; for (let i = 0; i < 10; i++) { const r = (i % 2 ? 70 : 170) * s, a = Math.PI / 5 * i - Math.PI / 2; pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r }); } o = new Fb.Polygon(pts, { fill: "#FACC15", name: "Star" }); }
    if (k === "line") o = new Fb.Line([0, 0, 500 * s, 0], { stroke: col, strokeWidth: 8 * s, name: "Line" });
    if (k === "arrow") o = new Fb.Polygon([{ x: 0, y: 40 }, { x: 300, y: 40 }, { x: 300, y: 0 }, { x: 400, y: 70 }, { x: 300, y: 140 }, { x: 300, y: 100 }, { x: 0, y: 100 }].map((p) => ({ x: p.x * s, y: p.y * s })), { fill: col, name: "Arrow" });
    if (k === "ribbon") o = new Fb.Polygon([{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 560, y: 55 }, { x: 600, y: 110 }, { x: 0, y: 110 }, { x: 40, y: 55 }].map((p) => ({ x: p.x * s, y: p.y * s })), { fill: "#DC2626", name: "Ribbon" });
    if (k === "frame") { o = new Fb.Rect({ left: 24 * s, top: 24 * s, width: S.W - 48 * s, height: S.H - 48 * s, fill: "", stroke: col, strokeWidth: 10 * s, name: "Page border" }); return addObj(o, true); }
    addObj(o);
  }
  async function addBadge(k) {
    const s = S.W / 1080;
    if (k === "price") return addObj(priceObj("₹0", "", 0, 0, 48 * s, "#FACC15", "#111111"));
    if (k === "offer") { const r = await fromSpec({ t: "poly", points: [[0, 0], [620 * s, 0], [580 * s, 55 * s], [620 * s, 110 * s], [0, 110 * s], [40 * s, 55 * s]], fill: "#DC2626", name: "Ribbon" }); const t = await fromSpec({ t: "text", text: S.lang === "en" ? "LIMITED OFFER" : S.lang === "mr" ? "मर्यादित ऑफर" : "सीमित ऑफ़र", left: 50 * s, top: 28 * s, w: 520 * s, size: 46 * s, weight: 900, font: "Montserrat", fill: "#FFFFFF", align: "center", name: "Ribbon text" }); return addObj(new (F().Group)([r, t], { name: "Offer ribbon" })); }
    const text = { disc: S.disc ? S.disc + "% OFF" : "20% OFF", new: "NEW", sale: "SALE" }[k];
    addObj(badgeObj(text, 0, 0, 120 * s, k === "new" ? "#16A34A" : "#DC2626", "#FFFFFF", -12));
  }
  async function addEmoji(e) { addObj(await fromSpec({ t: "emoji", text: e, left: 0, top: 0, size: 160 * S.W / 1080 })); }
  function addIcon(k) {
    const body = ICON_PATHS[k] || (document.getElementById("i-" + k) ? document.getElementById("i-" + k).innerHTML : "");
    if (!body) return;
    const col = darkPage() ? "#FFFFFF" : brand().colors[0] || "#111827";
    F().loadSVGFromString(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`, (objects, opts) => {
      const g = F().util.groupSVGElements(objects, opts); const k2 = (140 * S.W / 1080) / 24;
      g.set({ scaleX: k2, scaleY: k2, name: "Icon " + k }); addObj(g);
    });
  }
  async function addLogo() {
    if (!SRC.logo) { toast("Upload your logo in 🏷 Brand Kit first"); return panel("brand"); }
    addObj(await fromSpec({ t: "image", src: "logo", left: 0, top: 0, w: 260 * S.W / 1080, h: 260 * S.W / 1080, fit: "contain", name: "Logo" }));
  }
  async function addContact() {
    const b = brand(), lines = [b.phone && "📞 " + b.phone, b.address && "📍 " + b.address, b.website && "🌐 " + b.website, (M().kit || {}).instagram && "📷 " + String(M().kit.instagram).replace(/^https?:\/\/(www\.)?/, "")].filter(Boolean);
    if (!lines.length) { toast("Add your phone and address in 🏷 Brand Kit first"); return panel("brand"); }
    addObj(await fromSpec({ t: "text", text: lines.join("\n"), left: 0, top: 0, w: S.W * 0.7, size: 32 * S.W / 1080, weight: 600, font: brand().fontB || "Poppins", fill: darkPage() ? "#FFFFFF" : "#111827", align: "left", lh: 1.35, name: "Contact details", kind: "contact" }));
  }
  function qrOpen() {
    const t = qrTargets();
    dialog(`<h3>▦ QR code</h3><p class="st-hint">Customers scan it with their phone camera.</p>
      ${[["whatsapp", "WhatsApp chat", t.whatsapp], ["maps", "Google Maps location", t.maps], ["website", "Website", t.website], ["instagram", "Instagram", t.instagram]].map(([k, l, u]) =>
        `<label class="st-check"><input type="radio" name="stQr" value="${esc(u)}" ${u ? "" : "disabled"} ${k === ((M().kit || {}).qr || "whatsapp") && u ? "checked" : ""}> ${l} ${u ? `<small class="notr">${esc(u)}</small>` : `<small>(add it in Brand Kit)</small>`}</label>`).join("")}
      <label class="st-check"><input type="radio" name="stQr" value="custom"> Your own link or text</label><input id="stQrText" class="st-in notr" placeholder="https://…">
      <div class="st-dbtn"><button class="st-btn" onclick="STUDIO.dialog(null)">Cancel</button><button class="st-btn st-primary" onclick="STUDIO.qrAdd()">Add QR code</button></div>`);
  }
  async function qrAdd() {
    const r = document.querySelector('input[name="stQr"]:checked');
    let text = r ? r.value : ""; if (text === "custom") text = ($("stQrText").value || "").trim();
    if (!text) return toast("Choose what the QR code opens");
    dialog(null);
    addObj(await qrObject(text, 0, 0, 260 * S.W / 1080));
  }
  async function qrSet(text) {
    const o = active(); if (!o || o.kind !== "qr" || !text) return;
    const src = await qrDataUrl(text); const w = o.getScaledWidth();
    o.setSrc(src, () => { o.set({ qrData: text, scaleX: w / o.width, scaleY: w / o.width }); S.cv.requestRenderAll(); pushHist(); }, { crossOrigin: "anonymous" });
  }
  function groupText(i, val) { const o = active(); if (!o || o.type !== "group") return; const t = o.getObjects().filter((x) => /text/i.test(x.type))[i]; if (!t) return; t.set("text", val); t.initDimensions && t.initDimensions();
    if (o.kind === "price" && i === 0) { const r = o.getObjects()[0]; r.set("width", t.width + t.fontSize); }
    o.addWithUpdate && o.addWithUpdate(); S.cv.requestRenderAll(); schedHist(); }
  function groupFill(c) { const o = active(); if (!o || o.type !== "group") return; o.getObjects()[0].set("fill", c); S.cv.requestRenderAll(); schedHist(); }
  function groupTextFill(c) { const o = active(); if (!o || o.type !== "group") return; o.getObjects().filter((x) => /text/i.test(x.type)).slice(0, 1).forEach((t) => t.set("fill", c)); S.cv.requestRenderAll(); schedHist(); }
  function fillGrad(a, b) { const o = active(); if (!o) return; const w = o.width, h = o.height; o.set("fill", new (F().Gradient)({ type: "linear", coords: { x1: -w / 2, y1: -h / 2, x2: w / 2, y2: h / 2 }, colorStops: [{ offset: 0, color: a }, { offset: 1, color: b }] })); S.cv.requestRenderAll(); pushHist(); }
  function flip(ax) { const o = active(); if (!o) return; o.set(ax === "x" ? "flipX" : "flipY", !o[ax === "x" ? "flipX" : "flipY"]); S.cv.requestRenderAll(); pushHist(); }
  function round(pct) { const o = active(); if (!o || o.type !== "image") return; if (!pct) { o.clipPath = null; } else { const r = (Math.min(o.width, o.height) / 2) * (pct / 50); o.clipPath = new (F().Rect)({ width: o.width, height: o.height, rx: r, ry: r, originX: "center", originY: "center" }); } o.dirty = true; S.cv.requestRenderAll(); schedHist(); }

  /* ================= crop and background removal ================= */
  function cropOpen() {
    const o = active(); if (!o || o.type !== "image") return;
    const el = o._element, nw = el.naturalWidth, nh = el.naturalHeight;
    const c = { l: Math.round((o.cropX || 0) / nw * 100), t: Math.round((o.cropY || 0) / nh * 100), r: Math.round((nw - (o.cropX || 0) - o.width) / nw * 100), b: Math.round((nh - (o.cropY || 0) - o.height) / nh * 100) };
    dialog(`<h3>✂ Crop</h3><p class="st-hint">Cut away part of the photo (percent of the photo).</p>
      ${[["l", "Left"], ["r", "Right"], ["t", "Top"], ["b", "Bottom"]].map(([k, l]) => `<label class="st-lab">${l} <span id="cr_${k}v">${c[k]}%</span><input type="range" id="cr_${k}" min="0" max="90" value="${c[k]}" oninput="document.getElementById('cr_${k}v').innerText=this.value+'%'; STUDIO.cropApply(true)"></label>`).join("")}
      <div class="st-dbtn"><button class="st-btn" onclick="STUDIO.cropReset()">Reset</button><button class="st-btn st-primary" onclick="STUDIO.cropApply(); STUDIO.dialog(null)">Done</button></div>`);
  }
  function cropApply(live) {
    const o = active(); if (!o || o.type !== "image") return;
    if (!$("cr_l")) return;
    const el = o._element, nw = el.naturalWidth, nh = el.naturalHeight, g = (k) => Number(($("cr_" + k) || {}).value || 0) / 100;
    let l = g("l"), r = g("r"), t = g("t"), b = g("b");
    if (l + r > 0.95) r = 0.95 - l; if (t + b > 0.95) b = 0.95 - t;
    const shownW = o.getScaledWidth(), kx = shownW / o.width;
    o.set({ cropX: nw * l, cropY: nh * t, width: nw * (1 - l - r), height: nh * (1 - t - b), scaleX: kx, scaleY: kx });
    if (o.clipPath) o.clipPath.set({ width: o.width, height: o.height });
    o.setCoords(); S.cv.requestRenderAll(); if (!live) pushHist();
  }
  function cropReset() { ["l", "r", "t", "b"].forEach((k) => { if ($("cr_" + k)) { $("cr_" + k).value = 0; $("cr_" + k + "v").innerText = "0%"; } }); cropApply(true); }
  function removeBgOpen() {
    dialog(`<h3>🪄 Remove background</h3><p class="st-hint">Works on photos with a plain background (white, grey or one colour) – for example a product photographed on a sheet or a wall. The colour at the edges of the photo is removed.</p>
      <label class="st-lab">Strength <span id="rbV">32</span><input type="range" id="rbT" min="5" max="90" value="32" oninput="document.getElementById('rbV').innerText=this.value"></label>
      <div class="st-dbtn"><button class="st-btn" onclick="STUDIO.dialog(null)">Cancel</button><button class="st-btn st-primary" onclick="STUDIO.removeBg(+document.getElementById('rbT').value)">Remove background</button></div>`);
  }
  async function removeBg(tol) {
    const o = active(); if (!o || o.type !== "image") return;
    dialog(null); loading(true);
    try {
      const out = cutOut(o._element, tol);
      const key = await saveAssetData(out, "Background removed – " + (o.name || "photo"), "Products", "edit");
      await new Promise((res) => o.setSrc(out, res, { crossOrigin: "anonymous" }));
      o.set({ srcKey: key, ph: false }); S.cv.requestRenderAll(); pushHist(); props(); toast("Background removed");
    } catch (e) { console.error(e); toast("Could not remove the background: " + e.message); }
    finally { loading(false); }
  }
  // flood fill from the edges: pixels close to the edge colour become transparent (softened at the border)
  function cutOut(el, tol) {
    const maxS = 1600, k = Math.min(1, maxS / Math.max(el.naturalWidth, el.naturalHeight)), w = Math.round(el.naturalWidth * k), h = Math.round(el.naturalHeight * k);
    const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"); g.drawImage(el, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h), p = d.data;
    const sample = []; for (let x = 0; x < w; x += Math.max(1, w >> 5)) sample.push((0 * w + x) * 4, ((h - 1) * w + x) * 4); for (let y = 0; y < h; y += Math.max(1, h >> 5)) sample.push((y * w) * 4, (y * w + w - 1) * 4);
    let r0 = 0, g0 = 0, b0 = 0; sample.forEach((i) => { r0 += p[i]; g0 += p[i + 1]; b0 += p[i + 2]; }); r0 /= sample.length; g0 /= sample.length; b0 /= sample.length;
    const T = tol * 2.2, seen = new Uint8Array(w * h), stack = [];
    for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x); for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
    const dist = (i) => Math.sqrt((p[i] - r0) ** 2 + (p[i + 1] - g0) ** 2 + (p[i + 2] - b0) ** 2);
    while (stack.length) {
      const n = stack.pop(); if (seen[n]) continue; seen[n] = 1;
      const i = n * 4, dd = dist(i); if (dd > T) continue;
      p[i + 3] = dd > T * 0.7 ? Math.round(255 * (dd - T * 0.7) / (T * 0.3)) : 0;
      const x = n % w, y = (n / w) | 0;
      if (x > 0) stack.push(n - 1); if (x < w - 1) stack.push(n + 1); if (y > 0) stack.push(n - w); if (y < h - 1) stack.push(n + w);
    }
    g.putImageData(d, 0, 0);
    return c.toDataURL("image/png");
  }

  /* ================= media library ================= */
  async function loadAssets(force) {
    if (S.assets && !force) return S.assets;
    try { const s = await getDocs(C("mktAssets")); S.assets = s.docs.map((d) => { const x = d.data(); return { id: d.id, ...x, createdMs: x.createdAt && x.createdAt.toDate ? x.createdAt.toDate().getTime() : x.createdMs || 0 }; }); }
    catch (e) { console.warn(e); S.assets = []; if (e.code === "permission-denied") toast("The owner must publish the latest firestore.rules in Firebase first"); }
    return S.assets;
  }
  // a picture made small enough for the database (under ~900 KB); PNG keeps transparency
  async function prepImage(src, maxSide, keepPng) {
    const im = await imgEl(src); if (!im) throw new Error("This file is not a picture that can be opened");
    let side = Math.min(maxSide, Math.max(im.naturalWidth, im.naturalHeight));
    const has = keepPng && hasAlpha(im);
    for (let tries = 0; tries < 8; tries++) {
      const k = side / Math.max(im.naturalWidth, im.naturalHeight), w = Math.max(1, Math.round(im.naturalWidth * k)), h = Math.max(1, Math.round(im.naturalHeight * k));
      const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d");
      if (!has) { g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, w, h); } g.drawImage(im, 0, 0, w, h);
      const q = 0.9 - tries * 0.07, out = has ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", Math.max(0.5, q));
      if (out.length < 920000) return { img: out, w, h };
      side = Math.round(side * 0.82);
    }
    throw new Error("The picture is too large even after making it smaller");
  }
  function hasAlpha(im) {
    const c = document.createElement("canvas"), k = Math.min(1, 200 / Math.max(im.naturalWidth, im.naturalHeight)); c.width = Math.max(1, im.naturalWidth * k); c.height = Math.max(1, im.naturalHeight * k);
    const g = c.getContext("2d"); g.drawImage(im, 0, 0, c.width, c.height); const p = g.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < p.length; i += 16) if (p[i] < 250) return true; return false;
  }
  async function thumbOf(src, w) { const r = await prepImage(src, w || 240, true); return r.img.length < 60000 ? r.img : (await prepImage(src, 160, false)).img; }
  async function saveAssetData(src, name, folder, kind) {
    const prepared = await prepImage(src, kind === "logo" ? 900 : 2000, true), thumb = await thumbOf(prepared.img);
    const ref = doc(C("mktAssets")), id = ref.id;
    await setDoc(D("mktAssetData", id), { img: prepared.img });
    await setDoc(ref, { name: String(name || "Image").slice(0, 80), folder: folder || "", kind: kind || "upload", w: prepared.w, h: prepared.h, thumb, bytes: prepared.img.length, createdAt: serverTimestamp(), createdMs: Date.now(), by: st().name || "" });
    SRC["asset:" + id] = prepared.img;
    if (S.assets) S.assets.push({ id, name, folder, kind, w: prepared.w, h: prepared.h, thumb, createdMs: Date.now() });
    return "asset:" + id;
  }
  const fileUrl = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error("Could not read the file")); r.readAsDataURL(f); });
  function checkFile(f) {
    if (!f || !/^image\//.test(f.type)) return "Only pictures (JPG, PNG, WebP) can be uploaded";
    if (f.size > 15 * 1024 * 1024) return "This picture is bigger than 15 MB";
    return "";
  }
  function uploadPick(folder) { S.upFolder = folder || S.assetFilter.folder || "Products"; $("stFile").click(); }
  async function uploadFiles(input) {
    const files = [...(input.files || [])]; input.value = "";
    if (!files.length) return;
    loading(true); let n = 0, last = null;
    try {
      for (const f of files) {
        const bad = checkFile(f); if (bad) { toast(f.name + ": " + bad); continue; }
        last = await saveAssetData(await fileUrl(f), f.name.replace(/\.[a-z0-9]+$/i, ""), S.upFolder || "Products", "upload"); n++;
      }
      toast(n ? `${n} picture(s) added to the library` : "Nothing uploaded");
      if (n === 1 && last && S.panel !== "backgrounds") await addAssetKey(last);
      else if (n === 1 && last && S.panel === "backgrounds") await setBg({ type: "image", src: SRC[last], srcKey: last });
    } catch (e) { console.error(e); toast(e.code === "permission-denied" ? "The owner must publish the latest firestore.rules in Firebase first" : "Upload failed: " + e.message); }
    finally { loading(false); panel(S.panel); }
  }
  async function addAssetKey(key, keepPh) {
    const src = await srcFor(key); const im = await fabricImage(src); if (!im) return;
    const k = Math.min(S.W * 0.6 / im.width, S.H * 0.5 / im.height, 1.5); im.set({ scaleX: k, scaleY: k, srcKey: key, name: "Photo" });
    addObj(im);
  }
  const addAsset = (id) => addAssetKey("asset:" + id);
  async function bgAsset(id) { const src = await srcFor("asset:" + id); await setBg({ type: "image", src, srcKey: "asset:" + id }); toast("Background changed"); }
  async function delAsset(id) {
    if (!(await askConfirm("Delete this picture from the library? Designs that use it will show an empty space."))) return;
    try { await deleteDoc(D("mktAssetData", id)); await deleteDoc(D("mktAssets", id)); S.assets = (S.assets || []).filter((a) => a.id !== id); delete SRC["asset:" + id]; panel(S.panel); toast("Deleted"); }
    catch (e) { toast(e.message); }
  }
  // replace the selected picture / photo space
  function pickReplace() { $("stFile1").click(); }
  async function replaceFile(input) {
    const f = input.files && input.files[0]; input.value = "";
    if (!f) return; const bad = checkFile(f); if (bad) return toast(bad);
    loading(true);
    try { const key = await saveAssetData(await fileUrl(f), f.name.replace(/\.[a-z0-9]+$/i, ""), "Products", "upload"); await replaceWith(key); }
    catch (e) { toast(e.message); } finally { loading(false); }
  }
  async function replaceWith(key) {
    const o = active();
    if (!o || o.type !== "image") return addAssetKey(key);
    const src = await srcFor(key), box = { x: o.left, y: o.top, w: o.phW && o.ph ? o.phW : o.getScaledWidth(), h: o.phH && o.ph ? o.phH : o.getScaledHeight() }, rx = o.clipPath ? o.clipPath.rx * o.scaleX : 0;
    await new Promise((res) => o.setSrc(src, res, { crossOrigin: "anonymous" }));
    o.clipPath = null; placeIn(o, box.x, box.y, box.w, box.h, "cover", rx);
    o.set({ srcKey: key, ph: false, name: "Photo" }); S.cv.requestRenderAll(); pushHist(); props();
  }
  function bgFromSel() { const o = active(); if (!o || o.type !== "image") return; const key = o.srcKey, src = o._element.src; S.cv.remove(o); setBg({ type: "image", src, srcKey: key }); }

  /* ================= stock products ================= */
  function prodPick(id, on) { S.products = on ? [...new Set([...S.products, id])].slice(0, 6) : S.products.filter((x) => x !== id); panel("products"); }
  function itemUpload(id) { S.upItem = id; $("stItemFile").click(); }
  async function itemFile(input) {
    const f = input.files && input.files[0]; input.value = ""; if (!f || !S.upItem) return;
    const bad = checkFile(f); if (bad) return toast(bad);
    loading(true);
    try { const it = st().inventory.find((x) => x.id === S.upItem); const key = await saveAssetData(await fileUrl(f), it ? it.name : "Product", "Products", "product"); S.itemPhoto[S.upItem] = key; if (!S.products.includes(S.upItem)) S.products.push(S.upItem); toast("Photo added for this design"); }
    catch (e) { toast(e.message); } finally { loading(false); panel("products"); }
  }
  async function productAd() {
    if (!S.products.length) return toast("Pick products first");
    const tpl = TEMPLATES.find((t) => t.id === (S.products.length === 1 ? "product_ad" : S.disc > 0 ? "discount" : S.products.length > 4 ? "catalogue" : "arrivals"));
    await applyTemplate(tpl, false);
  }
  async function addProducts() {
    const list = productData(S.products); if (!list.length) return;
    const s = S.W / 1080, n = list.length, cols = n === 1 ? 1 : n <= 4 ? 2 : 3, cw = (S.W * 0.84 - (cols - 1) * 20 * s) / cols, ch = cw * 1.15, x0 = S.W * 0.08, y0 = S.H * 0.3;
    const added = [];
    for (let i = 0; i < n; i++) {
      const p = list[i], cx = x0 + (i % cols) * (cw + 20 * s), cy = y0 + Math.floor(i / cols) * (ch + 20 * s);
      const specs = [{ t: "rect", left: cx, top: cy, w: cw, h: ch, fill: "#FFFFFF", rx: 20 * s, shadow: true, name: "Product card" },
        { t: "image", src: p.hasPhoto ? "item:" + p.id : "placeholder", itemId: p.id, left: cx + 10 * s, top: cy + 10 * s, w: cw - 20 * s, h: ch * 0.72, fit: "cover", rx: 14 * s, name: "Photo – " + p.name },
        { t: "text", text: p.name + (p.size && p.size !== "-" ? " · " + p.size : ""), left: cx + 16 * s, top: cy + ch * 0.76, w: cw - 32 * s, size: 30 * s * (n === 1 ? 1.3 : 1), weight: 700, font: "Poppins", fill: "#111827", align: "left", name: "Product name" }];
      if (p.price > 0) { const now = S.disc > 0 ? Math.round(p.price * (1 - S.disc / 100)) : p.price; specs.push({ t: "price", text: "₹" + now.toLocaleString("en-IN") + (p.unit && p.unit !== "-" ? "/" + p.unit : ""), old: S.disc > 0 ? "₹" + p.price.toLocaleString("en-IN") : "", left: cx + 20 * s, top: cy + 20 * s, size: 30 * s, fill: "#FACC15", color: "#111111" }); }
      for (const sp of specs) { const f = await fromSpec(sp); if (f) { S.cv.add(f); added.push(f); } }
    }
    S.cv.setActiveObject(new (F().ActiveSelection)(added, { canvas: S.cv })); S.cv.requestRenderAll(); pushHist(); props(); toast("Products added. Move them where you like");
  }

  /* ================= Brand Kit ================= */
  async function brandSave() {
    const g = (id) => ($(id) ? $(id).value.trim() : "");
    const colors = [0, 1, 2, 3, 4, 5].map((i) => ($("bkC" + i) && $("bkC" + i).dataset.set === "1" ? $("bkC" + i).value : "")).filter(Boolean);
    const kit = { bizName: g("bkName"), website: g("bkWeb"), instagram: g("bkInsta"), facebook: g("bkFb"), youtube: g("bkYt"), whatsapp: g("bkWa"), maps: g("bkMaps"), colors, fontH: g("bkFH"), fontB: g("bkFB"), qr: g("bkQr") || "whatsapp" };
    const set = { tagline: g("bkTag"), phone: g("bkPhone"), address: g("bkAddr"), city: g("bkCity") };
    try {
      loading(true);
      await setDoc(D("brand", "kit"), kit, { merge: true });
      await setDoc(D("settings", "marketing"), set, { merge: true });
      Object.assign(M().kit, kit); Object.assign(M().set, set);
      Object.keys(thumbs).forEach((k) => delete thumbs[k]);
      toast("Brand Kit saved");
    } catch (e) { toast(e.code === "permission-denied" ? "The owner must publish the latest firestore.rules in Firebase first" : e.message); }
    finally { loading(false); }
  }
  async function logoFile(input) {
    const f = input.files && input.files[0]; input.value = ""; if (!f) return;
    const bad = checkFile(f); if (bad) return toast(bad);
    loading(true);
    try { const r = await prepImage(await fileUrl(f), 900, true); await setDoc(D("brand", "logo"), { img: r.img, updatedAt: serverTimestamp() }); SRC.logo = r.img; Object.keys(thumbs).forEach((k) => delete thumbs[k]); toast("Logo saved"); }
    catch (e) { toast(e.message); } finally { loading(false); panel("brand"); }
  }
  async function logoRemove() { if (!(await askConfirm("Remove the logo?"))) return; try { await deleteDoc(D("brand", "logo")); SRC.logo = ""; panel("brand"); } catch (e) { toast(e.message); } }

  /* ================= My Designs ================= */
  const setName = (n) => { S.name = n; if ($("stName")) $("stName").value = n; };
  function savedMark() { const el = $("stSaved"); if (el) el.innerText = S.dirty ? "● Not saved" : S.id ? "✓ Saved" : ""; }
  async function loadDesigns(force) {
    if (S.designs && !force) return S.designs;
    try { const s = await getDocs(C("mktDesigns")); S.designs = s.docs.map((d) => ({ id: d.id, ...d.data() })); }
    catch (e) { S.designs = []; if (e.code === "permission-denied") toast("The owner must publish the latest firestore.rules in Firebase first"); }
    return S.designs;
  }
  // every image must be in the library before the design is saved
  async function persistImages() {
    for (const o of S.cv.getObjects()) {
      const list = o.type === "group" ? o.getObjects() : [o];
      for (const x of list) if (x.type === "image" && (!x.srcKey || x.srcKey === "inline") && !x.isBg) { x.srcKey = await saveAssetData(x._element.src, x.name || "Photo", "Business", "upload"); }
      if (o.isBg && o.type === "image" && (!o.srcKey || o.srcKey === "inline")) o.srcKey = await saveAssetData(o._element.src, "Background", "Backgrounds", "upload");
    }
  }
  async function save(asNew) {
    if (!S.cv) return;
    loading(true);
    try {
      S.cv.discardActiveObject(); S.cv.requestRenderAll();
      await persistImages();
      const data = serial(true), json = JSON.stringify(data);
      if (json.length > 950000) throw new Error("This design is too big to save. Remove some elements or photos");
      const thumb = (await renderEl(Math.min(1, 360 / Math.max(S.W, S.H)))).toDataURL("image/jpeg", 0.75);
      const now = Date.now(), id = !asNew && S.id ? S.id : doc(C("mktDesigns")).id;
      const meta = { name: S.name || "Untitled design", folder: S.folder || "", w: S.W, h: S.H, sizeKey: S.sizeKey, thumb, updatedMs: now, updatedAt: serverTimestamp(), by: st().name || "" };
      const was = (S.designs || []).find((d) => d.id === id);
      if (!was) { meta.createdMs = now; meta.createdAt = serverTimestamp(); }
      await setDoc(D("mktDesignData", id), { json, v: 1 });
      await setDoc(D("mktDesigns", id), meta, { merge: true });
      S.id = id; S.dirty = false; savedMark();
      if (S.designs) { const i = S.designs.findIndex((d) => d.id === id); if (i >= 0) S.designs[i] = { ...S.designs[i], ...meta }; else S.designs.push({ id, ...meta }); }
      toast("Design saved");
      if (S.panel === "designs") panel("designs");
    } catch (e) { console.error(e); toast(e.code === "permission-denied" ? "The owner must publish the latest firestore.rules in Firebase first" : "Could not save: " + e.message); }
    finally { loading(false); }
  }
  async function openDesign(id) {
    if (S.dirty && S.id !== id && objs().length && !(await askConfirm("Open another design? Changes since the last save will be lost."))) return;
    loading(true);
    try {
      const [m, d] = await Promise.all([getDoc(D("mktDesigns", id)), getDoc(D("mktDesignData", id))]);
      if (!d.exists()) throw new Error("This design could not be found");
      S.restoring = true; await loadData(JSON.parse(d.data().json)); S.restoring = false;
      S.id = id; setName(m.exists() ? m.data().name : "Design"); S.folder = m.exists() ? m.data().folder || "" : "";
      S.hist = []; S.hi = -1; pushHist(); S.dirty = false; savedMark(); props();
      if (window.innerWidth < 900) hidePanel();
    } catch (e) { console.error(e); toast(e.message); } finally { S.restoring = false; loading(false); }
  }
  async function newDesign() {
    if (S.dirty && objs().length && !(await askConfirm("Start a new design? Changes since the last save will be lost."))) return;
    S.id = null; S.folder = ""; setName("Untitled design"); S.restoring = true; objs().forEach((o) => S.cv.remove(o)); setBg({ type: "color", colors: ["#FFFFFF"] }, true); S.restoring = false;
    S.hist = []; S.hi = -1; pushHist(); S.dirty = false; savedMark(); props(); panel("templates");
  }
  async function dupDesign(id) {
    try { loading(true); const [m, d] = await Promise.all([getDoc(D("mktDesigns", id)), getDoc(D("mktDesignData", id))]); const nid = doc(C("mktDesigns")).id, now = Date.now();
      await setDoc(D("mktDesignData", nid), d.data()); await setDoc(D("mktDesigns", nid), { ...m.data(), name: (m.data().name || "Design") + " (copy)", createdMs: now, updatedMs: now, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      S.designs = null; await loadDesigns(); panel("designs"); toast("Duplicated"); } catch (e) { toast(e.message); } finally { loading(false); }
  }
  async function renameDesign(id) {
    const d = (S.designs || []).find((x) => x.id === id); if (!d) return;
    const n = await ctx.askText("New name", d.name || ""); if (n === null || !n.trim()) return;
    try { await updateDoc(D("mktDesigns", id), { name: n.trim().slice(0, 80) }); d.name = n.trim(); if (S.id === id) setName(d.name); panel("designs"); } catch (e) { toast(e.message); }
  }
  async function moveDesign(id) {
    const d = (S.designs || []).find((x) => x.id === id); if (!d) return;
    const n = await ctx.askText("Folder name (empty = no folder)", d.folder || ""); if (n === null) return;
    try { await updateDoc(D("mktDesigns", id), { folder: n.trim().slice(0, 40) }); d.folder = n.trim(); if (S.id === id) S.folder = d.folder; panel("designs"); } catch (e) { toast(e.message); }
  }
  async function delDesign(id) {
    if (!(await askConfirm("Delete this design permanently?"))) return;
    try { await deleteDoc(D("mktDesignData", id)); await deleteDoc(D("mktDesigns", id)); S.designs = (S.designs || []).filter((d) => d.id !== id); if (S.id === id) { S.id = null; S.dirty = true; savedMark(); } panel("designs"); toast("Deleted"); }
    catch (e) { toast(e.message); }
  }
  async function quickDownload(id) {
    loading(true);
    try {
      const d = await getDoc(D("mktDesignData", id)), data = JSON.parse(d.data().json), m = (S.designs || []).find((x) => x.id === id) || {};
      const keep = snapshot(), keepId = S.id, keepName = S.name, keepDirty = S.dirty;
      S.restoring = true; await loadData(data);
      const el = await renderEl(1); const blob = await new Promise((r) => el.toBlob(r, "image/png"));
      await loadData(JSON.parse(keep)); S.restoring = false; S.id = keepId; setName(keepName); S.dirty = keepDirty; savedMark();
      downloadBlob(blob, (m.name || "design") + ".png");
    } catch (e) { console.error(e); toast(e.message); } finally { S.restoring = false; loading(false); }
  }
  // the owner's own templates
  async function loadMyTpl(force) { if (S.mytpl && !force) return S.mytpl; try { const s = await getDocs(C("mktTemplates")); S.mytpl = s.docs.map((d) => ({ id: d.id, ...d.data() })); } catch (e) { S.mytpl = []; } return S.mytpl; }
  async function saveAsTemplate() {
    const n = await ctx.askText("Template name", S.name || "My template"); if (n === null || !n.trim()) return;
    loading(true);
    try { S.cv.discardActiveObject(); await persistImages(); const json = JSON.stringify(serial(true)); if (json.length > 950000) throw new Error("This design is too big to keep as a template");
      const thumb = (await renderEl(Math.min(1, 300 / Math.max(S.W, S.H)))).toDataURL("image/jpeg", 0.75), id = doc(C("mktTemplates")).id;
      await setDoc(D("mktTemplates", id), { name: n.trim().slice(0, 60), json, thumb, w: S.W, h: S.H, createdMs: Date.now(), createdAt: serverTimestamp() });
      S.mytpl = null; toast("Saved in Templates → My saved templates"); } catch (e) { toast(e.message); } finally { loading(false); }
  }
  async function useMyTpl(id) {
    const t = (S.mytpl || []).find((x) => x.id === id); if (!t) return;
    if (S.dirty && objs().length && !(await askConfirm("Replace the current design with this template?"))) return;
    loading(true); try { S.restoring = true; await loadData(JSON.parse(t.json)); S.restoring = false; S.id = null; setName(t.name); pushHist(); S.dirty = true; savedMark(); } catch (e) { toast(e.message); } finally { S.restoring = false; loading(false); }
  }
  async function delMyTpl(id) { if (!(await askConfirm("Delete this template?"))) return; try { await deleteDoc(D("mktTemplates", id)); S.mytpl = (S.mytpl || []).filter((t) => t.id !== id); panel("templates"); } catch (e) { toast(e.message); } }

  /* ================= export ================= */
  async function renderEl(mult, transparent) {
    const cv = S.cv;
    await loadFonts();
    S.exporting = true;
    const act0 = cv.getActiveObject(), b = bgObj(), keepBgc = cv.backgroundColor, guides = S.guides;
    cv.discardActiveObject(); S.guides = [];
    if (transparent) { if (b) b.visible = false; cv.backgroundColor = null; }
    let el;
    try {
      el = cv.toCanvasElement((mult || 1) / cv.getZoom()); // the full design size × mult, whatever the zoom on screen
      const W = Math.round(S.W * (mult || 1)), H = Math.round(S.H * (mult || 1));
      if (el.width !== W || el.height !== H) { const c = document.createElement("canvas"); c.width = W; c.height = H; c.getContext("2d").drawImage(el, 0, 0, W, H); el = c; }
    }
    finally {
      if (b) b.visible = true; cv.backgroundColor = keepBgc; S.guides = guides; S.exporting = false;
      if (act0 && cv.getObjects().includes(act0)) cv.setActiveObject(act0);
      cv.requestRenderAll();
    }
    return el;
  }
  const QUAL = { std: ["Standard", 1], high: ["High (2×)", 2], print: ["Print (300 dpi)", 0] };
  const printMult = () => (SIZES[S.sizeKey] && SIZES[S.sizeKey].mm ? 2 : 3);
  function exportOpen() {
    const mm = SIZES[S.sizeKey] && SIZES[S.sizeKey].mm;
    dialog(`<h3>⬇ Download</h3>
      <label class="st-lab">Format</label><div class="st-row st-3">${["png", "jpg", "pdf"].map((f) => `<label class="st-check"><input type="radio" name="exF" value="${f}" ${f === (S.exF || "png") ? "checked" : ""} onchange="STUDIO.exSync()"> ${f.toUpperCase()}</label>`).join("")}</div>
      <label class="st-lab">Quality</label><div class="st-row st-3">${Object.entries(QUAL).map(([k, [l]]) => `<label class="st-check"><input type="radio" name="exQ" value="${k}" ${k === (S.exQ || "high") ? "checked" : ""}> ${l}</label>`).join("")}</div>
      <label class="st-check" id="exTrWrap"><input type="checkbox" id="exTr"> Transparent background (PNG only)</label>
      <div id="exPdf"><label class="st-check"><input type="checkbox" id="exBleed" ${mm ? "" : "disabled"}> Add 3 mm bleed and crop marks for the printer ${mm ? "" : "(print sizes only)"}</label></div>
      <p class="st-hint" id="exInfo"></p>
      <div class="st-dbtn"><button class="st-btn" onclick="STUDIO.dialog(null)">Cancel</button><button class="st-btn st-primary" onclick="STUDIO.doExport()">Download</button></div>`);
    exSync();
  }
  function exSync() {
    const f = (document.querySelector('input[name="exF"]:checked') || {}).value || "png";
    if ($("exTrWrap")) $("exTrWrap").style.display = f === "png" ? "" : "none";
    if ($("exPdf")) $("exPdf").style.display = f === "pdf" ? "" : "none";
    const mm = SIZES[S.sizeKey] && SIZES[S.sizeKey].mm;
    if ($("exInfo")) $("exInfo").innerText = `Design size ${S.W} × ${S.H} px. Print quality gives ${S.W * printMult()} × ${S.H * printMult()} px` + (mm ? ` (${mm[0]} × ${mm[1]} mm at 300 dpi).` : ".");
  }
  async function doExport() {
    const f = (document.querySelector('input[name="exF"]:checked') || {}).value || "png", q = (document.querySelector('input[name="exQ"]:checked') || {}).value || "high";
    const tr = f === "png" && $("exTr") && $("exTr").checked, bleed = f === "pdf" && $("exBleed") && $("exBleed").checked;
    S.exF = f; S.exQ = q; dialog(null);
    const mult = q === "print" ? printMult() : QUAL[q][1];
    if (S.W * S.H * mult * mult > 40e6) return toast("That is too large for this device. Choose a lower quality");
    loading(true);
    try {
      const el = await renderEl(mult, tr), base = (S.name || "design").replace(/[^\wऀ-ॿ -]+/g, "").trim() || "design";
      if (f === "png") downloadBlob(await new Promise((r) => el.toBlob(r, "image/png")), base + ".png");
      else if (f === "jpg") downloadBlob(await new Promise((r) => el.toBlob(r, "image/jpeg", 0.93)), base + ".jpg");
      else {
        const jpg = new Uint8Array(await (await new Promise((r) => el.toBlob(r, "image/jpeg", 0.95))).arrayBuffer());
        const mm = SIZES[S.sizeKey] && SIZES[S.sizeKey].mm;
        const trim = mm ? mm : [S.W / 96 * 25.4, S.H / 96 * 25.4];
        downloadBlob(new Blob([makePdf(jpg, el.width, el.height, trim[0], trim[1], bleed ? 3 : 0, bleed)], { type: "application/pdf" }), base + ".pdf");
      }
      toast("Downloaded");
    } catch (e) { console.error(e); toast("Could not export: " + e.message); } finally { loading(false); }
  }
  function downloadBlob(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  // a one-page PDF with the picture (sizes in mm); bleed: the picture fills the bleed area and crop marks show the trim
  function makePdf(jpg, pw, ph, wmm, hmm, bleedMm, marks) {
    const pt = (mm) => mm * 72 / 25.4, slug = marks ? 8 : 0;
    const W = pt(wmm + 2 * (bleedMm + slug)), H = pt(hmm + 2 * (bleedMm + slug)), bx = pt(slug), by = pt(slug), bw = pt(wmm + 2 * bleedMm), bh = pt(hmm + 2 * bleedMm);
    const tx = pt(slug + bleedMm), ty = pt(slug + bleedMm), tw = pt(wmm), th = pt(hmm);
    // the design covers the bleed box (keeps proportions, a sliver is trimmed)
    const k = Math.max(bw / pw, bh / ph), iw = pw * k, ih = ph * k, ix = bx + (bw - iw) / 2, iy = by + (bh - ih) / 2;
    let content = `q ${iw.toFixed(2)} 0 0 ${ih.toFixed(2)} ${ix.toFixed(2)} ${iy.toFixed(2)} cm /Im0 Do Q\n`;
    if (marks) {
      const m = pt(5), g = pt(bleedMm + 1);
      content += "0.5 w 0 G\n";
      [[tx, ty], [tx + tw, ty], [tx, ty + th], [tx + tw, ty + th]].forEach(([x, y], i) => {
        const sx = i % 2 ? 1 : -1, sy = i < 2 ? -1 : 1;
        content += `${(x + sx * g).toFixed(2)} ${y.toFixed(2)} m ${(x + sx * (g + m)).toFixed(2)} ${y.toFixed(2)} l S\n${x.toFixed(2)} ${(y + sy * g).toFixed(2)} m ${x.toFixed(2)} ${(y + sy * (g + m)).toFixed(2)} l S\n`;
      });
    }
    const enc = new TextEncoder(), parts = [], offs = [];
    let len = 0; const push = (x) => { const b = typeof x === "string" ? enc.encode(x) : x; parts.push(b); len += b.length; };
    const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); body(); push("\nendobj\n"); };
    push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    obj(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
    obj(2, () => push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"));
    obj(3, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W.toFixed(2)} ${H.toFixed(2)}] ${bleedMm ? `/BleedBox [${bx.toFixed(2)} ${by.toFixed(2)} ${(bx + bw).toFixed(2)} ${(by + bh).toFixed(2)}] ` : ""}/TrimBox [${tx.toFixed(2)} ${ty.toFixed(2)} ${(tx + tw).toFixed(2)} ${(ty + th).toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
    obj(4, () => { push(`<< /Type /XObject /Subtype /Image /Width ${pw} /Height ${ph} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`); push(jpg); push("\nendstream"); });
    obj(5, () => { const c = enc.encode(content); push(`<< /Length ${c.length} >>\nstream\n`); push(c); push("\nendstream"); });
    const xref = len;
    push(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map((n) => String(offs[n]).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    const out = new Uint8Array(len); let p = 0; parts.forEach((b) => { out.set(b, p); p += b.length; });
    return out;
  }
  async function preview() {
    loading(true);
    try { const el = await renderEl(1); dialog(`<div class="st-prev"><img src="${el.toDataURL("image/png")}" alt=""></div><p class="st-hint">${S.W} × ${S.H} px – this is exactly what will be downloaded (at Standard quality).</p><div class="st-dbtn"><button class="st-btn" onclick="STUDIO.dialog(null)">Close</button><button class="st-btn st-primary" onclick="STUDIO.exportOpen()">⬇ Download</button></div>`, true); }
    finally { loading(false); }
  }

  /* ================= design review ================= */
  function reviewList() {
    const out = [], W = S.W, H = S.H, list = objs().filter((o) => o.visible !== false);
    const texts = list.filter((o) => /text/i.test(o.type) && o.text && o.text.trim());
    const fonts = new Set(texts.map((t) => String(t.fontFamily).split(",")[0].replace(/['"]/g, "").trim()));
    const margin = Math.min(W, H) * 0.03;
    texts.forEach((t) => {
      const px = t.fontSize * t.scaleY;
      if (px < W * 0.022) out.push({ lvl: "warn", t: `“${short(t.text)}” is small (${Math.round(px)} px)`, d: "Small text is hard to read on phones and from a distance.", fix: () => { t.set({ fontSize: Math.round(W * 0.028 / t.scaleY) }); t.initDimensions(); } });
      const col = typeof t.fill === "string" ? colorOf(t.fill) : null, bgc = colourBehind(t);
      if (col && bgc) { const cr = contrast(col, bgc); if (cr < 3) out.push({ lvl: "warn", t: `Low contrast: “${short(t.text)}”`, d: `Contrast ${cr.toFixed(1)}:1 against what is behind it (aim for at least 4.5:1).`, fix: () => { const w = contrast("#FFFFFF", bgc) > contrast("#111111", bgc) ? "#FFFFFF" : "#111111"; t.set({ fill: w, shadow: new (F().Shadow)({ color: w === "#FFFFFF" ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.6)", blur: 10 }) }); } }); }
      if (t.text.length > 180 && px < W * 0.035) out.push({ lvl: "info", t: `A lot of text in “${short(t.text)}”`, d: "Posters work best with short lines. Keep the main message under about 15 words." });
    });
    if (fonts.size > 3) { const counts = {}; texts.forEach((t) => { const f = String(t.fontFamily).split(",")[0].replace(/['"]/g, "").trim(); counts[f] = (counts[f] || 0) + t.text.length; }); const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 2).map((x) => x[0]);
      out.push({ lvl: "info", t: `${fonts.size} different fonts`, d: "Two fonts (one for headings, one for the rest) look more professional.", fix: () => texts.forEach((t) => { const f = String(t.fontFamily).split(",")[0].replace(/['"]/g, "").trim(); if (!top.includes(f)) { t.set("fontFamily", fontStack(top[1] || top[0])); t.initDimensions(); } }) }); }
    list.forEach((o) => {
      if (o.isBg) return;
      const r = o.getBoundingRect(true, true), full = r.width > W * 0.95 || r.height > H * 0.95;
      if (full) return;
      const out1 = r.left < -1 || r.top < -1 || r.left + r.width > W + 1 || r.top + r.height > H + 1;
      const near = !out1 && (r.left < margin || r.top < margin || r.left + r.width > W - margin || r.top + r.height > H - margin) && /text|qr/i.test(o.type + (o.kind || ""));
      if (out1 && r.width < W && r.height < H && !/Decoration|Corner|border|Footer|band/i.test(o.name || "")) out.push({ lvl: "warn", t: `“${o.name || o.type}” goes off the page`, d: "Part of it will be cut off.", fix: () => moveInside(o, margin) });
      else if (near) out.push({ lvl: "info", t: `“${o.name || o.type}” is very close to the edge`, d: "Keep text and QR codes a little inside the edge, especially for printing.", fix: () => moveInside(o, margin) });
      const cx = r.left + r.width / 2, off = Math.abs(cx - W / 2);
      if (off > 1.5 && off < W * 0.02 && r.width < W * 0.9) out.push({ lvl: "info", t: `“${o.name || o.type}” is almost centred`, d: "Centre it exactly for a neater look.", fix: () => { o.set({ left: o.left + (W / 2 - cx) }); o.setCoords(); } });
      if (o.type === "image" && !o.ph && o._element) { const k = o.getScaledWidth() / (o.width || 1); if (k > 1.6) out.push({ lvl: "warn", t: `“${o.name || "Photo"}” is enlarged ${k.toFixed(1)}×`, d: "It may look blurry, especially when printed. Use a bigger photo." }); }
      if (o.ph) out.push({ lvl: "warn", t: "An empty photo space", d: "Add a photo or delete the space.", fix: null });
    });
    for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i].getBoundingRect(true, true), b = texts[j].getBoundingRect(true, true);
      const ix = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)), iy = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
      if (ix * iy > 0.25 * Math.min(a.width * a.height, b.width * b.height)) out.push({ lvl: "warn", t: `Texts overlap: “${short(texts[i].text)}” and “${short(texts[j].text)}”`, d: "Move one of them so both can be read.", fix: () => { texts[j].set({ top: a.top + a.height + 10 - (b.top - texts[j].top) }); texts[j].setCoords(); } });
    }
    const sizes = texts.map((t) => t.fontSize * t.scaleY).sort((a, b) => b - a);
    if (sizes.length > 1 && sizes[0] < sizes[1] * 1.4) { const big = texts.find((t) => t.fontSize * t.scaleY === sizes[0]); out.push({ lvl: "info", t: "No clear headline", d: "Make the main message clearly the biggest text so it is seen first.", fix: () => { big.set({ fontSize: big.fontSize * 1.3 }); big.initDimensions(); } }); }
    if (!texts.some((t) => /\d{5,}|📞|☎|call|कॉल/i.test(t.text))) out.push({ lvl: "info", t: "No phone number", d: "Add your contact details so customers can reach you.", fix: async () => { await addContact(); } });
    return out;
  }
  const short = (t) => { t = String(t || "").replace(/\s+/g, " ").trim(); return t.length > 28 ? t.slice(0, 26) + "…" : t; };
  function moveInside(o, m) { const r = o.getBoundingRect(true, true); let dx = 0, dy = 0; if (r.left < m) dx = m - r.left; if (r.left + r.width > S.W - m) dx = S.W - m - (r.left + r.width); if (r.top < m) dy = m - r.top; if (r.top + r.height > S.H - m) dy = S.H - m - (r.top + r.height); o.set({ left: o.left + dx, top: o.top + dy }); o.setCoords(); }
  // average colour of what is behind an element (rendered small, without the element)
  function colourBehind(o) {
    try {
      const r = o.getBoundingRect(true, true), cv = S.cv;
      o.visible = false; S.exporting = true;
      const k = 0.15, el = cv.toCanvasElement(k / cv.getZoom());
      o.visible = true; S.exporting = false;
      const g = el.getContext("2d"), x = Math.max(0, Math.floor(r.left * k)), y = Math.max(0, Math.floor(r.top * k)), ww = Math.max(1, Math.min(el.width - x, Math.ceil(r.width * k))), hh = Math.max(1, Math.min(el.height - y, Math.ceil(r.height * k)));
      if (ww <= 0 || hh <= 0) return null;
      const p = g.getImageData(x, y, ww, hh).data; let R = 0, G = 0, B = 0, n = 0;
      for (let i = 0; i < p.length; i += 4) { R += p[i]; G += p[i + 1]; B += p[i + 2]; n++; }
      return "#" + [R / n, G / n, B / n].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
    } catch (e) { o.visible = true; S.exporting = false; return null; }
  }
  function reviewOpen() {
    S.cv.discardActiveObject();
    S.review = reviewList();
    const r = S.review;
    dialog(`<h3>✔ Design review</h3><p class="st-hint">Checks readability, colours, hierarchy, alignment, spacing, fonts, photo quality and the message. Nothing changes until you press Apply.</p>
      ${r.length ? `<div class="st-rev">${r.map((x, i) => `<div class="st-ri ${x.lvl}"><div><b>${x.lvl === "warn" ? "⚠" : "💡"} ${esc(x.t)}</b><small>${esc(x.d)}</small></div>${x.fix ? `<button class="st-mini" onclick="STUDIO.reviewFix(${i})">Apply</button>` : ""}</div>`).join("")}</div>`
        : `<p>✅ No problems found.</p>`}
      <div id="stAiRev"></div>
      <div class="st-dbtn">${r.some((x) => x.fix) ? `<button class="st-btn" onclick="STUDIO.reviewFix('all')">Apply all suggestions</button>` : ""}<button class="st-btn" onclick="STUDIO.reviewAi()">🤖 Ask AI for advice</button><button class="st-btn st-primary" onclick="STUDIO.dialog(null)">Close</button></div>`);
  }
  async function reviewFix(i) {
    const list = i === "all" ? S.review.filter((x) => x.fix) : [S.review[i]];
    for (const x of list) { try { await x.fix(); } catch (e) { console.warn(e); } }
    S.cv.requestRenderAll(); pushHist(); toast(list.length + " suggestion(s) applied"); reviewOpen();
  }
  async function reviewAi() {
    const el = $("stAiRev"); if (!el) return;
    if (!keys2().claude) { el.innerHTML = `<p class="st-hint">⚪ AI advice is off – the developer turns it on in the developer console.</p>`; return; }
    el.innerHTML = `<p class="st-hint">🤖 Reading the design…</p>`;
    const items = objs().slice(0, 40).map((o) => { const r = o.getBoundingRect(true, true); return { type: o.type, name: o.name, text: o.text ? String(o.text).slice(0, 140) : undefined, font: o.fontFamily ? String(o.fontFamily).split(",")[0] : undefined, size: o.fontSize ? Math.round(o.fontSize * o.scaleY) : undefined, color: typeof o.fill === "string" ? o.fill : undefined, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; });
    try {
      const r = await ctx.aiJSON(`You are a senior graphic designer reviewing a marketing poster for an Indian tiles and sanitaryware shop. Canvas ${S.W}x${S.H} px. Elements (top-left origin): ${JSON.stringify(items)}.
Give up to 8 short, specific suggestions about text readability, colour combinations, visual hierarchy, image quality, alignment, spacing, typography and clarity of the promotional message. Do not invent facts about the business.
Reply with ONLY JSON: {"suggestions":[{"area":"","advice":""}]}`, 900);
      el.innerHTML = `<h4 class="st-h">🤖 AI advice (not applied automatically)</h4>${(r.suggestions || []).map((x) => `<div class="st-ri info"><div><b>${esc(x.area || "")}</b><small class="notr">${esc(x.advice || "")}</small></div></div>`).join("") || "<p class='st-hint'>No advice returned.</p>"}`;
    } catch (e) { el.innerHTML = `<p class="st-warn">${esc(e.message)}</p>`; }
  }

  /* ================= AI copywriter ================= */
  function productFacts() { return productData(S.products).map((p) => ({ name: p.name, size: p.size && p.size !== "-" ? p.size : undefined, category: p.category, price: p.price > 0 ? "₹" + p.price + (p.unit && p.unit !== "-" ? "/" + p.unit : "") : "not given" })); }
  async function write() {
    const w = S.writer = { what: $("wrWhat").value, lang: $("wrLang").value, style: $("wrStyle").value, info: $("wrInfo").value.trim() };
    const out = $("wrOut"); if (out) out.innerHTML = `<p class="st-hint">✍️ Writing…</p>`;
    const L = { hi: "Hindi (Devanagari script)", mr: "Marathi (Devanagari script)", en: "English" }[w.lang], b = brand();
    if (!keys2().claude) { w.res = ready(w); w.ai = false; panel("writer"); return; }
    try {
      const r = await ctx.aiJSON(`Write marketing copy for "${b.name || "a tiles, sanitaryware and hardware showroom"}"${b.address ? " in " + b.address : ""}, an Indian tiles, ceramics, sanitaryware, plumbing and hardware showroom.
Purpose: ${w.what}. Details from the owner: ${w.info || "none"}. Writing style: ${w.style}. Language: ${L}.
Products (real data from the shop's stock – use only these facts): ${JSON.stringify(productFacts())}.
Rules: never invent prices, discounts, offers, dates, stock levels or product specifications that are not given above. If a price is "not given", do not mention a price. Only mention a discount if the owner's details give one.
Reply with ONLY JSON: {"headlines":["5 catchy headlines, max 8 words"],"slogans":["3 short slogans"],"descriptions":["2 promotional descriptions, 1-2 sentences"],"highlights":["3-5 product highlights based only on the given facts"],"greeting":"a festival greeting if relevant, else empty","discount":"a discount announcement if a discount was given, else empty","cta":["3 call-to-action lines"],"instagram":"an Instagram caption with emojis","whatsapp":"a WhatsApp promotional message","hashtags":["10 hashtags"]}`, 1800);
      w.res = r; w.ai = true;
    } catch (e) { toast(e.message); w.res = ready(w); w.ai = false; }
    if (S.panel === "writer") panel("writer");
  }
  function ready(w) {
    const R = READY[w.lang] || READY.hi, b = brand();
    return { headlines: R.head, cta: R.cta, hashtags: R.tags, descriptions: [], highlights: productData(S.products).map((p) => p.name + (p.price ? " – ₹" + p.price.toLocaleString("en-IN") + (p.unit && p.unit !== "-" ? "/" + p.unit : "") : "")), instagram: "", whatsapp: b.name ? (w.lang === "en" ? `Visit ${b.name}` : w.lang === "mr" ? `${b.name} ला भेट द्या` : `${b.name} पर पधारें`) + (b.phone ? " 📞 " + b.phone : "") : "" };
  }
  async function wrUse(k, i, how) {
    const el = $(`wr_${k}_${i}`); if (!el) return; const text = el.value;
    if (how === "copy") { try { await navigator.clipboard.writeText(text); toast("Copied"); } catch (e) { el.select(); document.execCommand && document.execCommand("copy"); } return; }
    const o = active();
    if (how === "replace") { if (!o || !/text/i.test(o.type)) return toast("Select a text in the design first"); o.set("text", text); o.initDimensions(); S.cv.requestRenderAll(); pushHist(); props(); return; }
    const big = k === "head" || k === "slogan" || k === "greet";
    addObj(await fromSpec({ t: "text", text, left: 0, top: 0, w: S.W * 0.8, size: (big ? 70 : 34) * S.W / 1080, weight: big ? 800 : 500, font: big ? brand().fontH || "Poppins" : brand().fontB || "Poppins", fill: darkPage() ? "#FFFFFF" : "#111827", align: "center", name: big ? "Headline" : "Text" }));
  }

  /* ================= AI poster + AI images ================= */
  const aspectFor = (w, h) => { const r = w / h, opts = [["1:1", 1], ["3:4", 0.75], ["4:3", 1.333], ["9:16", 0.5625], ["16:9", 1.778]]; return opts.sort((a, b) => Math.abs(Math.log(a[1] / r)) - Math.abs(Math.log(b[1] / r)))[0][0]; };
  async function geminiImage(prompt, w, h) {
    const key = ((M().secrets || {}).geminiKey || "").trim();
    if (!key) throw new Error("AI pictures are off: add your Google Gemini API key in 🎬 Marketing → ⚙ Settings");
    const model = imageModel(), ar = aspectFor(w, h), full = prompt + ". High quality, photorealistic, professional advertising photography. No text, no letters, no words, no logos, no watermark.";
    let r, j, b64 = "", mime = "image/png";
    if (/^gemini/i.test(model)) {
      r = await fetch(`${GEM}/models/${encodeURIComponent(model)}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents: [{ parts: [{ text: full }] }], generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: ar } } }) });
      j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error("Google: " + ((j.error && j.error.message) || r.status));
      const part = ((((j.candidates || [])[0] || {}).content || {}).parts || []).find((p) => p.inlineData || p.inline_data);
      if (part) { const d = part.inlineData || part.inline_data; b64 = d.data; mime = d.mimeType || d.mime_type || mime; }
    } else {
      r = await fetch(`${GEM}/models/${encodeURIComponent(model)}:predict`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ instances: [{ prompt: full }], parameters: { sampleCount: 1, aspectRatio: ar } }) });
      j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error("Google: " + ((j.error && j.error.message) || r.status));
      const p = (j.predictions || [])[0]; if (p) { b64 = p.bytesBase64Encoded; mime = p.mimeType || mime; }
    }
    if (!b64) throw new Error("Google did not return a picture (it may have been blocked by its safety filter). Try other words");
    return `data:${mime};base64,${b64}`;
  }
  async function aiImage(where) {
    const prompt = ($("stImgPrompt").value || "").trim(); if (!prompt) return toast("Describe the picture first");
    const st0 = $("stAiStatus"); if (st0) st0.innerHTML = "🖼 Google is making the picture…";
    loading(true);
    try {
      const img = await geminiImage(prompt, S.W, S.H), key = await saveAssetData(img, "AI – " + prompt.slice(0, 50), "AI images", "ai");
      if (where === "bg") await setBg({ type: "image", src: SRC[key], srcKey: key }); else await addAssetKey(key);
      if (st0) st0.innerHTML = "✅ Picture made and saved in Uploads → AI images.";
    } catch (e) { console.error(e); if (st0) st0.innerHTML = `<span class="st-warn">${esc(e.message)}</span>`; }
    finally { loading(false); }
  }
  async function aiPoster() {
    const prompt = ($("stAiPrompt").value || "").trim(); if (!prompt) return toast("Describe the poster first");
    S.aiPrompt = prompt; S.aiStyle = $("stAiStyle").value; const lang = $("stAiLang").value, useProd = $("stAiProd").checked, wantImg = $("stAiImg").checked;
    const k = keys2(), status = (h) => { const el = $("stAiStatus"); if (el) el.innerHTML = h; };
    if (!k.claude && !k.gemini) return status(`<span class="st-warn">AI is off. AI text: the developer turns it on in the developer console. AI pictures: add a Google Gemini key in Marketing → Settings.</span>`);
    let concept = null, img = null;
    try {
      if (k.claude) {
        status("🤖 1/3 Planning the design and writing the text…");
        const L = { hi: "Hindi (Devanagari)", mr: "Marathi (Devanagari)", en: "English", hien: "Hindi (Devanagari) for the main text, with one short English line" }[lang];
        concept = await ctx.aiJSON(`You design marketing posters for "${brand().name || "an Indian tiles and sanitaryware showroom"}", an Indian tiles, ceramics, sanitaryware, plumbing and hardware showroom.
The owner asks: "${prompt}". Writing style: ${S.aiStyle}. Language for the poster text: ${L}. Poster size ${S.W}x${S.H} px.
Products from the real stock to feature (use only these facts): ${useProd ? JSON.stringify(productFacts()) : "none"}.
Rules: never invent prices, stock or product specifications. A discount badge only if the owner's request mentions a discount (use exactly that number).
Choose a layout: "festive" (centred greeting with decorations), "split" (photo + text), "bold" (big diagonal headline), "elegant" (dark with gold frame), "modern" (clean header band and product cards), "minimal".
Reply with ONLY JSON: {"concept":"one sentence describing the design idea","layout":"festive|split|bold|elegant|modern|minimal","category":"business|festival|retail|professional","headline":"max 7 words","subheadline":"max 14 words","cta":"max 8 words","badge":"e.g. 20% OFF or empty","colors":{"dark":"#hex","main":"#hex","accent":"#hex"},"headingFont":"one of ${FONTS.join(", ")}","bodyFont":"one of the same list","emoji":"one festive emoji or empty","imagePrompt":"English prompt for a background photo without any text"}`, 1200);
      }
      if (wantImg && k.gemini) {
        status("🖼 2/3 Google is making the background picture… (10–30 s)");
        try { const src = await geminiImage((concept && concept.imagePrompt) || prompt, S.W, S.H); img = { src: null, key: await saveAssetData(src, "AI – " + prompt.slice(0, 50), "AI images", "ai") }; img.src = SRC[img.key]; }
        catch (e) { status(`<span class="st-warn">The picture could not be made: ${esc(e.message)}. Continuing with colours only.</span>`); await new Promise((r) => setTimeout(r, 1200)); }
      }
      status("🎨 3/3 Building the editable design…");
      const style = concept && STYLES[concept.layout] ? concept.layout : "festive";
      const base = TEMPLATES.find((t) => t.style === style && (!concept || t.cat === concept.category)) || TEMPLATES.find((t) => t.style === style) || TEMPLATES[0];
      const c = (concept && concept.colors) || {};
      const valid = (h) => /^#[0-9a-f]{6}$/i.test(h || "");
      const pal = valid(c.main) ? { bg1: valid(c.dark) ? c.dark : mix(c.main, "#000000", 0.5), bg2: c.main, acc: valid(c.accent) ? c.accent : "#FACC15", ink: lum(valid(c.accent) ? c.accent : "#FACC15") > 0.45 ? "#111111" : "#FFFFFF", text: lum(c.main) > 0.55 ? "#111827" : "#FFFFFF", sub: lum(c.main) > 0.55 ? "#374151" : "#F3F4F6", tags: [] } : null;
      const tpl = { ...base, emoji: (concept && concept.emoji) || base.emoji, products: useProd && S.products.length ? true : base.products,
        title: { en: concept ? concept.headline : tText(base, "title", "en"), hi: concept ? concept.headline : tText(base, "title", "hi"), mr: concept ? concept.headline : tText(base, "title", "mr") },
        sub: { en: concept ? concept.subheadline : "", hi: concept ? concept.subheadline : "", mr: concept ? concept.subheadline : "" },
        cta: { en: concept ? concept.cta : "", hi: concept ? concept.cta : "", mr: concept ? concept.cta : "" },
        badge: concept && concept.badge ? { en: concept.badge, hi: concept.badge, mr: concept.badge } : null };
      if (lang === "hien") tpl.title.en = concept ? concept.headline : tpl.title.en;
      const oldFH = M().kit.fontH, oldFB = M().kit.fontB;
      if (concept && FONTS.includes(concept.headingFont)) M().kit.fontH = concept.headingFont; if (concept && FONTS.includes(concept.bodyFont)) M().kit.fontB = concept.bodyFont;
      await applyTemplate(tpl, true, { lang: lang === "hien" ? "hi" : lang, palObj: pal, products: useProd ? S.products : [], bgImage: img });
      M().kit.fontH = oldFH; M().kit.fontB = oldFB;
      S.dirty = true; savedMark(); setName((concept && concept.headline) || "AI poster");
      status(`✅ Done.${concept ? " " + esc(concept.concept || "") : ""} Everything can be edited – tap any element.${img ? " The picture is saved in Uploads → AI images." : ""}`);
      if (window.innerWidth < 900) hidePanel();
    } catch (e) { console.error(e); status(`<span class="st-warn">${esc(e.message)}</span>`); }
  }

  /* ================= from the existing pamphlet maker ================= */
  async function fromContent(c) {
    const map = { arrivals: "arrivals", offer: "discount", catalogue: "catalogue", festival: "diwali", tip: "announce" };
    let tpl = TEMPLATES.find((t) => t.id === map[c.type]) || TEMPLATES[0];
    S.products = (c.list || []).map((x) => x.item && x.item.id).filter(Boolean).slice(0, 6);
    if (c.type === "festival") {
      const known = { "दीपावली": "diwali", "होली": "holi", "गणेश चतुर्थी": "ganesh", "दशहरा": "dussehra", "क्रिसमस": "christmas", "नया साल": "newyear", "रक्षाबंधन": "rakhi", "स्वतंत्रता दिवस": "independence" }[c.festival];
      tpl = TEMPLATES.find((t) => t.id === known) || { ...TEMPLATES.find((t) => t.id === "diwali"), title: { en: (c.festivalEn || c.festival) + " Greetings", hi: c.festival + " की शुभकामनाएँ", mr: c.festival + " च्या शुभेच्छा" } };
    }
    if (c.type === "tip" && c.tip) tpl = { ...tpl, title: { en: c.tip.t, hi: c.tip.t, mr: c.tip.t }, sub: { en: c.tip.b.join(" • "), hi: c.tip.b.join(" • "), mr: c.tip.b.join(" • ") } };
    S.id = null; setName(tText(tpl, "title", S.lang) || "Pamphlet");
    await applyTemplate(tpl, true);
    S.dirty = true; savedMark();
  }

  /* ================= dialogs, keys ================= */
  function dialog(html, wide) {
    const el = $("stDialog"); if (!el) return;
    if (!html) { el.classList.add("hidden"); el.innerHTML = ""; return; }
    el.innerHTML = `<div class="st-dbox ${wide ? "wide" : ""}">${html}</div>`; el.classList.remove("hidden");
    el.onclick = (e) => { if (e.target === el) dialog(null); };
  }
  const editingText = () => { const o = S.cv && S.cv.getActiveObject(); return o && o.isEditing; };
  function keys(e) {
    if (!S.open || !S.cv) return;
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    if (/INPUT|TEXTAREA|SELECT/.test(tag) || editingText()) return;
    if (!$("confirmModal").classList.contains("open") && !$("promptModal").classList.contains("open") && $("loadingOverlay").classList.contains("hidden")) {
      const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey, o = active();
      let done = true;
      if (mod && k === "z" && !e.shiftKey) undo();
      else if (mod && (k === "y" || (k === "z" && e.shiftKey))) redo();
      else if (mod && k === "c") act("copy");
      else if (mod && k === "v") paste();
      else if (mod && k === "d") act("dup");
      else if (mod && k === "s") save();
      else if ((k === "delete" || k === "backspace") && o) act("del");
      else if (k.startsWith("arrow") && o && !o.locked) { const d = e.shiftKey ? 10 : 1; o.set({ left: o.left + (k === "arrowleft" ? -d : k === "arrowright" ? d : 0), top: o.top + (k === "arrowup" ? -d : k === "arrowdown" ? d : 0) }); o.setCoords(); S.cv.requestRenderAll(); schedHist(); }
      else done = false;
      if (done) { e.preventDefault(); e.stopPropagation(); }
    }
  }
  // Escape / phone back: close the dialog, stop typing, deselect, close the side panel (phone), then close the Studio
  function escape() {
    if (!S.open) return false;
    if ($("stDialog") && !$("stDialog").classList.contains("hidden")) { dialog(null); return true; }
    const o = S.cv && S.cv.getActiveObject();
    if (o && o.isEditing) { o.exitEditing(); S.cv.requestRenderAll(); return true; }
    if (o) { deselect(); return true; }
    if (window.innerWidth < 900 && $("stPanel").classList.contains("open")) { hidePanel(); return true; }
    close(); return true;
  }

  window.STUDIO = {
    open, close, isOpen: () => S.open, escape, panel, hidePanel, dialog, undo, redo, zoomBy, fit, save, preview, exportOpen, exSync, doExport,
    toggle: (k) => { S[k] = !S[k]; $("stGridBtn").classList.toggle("on", S.grid); $("stSnapBtn").classList.toggle("on", S.snap); S.cv.requestRenderAll(); },
    gridSize: (v) => { S.gridSize = Math.max(5, Math.min(200, Number(v) || 20)); S.cv.requestRenderAll(); },
    rename: (v) => { S.name = v; S.dirty = true; savedMark(); },
    sizePick: (k) => { if (k === "custom") { S.sizeKey = "custom"; S.cv.discardActiveObject(); props(); return toast("Type the width and height in the Page panel on the right"); } const z = SIZES[k]; setSize(z.w, z.h, k); panel(S.panel); props(); },
    customSize: (w, h) => { if (!(w >= 100 && h >= 100 && w <= 5000 && h <= 5000)) return toast("Width and height must be between 100 and 5000 px"); setSize(w, h, "custom"); panel(S.panel); props(); },
    setLang: (l) => { S.lang = l; panel("templates"); }, tplSet: (k, v, keep) => { S.tplFilter[k] = v; if (keep) { $("stTplGrid").innerHTML = tplCards(); fillThumbs(); } else panel("templates"); },
    useTpl: (id) => applyTemplate(TEMPLATES.find((t) => t.id === id)), useMyTpl, delMyTpl, saveAsTemplate,
    addText, addPair, addShape, addBadge, addEmoji, addIcon, addLogo, addContact, qrOpen, qrAdd, qrSet,
    set, refresh, sizeTo, shadow, align, act, deselect, stack: fontStack, upper: () => { const o = active(); return o && o.text ? (o.text === o.text.toUpperCase() ? o.text.toLowerCase() : o.text.toUpperCase()) : ""; },
    groupText, groupFill, groupTextFill, fillGrad, flip, round, cropOpen, cropApply, cropReset, removeBgOpen, removeBg, pickReplace, replaceFile, bgFromSel,
    bg: (type, a, b, angle) => { if (type === "none") { const o = bgObj(); if (o && o.type === "image") { S.cv.remove(o); setBg({ type: "color", colors: ["#FFFFFF"] }); } return; } setBg(type === "gradient" ? { type, colors: [a, b], angle: angle || 160 } : { type: "color", colors: [a] }); },
    uploadPick, uploadFiles, addAsset, bgAsset, delAsset, assetSet: (k, v) => { S.assetFilter[k] = v; const g = $("stAssetGrid"); if (g && k === "q") g.innerHTML = assetGrid(S.panel === "backgrounds"); else panel(S.panel); },
    prodSearch: (v) => { S.prodQ = v; clearTimeout(S.pq); S.pq = setTimeout(() => { panel("products"); const i = document.querySelector("#stPanel .st-in"); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }, 250); },
    prodPick, setDisc: (v) => { S.disc = Math.max(0, Math.min(90, Number(v) || 0)); }, productAd, addProducts, itemUpload, itemFile,
    brandSave, logoFile, logoRemove,
    newDesign, openDesign, dupDesign, renameDesign, moveDesign, delDesign, quickDownload, designSet: (k, v) => { S.designFilter[k] = v; if ($("stDesignList")) $("stDesignList").innerHTML = designList(); },
    reviewOpen, reviewFix, reviewAi, write, wrUse, aiPoster, aiImage,
    _test: { S, SRC, serial, reviewList, makePdf, buildTemplate, renderEl, cutOut, objs: () => objs(), active: () => active(), canvas: () => S.cv, snapshot }
  };
  return { open, close, isOpen: () => S.open, escape };
}
