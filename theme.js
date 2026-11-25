// =====================================================================
// theme.js - Appearance & Theme Settings
// Light / Dark / Custom mode, any primary colour, any background colour (Custom).
// Every colour of the app comes from CSS variables; this file works them out from the two chosen colours,
// keeps text readable (contrast checks) and saves the choice PER PERSON AND PER COMPANY:
//   Firestore  userPrefs/{uid}.themes.{companyId}   (only that person can read / write it)
//   + a copy on this device so the page opens in the right colours straight away.
// Business data is never touched.
// =====================================================================

/* <themepure> */
export const DEFAULT_THEME = { mode: "light", primary: "#126B3A", bg: "#F5F7F5" };
export const PRESETS = [["Green", "#126B3A"], ["Blue", "#2563EB"], ["Purple", "#7C3AED"], ["Orange", "#EA580C"], ["Red", "#DC2626"],
  ["Pink", "#DB2777"], ["Cyan", "#0891B2"], ["Teal", "#0F766E"], ["Indigo", "#4338CA"], ["Brown", "#92400E"]];
export const BG_PRESETS = [["Soft white", "#F5F7F5"], ["Cream", "#FBF6EC"], ["Light grey", "#EEF0F3"], ["Mint", "#EAF6EF"], ["Sky", "#EAF2FB"],
  ["Blush", "#FBEFF3"], ["Charcoal", "#1C1F24"], ["Midnight", "#0F172A"], ["Deep green", "#07140B"], ["Black", "#0A0A0A"]];

export function normHex(v) {
  let s = String(v || "").trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(s)) s = s.split("").map((c) => c + c).join("");
  return /^[0-9a-f]{6}$/i.test(s) ? "#" + s.toUpperCase() : null;
}
export const hexToRgb = (h) => { h = normHex(h) || "#000000"; return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; };
export const rgbToHex = (r, g, b) => "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(Number(x) || 0))).toString(16).padStart(2, "0")).join("").toUpperCase();
export const mix = (a, b, t) => { const x = hexToRgb(a), y = hexToRgb(b); return rgbToHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); };
export function luminance(h) {
  return hexToRgb(h).map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); })
    .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
}
export const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const rgba = (h, a) => { const [r, g, b] = hexToRgb(h); return `rgba(${r}, ${g}, ${b}, ${a})`; };
// move a colour towards white or black until it reaches the contrast needed against "on"
function readableOn(color, on, need) {
  const toward = luminance(on) > 0.4 ? "#000000" : "#FFFFFF";
  let c = color;
  for (let t = 0; t <= 1.0001 && contrast(c, on) < need; t += 0.05) c = mix(color, toward, t);
  return c;
}

