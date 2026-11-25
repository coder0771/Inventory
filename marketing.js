// =====================================================================
// marketing.js - 🎬 automatic marketing (owner)
//   • Hindi pamphlets made automatically from the stock: new arrivals, offers on
//     slow stock, festival greetings, showroom catalogue, tile & plumbing tips
//   • photo slideshow videos (zoom / pan, captions, music) made on the phone
//   • AI videos with Google Veo (owner's own Gemini API key, paid per second)
//   • one-tap share, and automatic daily posting to a Facebook Page / Instagram
// =====================================================================
import {
  collection, doc, addDoc, getDoc, setDoc, query, where, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* <mktpure> */
// festival greetings (Maharashtra calendar where regions differ); the owner can edit this list in settings
export const MKT_FESTIVALS = [
  ["2026-11-24", "गुरु नानक जयंती"], ["2026-12-25", "क्रिसमस"], ["2027-01-01", "नया साल"], ["2027-01-14", "मकर संक्रांति"],
  ["2027-01-26", "गणतंत्र दिवस"], ["2027-03-06", "महाशिवरात्रि"], ["2027-03-22", "होली"], ["2027-04-07", "गुढी पाडवा"],
  ["2027-04-14", "राम नवमी"], ["2027-05-01", "महाराष्ट्र दिवस"], ["2027-05-08", "अक्षय तृतीया"], ["2027-08-15", "स्वतंत्रता दिवस"],
  ["2027-08-16", "रक्षाबंधन"], ["2027-08-25", "जन्माष्टमी"], ["2027-09-03", "गणेश चतुर्थी"], ["2027-10-09", "दशहरा"],
  ["2027-10-26", "धनतेरस"], ["2027-10-28", "दीपावली"], ["2027-12-25", "क्रिसमस"]
];
// tips about tiles and plumbing (Hindi) - pamphlets, slideshow captions and AI video scenes
export const MKT_TIPS = [
  { t: "सही टाइल कैसे चुनें?", b: ["बाथरूम में एंटी-स्किड (मैट) टाइल लगाएं", "किचन में दाग-रोधी ग्लॉसी टाइल", "हॉल में बड़े साइज़ की टाइल से कमरा बड़ा दिखे", "बाहर पार्किंग के लिए मज़बूत आउटडोर टाइल"],
    scene: "a bright modern Indian bathroom with matte anti-skid floor tiles, then a kitchen with glossy tiles, then a spacious living room with large polished tiles", say: "हर कमरे के लिए सही टाइल चुनें – बाथरूम में एंटी-स्किड, हॉल में बड़ी टाइल।" },
  { t: "एक ही शेड और बैच की टाइल लें", b: ["अलग बैच में रंग थोड़ा अलग होता है", "बॉक्स पर शेड और बैच नंबर ज़रूर देखें", "कटिंग के लिए 10% टाइल ज़्यादा लें", "बाद में वही शेड मिलना मुश्किल होता है"],
    scene: "a tile showroom worker comparing two tile boxes and pointing at the shade number printed on the box, close-up of matching tiles laid side by side", say: "टाइल हमेशा एक ही शेड और बैच की लें, और दस प्रतिशत ज़्यादा रखें।" },
  { t: "टाइल की सफ़ाई के आसान तरीके", b: ["रोज़ सूखा या हल्का गीला पोछा लगाएं", "एसिड वाले क्लीनर का इस्तेमाल न करें", "जोड़ों (ग्राउट) को साल में एक बार साफ़ करें", "दाग तुरंत साफ़ करें"],
    scene: "gentle mopping of a shiny vitrified tile floor in an Indian home, sunlight reflecting, close-up of clean tile joints", say: "टाइल को हल्के साबुन से साफ़ करें, एसिड बिल्कुल नहीं।" },
  { t: "विट्रिफाइड या सिरेमिक – क्या लें?", b: ["विट्रिफाइड: मज़बूत, कम पानी सोखे – फ़र्श के लिए", "सिरेमिक: हल्की और किफ़ायती – दीवार के लिए", "GVT / PGVT: सुंदर डिज़ाइन और चमक", "जगह और बजट के हिसाब से चुनें"],
    scene: "side by side comparison of a glossy vitrified floor tile and a ceramic wall tile in a well-lit tile showroom, slow camera pan", say: "फ़र्श के लिए विट्रिफाइड और दीवार के लिए सिरेमिक टाइल बढ़िया है।" },
  { t: "टाइल लगवाने से पहले ध्यान दें", b: ["फ़र्श समतल और साफ़ होना चाहिए", "अच्छे टाइल एडहेसिव का इस्तेमाल करें", "स्पेसर से बराबर जोड़ रखें", "24 घंटे तक टाइल पर न चलें"],
    scene: "an Indian tile mason laying large floor tiles with spacers and tile adhesive, using a level tool, neat work", say: "टाइल लगाने से पहले फ़र्श समतल करें और अच्छा एडहेसिव लगाएं।" },
  { t: "बाथरूम की दीवार के लिए टिप्स", b: ["छत तक टाइल लगाने से नमी नहीं आती", "हल्के रंग से छोटा बाथरूम बड़ा दिखे", "हाइलाइटर टाइल से सुंदरता बढ़ाएं", "जोड़ों में एपॉक्सी ग्राउट लगाएं"],
    scene: "a beautiful Indian bathroom with full height light colored wall tiles and one decorative highlighter tile strip, slow camera move", say: "बाथरूम में छत तक टाइल लगवाएं, नमी से बचाव होगा।" },
  { t: "किचन के लिए सही टाइल", b: ["काउंटर के पीछे बैकस्प्लैश टाइल लगाएं", "ग्लॉसी टाइल आसानी से साफ़ होती है", "गहरे रंग के जोड़ों में दाग कम दिखते हैं", "गर्मी सहने वाली टाइल चुनें"],
    scene: "a modern Indian kitchen with a glossy backsplash tile wall behind the cooking counter, steam from a pot, warm light", say: "किचन में ग्लॉसी बैकस्प्लैश टाइल लगाएं, सफ़ाई आसान होगी।" },
  { t: "बड़े साइज़ की टाइल के फ़ायदे", b: ["कम जोड़, साफ़ और सुंदर दिखावट", "कमरा बड़ा और खुला लगता है", "सफ़ाई बहुत आसान", "अनुभवी मिस्त्री से लगवाएं"],
    scene: "a large living room with big 600x1200 polished marble look tiles, almost no visible joints, cinematic slow reveal", say: "बड़ी टाइल से घर बड़ा और सुंदर दिखता है।" },
  { t: "टपकता नल? ऐसे ठीक करें", b: ["नल का वाशर या कार्ट्रिज बदलें", "टपकता नल महीने में सैकड़ों लीटर पानी बर्बाद करता है", "अच्छी क्वालिटी के CP फिटिंग लगाएं", "हर 6 महीने में जांच करें"],
    scene: "close-up of a dripping chrome tap in an Indian bathroom, then a plumber replacing the washer and the tap stops dripping", say: "टपकता नल पानी बर्बाद करता है, आज ही वाशर बदलवाएं।" },
  { t: "पानी के लीकेज को ऐसे पहचानें", b: ["दीवार पर सीलन या धब्बे दिखें", "बिना इस्तेमाल पानी का मीटर चले", "फ़र्श की टाइल ढीली हो जाए", "तुरंत प्लंबर से जांच करवाएं"],
    scene: "an Indian home wall with a damp patch, a plumber checking pipes behind the wall with a moisture meter, calm informative mood", say: "दीवार पर सीलन दिखे तो समझिए लीकेज है, तुरंत जांच करवाएं।" },
  { t: "सही पाइप कैसे चुनें?", b: ["ठंडे पानी के लिए uPVC पाइप", "गर्म पानी के लिए CPVC पाइप", "ड्रेनेज के लिए SWR पाइप", "हमेशा ISI मार्क देखकर ख़रीदें"],
    scene: "neatly arranged uPVC, CPVC and SWR plumbing pipes and fittings in a hardware showroom, slow camera pan across labels", say: "गर्म पानी के लिए सीपीवीसी और ठंडे पानी के लिए यूपीवीसी पाइप लें।" },
  { t: "नाली जाम होने से बचाएं", b: ["रसोई में तेल और जूठन नाली में न डालें", "नाली पर जाली (स्ट्रेनर) लगाएं", "हफ़्ते में एक बार गर्म पानी डालें", "बाथरूम में बाल फँसने से बचाएं"],
    scene: "a stainless steel kitchen sink with a mesh strainer catching food waste, hot water flowing down the drain, clean Indian kitchen", say: "नाली पर जाली लगाएं और तेल कभी न डालें।" },
  { t: "पानी की टंकी की देखभाल", b: ["हर 6 महीने में टंकी साफ़ करवाएं", "ढक्कन हमेशा बंद रखें", "ओवरफ़्लो पाइप पर जाली लगाएं", "फ़्लोट वाल्व से पानी बचाएं"],
    scene: "a clean water storage tank on an Indian rooftop with a closed lid and a float valve, blue sky, gentle camera move", say: "पानी की टंकी हर छह महीने में साफ़ करवाएं।" },
  { t: "बाथरूम वॉटरप्रूफिंग ज़रूरी है", b: ["टाइल लगाने से पहले वॉटरप्रूफ कोटिंग करें", "फ़र्श का ढलान नाली की तरफ़ रखें", "कोनों पर वॉटरप्रूफ टेप लगाएं", "नीचे के फ़्लैट में सीलन नहीं आएगी"],
    scene: "a worker applying waterproof coating on a bathroom floor and walls before tiling, then finished tiled bathroom with floor sloping to the drain", say: "टाइल से पहले वॉटरप्रूफिंग करें, सीलन की परेशानी ख़त्म।" }
];
const MKT_DAYPLAN = ["catalogue", "arrivals", "tip", "offer", "catalogue", "tip", "arrivals"]; // Sunday .. Saturday
export const MKT_TYPES = { arrivals: "New arrivals", offer: "Offer on slow stock", festival: "Festival greeting", catalogue: "Showroom catalogue", tip: "Tile & plumbing tip" };
const dk = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const DAY = 86400000;
// the festival to greet for (from 3 days before up to the day itself)
export function festivalFor(ms, list) {
  const today = dk(ms);
  for (const [date, name] of (list || MKT_FESTIVALS).slice().sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const t = new Date(date + "T00:00:00").getTime();
    if (date >= today && t - new Date(today + "T00:00:00").getTime() <= 3 * DAY) return { date, name, days: Math.round((t - new Date(today + "T00:00:00").getTime()) / DAY) };
  }
  return null;
}
export const tipFor = (ms) => MKT_TIPS[Math.floor(ms / DAY) % MKT_TIPS.length];
export function newArrivals(items, now, days) {
  const out = [], from = now - (days || 21) * DAY;
  (items || []).forEach((i) => {
    if ((Number(i.createdMs) || 0) >= from && (Number(i.qty) || 0) > 0) out.push({ item: i, lot: null, at: i.createdMs });
    Object.entries(i.lots || {}).forEach(([id, l]) => { if ((Number(l.addedAt) || 0) >= from) out.push({ item: i, lot: { id, ...l }, at: l.addedAt }); });
  });
  return out.sort((a, b) => b.at - a.at);
}
// what to post today
export function planFor(ms, data) {
  const f = festivalFor(ms, data.festivals);
  if (f) return "festival";
  const want = MKT_DAYPLAN[new Date(ms).getDay()];
  const ok = (t) => (t === "arrivals" ? data.arrivals > 0 : t === "offer" ? data.offers > 0 : t === "catalogue" ? data.items > 0 : true);
  if (ok(want)) return want;
  return ["arrivals", "offer", "catalogue", "tip"].find(ok) || "tip";
}
const money = (n) => "₹" + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-IN");
export function captionFor(type, d) {
  const shop = d.shop || "हमारा शोरूम", tail = [d.address && "📍 " + d.address, d.phone && "📞 " + d.phone, d.maps && "🗺 " + d.maps].filter(Boolean).join("\n");
  const tags = "#टाइल्स #Tiles #Sanitaryware #HomeDecor" + (d.city ? " #" + String(d.city).replace(/\s+/g, "") : "");
  let body = "";
  if (type === "festival") body = `🪔 ${d.festival} की हार्दिक शुभकामनाएँ! 🙏\nआपके घर में सुख, शांति और समृद्धि बनी रहे।\n– ${shop}`;
  else if (type === "arrivals") body = `✨ ${shop} में नया स्टॉक आ गया है!\n` + (d.items || []).slice(0, 6).map((x) => "• " + x).join("\n") + "\nआज ही शोरूम आइए और देखिए। 🏠";
  else if (type === "offer") body = `🏷 विशेष ऑफ़र – ${shop}\n` + (d.items || []).slice(0, 6).map((x) => "• " + x).join("\n") + "\nसीमित स्टॉक! ऑफ़र कीमत के लिए कॉल करें।";
  else if (type === "catalogue") body = `🏬 ${shop} – टाइल्स, सैनिटरीवेयर और फ़िटिंग्स की पूरी रेंज\n` + (d.cats || []).slice(0, 6).map((x) => "• " + x).join("\n") + "\nएक ही छत के नीचे सब कुछ।";
  else body = `💡 ${d.tip.t}\n` + d.tip.b.map((x) => "✔ " + x).join("\n") + `\n\nसही सामान और सलाह के लिए आइए – ${shop}`;
  return body + (tail ? "\n\n" + tail : "") + "\n\n" + tags;
}
// what the AI video should show (English scene for the model, the narration in Hindi)
export function veoPrompt(type, d) {
  const shop = d.shop || "our showroom";
  const end = " Vertical 9:16 format, realistic, warm natural light, smooth cinematic camera movement. No on-screen text, no subtitles, no logos, no watermarks.";
  if (type === "festival") return `Festive Indian home celebrating ${d.festivalEn || "the festival"}: diyas, flowers and rangoli on a beautiful polished tile floor, family smiling. A warm voice says in Hindi: "${d.festival} की हार्दिक शुभकामनाएँ, ${shop} की ओर से।"` + end;
  if (type === "tip") return `Short informative home-improvement clip: ${d.tip.scene}. A friendly Indian expert's voice says in Hindi: "${d.tip.say}"` + end;
  if (type === "arrivals") return `A premium Indian tile and sanitaryware showroom revealing new arrivals${d.what ? ": " + d.what : ""}, glossy tiles reflecting light, elegant bathroom and living room displays. A narrator says in Hindi: "${shop} में नया स्टॉक आ गया है, आज ही आइए!"` + end;
  if (type === "offer") return `A tile showroom with a special offer mood, stacks of beautiful tiles${d.what ? " (" + d.what + ")" : ""}, a shopkeeper welcoming customers. A narrator says in Hindi: "विशेष ऑफ़र! सीमित स्टॉक, आज ही ${shop} आइए।"` + end;
  return `A walk-through of a large, well-lit Indian tile and sanitaryware showroom: floor tiles, wall tiles, bathroom fittings, happy customers. A narrator says in Hindi: "टाइल्स और सैनिटरीवेयर की पूरी रेंज – ${shop}।"` + end;
}
/* </mktpure> */

const FEST_EN = { "दीपावली": "Diwali", "धनतेरस": "Dhanteras", "होली": "Holi", "गणेश चतुर्थी": "Ganesh Chaturthi", "गुढी पाडवा": "Gudi Padwa", "दशहरा": "Dussehra", "मकर संक्रांति": "Makar Sankranti",
  "नया साल": "New Year", "क्रिसमस": "Christmas", "रक्षाबंधन": "Raksha Bandhan", "जन्माष्टमी": "Janmashtami", "स्वतंत्रता दिवस": "Independence Day", "गणतंत्र दिवस": "Republic Day",
  "महाशिवरात्रि": "Maha Shivratri", "राम नवमी": "Ram Navami", "अक्षय तृतीया": "Akshaya Tritiya", "महाराष्ट्र दिवस": "Maharashtra Day", "गुरु नानक जयंती": "Guru Nanak Jayanti" };

export function initMarketing(ctx) {
  const { db, $, toast, askConfirm, loading, esc, fmtD, fmtDT, pushAlert } = ctx;
  const st = () => ctx.getState();
  const C = (n) => collection(db, "companies", st().companyID, n);
  const D = (n, id) => doc(db, "companies", st().companyID, n, id);
  const isAdmin = () => st().role === "ADMIN";
  const G = "https://graph.facebook.com/v25.0";
  const VEO = "https://generativelanguage.googleapis.com/v1beta";
  const DEF = { phone: "", address: "", city: "", tagline: "टाइल्स • सैनिटरीवेयर • फ़िटिंग्स", color: "#1f4011", auto: true, postTime: "10:00", autoVideo: "off",
    toFb: true, toIg: true, festivals: null, lastAuto: "", veoModel: "veo-3.1-fast-generate-preview" };
  let set = { ...DEF }, kit = {}, secrets = {}, log = [], unsub = [];
  const V = { tab: "today", type: "", items: [], size: "post", lastVideo: null, busy: false, veo: null };
  const errText = (e) => (e && e.code === "permission-denied" ? "The owner must publish the latest firestore.rules in Firebase first" : (e && e.message) || String(e));

  function start() {
    unsub.forEach((f) => { try { f(); } catch (e) {} });
    unsub = []; set = { ...DEF }; kit = {}; secrets = {}; log = [];
    if (!isAdmin()) return;
    const keep = (f) => { unsub.push(f); ctx.addUnsub(f); };
    keep(onSnapshot(D("settings", "marketing"), (s) => { set = { ...DEF, ...(s.exists() ? s.data() : {}) }; render(); }, (e) => console.warn("Marketing settings", e)));
    keep(onSnapshot(D("brand", "kit"), (s) => { kit = s.exists() ? s.data() : {}; }, () => {}));
    keep(onSnapshot(query(C("mktPosts"), where("at", ">=", new Date(Date.now() - 60 * DAY))), (s) => { log = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => tms(b.at) - tms(a.at)); render(); }, (e) => console.warn("Marketing log", e)));
    getDoc(D("private", "marketing")).then((s) => { secrets = s.exists() ? s.data() : {}; }).catch(() => {});
    const h = setInterval(autoTick, 60000);
    keep(() => clearInterval(h));
    setTimeout(autoTick, 15000);
  }
  const tms = (v) => (v && v.toDate ? v.toDate().getTime() : typeof v === "number" ? v : 0);
  const shopName = () => kit.bizName || st().companyName || "";
  const fests = () => (Array.isArray(set.festivals) && set.festivals.length ? set.festivals : MKT_FESTIVALS);

  /* ---------------- content of a post ---------------- */
  const itemLine = (i, l) => `${i.name}${i.size && i.size !== "-" ? " " + i.size : ""}${l && l.shade ? " (शेड " + l.shade + ")" : ""}${Number(i.price) > 0 ? " – " + money(i.price) + (i.unit && i.unit !== "-" ? "/" + i.unit : "") : ""}`;
  function content(type, pick, auto) {
    const S = st(), now = Date.now();
    const base = { shop: shopName(), phone: set.phone, address: set.address, city: set.city, maps: kit.maps || "" };
    if (type === "festival") {
      const f = festivalFor(now, fests()), name = (!auto && V.festName) || (f && f.name) || V.festName || (fests()[0] || [])[1] || "शुभ अवसर";
      return { ...base, type, festival: name, festivalEn: FEST_EN[name] || "", photos: [] };
    }
    if (type === "tip") { const tip = !auto && V.tipIdx !== undefined ? MKT_TIPS[V.tipIdx] : tipFor(now); return { ...base, type, tip, photos: [] }; }
    if (type === "arrivals") {
      const list = (pick && pick.length ? pick.map((id) => ({ item: S.inventory.find((x) => x.id === id), lot: null })).filter((x) => x.item) : newArrivals(S.inventory, now)).slice(0, 6);
      return { ...base, type, list, items: list.map((x) => itemLine(x.item, x.lot)), what: list.map((x) => x.item.name).slice(0, 3).join(", ") };
    }
    if (type === "offer") {
      const list = (pick && pick.length ? pick.map((id) => ({ item: S.inventory.find((x) => x.id === id) })).filter((x) => x.item) : ctx.deadStock(S.inventory, S.history, 60, now).map((r) => ({ item: r.item }))).slice(0, 6);
      return { ...base, type, list, items: list.map((x) => itemLine(x.item)), what: list.map((x) => x.item.name).slice(0, 3).join(", ") };
    }
    const cats = {};
    S.inventory.forEach((i) => { const c = i.category || "General", p = Number(i.price) || 0; const x = cats[c] = cats[c] || { n: 0, min: Infinity, max: 0, items: [] }; x.n++; if (p) { x.min = Math.min(x.min, p); x.max = Math.max(x.max, p); } x.items.push(i); });
    const catList = Object.entries(cats).sort((a, b) => b[1].n - a[1].n).slice(0, 6);
    const list = catList.map(([, x]) => ({ item: x.items.find((i) => i.photo) || x.items[0] }));
    return { ...base, type: "catalogue", list, cats: catList.map(([c, x]) => `${c}${x.max ? " – " + money(x.min) + (x.max > x.min ? " से " + money(x.max) : "") : ""}`) };
  }

  /* ---------------- photos ---------------- */
  const imgCache = {};
  function loadImg(src) {
    return new Promise((res) => { if (!src) return res(null); const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  }
  async function photoOf(item, lot) {
    const key = item.id + "_" + (lot ? lot.id : "");
    if (imgCache[key] !== undefined) return imgCache[key];
    let src = "";
    try { const d = await getDoc(D("itemPhotos", lot ? item.id + "_" + lot.id : item.id)); if (d.exists() && d.data().img) src = d.data().img; } catch (e) {}
    if (!src) src = (lot && lot.photo) || item.photo || item.photoUrl || "";
    return (imgCache[key] = await loadImg(src));
  }
  async function showroomPhoto() {
    if (imgCache._show !== undefined) return imgCache._show;
    let src = "";
    try { const d = await getDoc(D("brand", "showroom")); if (d.exists()) src = d.data().img || ""; } catch (e) {}
    return (imgCache._show = await loadImg(src));
  }

  /* ---------------- 🖼 pamphlet (canvas) ---------------- */
  const FONT = "'Noto Sans Devanagari','Mangal','Nirmala UI','Segoe UI',sans-serif";
  function wrap(g, text, maxW) {
    const words = String(text || "").split(/\s+/), lines = [];
    let cur = "";
    words.forEach((w) => { const t = cur ? cur + " " + w : w; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur);
    return lines;
  }
  function textBlock(g, text, x, y, maxW, size, weight, color, align, lh, maxLines) {
    g.font = `${weight || 700} ${size}px ${FONT}`; g.fillStyle = color; g.textAlign = align || "center"; g.textBaseline = "top";
    let lines = wrap(g, text, maxW);
    if (maxLines && lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] += "…"; }
    lines.forEach((ln, i) => g.fillText(ln, x, y + i * size * (lh || 1.25)));
    return y + lines.length * size * (lh || 1.25);
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function cover(g, im, x, y, w, h, zoom, px, py) {
    const s = Math.max(w / im.width, h / im.height) * (zoom || 1), iw = im.width * s, ih = im.height * s;
    g.drawImage(im, x + (w - iw) / 2 + (px || 0) * (iw - w) / 2, y + (h - ih) / 2 + (py || 0) * (ih - h) / 2, iw, ih);
  }
  async function pamphlet(c, size) {
    const W = 1080, H = size === "story" ? 1920 : 1350;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    try { if (document.fonts && document.fonts.load) await document.fonts.load(`700 40px ${FONT}`, "टाइल"); } catch (e) {}
    const fest = c.type === "festival";
    const bg = g.createLinearGradient(0, 0, W, H);
    if (fest) { bg.addColorStop(0, "#7a1f00"); bg.addColorStop(0.5, "#c2410c"); bg.addColorStop(1, "#facc15"); }
    else { bg.addColorStop(0, "#0b1d0e"); bg.addColorStop(1, set.color || "#1f4011"); }
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // decoration
    g.globalAlpha = 0.08; g.fillStyle = "#fff";
    for (let i = 0; i < 6; i++) { g.beginPath(); g.arc((i * 233) % W, (i * 397) % H, 120 + i * 30, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1;
    // header: shop name
    const accent = fest ? "#fff7ae" : "#39ff14";
    let y = 50;
    y = textBlock(g, c.shop, W / 2, y, W - 120, 64, 800, "#ffffff", "center", 1.15, 2);
    if (set.tagline) y = textBlock(g, set.tagline, W / 2, y + 6, W - 140, 32, 500, accent, "center", 1.2, 1);
    g.fillStyle = accent; g.fillRect(W / 2 - 120, y + 18, 240, 6); y += 50;
    const footerH = 210, bottom = H - footerH;
    if (fest) {
      g.font = `400 220px ${FONT}`; g.textAlign = "center"; g.textBaseline = "top"; g.fillText("🪔", W / 2, y + 20);
      y = textBlock(g, c.festival, W / 2, y + 290, W - 120, 104, 800, "#ffffff", "center", 1.15, 2);
      y = textBlock(g, "की हार्दिक शुभकामनाएँ", W / 2, y + 10, W - 120, 66, 700, "#fff7ae", "center", 1.2, 2);
      textBlock(g, "आपके घर में सुख, शांति और समृद्धि बनी रहे 🙏", W / 2, y + 40, W - 160, 42, 500, "#ffffff", "center", 1.3, 3);
    } else if (c.type === "tip") {
      y = textBlock(g, "💡 काम की बात", W / 2, y, W - 120, 44, 700, accent, "center", 1.2, 1);
      y = textBlock(g, c.tip.t, W / 2, y + 16, W - 120, 74, 800, "#ffffff", "center", 1.2, 3) + 30;
      const boxH = Math.min(bottom - y - 30, 96 * c.tip.b.length + 50);
      g.fillStyle = "rgba(255,255,255,0.95)"; rr(g, 60, y, W - 120, boxH, 36); g.fill();
      let by = y + 36;
      c.tip.b.forEach((b, i) => {
        g.fillStyle = set.color || "#1f4011"; g.beginPath(); g.arc(120, by + 26, 30, 0, Math.PI * 2); g.fill();
        g.font = `800 34px ${FONT}`; g.fillStyle = "#39ff14"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(i + 1), 120, by + 27);
        by = Math.max(by + 80, textBlock(g, b, 175, by, W - 280, 42, 600, "#1a1a1a", "left", 1.25, 2) + 24);
      });
    } else {
      const head = { arrivals: "✨ नया स्टॉक आ गया है!", offer: "🏷 विशेष ऑफ़र – सीमित स्टॉक", catalogue: "🏬 हमारा शोरूम – पूरी रेंज" }[c.type];
      y = textBlock(g, head, W / 2, y, W - 100, 66, 800, "#ffffff", "center", 1.2, 2) + 20;
      const list = (c.list || []).slice(0, 4), photos = await Promise.all(list.map((x) => photoOf(x.item, x.lot)));
      const show = c.type === "catalogue" && !photos.some(Boolean) ? await showroomPhoto() : null;
      const gridH = Math.max(300, bottom - y - (c.type === "catalogue" ? 300 : c.type === "offer" ? 110 : 40));
      if (show) { g.save(); rr(g, 60, y, W - 120, gridH, 30); g.clip(); cover(g, show, 60, y, W - 120, gridH); g.restore(); y += gridH + 20; }
      else if (list.length) {
        const n = list.length, cols = n === 1 ? 1 : 2, rows = Math.ceil(n / cols), gap = 24, cw = (W - 120 - gap * (cols - 1)) / cols, ch = (gridH - gap * (rows - 1)) / rows;
        list.forEach((x, i) => {
          const cx = 60 + (i % cols) * (cw + gap), cy = y + Math.floor(i / cols) * (ch + gap);
          g.save(); rr(g, cx, cy, cw, ch, 26); g.clip();
          if (photos[i]) cover(g, photos[i], cx, cy, cw, ch); else { g.fillStyle = "#e9ecef"; g.fillRect(cx, cy, cw, ch); g.font = `400 ${Math.min(cw, ch) / 3}px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("🧱", cx + cw / 2, cy + ch / 2 - 20); }
          const lab = g.createLinearGradient(0, cy + ch - 150, 0, cy + ch); lab.addColorStop(0, "rgba(0,0,0,0)"); lab.addColorStop(1, "rgba(0,0,0,0.85)");
          g.fillStyle = lab; g.fillRect(cx, cy + ch - 150, cw, 150);
          g.restore();
          const nm = x.item.name + (x.item.size && x.item.size !== "-" ? " · " + x.item.size : "") + (x.lot && x.lot.shade ? " · शेड " + x.lot.shade : "");
          const fs = n === 1 ? 46 : 34;
          g.font = `700 ${fs}px ${FONT}`;
          const nl = Math.min(2, wrap(g, nm, cw - 40).length);
          textBlock(g, nm, cx + 20, cy + ch - 20 - nl * fs * 1.15, cw - 40, fs, 700, "#ffffff", "left", 1.15, 2);
          if (Number(x.item.price) > 0 && c.type !== "offer") {
            const pt = money(x.item.price) + (x.item.unit && x.item.unit !== "-" ? "/" + x.item.unit : "");
            const ph = n === 1 ? 56 : 46;
            g.font = `800 ${n === 1 ? 44 : 32}px ${FONT}`; const pw = g.measureText(pt).width + 36;
            g.fillStyle = "#39ff14"; rr(g, cx + 16, cy + 16, pw, ph, 23); g.fill();
            g.fillStyle = "#0b1d0e"; g.textAlign = "left"; g.textBaseline = "middle"; g.fillText(pt, cx + 34, cy + 16 + ph / 2 + 1);
          }
          if (c.type === "offer") { g.fillStyle = "#dc2626"; rr(g, cx + cw - 170, cy + 18, 150, 54, 27); g.fill(); g.font = `800 30px ${FONT}`; g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("ऑफ़र", cx + cw - 95, cy + 46); }
        });
        y += gridH + 20;
      }
      if (c.type === "catalogue" && c.cats && c.cats.length) {
        g.fillStyle = "rgba(255,255,255,0.95)"; rr(g, 60, y, W - 120, bottom - y - 20, 28); g.fill();
        let cy = y + 22;
        c.cats.slice(0, 5).forEach((t) => { if (cy < bottom - 60) cy = textBlock(g, "✔ " + t, 100, cy, W - 200, 34, 600, "#1a1a1a", "left", 1.2, 1) + 8; });
      }
      if (c.type === "offer") textBlock(g, "ऑफ़र कीमत के लिए अभी कॉल करें!", W / 2, bottom - 80, W - 120, 46, 800, "#fde047", "center", 1.2, 1);
    }
    // footer: contact
    g.fillStyle = "rgba(0,0,0,0.55)"; g.fillRect(0, bottom, W, footerH);
    g.fillStyle = accent; g.fillRect(0, bottom, W, 6);
    let fy = bottom + 26;
    if (c.phone) fy = textBlock(g, "📞 " + c.phone, W / 2, fy, W - 80, 52, 800, "#ffffff", "center", 1.15, 1) + 6;
    if (c.address) fy = textBlock(g, "📍 " + c.address, W / 2, fy, W - 80, 32, 500, "#e5e7eb", "center", 1.2, 2) + 4;
    if (!c.phone && !c.address) textBlock(g, "📍 हमारे शोरूम पर ज़रूर आइए", W / 2, fy, W - 80, 40, 700, "#ffffff", "center", 1.2, 1);
    if (kit.instagram && fy < H - 50) textBlock(g, "📷 " + String(kit.instagram).replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""), W / 2, Math.min(fy + 4, H - 48), W - 80, 28, 500, "#d1d5db", "center", 1.2, 1);
    return cv;
  }
  const toBlob = (cv, type, q) => new Promise((res) => cv.toBlob(res, type || "image/jpeg", q || 0.9));

  /* ---------------- 🎞 slideshow video (made on the phone, no cost) ---------------- */
  function pickMime() {
    const list = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    return list.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || "";
  }
  // soft background music made in the browser (no copyright)
  function music(seconds) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      const ac = new AC(), dest = ac.createMediaStreamDestination(), master = ac.createGain();
      master.gain.value = 0.0001; master.connect(dest);
      const t0 = ac.currentTime + 0.05;
      master.gain.exponentialRampToValueAtTime(0.18, t0 + 1.2);
      master.gain.setValueAtTime(0.18, t0 + Math.max(1.3, seconds - 1.5));
      master.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
      const chords = [[261.63, 329.63, 392.0], [196.0, 246.94, 293.66], [220.0, 261.63, 329.63], [174.61, 220.0, 261.63]];
      for (let b = 0; b * 2 < seconds; b++) {
        const ch = chords[b % 4], at = t0 + b * 2;
        ch.forEach((f, k) => {
          const o = ac.createOscillator(), gg = ac.createGain(); o.type = k ? "sine" : "triangle"; o.frequency.value = f / (k ? 1 : 2);
          gg.gain.setValueAtTime(0.0001, at); gg.gain.exponentialRampToValueAtTime(0.25, at + 0.3); gg.gain.exponentialRampToValueAtTime(0.0001, at + 2.1);
          o.connect(gg); gg.connect(master); o.start(at); o.stop(at + 2.2);
        });
        [0, 0.5, 1, 1.5].forEach((d, k) => { const o = ac.createOscillator(), gg = ac.createGain(); o.type = "sine"; o.frequency.value = ch[k % 3] * 2;
          gg.gain.setValueAtTime(0.0001, at + d); gg.gain.exponentialRampToValueAtTime(0.12, at + d + 0.03); gg.gain.exponentialRampToValueAtTime(0.0001, at + d + 0.45);
          o.connect(gg); gg.connect(master); o.start(at + d); o.stop(at + d + 0.5); });
      }
      return { track: dest.stream.getAudioTracks()[0], close: () => ac.close().catch(() => {}) };
    } catch (e) { return null; }
  }
  // record a canvas animation: draw(g, t, W, H) for `seconds`; extra audio track optional
  function record(seconds, draw, audioTrack, onProgress) {
    return new Promise((resolve, reject) => {
      const W = 720, H = 1280, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      const g = cv.getContext("2d"), mime = pickMime();
      if (!cv.captureStream || !window.MediaRecorder) return reject(new Error("This browser cannot make videos. Use Chrome on Android or a computer"));
      const stream = cv.captureStream(30);
      if (audioTrack) stream.addTrack(audioTrack);
      let rec;
      try { rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 4000000 } : undefined); } catch (e) { return reject(e); }
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => resolve(new Blob(chunks, { type: (rec.mimeType || mime || "video/webm").split(";")[0] }));
      const t0 = performance.now();
      draw(g, 0, W, H);
      rec.start(500);
      const step = () => {
        const t = (performance.now() - t0) / 1000;
        if (t >= seconds) { draw(g, seconds, W, H); setTimeout(() => rec.state !== "inactive" && rec.stop(), 120); return; }
        draw(g, t, W, H);
        if (onProgress) onProgress(t / seconds);
        setTimeout(step, 33);
      };
      step();
    });
  }
  function brandCard(g, W, H, title, sub) {
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, "#0b1d0e"); bg.addColorStop(1, set.color || "#1f4011");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    let y = H * 0.3;
    y = textBlock(g, title, W / 2, y, W - 80, 58, 800, "#ffffff", "center", 1.2, 3);
    if (sub) y = textBlock(g, sub, W / 2, y + 20, W - 100, 34, 600, "#39ff14", "center", 1.3, 4);
    return y;
  }
  function contactCard(g, W, H, a) {
    g.globalAlpha = a; brandCard(g, W, H, shopName(), set.tagline || "");
    let y = H * 0.62;
    if (set.phone) y = textBlock(g, "📞 " + set.phone, W / 2, y, W - 60, 46, 800, "#ffffff", "center", 1.2, 1) + 10;
    if (set.address) y = textBlock(g, "📍 " + set.address, W / 2, y, W - 80, 28, 500, "#e5e7eb", "center", 1.25, 3) + 10;
    textBlock(g, "आज ही शोरूम आइए! 🙏", W / 2, Math.min(y + 10, H - 120), W - 80, 38, 700, "#fde047", "center", 1.2, 1);
    g.globalAlpha = 1;
  }
  async function slideshow(c, onProgress) {
    // slides: photos of the items / shades, or the showroom photo, or the pamphlet itself
    const slides = [];
    for (const x of (c.list || []).slice(0, 6)) {
      const im = await photoOf(x.item, x.lot);
      if (im) slides.push({ im, title: x.item.name + (x.item.size && x.item.size !== "-" ? " · " + x.item.size : "") + (x.lot && x.lot.shade ? " · शेड " + x.lot.shade : ""),
        sub: Number(x.item.price) > 0 && c.type !== "offer" ? money(x.item.price) + (x.item.unit && x.item.unit !== "-" ? "/" + x.item.unit : "") : c.type === "offer" ? "विशेष ऑफ़र" : "" });
    }
    const show = await showroomPhoto();
    if (!slides.length && show) slides.push({ im: show, title: c.type === "festival" ? c.festival + " की शुभकामनाएँ" : "हमारा शोरूम", sub: "" });
    if (c.type === "tip") (c.tip.b || []).forEach((b, i) => slides.push({ im: null, title: (i + 1) + ". " + b, sub: c.tip.t, card: true }));
    if (!slides.length) { const pm = await pamphlet(c, "story"); slides.push({ im: pm, title: "", sub: "", whole: true }); }
    const intro = { arrivals: "✨ नया स्टॉक आ गया है!", offer: "🏷 विशेष ऑफ़र!", catalogue: "🏬 हमारा शोरूम", festival: "🪔 " + (c.festival || "") + " की हार्दिक शुभकामनाएँ", tip: "💡 " + (c.tip ? c.tip.t : "") }[c.type];
    const per = c.type === "tip" ? 3.2 : 3, introS = 2.5, outroS = 3.5, total = introS + slides.length * per + outroS, fade = 0.6;
    const m = music(total);
    const draw = (g, t, W, H) => {
      g.globalAlpha = 1;
      if (t < introS) { brandCard(g, W, H, shopName(), intro); return; }
      const s = t - introS, i = Math.floor(s / per);
      if (i >= slides.length) { contactCard(g, W, H, Math.min(1, (s - slides.length * per) / fade)); return; }
      const drawSlide = (k, alpha) => {
        const sl = slides[k], local = s - k * per, p = Math.min(1, Math.max(0, local / per));
        g.globalAlpha = alpha;
        if (sl.card || !sl.im) { brandCard(g, W, H, sl.title, sl.sub); }
        else if (sl.whole) { g.fillStyle = "#000"; g.fillRect(0, 0, W, H); cover(g, sl.im, 0, 0, W, H, 1 + 0.06 * p); }
        else {
          g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
          cover(g, sl.im, 0, 0, W, H, 1.05 + 0.15 * p, (k % 2 ? 1 : -1) * (p - 0.5) * 0.8, 0.2 - 0.4 * p); // Ken Burns zoom and pan
          const gr = g.createLinearGradient(0, H - 420, 0, H); gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,0.85)");
          g.fillStyle = gr; g.fillRect(0, H - 420, W, 420);
          const slide = Math.min(1, local / 0.5) * alpha;
          g.globalAlpha = slide;
          const ty = textBlock(g, sl.title, 40, H - 300 + (1 - Math.min(1, local / 0.5)) * 40, W - 80, 46, 800, "#ffffff", "left", 1.2, 3);
          if (sl.sub) { g.font = `800 40px ${FONT}`; const w = g.measureText(sl.sub).width + 40; g.fillStyle = "#39ff14"; rr(g, 40, ty + 10, w, 60, 30); g.fill(); g.fillStyle = "#0b1d0e"; g.textAlign = "left"; g.textBaseline = "middle"; g.fillText(sl.sub, 60, ty + 41); }
          g.globalAlpha = alpha;
          g.font = `700 28px ${FONT}`; g.fillStyle = "rgba(255,255,255,0.9)"; g.textAlign = "right"; g.textBaseline = "top"; g.fillText(shopName(), W - 30, 36);
        }
        g.globalAlpha = 1;
      };
      drawSlide(i, 1);
      const into = s - i * per;
      if (into < fade) { g.save(); g.globalAlpha = 1 - into / fade; if (i > 0) drawSlide(i - 1, 1 - into / fade); else brandCard(g, W, H, shopName(), intro); g.restore(); }
    };
    try { return await record(total, draw, m && m.track, onProgress); }
    finally { if (m) setTimeout(m.close, 500); }
  }

  /* ---------------- 🤖 AI video (Google Veo) ---------------- */
  async function veoVideo(c, onStatus) {
    const key = (secrets.geminiKey || "").trim();
    if (!key) throw new Error("Add your Google Gemini API key in 🎬 Marketing → ⚙ Settings first");
    const model = (set.veoModel || DEF.veoModel).trim();
    const prompt = veoPrompt(c.type, c);
    onStatus && onStatus("Sending to Google Veo...");
    let r = await fetch(`${VEO}/models/${encodeURIComponent(model)}:predictLongRunning`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ instances: [{ prompt }], parameters: { aspectRatio: "9:16", negativePrompt: "on-screen text, subtitles, watermark, logo, blurry, low quality" } }) });
    let j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error("Google Veo: " + ((j.error && j.error.message) || r.status));
    const name = j.name, started = Date.now();
    while (true) {
      await new Promise((res) => setTimeout(res, window.__mkPoll || 10000));
      const secs = Math.round((Date.now() - started) / 1000);
      onStatus && onStatus(`Google Veo is making the video... ${secs} s (usually 1–3 minutes)`);
      r = await fetch(`${VEO}/${name}`, { headers: { "x-goog-api-key": key } });
      j = await r.json().catch(() => ({}));
      if (j.error) throw new Error("Google Veo: " + j.error.message);
      if (j.done) break;
      if (Date.now() - started > 8 * 60000) throw new Error("Google Veo is taking too long. Try again later");
    }
    const resp = j.response || {}, sample = ((resp.generateVideoResponse || {}).generatedSamples || resp.generatedVideos || [])[0];
    const uri = sample && sample.video && (sample.video.uri || sample.video.url);
    if (!uri) throw new Error("Google Veo did not return a video (it may have been blocked by its safety filter). Try another topic");
    onStatus && onStatus("Downloading the video...");
    r = await fetch(uri + (uri.includes("?") ? "&" : "?") + "key=" + encodeURIComponent(key));
    if (!r.ok) throw new Error("Could not download the video (" + r.status + ")");
    return { blob: await r.blob(), prompt };
  }
  // put the shop name on the AI video and add the contact card at the end (sound is kept)
  async function brandVideo(blob, onProgress) {
    const url = URL.createObjectURL(blob), v = document.createElement("video");
    v.src = url; v.muted = false; v.playsInline = true; v.crossOrigin = "anonymous";
    await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error("The video could not be opened")); });
    const dur = Math.min(v.duration || 8, 30), outro = 3;
    let audio = null, ac = null;
    try { const AC = window.AudioContext || window.webkitAudioContext; ac = new AC(); const src = ac.createMediaElementSource(v), dest = ac.createMediaStreamDestination(); src.connect(dest); audio = dest.stream.getAudioTracks()[0]; } catch (e) {}
    await v.play().catch(() => {});
    const draw = (g, t, W, H) => {
      if (t < dur) {
        g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
        if (v.videoWidth) cover(g, v, 0, 0, W, H);
        g.fillStyle = "rgba(0,0,0,0.5)"; rr(g, 20, 24, W - 40, 70, 35); g.fill();
        textBlock(g, shopName() + (set.phone ? "  📞 " + set.phone : ""), W / 2, 40, W - 80, 32, 800, "#ffffff", "center", 1.1, 1);
      } else contactCard(g, W, H, Math.min(1, (t - dur) / 0.5));
    };
    try { return await record(dur + outro, draw, audio, onProgress); }
    finally { v.pause(); URL.revokeObjectURL(url); if (ac) ac.close().catch(() => {}); }
  }

  /* ---------------- share / download ---------------- */
  const ext = (b) => (b.type.includes("mp4") ? "mp4" : b.type.includes("webm") ? "webm" : b.type.includes("png") ? "png" : "jpg");
  async function share(blob, caption, base) {
    const file = new File([blob], (base || "post") + "." + ext(blob), { type: blob.type });
    try { await navigator.clipboard.writeText(caption); } catch (e) {}
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text: caption }); return "shared"; } catch (e) { if (e && e.name === "AbortError") return "cancel"; }
    }
    download(blob, base);
    toast("Saved to your phone. The caption is copied – paste it when you post");
    return "saved";
  }
  function download(blob, base) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = (base || "post") + "." + ext(blob);
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }

  /* ---------------- 📤 Facebook Page and Instagram (Meta Graph API) ---------------- */
  const metaReady = () => !!(secrets.pageId && secrets.pageToken);
  async function gj(r) { const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error("Facebook: " + ((j.error && (j.error.error_user_msg || j.error.message)) || r.status)); return j; }
  async function fbPhoto(blob, caption, published) {
    const f = new FormData(); f.append("source", blob, "post.jpg"); f.append("message", caption); f.append("published", published === false ? "false" : "true"); f.append("access_token", secrets.pageToken);
    return gj(await fetch(`${G}/${secrets.pageId}/photos`, { method: "POST", body: f }));
  }
  async function igImage(blob, caption) {
    // Instagram needs the picture on a public web address: it is first put on the Facebook Page (hidden), and Instagram takes it from there
    const ph = await fbPhoto(blob, caption, false);
    const info = await gj(await fetch(`${G}/${ph.id}?fields=images&access_token=${encodeURIComponent(secrets.pageToken)}`));
    const url = info.images && info.images[0] && info.images[0].source;
    if (!url) throw new Error("Instagram: the picture address was not found");
    const c = await gj(await fetch(`${G}/${secrets.igId}/media`, { method: "POST", body: new URLSearchParams({ image_url: url, caption, access_token: secrets.pageToken }) }));
    return gj(await fetch(`${G}/${secrets.igId}/media_publish`, { method: "POST", body: new URLSearchParams({ creation_id: c.id, access_token: secrets.pageToken }) }));
  }
  async function fbReel(blob, caption) {
    const s = await gj(await fetch(`${G}/${secrets.pageId}/video_reels`, { method: "POST", body: new URLSearchParams({ upload_phase: "start", access_token: secrets.pageToken }) }));
    const up = await fetch(s.upload_url || `https://rupload.facebook.com/video-upload/v25.0/${s.video_id}`, { method: "POST", headers: { Authorization: "OAuth " + secrets.pageToken, offset: "0", file_size: String(blob.size) }, body: blob });
    await gj(up);
    return gj(await fetch(`${G}/${secrets.pageId}/video_reels`, { method: "POST", body: new URLSearchParams({ upload_phase: "finish", video_id: s.video_id, video_state: "PUBLISHED", description: caption, access_token: secrets.pageToken }) }));
  }
  async function igReel(blob, caption) {
    if (!blob.type.includes("mp4")) throw new Error("Instagram needs an MP4 video. This phone made a WebM video – share it by hand");
    const c = await gj(await fetch(`${G}/${secrets.igId}/media`, { method: "POST", body: new URLSearchParams({ media_type: "REELS", upload_type: "resumable", caption, access_token: secrets.pageToken }) }));
    await gj(await fetch(`https://rupload.facebook.com/ig-api-upload/v25.0/${c.id}`, { method: "POST", headers: { Authorization: "OAuth " + secrets.pageToken, offset: "0", file_size: String(blob.size) }, body: blob }));
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, window.__mkPoll || 6000));
      const s = await gj(await fetch(`${G}/${c.id}?fields=status_code&access_token=${encodeURIComponent(secrets.pageToken)}`));
      if (s.status_code === "FINISHED") break;
      if (s.status_code === "ERROR") throw new Error("Instagram could not process the video");
    }
    return gj(await fetch(`${G}/${secrets.igId}/media_publish`, { method: "POST", body: new URLSearchParams({ creation_id: c.id, access_token: secrets.pageToken }) }));
  }
  async function publish(blob, caption, kind, title, isVideo) {
    const done = [], errs = [];
    if (set.toFb !== false) { try { await (isVideo ? fbReel : fbPhoto)(blob, caption); done.push("Facebook"); } catch (e) { errs.push(e.message); } }
    if (set.toIg !== false && secrets.igId) { try { await (isVideo ? igReel : igImage)(blob, caption); done.push("Instagram"); } catch (e) { errs.push(e.message); } }
    try { await addDoc(C("mktPosts"), { at: serverTimestamp(), kind, title, video: !!isVideo, platforms: done, error: errs.join(" | "), by: st().name || "Owner" }); } catch (e) {}
    return { done, errs };
  }

  /* ---------------- 🗓 automatic daily post ---------------- */
  let autoBusy = false;
  async function autoTick() {
    if (!isAdmin() || autoBusy || set.auto === false) return;
    const now = Date.now(), today = dk(now), d = new Date(now), [hh, mm] = String(set.postTime || "10:00").split(":").map(Number);
    if (set.lastAuto === today || d.getHours() * 60 + d.getMinutes() < (hh || 0) * 60 + (mm || 0)) return;
    autoBusy = true;
    try {
      await setDoc(D("settings", "marketing"), { lastAuto: today }, { merge: true });
      set.lastAuto = today;
      const type = todayType(), c = content(type, null, true), cap = captionFor(type, c);
      const img = await toBlob(await pamphlet(c, "post"));
      if (metaReady()) {
        const r = await publish(img, cap, type, MKT_TYPES[type], false);
        let vid = "";
        if (set.autoVideo === "slideshow" || set.autoVideo === "ai") {
          try {
            const vb = set.autoVideo === "ai" ? await brandVideo((await veoVideo(c)).blob) : await slideshow(c);
            const rv = await publish(vb, cap, type, MKT_TYPES[type] + " (video)", true);
            vid = rv.done.length ? " + video" : "";
          } catch (e) { console.warn("Auto video", e); }
        }
        pushAlert(r.done.length ? `<b>📣 Today's post is on ${r.done.join(" and ")}${vid}</b><br><small>${esc(MKT_TYPES[type])}</small>` : `<b>⚠ Today's post could not be posted</b><br><small>${esc(r.errs.join(" | ").slice(0, 160))}</small>`, r.done.length ? "enter" : "left");
      } else {
        pushAlert(`<b>📣 Today's marketing post is ready</b><br><small>Tap to see it and share it</small>`, "enter");
        const card = document.querySelector("#alertStack .move-alert");
        if (card) card.onclick = () => { card.remove(); open("today"); };
      }
    } catch (e) { console.warn("Auto marketing", e); }
    finally { autoBusy = false; }
  }
  function todayType() {
    const S = st(), now = Date.now();
    return planFor(now, { festivals: fests(), arrivals: newArrivals(S.inventory, now).length, offers: ctx.deadStock(S.inventory, S.history, 60, now).length, items: S.inventory.length });
  }

  /* =====================================================================
     the 🎬 Marketing window
     ===================================================================== */
  const TABS = [["today", "📅 Today"], ["create", "🖼 Create"], ["videos", "🎞 Videos"], ["posted", "📤 Posted"], ["settings", "⚙ Settings"]];
  function open(tab) { if (!isAdmin()) return; if (tab) V.tab = tab; $("mktModal").classList.add("open"); render(true); }
  const close = () => $("mktModal").classList.remove("open");
  const go = (t) => { V.tab = t; render(true); };
  let editing = false;
  function render(force) {
    const el = $("mktBody");
    if (!el || !$("mktModal").classList.contains("open") || (editing && !force) || (V.busy && !force)) return;
    editing = false;
    $("mktTabs").innerHTML = TABS.map(([k, l]) => `<button class="stab ${V.tab === k ? "on" : ""}" onclick="MK.go('${k}')">${l}</button>`).join("");
    el.innerHTML = ({ today: viewToday, create: viewCreate, videos: viewVideos, posted: viewPosted, settings: viewSettings }[V.tab] || viewToday)();
    if (V.tab === "today" || V.tab === "create") drawPreview();
  }
  const setupHint = () => (!set.phone && !set.address ? `<p class="calc-warn">Add your shop phone number and address in ⚙ Settings – they are printed on every pamphlet and video.</p>` : "");
  function viewToday() {
    const type = V.type && V.tab === "today" ? V.type : todayType();
    V.cur = { type, pick: [], auto: true };
    const f = festivalFor(Date.now(), fests());
    return setupHint() + `<p class="hint">Every day the app makes a new post by itself: festival greetings before festivals, otherwise new arrivals, offers on slow stock, the showroom catalogue and tile &amp; plumbing tips in turn.</p>
      ${set.auto !== false ? `<p class="hint">${metaReady() ? (secrets.igId ? "Posted to Facebook and Instagram at" : "Posted to Facebook at") + " " + esc(set.postTime) : "Connect Facebook / Instagram in ⚙ Settings to post it automatically."}</p>` : ""}
      <div class="task-card" style="flex-direction:column; align-items:stretch">
        <div class="task-title">📅 Today: ${esc(MKT_TYPES[type])}${f ? ` <span class="chip chip-yellow">🪔 ${esc(f.name)}</span>` : ""}</div>
        ${previewBlock()}
      </div>`;
  }
  function previewBlock() {
    return `<div class="mkt-prev"><canvas id="mktCanvas" width="1080" height="1350"></canvas></div>
      <div class="suite-bar"><button class="auth-btn ${V.size === "post" ? "on" : ""}" onclick="MK.size('post')">Post (4:5)</button><button class="auth-btn ${V.size === "story" ? "on" : ""}" onclick="MK.size('story')">Status / Story (9:16)</button></div>
      <label class="task-label">Caption (Hindi)</label><textarea id="mktCap" class="task-input notr" rows="6" onfocus="MK.typing()"></textarea>
      <div class="calc-actions">
        <button class="role-btn" style="background:#25D366" onclick="MK.sharePam()">📲 Share pamphlet</button>
        <button class="auth-btn" onclick="MK.dlPam()">⬇ Download</button>
        ${metaReady() ? `<button class="auth-btn" style="background:#1877f2" onclick="MK.postPam()">📤 Post now</button>` : ""}
      </div>
      <div class="calc-actions">
        <button class="auth-btn" style="background:#0e7490" onclick="MK.makeSlide()">🎞 Make slideshow video</button>
        <button class="auth-btn" style="background:#7c3aed" onclick="MK.makeAi()">🤖 Make AI video</button>
      </div>
      <div id="mktVid"></div>`;
  }
  async function drawPreview() {
    const cv = $("mktCanvas"); if (!cv || !V.cur) return;
    const c = content(V.cur.type, V.cur.pick, V.cur.auto);
    V.cur.c = c;
    const capEl = $("mktCap"); if (capEl && !capEl.dataset.touched) capEl.value = captionFor(V.cur.type, c);
    const pm = await pamphlet(c, V.size);
    if (!$("mktCanvas")) return;
    cv.width = pm.width; cv.height = pm.height; cv.getContext("2d").drawImage(pm, 0, 0);
    V.cur.canvas = pm;
    showVid();
  }
  function viewCreate() {
    const S = st(), type = V.type || "arrivals";
    V.cur = { type, pick: V.items };
    const items = S.inventory.slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return setupHint() + `<label class="task-label">What to make</label>
      <select onchange="MK.type(this.value)" style="width:95%">${Object.entries(MKT_TYPES).map(([k, l]) => `<option value="${k}" ${k === type ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
      ${type === "festival" ? `<label class="task-label">Festival</label><select onchange="MK.fest(this.value)" style="width:95%">${fests().map(([d, n]) => `<option value="${esc(n)}" ${V.festName === n ? "selected" : ""}>${esc(n)} – ${esc(fmtD(new Date(d + "T00:00:00")))}</option>`).join("")}</select>` : ""}
      ${type === "tip" ? `<label class="task-label">Tip</label><select onchange="MK.tip(this.value)" style="width:95%" class="notr">${MKT_TIPS.map((t, i) => `<option value="${i}" ${V.tipIdx === i ? "selected" : ""}>${esc(t.t)}</option>`).join("")}</select>` : ""}
      ${type === "arrivals" || type === "offer" ? `<label class="task-label">Items (up to 4 photos; none ticked = chosen automatically)</label>
        <div class="mkt-items">${items.map((i) => `<label class="notr"><input type="checkbox" ${V.items.includes(i.id) ? "checked" : ""} onchange="MK.pick('${esc(i.id)}',this.checked)"> ${esc(i.name)}${i.size && i.size !== "-" ? " · " + esc(i.size) : ""}</label>`).join("") || "<p class='hint'>No items in stock yet.</p>"}</div>` : ""}
      <div class="task-card" style="flex-direction:column; align-items:stretch; margin-top:10px">${previewBlock()}</div>`;
  }
  function viewVideos() {
    return `<p class="hint">🎞 <b>Slideshow video</b>: made on this phone from your stock / shade photos with moving zoom, Hindi captions, prices, soft music and your contact details at the end. Free. Takes as long as the video (about 20–30 s) – keep the app open.</p>
      <p class="hint">🤖 <b>AI video</b>: Google Veo makes an 8-second realistic video with a Hindi voice for the topic. It needs your own Google Gemini API key (⚙ Settings) and Google charges you per second of video. Your shop name and phone are added on top, with a contact card at the end.</p>
      <p class="hint">Make a video from 📅 Today or 🖼 Create. Download or share it at once – videos are not stored in the app.</p>${V.lastVideo ? `<div id="mktVid"></div>` : ""}`;
  }
  function showVid() {
    const el = $("mktVid"); if (!el) return;
    if (V.veo) { el.innerHTML = `<div class="hint">${esc(V.veo)}</div>`; return; }
    if (!V.lastVideo) { el.innerHTML = ""; return; }
    const v = V.lastVideo;
    el.innerHTML = `<h4>${v.ai ? "🤖 AI video" : "🎞 Slideshow video"} ${v.blob.type.includes("mp4") ? "" : '<span class="chip chip-yellow">WebM</span>'}</h4>
      <video src="${v.url}" controls playsinline style="width:100%; max-width:360px; border-radius:12px; background:#000"></video>
      <div class="calc-actions"><button class="role-btn" style="background:#25D366" onclick="MK.shareVid()">📲 Share video</button><button class="auth-btn" onclick="MK.dlVid()">⬇ Download</button>
      ${metaReady() ? `<button class="auth-btn" style="background:#1877f2" onclick="MK.postVid()">📤 Post as Reel</button>` : ""}</div>
      ${v.blob.type.includes("mp4") ? "" : `<p class="hint">This phone saved the video as WebM. YouTube and Facebook accept it; for WhatsApp and Instagram use Chrome on a newer phone (it saves MP4).</p>`}`;
  }
  function viewPosted() {
    return log.length ? log.map((p) => `<div class="task-card"><div class="task-info"><div class="task-title">${p.video ? "🎞" : "🖼"} ${esc(p.title || "")}</div>
      <div class="task-meta">${p.platforms && p.platforms.length ? "✅ Posted on: " + esc(p.platforms.join(", ")) : "❌ Not posted"}${p.error ? "<br><small class='notr'>" + esc(p.error) + "</small>" : ""}</div></div><div class="note-time">${tms(p.at) ? esc(fmtDT(new Date(tms(p.at)))) : ""}</div></div>`).join("")
      : `<p class="hint">Nothing posted automatically yet. Posts made with "Post now" or by the daily automatic post appear here.</p>`;
  }
  function viewSettings() {
    editing = true;
    const f = (k, label, type, ph) => `<label class="task-label">${label}</label><input id="mk_${k}" type="${type || "text"}" value="${esc(set[k] ?? "")}" placeholder="${esc(ph || "")}" style="width:95%">`;
    const s = (k, label, ph) => `<label class="task-label">${label}</label><input id="mks_${k}" type="text" value="${esc(secrets[k] ? (k === "pageToken" || k === "geminiKey" ? "••••••••" + String(secrets[k]).slice(-4) : secrets[k]) : "")}" placeholder="${esc(ph || "")}" style="width:95%" autocomplete="off">`;
    return `<h4 style="margin-top:0">🏬 Printed on every pamphlet and video</h4>
      ${f("phone", "Shop phone number", "tel", "e.g. 98220 12345")}${f("address", "Shop address", "text", "e.g. Main Road, Jalna")}${f("city", "City (for hashtags)", "text", "Jalna")}${f("tagline", "Tagline", "text")}
      <label class="task-label">Colour</label><input id="mk_color" type="color" value="${esc(set.color || "#1f4011")}">
      <h4>🗓 Automatic daily post</h4>
      <label class="task-radio"><input type="checkbox" id="mk_auto" ${set.auto !== false ? "checked" : ""}> Make a new post every day</label>
      ${f("postTime", "Post at (when the app is open on your phone)", "time")}
      <label class="task-label">Also post a video every day</label>
      <select id="mk_autoVideo" style="width:95%">${[["off", "No video"], ["slideshow", "🎞 Slideshow video (free)"], ["ai", "🤖 AI video (paid, Google)"]].map(([v, l]) => `<option value="${v}" ${set.autoVideo === v ? "selected" : ""}>${l}</option>`).join("")}</select>
      <h4>📤 Facebook Page and Instagram</h4>
      <p class="hint">Needed only for automatic posting. Create a Meta app at developers.facebook.com, link your Instagram professional account to your Facebook Page, and create a long-lived Page access token with the permissions pages_manage_posts, pages_read_engagement, instagram_basic and instagram_content_publish. Paste the IDs and the token here. They are kept private for the owner.</p>
      ${s("pageId", "Facebook Page ID", "e.g. 1234567890")}${s("pageToken", "Page access token", "EAAG...")}${s("igId", "Instagram business account ID (optional)", "e.g. 1784...")}
      <label class="task-radio"><input type="checkbox" id="mk_toFb" ${set.toFb !== false ? "checked" : ""}> Post to Facebook</label>
      <label class="task-radio"><input type="checkbox" id="mk_toIg" ${set.toIg !== false ? "checked" : ""}> Post to Instagram</label>
      <button class="auth-btn" style="background:#1877f2" onclick="MK.testMeta()">🔌 Test the connection</button>
      <h4>🤖 AI video (Google Veo)</h4>
      <p class="hint">Get a key at aistudio.google.com → Get API key (billing must be on – Google charges for each second of video).</p>
      ${s("geminiKey", "Google Gemini API key", "AIza...")}${f("veoModel", "Veo model", "text", DEF.veoModel)}
      <h4>🪔 Festivals</h4><p class="hint">One per line: date (YYYY-MM-DD), a space, then the name. Greetings start 3 days before.</p>
      <textarea id="mk_fests" class="task-input notr" rows="6">${esc(fests().map(([d, n]) => d + " " + n).join("\n"))}</textarea>
      <button class="role-btn" style="background:var(--primary); margin-top:12px" onclick="MK.saveSet()">💾 Save settings</button>`;
  }
  async function saveSet() {
    const g = (k) => ($("mk_" + k)?.value || "").trim(), ck = (k) => !!$("mk_" + k)?.checked;
    const festivals = g("fests").split("\n").map((l) => l.trim().match(/^(\d{4}-\d{2}-\d{2})\s+(.+)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]);
    const v = { phone: g("phone"), address: g("address"), city: g("city"), tagline: g("tagline"), color: g("color") || "#1f4011", auto: ck("auto"), postTime: g("postTime") || "10:00",
      autoVideo: g("autoVideo") || "off", toFb: ck("toFb"), toIg: ck("toIg"), veoModel: g("veoModel") || DEF.veoModel, festivals: festivals.length ? festivals : null };
    const sec = {};
    ["pageId", "pageToken", "igId", "geminiKey"].forEach((k) => { const x = ($("mks_" + k)?.value || "").trim(); if (!x.startsWith("••••")) sec[k] = x; });
    try {
      loading(true);
      await setDoc(D("settings", "marketing"), { ...v, updatedAt: serverTimestamp() }, { merge: true });
      await setDoc(D("private", "marketing"), { ...sec, updatedAt: serverTimestamp() }, { merge: true });
      set = { ...set, ...v }; secrets = { ...secrets, ...sec };
      toast("Settings saved"); editing = false; render(true);
    } catch (e) { console.error(e); toast(errText(e)); }
    finally { loading(false); }
  }
  async function testMeta() {
    const id = ($("mks_pageId")?.value || secrets.pageId || "").trim();
    let tok = ($("mks_pageToken")?.value || "").trim(); if (!tok || tok.startsWith("••••")) tok = secrets.pageToken || "";
    if (!id || !tok) return toast("Enter the Page ID and the Page access token first");
    try {
      loading(true);
      const j = await gj(await fetch(`${G}/${encodeURIComponent(id)}?fields=name,instagram_business_account&access_token=${encodeURIComponent(tok)}`));
      const ig = j.instagram_business_account && j.instagram_business_account.id;
      if (ig && $("mks_igId") && !$("mks_igId").value) $("mks_igId").value = ig;
      toast("Connected to the Facebook Page: " + (j.name || id) + (ig ? " (Instagram found)" : ""));
    } catch (e) { toast(e.message); }
    finally { loading(false); }
  }

  /* ---------------- actions ---------------- */
  const curCaption = () => ($("mktCap") ? $("mktCap").value : captionFor(V.cur.type, V.cur.c));
  const fname = () => (V.cur ? V.cur.type : "post") + "-" + dk(Date.now());
  async function pamBlob() { if (!V.cur || !V.cur.canvas) await drawPreview(); return toBlob(V.cur.canvas); }
  async function sharePam() { const b = await pamBlob(); await share(b, curCaption(), fname()); }
  async function dlPam() { download(await pamBlob(), fname()); }
  async function postPam() {
    if (!(await askConfirm(secrets.igId && set.toIg !== false ? "Post this pamphlet now to Facebook and Instagram?" : "Post this pamphlet now to Facebook?"))) return;
    try { loading(true); const r = await publish(await pamBlob(), curCaption(), V.cur.type, MKT_TYPES[V.cur.type], false); toast(r.done.length ? "Posted on " + r.done.join(" and ") : "Not posted: " + r.errs.join(" | ")); }
    finally { loading(false); }
  }
  function setVideo(blob, ai) { if (V.lastVideo) URL.revokeObjectURL(V.lastVideo.url); V.lastVideo = { blob, url: URL.createObjectURL(blob), ai, type: V.cur && V.cur.type }; V.veo = null; showVid(); }
  async function makeSlide() {
    if (V.busy) return;
    if (!V.cur || !V.cur.c) await drawPreview();
    V.busy = true; V.veo = "🎞 Making the slideshow video... 0%"; showVid();
    try { const b = await slideshow(V.cur.c, (p) => { V.veo = "🎞 Making the slideshow video... " + Math.round(p * 100) + "% (keep the app open)"; showVid(); }); setVideo(b, false); toast("Video ready"); }
    catch (e) { console.error(e); V.veo = null; showVid(); toast(e.message); }
    finally { V.busy = false; }
  }
  async function makeAi() {
    if (V.busy) return;
    if (!secrets.geminiKey) { toast("Add your Google Gemini API key in ⚙ Settings first"); return go("settings"); }
    if (!(await askConfirm("Make an 8-second AI video with Google Veo? Google charges your account for each second of video."))) return;
    if (!V.cur || !V.cur.c) await drawPreview();
    V.busy = true;
    try {
      const r = await veoVideo(V.cur.c, (m) => { V.veo = "🤖 " + m; showVid(); });
      V.veo = "🤖 Adding your shop name and phone..."; showVid();
      let b = r.blob;
      try { b = await brandVideo(r.blob); } catch (e) { console.warn("Branding skipped", e); }
      setVideo(b, true); toast("AI video ready");
    } catch (e) { console.error(e); V.veo = null; showVid(); toast(e.message); }
    finally { V.busy = false; }
  }
  const vidName = () => (V.lastVideo && V.lastVideo.ai ? "ai-video-" : "video-") + dk(Date.now());
  const shareVid = () => V.lastVideo && share(V.lastVideo.blob, curCaption(), vidName());
  const dlVid = () => V.lastVideo && download(V.lastVideo.blob, vidName());
  async function postVid() {
    if (!V.lastVideo || !(await askConfirm("Post this video as a Reel now?"))) return;
    try { loading(true); const r = await publish(V.lastVideo.blob, curCaption(), V.cur ? V.cur.type : "", (V.cur ? MKT_TYPES[V.cur.type] : "") + " (video)", true); toast(r.done.length ? "Posted on " + r.done.join(" and ") : "Not posted: " + r.errs.join(" | ")); }
    finally { loading(false); }
  }

  window.MK = {
    open, close, go, typing: () => { editing = true; const c = $("mktCap"); if (c) c.dataset.touched = "1"; },
    size: (s) => { V.size = s; render(true); }, type: (t) => { V.type = t; V.items = []; render(true); },
    fest: (n) => { V.festName = n; drawPreview(); }, tip: (i) => { V.tipIdx = +i; drawPreview(); }, pick: (id, on) => { V.items = on ? [...new Set([...V.items, id])].slice(0, 4) : V.items.filter((x) => x !== id); V.cur.pick = V.items; drawPreview(); },
    sharePam, dlPam, postPam, makeSlide, makeAi, shareVid, dlVid, postVid, saveSet, testMeta,
    _test: { content, pamphlet, slideshow, veoVideo, brandVideo, publish, autoTick, todayType, setSecrets: (s) => { secrets = { ...secrets, ...s }; } }
  };
  return { start };
}