// the full set of CSS variables for a theme
export function buildPalette(theme) {
  const th = { ...DEFAULT_THEME, ...(theme || {}) };
  const P = normHex(th.primary) || DEFAULT_THEME.primary;
  let bg, surface, surface2, text, border, dark;
  if (th.mode === "dark") {
    dark = true; bg = mix("#0A0F0C", P, 0.06); surface = mix("#111714", P, 0.08); surface2 = mix("#161D19", P, 0.09); text = "#E6EEE9"; border = mix("#26302B", P, 0.1);
  } else if (th.mode === "custom") {
    bg = normHex(th.bg) || DEFAULT_THEME.bg; dark = luminance(bg) < 0.3;
    if (dark) { surface = mix(bg, "#FFFFFF", 0.06); surface2 = mix(bg, "#FFFFFF", 0.1); text = "#EEF2EF"; border = mix(bg, "#FFFFFF", 0.16); }
    else { surface = mix(bg, "#FFFFFF", 0.78); surface2 = mix(bg, "#FFFFFF", 0.4); text = "#17201B"; border = mix(bg, "#000000", 0.1); }
  } else {
    dark = false; bg = DEFAULT_THEME.bg === "#F5F7F5" ? mix("#F5F7F5", P, 0.015) : DEFAULT_THEME.bg; surface = "#FFFFFF"; surface2 = mix("#F8FAF8", P, 0.012); text = "#17251D"; border = mix("#E3E8E5", P, 0.04);
  }
  const muted = readableOn(mix(text, bg, 0.45), surface, 4.5);
  const onPrimary = contrast(P, "#FFFFFF") >= 3 ? "#FFFFFF" : "#111111";
  const ink = readableOn(dark ? mix(P, "#FFFFFF", 0.15) : P, surface, 4.5);     // primary as text on cards
  const btn = dark && contrast(P, bg) < 2.2 ? mix(P, "#FFFFFF", 0.3) : P;        // buttons stay visible on a dark page
  const onBtn = contrast(btn, "#FFFFFF") >= 3 ? "#FFFFFF" : "#111111";
  const secondary = dark ? mix(btn, "#FFFFFF", 0.2) : mix(P, "#FFFFFF", 0.18);
  const light = dark ? mix(surface, P, 0.2) : mix("#FFFFFF", P, 0.1);
  const tint = dark ? mix(surface, P, 0.35) : mix("#FFFFFF", P, 0.28);
  const sideBase = dark ? mix(bg, P, 0.12) : mix(P, "#000000", 0.55);
  const v = {
    "--primary": btn, "--on-primary": onBtn, "--primary-dark": mix(btn, "#000000", 0.22), "--primary-ink": ink, "--secondary": secondary,
    "--light": light, "--tint-border": tint, "--ring": rgba(btn, 0.22), "--ring-strong": rgba(btn, 0.35),
    "--bg": bg, "--surface": surface, "--surface2": surface2, "--text": text, "--muted": muted, "--border": border, "--border2": border, "--text-dim": muted,
    "--neon": secondary, "--dark-neon": mix(P, "#000000", 0.6),
    "--side-1": sideBase, "--side-2": dark ? mix(bg, "#000000", 0.2) : mix(P, "#000000", 0.7),
    "--side-text": "#F2F6F3", "--side-muted": dark ? mix(text, bg, 0.4) : mix("#FFFFFF", P, 0.35), "--side-accent": mix(P, "#FFFFFF", 0.45), "--side-active": rgba(mix(P, "#FFFFFF", 0.3), 0.28),
    "--login-1": mix(P, "#000000", 0.25), "--login-2": mix(P, "#000000", 0.55), "--login-3": mix(P, "#000000", 0.75),
    "--topbar": rgba(surface, 0.9),
    "--c0": btn, "--c1": secondary, "--c2": "#F59E0B", "--c3": contrast(P, "#2563EB") < 1.6 ? "#8B5CF6" : "#2563EB", "--c4": contrast(P, "#8B5CF6") < 1.6 ? "#EC4899" : "#8B5CF6", "--c5": "#94A3B8"
  };
  return { vars: v, dark, P, bg, warnings: themeWarnings(btn, bg, surface, text) };
}
export function themeWarnings(P, bg, surface, text) {
  const w = [];
  if (contrast(P, bg) < 1.25) w.push("The primary colour is almost the same as the background, so buttons will be hard to see.");
  if (contrast(text, bg) < 4.5) w.push("Text on this background may be hard to read.");
  return w;
}
/* </themepure> */

export function applyVars(el, pal) {
  Object.entries(pal.vars).forEach(([k, val]) => el.style.setProperty(k, val));
}

export function initTheme(ctx) {
  const { $, esc, toast } = ctx;
  const root = document.documentElement;
  let saved = { ...DEFAULT_THEME }, draft = null, applied = false, who = null;
  const key = () => (who ? `pi_theme:${who.uid}:${who.cid}` : null);

  function apply(theme) {
    const pal = buildPalette(theme);
    applyVars(root, pal);
    root.setAttribute("data-theme", pal.dark ? "dark" : "light");
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute("content", pal.vars["--side-2"]);
    const b = $("themeBtn"); if (b) b.innerHTML = `<svg class="ic"><use href="#i-${pal.dark ? "sun" : "moon"}"/></svg>`;
    document.querySelectorAll("[data-theme-pick]").forEach((x) => x.classList.toggle("on", x.dataset.themePick === (theme.mode || "light")));
    if (ctx.onChange) ctx.onChange();
    return pal;
  }
  // remember the colours on this device, so a refresh opens in them straight away
  function cacheVars(theme) {
    try { localStorage.setItem("pi_theme_vars", JSON.stringify({ t: theme, v: buildPalette(theme).vars, d: buildPalette(theme).dark })); } catch (e) {}
  }

  // called when someone enters a company (uid + company) and when they leave (null)
  async function load(uid, cid) {
    who = uid && cid ? { uid, cid } : null;
    draft = null; applied = false;
    if (!who) { saved = { ...DEFAULT_THEME }; apply(saved); try { localStorage.removeItem("pi_theme_vars"); } catch (e) {} return; }
    let t = null;
    try { t = JSON.parse(localStorage.getItem(key()) || "null"); } catch (e) {}
    if (!t) { let old = null; try { old = localStorage.getItem("pi_theme"); } catch (e) {} t = { ...DEFAULT_THEME, mode: old === "dark" ? "dark" : "light" }; }
    saved = clean(t); apply(saved); cacheVars(saved);
    try {
      const s = await ctx.getDoc(ctx.doc(ctx.db, "userPrefs", uid));
      const remote = s.exists() && s.data().themes && s.data().themes[cid];
      if (remote && who && who.uid === uid && who.cid === cid) {
        saved = clean(remote);
        if (!draft) { apply(saved); cacheVars(saved); }
        try { localStorage.setItem(key(), JSON.stringify(saved)); } catch (e) {}
      }
    } catch (e) { /* offline: the copy on this device is used */ }
  }
  const clean = (t) => ({ mode: ["light", "dark", "custom"].includes(t && t.mode) ? t.mode : "light", primary: normHex(t && t.primary) || DEFAULT_THEME.primary, bg: normHex(t && t.bg) || DEFAULT_THEME.bg });

  async function save(theme) {
    saved = clean(theme); draft = null; applied = false;
    apply(saved); cacheVars(saved);
    if (!who) return;
    try { localStorage.setItem(key(), JSON.stringify(saved)); } catch (e) {}
    try { await ctx.setDoc(ctx.doc(ctx.db, "userPrefs", who.uid), { themes: { [who.cid]: { ...saved, updatedAt: Date.now() } } }, { merge: true }); }
    catch (e) { console.error("Theme not saved online", e); toast("Theme saved on this device. It will be saved online when the internet is back"); }
  }
  // the moon / sun button: light <-> dark, keeps the chosen primary colour
  const quick = (mode) => save({ ...saved, mode: mode || (root.getAttribute("data-theme") === "dark" ? "light" : "dark") });

  /* ---------------- the settings panel ---------------- */
  let host = null;
  const isDirty = () => draft && JSON.stringify(clean(draft)) !== JSON.stringify(saved);
  function render(hostId) {
    const h = $(hostId); if (!h) return;
    ["themeHostSettings", "themeHostPage"].forEach((id) => { if (id !== hostId && $(id)) $(id).innerHTML = ""; });
    host = h; draft = draft || { ...saved };
    const d = clean(draft), pal = buildPalette(d), rgb = hexToRgb(d.bg), custom = d.mode === "custom";
    const modeCard = (m, label, sw) => `<button class="tp-mode ${d.mode === m ? "on" : ""}" data-mode="${m}"><span class="tp-sw">${sw.map((c) => `<i style="background:${c}"></i>`).join("")}</span>${label}</button>`;
    h.innerHTML = `<div class="theme-panel">
      <div class="tp-controls">
        <div class="tp-sec"><b>Mode</b><div class="tp-modes">
          ${modeCard("light", "Light", ["#F5F7F5", "#FFFFFF", d.primary])}${modeCard("dark", "Dark", ["#0B1510", "#15261C", d.primary])}${modeCard("custom", "Custom", [d.bg, mix(d.bg, "#FFFFFF", 0.5), d.primary])}</div></div>
        <div class="tp-sec"><b>Primary colour</b><p class="hint">Buttons, the active menu item, links, tabs, highlights and charts.</p>
          <div class="tp-presets">${PRESETS.map(([n, c]) => `<button class="tp-dot ${d.primary === c ? "on" : ""}" data-primary="${c}" title="${n}" style="background:${c}"></button>`).join("")}</div>
          <div class="tp-row"><input type="color" class="tp-color" data-f="primary" value="${d.primary}" aria-label="Primary colour">
            <label class="tp-hex">HEX <input class="notr" data-hex="primary" value="${d.primary}" maxlength="7" spellcheck="false"></label>
            <button class="btn btn-ghost sm" data-reset="primary">Reset to default</button></div></div>
        <div class="tp-sec ${custom ? "" : "tp-off"}"><b>Background colour</b><p class="hint">${custom ? "The colour of the whole page. Cards and text adjust to it." : "Choose <b>Custom</b> mode to pick your own background colour."}</p>
          <div class="tp-presets">${BG_PRESETS.map(([n, c]) => `<button class="tp-dot ${d.bg === c ? "on" : ""}" data-bg="${c}" title="${n}" style="background:${c}"></button>`).join("")}</div>
          <div class="tp-row"><input type="color" class="tp-color" data-f="bg" value="${d.bg}" aria-label="Background colour">
            <label class="tp-hex">HEX <input class="notr" data-hex="bg" value="${d.bg}" maxlength="7" spellcheck="false"></label>
            <span class="tp-rgb">RGB ${["R", "G", "B"].map((n, i) => `<input type="number" min="0" max="255" data-rgb="${i}" value="${rgb[i]}" aria-label="${n}">`).join("")}</span>
            <button class="btn btn-ghost sm" data-reset="bg">Reset to default</button></div></div>
        ${pal.warnings.length ? `<div class="calc-warn">⚠ ${pal.warnings.map(esc).join("<br>⚠ ")}</div>` : ""}
      </div>
      <div class="tp-preview-wrap"><b>Preview</b>
        <div class="tp-preview" data-theme="${pal.dark ? "dark" : "light"}">
          <div class="tpv-side"><span class="tpv-logo"></span><i class="on">Dashboard</i><i>Inventory</i><i>Reports</i></div>
          <div class="tpv-main"><div class="tpv-top"><span class="tpv-search">Search…</span><span class="tpv-av">A</span></div>
            <div class="tpv-card"><small>Total Stock</small><b>1,250</b><span class="tpv-chip">In Stock</span></div>
            <div class="tpv-card"><small>Stock Movement</small><span class="tpv-bars"><i style="height:40%"></i><i style="height:70%"></i><i style="height:55%"></i><i style="height:90%"></i></span></div>
            <div class="tpv-actions"><span class="tpv-btn">Save</span><span class="tpv-ghost">Cancel</span><a>Link</a></div>
            <span class="tpv-input">Focused box</span></div></div>
        <p class="hint">${isDirty() ? (applied ? "Showing on the whole app. Not saved yet." : "Changes are only in the preview. Press Apply to try them on the app, or Save Changes.") : "These are your saved colours."}</p>
      </div>
      <div class="tp-buttons">
        <button class="btn btn-ghost" data-act="discard" ${isDirty() ? "" : "disabled"}>Discard changes</button>
        <button class="btn btn-ghost" data-act="apply" ${isDirty() ? "" : "disabled"}>Apply</button>
        <button class="btn btn-primary" data-act="save" ${isDirty() ? "" : "disabled"}>Save Changes</button>
        <button class="btn btn-danger" data-act="resetall">Reset All Settings</button>
      </div></div>`;
    applyVars(h.querySelector(".tp-preview"), pal);
  }
  const rerender = () => { if (host && document.body.contains(host)) render(host.id); };
  function set(f, v) {
    const d = draft || (draft = { ...saved });
    if (f === "bg") { d.bg = v; d.mode = "custom"; } else d[f] = v;
    if (applied) apply(clean(d));
    rerender();
  }
  // one listener for both places the panel can be shown
  document.addEventListener("click", async (e) => {
    const t = e.target.closest && e.target.closest(".theme-panel [data-mode], .theme-panel [data-primary], .theme-panel [data-bg], .theme-panel [data-reset], .theme-panel [data-act]");
    if (!t) return;
    if (t.dataset.mode) return set("mode", t.dataset.mode);
    if (t.dataset.primary) return set("primary", t.dataset.primary);
    if (t.dataset.bg) return set("bg", t.dataset.bg);
    if (t.dataset.reset) return set(t.dataset.reset, DEFAULT_THEME[t.dataset.reset]);
    const act = t.dataset.act;
    if (act === "apply") { applied = true; apply(clean(draft)); rerender(); toast("Applied. Press Save Changes to keep it"); }
    if (act === "discard") { draft = null; applied = false; apply(saved); rerender(); }
    if (act === "save") { await save(draft); rerender(); toast("Theme saved"); }
    if (act === "resetall") { if (!(await ctx.askConfirm("Reset all appearance settings to the original green and light mode?"))) return; await save({ ...DEFAULT_THEME }); rerender(); toast("Theme reset"); }
  });
  document.addEventListener("input", (e) => {
    const t = e.target; if (!t.closest || !t.closest(".theme-panel")) return;
    if (t.classList.contains("tp-color")) { const v = normHex(t.value); if (v) setSoft(t.dataset.f, v); }
    if (t.dataset.hex) { const v = normHex(t.value); t.classList.toggle("bad", !v); if (v) setSoft(t.dataset.hex, v); }
    if (t.dataset.rgb !== undefined) {
      const rgb = hexToRgb((draft || saved).bg); rgb[Number(t.dataset.rgb)] = Math.max(0, Math.min(255, Number(t.value) || 0)); setSoft("bg", rgbToHex(...rgb));
    }
  });
  // typing / dragging the picker: update the preview without redrawing the box being typed in
  let soft = null;
  function setSoft(f, v) {
    const d = draft || (draft = { ...saved });
    if (f === "bg") { d.bg = v; d.mode = "custom"; } else d[f] = v;
    if (applied) apply(clean(d));
    clearTimeout(soft);
    soft = setTimeout(() => {
      const a = document.activeElement, sel = a && a.dataset ? (a.dataset.hex ? `[data-hex="${a.dataset.hex}"]` : a.dataset.rgb !== undefined ? `[data-rgb="${a.dataset.rgb}"]` : a.dataset.f ? `[data-f="${a.dataset.f}"]` : null) : null;
      const pos = a && a.selectionStart; rerender();
      if (sel && host) { const n = host.querySelector(sel); if (n) { n.focus(); try { if (pos !== null && pos !== undefined) n.setSelectionRange(pos, pos); } catch (e) {} } }
    }, 250);
  }
  // leaving the settings without saving: back to the saved colours
  function leftPanel() {
    if (draft && !isDirty()) { draft = null; return; }
    if (!draft) return;
    const wasApplied = applied;
    draft = null; applied = false;
    if (wasApplied) { apply(saved); toast("Theme changes were not saved"); }
  }

  return { load, save, quick, render, leftPanel, current: () => ({ ...saved }), apply };
}
