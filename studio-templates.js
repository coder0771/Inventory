// =====================================================================
// studio-templates.js - sizes, fonts, colour sets and the template library of the
// 🎨 AI Marketing Studio. Templates are built in code for any size, so every
// template works in every format, uses the company's Brand Kit and real stock data.
// A template returns plain object descriptions; studio.js turns them into editable elements.
// =====================================================================

export const SIZES = {
  ig_square: { w: 1080, h: 1080, label: "Instagram post 1:1", group: "Social" },
  ig_portrait: { w: 1080, h: 1350, label: "Instagram portrait 4:5", group: "Social" },
  ig_story: { w: 1080, h: 1920, label: "Instagram story 9:16", group: "Social" },
  wa_status: { w: 1080, h: 1920, label: "WhatsApp status", group: "Social" },
  fb_post: { w: 1200, h: 630, label: "Facebook post", group: "Social" },
  fb_cover: { w: 1640, h: 624, label: "Facebook cover", group: "Social" },
  a4_p: { w: 1240, h: 1754, label: "A4 pamphlet (portrait)", group: "Print", mm: [210, 297] },
  a4_l: { w: 1754, h: 1240, label: "A4 pamphlet (landscape)", group: "Print", mm: [297, 210] },
  a5_p: { w: 874, h: 1240, label: "A5 pamphlet", group: "Print", mm: [148, 210] },
  a3_p: { w: 1754, h: 2480, label: "A3 poster", group: "Print", mm: [297, 420] }
};
export const orientationOf = (w, h) => (Math.abs(w - h) < Math.min(w, h) * 0.06 ? "square" : w > h ? "landscape" : "portrait");

// fonts (Google Fonts, free licence). Devanagari text falls back to Noto Sans Devanagari.
export const FONTS = ["Poppins", "Montserrat", "Playfair Display", "Oswald", "Bebas Neue", "Dancing Script", "Roboto Slab", "Inter",
  "Noto Sans Devanagari", "Mukta", "Hind", "Rozha One", "Yatra One", "Tiro Devanagari Hindi"];
export const fontStack = (f) => (f && f !== "Noto Sans Devanagari" ? `${f}, Noto Sans Devanagari` : "Noto Sans Devanagari");
export const FONT_URL = "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&family=Montserrat:wght@400;600;700;800;900&family=Playfair+Display:wght@400;700;900&family=Oswald:wght@400;600;700&family=Bebas+Neue&family=Dancing+Script:wght@600;700&family=Roboto+Slab:wght@400;700;900&family=Mukta:wght@400;600;800&family=Hind:wght@400;600;700&family=Rozha+One&family=Yatra+One&family=Tiro+Devanagari+Hindi&family=Noto+Sans+Devanagari:wght@400;600;700;800;900&display=swap";

// colour sets: bg1 -> bg2 gradient, acc = highlight, ink = text on the highlight, text = main text, tags = colour filter
export const PALETTES = {
  emerald_gold: { bg1: "#062A1E", bg2: "#0F5132", acc: "#D4AF37", ink: "#1A1300", text: "#FFFFFF", sub: "#F3E7C1", tags: ["green", "gold", "dark"] },
  royal_gold: { bg1: "#0B1B4D", bg2: "#1E3A8A", acc: "#FACC15", ink: "#1F1A00", text: "#FFFFFF", sub: "#DBEAFE", tags: ["blue", "gold", "dark"] },
  festive: { bg1: "#7A1F00", bg2: "#EA580C", acc: "#FDE68A", ink: "#5A1600", text: "#FFFFFF", sub: "#FFEDD5", tags: ["orange", "red", "gold"] },
  maroon: { bg1: "#3B0A12", bg2: "#9F1239", acc: "#FCD34D", ink: "#3B2A00", text: "#FFFFFF", sub: "#FFE4E6", tags: ["red", "gold", "dark"] },
  holi: { bg1: "#7C3AED", bg2: "#DB2777", acc: "#FDE047", ink: "#3B0764", text: "#FFFFFF", sub: "#FCE7F3", tags: ["purple", "pink", "multi"] },
  sky: { bg1: "#E0F2FE", bg2: "#FFFFFF", acc: "#0369A1", ink: "#FFFFFF", text: "#0C4A6E", sub: "#0369A1", tags: ["blue", "light"] },
  charcoal: { bg1: "#0F172A", bg2: "#334155", acc: "#F59E0B", ink: "#1F1300", text: "#FFFFFF", sub: "#CBD5E1", tags: ["dark", "orange"] },
  teal: { bg1: "#042F2E", bg2: "#0F766E", acc: "#5EEAD4", ink: "#042F2E", text: "#FFFFFF", sub: "#CCFBF1", tags: ["green", "blue", "dark"] },
  rose: { bg1: "#FFF1F2", bg2: "#FFFFFF", acc: "#BE123C", ink: "#FFFFFF", text: "#4C0519", sub: "#9F1239", tags: ["pink", "red", "light"] },
  cream: { bg1: "#FBF6EC", bg2: "#FFFFFF", acc: "#92400E", ink: "#FFFFFF", text: "#3B2412", sub: "#92400E", tags: ["light", "orange"] },
  tricolour: { bg1: "#FFFFFF", bg2: "#FFF7ED", acc: "#138808", ink: "#FFFFFF", text: "#0B1B4D", sub: "#FF9933", tags: ["light", "orange", "green", "multi"] },
  night: { bg1: "#020617", bg2: "#1E1B4B", acc: "#E2E8F0", ink: "#0F172A", text: "#FFFFFF", sub: "#C7D2FE", tags: ["dark", "blue", "purple"] }
};
// a colour set made from the Brand Kit colours
export function brandPalette(colors) {
  const c = (colors || []).filter(Boolean);
  if (!c.length) return null;
  const main = c[0], acc = c[1] || "#FACC15";
  const L = lum(main);
  return { bg1: L > 0.5 ? "#FFFFFF" : mix(main, "#000000", 0.45), bg2: main, acc, ink: lum(acc) > 0.45 ? "#111111" : "#FFFFFF", text: L > 0.5 ? "#111827" : "#FFFFFF", sub: L > 0.5 ? "#374151" : mix(main, "#FFFFFF", 0.75), tags: ["brand"] };
}
const hx = (h) => { h = String(h || "").replace("#", ""); if (h.length === 3) h = h.split("").map((x) => x + x).join(""); const n = parseInt(h, 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const mix = (a, b, t) => { const x = hx(a), y = hx(b); return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join(""); };
export const lum = (h) => { const [r, g, b] = hx(h).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

export const STYLES = { festive: "Festive", split: "Photo + text", bold: "Bold", elegant: "Elegant", modern: "Modern", minimal: "Minimal" };
export const CATEGORIES = { business: "Business", festival: "Festivals", retail: "Retail & products", professional: "Professional" };

// t(en, hi, mr) -> texts in the three languages
const T = (en, hi, mr) => ({ en, hi, mr });
export const TEMPLATES = [
  // ---- Business ----
  { id: "opening", cat: "business", name: "New shop opening", style: "festive", pal: "emerald_gold", emoji: "🎉", occasion: "opening",
    title: T("Grand Opening", "भव्य शुभारंभ", "भव्य शुभारंभ"), sub: T("You are warmly invited", "आप सादर आमंत्रित हैं", "आपणास सस्नेह निमंत्रण"), cta: T("Visit us – special opening offers", "पधारें – शुभारंभ पर खास ऑफ़र", "भेट द्या – शुभारंभ विशेष ऑफर") },
  { id: "promotion", cat: "business", name: "Business promotion", style: "modern", pal: "royal_gold", emoji: "🏬", occasion: "promotion", products: true,
    title: T("Everything for your dream home", "आपके सपनों के घर के लिए सब कुछ", "तुमच्या स्वप्नातील घरासाठी सर्व काही"), sub: T("Tiles • Sanitaryware • Fittings", "टाइल्स • सैनिटरीवेयर • फ़िटिंग्स", "टाइल्स • सॅनिटरीवेअर • फिटिंग्ज"), cta: T("Visit our showroom today", "आज ही शोरूम आइए", "आजच शोरूमला भेट द्या") },
  { id: "anniversary", cat: "business", name: "Anniversary", style: "elegant", pal: "emerald_gold", emoji: "✨", occasion: "anniversary",
    title: T("Celebrating Our Anniversary", "हमारी वर्षगांठ का जश्न", "आमचा वर्धापन दिन"), sub: T("Thank you for your trust over the years", "वर्षों के भरोसे के लिए धन्यवाद", "वर्षानुवर्षाच्या विश्वासाबद्दल धन्यवाद"), cta: T("Special anniversary offers in store", "वर्षगांठ पर शोरूम में खास ऑफ़र", "वर्धापन दिनानिमित्त खास ऑफर"), badge: T("Thank You", "धन्यवाद", "धन्यवाद") },
  { id: "thanks", cat: "business", name: "Customer appreciation", style: "minimal", pal: "cream", emoji: "🙏", occasion: "appreciation",
    title: T("Thank You, Valued Customers", "धन्यवाद, हमारे प्रिय ग्राहक", "धन्यवाद, आमचे प्रिय ग्राहक"), sub: T("Your support builds our business", "आपका साथ ही हमारी ताकत है", "तुमची साथ हीच आमची ताकद"), cta: T("We look forward to serving you again", "फिर से सेवा का अवसर दें", "पुन्हा सेवेची संधी द्या") },
  { id: "arrivals", cat: "business", name: "New arrivals", style: "modern", pal: "teal", emoji: "✨", occasion: "arrivals", products: true,
    title: T("New Arrivals", "नया स्टॉक आ गया है", "नवीन स्टॉक आला आहे"), sub: T("Fresh designs, new colours", "नई डिज़ाइन, नए रंग", "नवीन डिझाइन, नवीन रंग"), cta: T("See them in our showroom", "शोरूम में आकर देखें", "शोरूममध्ये येऊन पहा"), badge: T("NEW", "नया", "नवीन") },
  { id: "discounts", cat: "business", name: "Special discounts", style: "bold", pal: "maroon", emoji: "🏷️", occasion: "discount", products: true,
    title: T("Special Discounts", "विशेष छूट", "विशेष सूट"), sub: T("On selected products, for a limited time", "चुने हुए सामान पर, सीमित समय", "निवडक मालावर, मर्यादित काळ"), cta: T("Call now for the offer price", "ऑफ़र कीमत के लिए अभी कॉल करें", "ऑफर किमतीसाठी आत्ताच कॉल करा"), badge: T("SALE", "सेल", "सेल") },
  { id: "clearance", cat: "business", name: "Clearance sale", style: "bold", pal: "festive", emoji: "🔥", occasion: "clearance", products: true,
    title: T("Clearance Sale", "क्लीयरेंस सेल", "क्लिअरन्स सेल"), sub: T("Limited stock – first come, first served", "सीमित स्टॉक – पहले आओ, पहले पाओ", "मर्यादित स्टॉक – आधी येईल त्याला"), cta: T("Hurry – visit today", "जल्दी करें – आज ही आइए", "घाई करा – आजच या"), badge: T("Stock clearance", "स्टॉक क्लीयरेंस", "स्टॉक क्लिअरन्स") },
  // ---- Festivals ----
  { id: "diwali", cat: "festival", name: "Diwali", style: "festive", pal: "emerald_gold", emoji: "🪔", occasion: "diwali",
    title: T("Happy Diwali", "शुभ दीपावली", "शुभ दीपावली"), sub: T("May the festival of lights fill your home with joy", "दीपों का यह पर्व आपके घर को खुशियों से भर दे", "दिव्यांचा हा सण तुमचे घर आनंदाने उजळो"), cta: T("Festive offers in our showroom", "शोरूम में त्योहारी ऑफ़र", "शोरूममध्ये सणासुदीच्या ऑफर") },
  { id: "holi", cat: "festival", name: "Holi", style: "festive", pal: "holi", emoji: "🎨", occasion: "holi",
    title: T("Happy Holi", "होली की हार्दिक शुभकामनाएँ", "होळीच्या हार्दिक शुभेच्छा"), sub: T("Wishing you a colourful celebration", "रंगों भरा त्योहार मुबारक", "रंगांनी भरलेल्या सणाच्या शुभेच्छा"), cta: T("", "", "") },
  { id: "ganesh", cat: "festival", name: "Ganesh Chaturthi", style: "elegant", pal: "festive", emoji: "🪷", occasion: "ganesh",
    title: T("Happy Ganesh Chaturthi", "गणेश चतुर्थी की शुभकामनाएँ", "गणेश चतुर्थीच्या हार्दिक शुभेच्छा"), sub: T("Ganpati Bappa Morya!", "गणपति बप्पा मोरया!", "गणपती बाप्पा मोरया!"), cta: T("", "", "") },
  { id: "navratri", cat: "festival", name: "Navratri", style: "festive", pal: "maroon", emoji: "🌺", occasion: "navratri",
    title: T("Happy Navratri", "नवरात्रि की शुभकामनाएँ", "नवरात्रीच्या शुभेच्छा"), sub: T("Nine nights of devotion and joy", "भक्ति और उल्लास के नौ दिन", "भक्ती आणि आनंदाचे नऊ दिवस"), cta: T("", "", "") },
  { id: "dussehra", cat: "festival", name: "Dussehra", style: "elegant", pal: "royal_gold", emoji: "🏹", occasion: "dussehra",
    title: T("Happy Dussehra", "विजयादशमी की शुभकामनाएँ", "दसऱ्याच्या हार्दिक शुभेच्छा"), sub: T("Victory of good over evil", "बुराई पर अच्छाई की जीत", "वाईटावर चांगल्याचा विजय"), cta: T("", "", "") },
  { id: "eid", cat: "festival", name: "Eid", style: "elegant", pal: "teal", emoji: "🌙", occasion: "eid",
    title: T("Eid Mubarak", "ईद मुबारक", "ईद मुबारक"), sub: T("Peace, happiness and prosperity to all", "सभी को अमन, खुशी और खुशहाली", "सर्वांना शांती, आनंद आणि समृद्धी"), cta: T("", "", "") },
  { id: "christmas", cat: "festival", name: "Christmas", style: "festive", pal: "maroon", emoji: "🎄", occasion: "christmas",
    title: T("Merry Christmas", "क्रिसमस की शुभकामनाएँ", "नाताळच्या शुभेच्छा"), sub: T("Season's greetings to you and your family", "आपको और आपके परिवार को शुभकामनाएँ", "तुम्हाला आणि कुटुंबाला शुभेच्छा"), cta: T("", "", "") },
  { id: "newyear", cat: "festival", name: "New Year", style: "bold", pal: "night", emoji: "🎆", occasion: "newyear",
    title: T("Happy New Year", "नववर्ष की शुभकामनाएँ", "नववर्षाच्या शुभेच्छा"), sub: T("Wishing you a prosperous year ahead", "नया साल मंगलमय हो", "नवीन वर्ष सुख-समृद्धीचे जावो"), cta: T("New year, new home designs", "नया साल, नए घर की नई डिज़ाइन", "नवे वर्ष, घराचे नवे डिझाइन") },
  { id: "rakhi", cat: "festival", name: "Raksha Bandhan", style: "festive", pal: "rose", emoji: "🪢", occasion: "rakhi",
    title: T("Happy Raksha Bandhan", "रक्षाबंधन की शुभकामनाएँ", "रक्षाबंधनाच्या शुभेच्छा"), sub: T("Celebrating the bond of love", "प्यार के बंधन का त्योहार", "प्रेमाच्या बंधनाचा सण"), cta: T("", "", "") },
  { id: "independence", cat: "festival", name: "Independence Day", style: "minimal", pal: "tricolour", emoji: "🇮🇳", occasion: "independence",
    title: T("Happy Independence Day", "स्वतंत्रता दिवस की शुभकामनाएँ", "स्वातंत्र्य दिनाच्या शुभेच्छा"), sub: T("Proud to be Indian", "गर्व है हम भारतीय हैं", "भारतीय असल्याचा अभिमान"), cta: T("Jai Hind", "जय हिंद", "जय हिंद") },
  // ---- Retail & products ----
  { id: "product_ad", cat: "retail", name: "Product advertisement", style: "split", pal: "emerald_gold", emoji: "🧱", occasion: "product", products: true,
    title: T("Premium Quality", "बेहतरीन क्वालिटी", "उत्कृष्ट दर्जा"), sub: T("Now available in our showroom", "अब हमारे शोरूम में उपलब्ध", "आता आमच्या शोरूममध्ये उपलब्ध"), cta: T("Visit or call to order", "ऑर्डर के लिए आइए या कॉल करें", "ऑर्डरसाठी भेट द्या किंवा कॉल करा") },
  { id: "price", cat: "retail", name: "Price announcement", style: "modern", pal: "charcoal", emoji: "₹", occasion: "price", products: true,
    title: T("Best Prices", "सबसे अच्छी कीमत", "सर्वोत्तम किंमत"), sub: T("Quality products at honest prices", "बढ़िया सामान, सही दाम", "उत्तम माल, योग्य दर"), cta: T("Prices as on today", "आज की कीमत", "आजचे दर") },
  { id: "discount", cat: "retail", name: "Discount offer", style: "bold", pal: "festive", emoji: "💥", occasion: "discount", products: true,
    title: T("Discount Offer", "डिस्काउंट ऑफ़र", "डिस्काउंट ऑफर"), sub: T("Save more on selected products", "चुने हुए सामान पर ज़्यादा बचत", "निवडक मालावर अधिक बचत"), cta: T("Offer valid while stock lasts", "स्टॉक रहने तक ऑफ़र", "स्टॉक असेपर्यंत ऑफर"), badge: T("OFFER", "ऑफ़र", "ऑफर") },
  { id: "collection", cat: "retail", name: "New collection", style: "elegant", pal: "night", emoji: "💎", occasion: "collection", products: true,
    title: T("The New Collection", "नया कलेक्शन", "नवीन कलेक्शन"), sub: T("Luxury finishes for modern homes", "आधुनिक घरों के लिए शानदार डिज़ाइन", "आधुनिक घरांसाठी आलिशान डिझाइन"), cta: T("Explore the collection", "कलेक्शन देखने आइए", "कलेक्शन पाहायला या") },
  { id: "compare", cat: "retail", name: "Product comparison", style: "split", pal: "sky", emoji: "⚖️", occasion: "comparison", products: true, compare: true,
    title: T("Which One Is Right for You?", "आपके लिए कौन सा सही है?", "तुमच्यासाठी कोणते योग्य?"), sub: T("Compare and choose", "तुलना करें और चुनें", "तुलना करा आणि निवडा"), cta: T("Ask us for advice", "सलाह के लिए पूछें", "सल्ल्यासाठी विचारा") },
  { id: "catalogue", cat: "retail", name: "Product catalogue", style: "modern", pal: "emerald_gold", emoji: "📒", occasion: "catalogue", products: true, many: true,
    title: T("Our Product Range", "हमारी प्रोडक्ट रेंज", "आमची उत्पादन श्रेणी"), sub: T("Tiles, sanitaryware and fittings under one roof", "एक ही छत के नीचे टाइल्स, सैनिटरीवेयर और फ़िटिंग्स", "एकाच छताखाली टाइल्स, सॅनिटरीवेअर आणि फिटिंग्ज"), cta: T("Visit for the full range", "पूरी रेंज देखने आइए", "संपूर्ण श्रेणी पाहायला या") },
  // ---- Professional ----
  { id: "corporate", cat: "professional", name: "Corporate advertisement", style: "minimal", pal: "royal_gold", emoji: "🏢", occasion: "corporate",
    title: T("Trusted Building Materials Partner", "भरोसेमंद बिल्डिंग मटीरियल पार्टनर", "विश्वासार्ह बांधकाम साहित्य भागीदार"), sub: T("Supplying builders, architects and homeowners", "बिल्डर, आर्किटेक्ट और घर मालिकों के लिए", "बिल्डर, आर्किटेक्ट आणि घरमालकांसाठी"), cta: T("Contact us for bulk orders", "बल्क ऑर्डर के लिए संपर्क करें", "मोठ्या ऑर्डरसाठी संपर्क करा") },
  { id: "intro", cat: "professional", name: "Business introduction", style: "split", pal: "teal", emoji: "🏠", occasion: "introduction",
    title: T("Welcome to Our Showroom", "हमारे शोरूम में आपका स्वागत है", "आमच्या शोरूममध्ये स्वागत"), sub: T("Tiles, sanitaryware, plumbing and hardware", "टाइल्स, सैनिटरीवेयर, प्लंबिंग और हार्डवेयर", "टाइल्स, सॅनिटरीवेअर, प्लंबिंग आणि हार्डवेअर"), cta: T("Expert advice • Genuine products", "सही सलाह • असली सामान", "योग्य सल्ला • अस्सल माल") },
  { id: "service", cat: "professional", name: "Service promotion", style: "modern", pal: "sky", emoji: "🚚", occasion: "service",
    title: T("Home Delivery Available", "होम डिलीवरी उपलब्ध", "होम डिलिव्हरी उपलब्ध"), sub: T("We deliver your order to your site", "आपका सामान आपकी साइट तक", "तुमचा माल तुमच्या साइटपर्यंत"), cta: T("Call us to book", "बुकिंग के लिए कॉल करें", "बुकिंगसाठी कॉल करा") },
  { id: "invite", cat: "professional", name: "Invitation", style: "elegant", pal: "maroon", emoji: "💌", occasion: "invitation",
    title: T("You Are Invited", "आप आमंत्रित हैं", "आपणास निमंत्रण"), sub: T("Join us for a special showcase", "खास प्रदर्शनी में पधारें", "विशेष प्रदर्शनाला या"), cta: T("Date & time: ____", "तारीख और समय: ____", "तारीख आणि वेळ: ____") },
  { id: "announce", cat: "professional", name: "Announcement", style: "minimal", pal: "charcoal", emoji: "📢", occasion: "announcement",
    title: T("Important Announcement", "ज़रूरी सूचना", "महत्त्वाची सूचना"), sub: T("Write your announcement here", "अपनी सूचना यहाँ लिखें", "तुमची सूचना येथे लिहा"), cta: T("Thank you", "धन्यवाद", "धन्यवाद") }
];

// a template's texts in a language ("hien" = Hindi with an English line)
export const tText = (tpl, key, lang) => { const x = tpl[key]; if (!x) return ""; return lang === "en" ? x.en : lang === "mr" ? x.mr : x.hi; };

/* ---------------- build a template for a size ----------------
   input: tpl, { w, h, lang, pal (palette object), brand: { name, tagline, phone, address, website, hasLogo, fontH, fontB },
                 products: [{ id, name, size, unit, price, category, hasPhoto }], discount (number or 0) }
   output: { bg: { type: "gradient"|"color", colors:[..], angle }, objects: [ spec... ] }
   spec types: text, rect, circle, tri, star, line, emoji, image (placeholder / item / logo), qr, badge, price */
export function buildTemplate(tpl, o) {
  const W = o.w, H = o.h, land = W > H * 1.15, sq = !land && H < W * 1.15;
  const s = Math.min(W / 1080, H / (land ? 700 : 1100));
  const P = o.pal || PALETTES[tpl.pal] || PALETTES.emerald_gold, lang = o.lang || "hi";
  const fH = o.brand && o.brand.fontH ? o.brand.fontH : tpl.style === "elegant" ? "Playfair Display" : tpl.style === "bold" ? "Montserrat" : "Poppins";
  const fB = o.brand && o.brand.fontB ? o.brand.fontB : "Poppins";
  const B = o.brand || {}, out = [], light = tpl.style === "minimal" || tpl.style === "modern" && lum(P.bg1) > 0.5 || lum(P.bg1) > 0.6;
  const pad = 64 * s, txt = P.text, sub = P.sub;
  const title = tText(tpl, "title", lang), subT = tText(tpl, "sub", lang), cta = tText(tpl, "cta", lang), badge = tText(tpl, "badge", lang);
  const en2 = lang === "hien" ? tpl.title.en : "";
  const add = (x) => (out.push(x), x);
  const prods = (o.products || []).slice(0, tpl.many ? 6 : tpl.compare ? 2 : 4);
  const bg = tpl.style === "minimal" ? { type: "color", colors: [lum(P.bg1) > 0.5 ? P.bg1 : "#FFFFFF"] } : { type: "gradient", colors: [P.bg1, P.bg2], angle: tpl.style === "bold" ? 135 : 160 };
  const T0 = tpl.style === "minimal" && lum(P.bg1) <= 0.5 ? { txt: P.bg1, sub: P.bg2 } : { txt, sub };

  /* decoration */
  if (tpl.style === "festive") {
    for (let i = 0; i < 7; i++) add({ t: "circle", left: ((i * 271) % 100) / 100 * W - 60 * s, top: ((i * 389) % 100) / 100 * H - 60 * s, r: (90 + i * 26) * s, fill: "#FFFFFF", opacity: 0.07, name: "Decoration" });
    add({ t: "rect", left: 0, top: 0, w: W, h: 10 * s, fill: P.acc, name: "Top border" });
    add({ t: "rect", left: 0, top: H - 10 * s, w: W, h: 10 * s, fill: P.acc, name: "Bottom border" });
  } else if (tpl.style === "bold") {
    add({ t: "poly", points: [[0, 0], [W * 0.62, 0], [0, H * (land ? 0.55 : 0.3)]], fill: P.acc, opacity: 0.92, name: "Corner shape" });
    add({ t: "poly", points: [[W, H * 0.6], [W, H], [W * 0.3, H]], fill: "#FFFFFF", opacity: 0.12, name: "Corner shape" });
  } else if (tpl.style === "elegant") {
    add({ t: "rect", left: 26 * s, top: 26 * s, w: W - 52 * s, h: H - 52 * s, fill: "", stroke: P.acc, sw: 4 * s, name: "Frame" });
    add({ t: "rect", left: 40 * s, top: 40 * s, w: W - 80 * s, h: H - 80 * s, fill: "", stroke: P.acc, sw: 1.5 * s, name: "Frame" });
  } else if (tpl.style === "modern") {
    add({ t: "rect", left: 0, top: 0, w: W, h: (land ? 110 : 150) * s, fill: P.bg1 === "#FFFFFF" ? P.acc : P.bg1, name: "Header band" });
    add({ t: "rect", left: 0, top: (land ? 110 : 150) * s, w: W, h: 8 * s, fill: P.acc, name: "Accent line" });
  } else if (tpl.style === "minimal") {
    add({ t: "rect", left: pad, top: pad * 0.8, w: 120 * s, h: 10 * s, fill: P.acc, rx: 5 * s, name: "Accent bar" });
  } else if (tpl.style === "split") {
    // photo side gets a soft panel
  }

  /* header: logo + name */
  const headerOnBand = tpl.style === "modern";
  const centered = tpl.style === "festive" || tpl.style === "elegant" || tpl.style === "bold" && !land;
  let y = (tpl.style === "elegant" ? 80 : tpl.style === "modern" ? 26 : tpl.style === "minimal" ? 110 : 54) * s;
  const nameColor = headerOnBand ? "#FFFFFF" : tpl.style === "elegant" ? P.acc : T0.txt;
  const logoH = (land ? 70 : 96) * s;
  if (centered && !land) {
    if (B.hasLogo) { add({ t: "image", src: "logo", left: W / 2 - logoH / 2, top: y, w: logoH, h: logoH, fit: "contain", name: "Logo" }); y += logoH + 12 * s; }
    add({ t: "text", text: B.name || "", left: pad, top: y, w: W - pad * 2, size: 54 * s, weight: 800, font: fH, fill: nameColor, align: "center", name: "Shop name" }); y += 70 * s;
    if (B.tagline) { add({ t: "text", text: B.tagline, left: pad, top: y, w: W - pad * 2, size: 26 * s, weight: 500, font: fB, fill: tpl.style === "elegant" ? sub : P.acc, align: "center", name: "Tagline" }); y += 44 * s; }
    y += 20 * s;
  } else {
    let x = pad;
    if (B.hasLogo) { add({ t: "image", src: "logo", left: x, top: y, w: logoH * (headerOnBand ? 0.95 : 1), h: logoH * (headerOnBand ? 0.95 : 1), fit: "contain", name: "Logo" }); x += logoH + 18 * s; }
    add({ t: "text", text: B.name || "", left: x, top: y + (headerOnBand ? 8 * s : 0), w: W - x - pad - (tpl.style === "bold" ? 0 : 0), size: (land ? 40 : 48) * s, weight: 800, font: fH, fill: nameColor, align: "left", name: "Shop name" });
    if (B.tagline) add({ t: "text", text: B.tagline, left: x, top: y + (headerOnBand ? 8 * s : 0) + (land ? 50 : 60) * s, w: W - x - pad, size: (land ? 20 : 24) * s, weight: 500, font: fB, fill: headerOnBand ? "#E5E7EB" : sub, align: "left", name: "Tagline" });
    y = headerOnBand ? ((land ? 110 : 150) + 44) * s : y + Math.max(logoH, 110 * s) + 20 * s;
  }

  /* areas */
  const footH = (land ? 110 : 170) * s, footTop = H - footH;
  const hasProducts = tpl.products && prods.length;
  const wantsMedia = tpl.style === "split" || tpl.products;
  const colText = land && wantsMedia ? { x: W * 0.52, w: W * 0.48 - pad } : { x: pad, w: W - pad * 2 };
  const alignT = centered && !(land && wantsMedia) ? "center" : "left";

  /* emoji + headline */
  const isFest = tpl.cat === "festival" || tpl.id === "opening" || tpl.id === "anniversary";
  let ty = y;
  if (isFest && !(land && wantsMedia)) { add({ t: "emoji", text: tpl.emoji, left: alignT === "center" ? W / 2 - 90 * s : colText.x, top: ty, size: (land ? 110 : 160) * s, name: "Decoration" }); ty += (land ? 130 : 190) * s; }
  const headSize = (isFest ? (land ? 80 : 104) : tpl.style === "bold" ? (land ? 72 : 96) : (land ? 60 : 76)) * s;
  add({ t: "text", text: title, left: colText.x, top: ty, w: colText.w, size: headSize, weight: tpl.style === "elegant" ? 700 : 900, font: fH, fill: tpl.style === "elegant" ? P.acc : T0.txt, align: alignT, lh: 1.05, name: "Headline", shadow: !light });
  ty += headSize * (approxLines(title, colText.w, headSize) * 1.12) + 16 * s;
  if (en2 && en2 !== title) { add({ t: "text", text: en2, left: colText.x, top: ty, w: colText.w, size: headSize * 0.42, weight: 700, font: "Montserrat", fill: P.acc, align: alignT, name: "English line" }); ty += headSize * 0.6; }
  if (subT) { add({ t: "text", text: subT, left: colText.x, top: ty, w: colText.w, size: (land ? 28 : 38) * s, weight: 500, font: fB, fill: sub, align: alignT, lh: 1.25, name: "Sub heading" }); ty += (land ? 28 : 38) * s * 1.25 * approxLines(subT, colText.w, (land ? 28 : 38) * s) + 26 * s; }

  /* badge */
  const disc = Number(o.discount) || 0;
  const badgeText = disc > 0 && tpl.products ? (lang === "en" ? disc + "% OFF" : lang === "mr" ? disc + "% सूट" : disc + "% छूट") : badge;
  if (badgeText) { const r = (land ? 70 : 96) * s; add({ t: "badge", text: badgeText, left: W - pad - r * 2 + 12 * s, top: land ? H * 0.42 : y - 10 * s, r, fill: "#DC2626", color: "#FFFFFF", angle: -12, name: "Badge" }); }

  /* media: products / placeholder */
  const ctaH = cta ? 74 * s : 0;
  const mediaTop = land && wantsMedia ? y : ty, mediaBottom = footTop - ctaH - 30 * s;
  const media = land && wantsMedia ? { x: pad, y: mediaTop, w: W * 0.48 - pad, h: footTop - 30 * s - mediaTop } : { x: pad, y: mediaTop, w: W - pad * 2, h: Math.max(140 * s, mediaBottom - mediaTop) };
  if (wantsMedia && media.h > 120 * s) {
    if (hasProducts) {
      const n = prods.length, cols = n === 1 ? 1 : n <= 4 ? 2 : 3, rows = Math.ceil(n / cols), gap = 22 * s;
      const cw = (media.w - gap * (cols - 1)) / cols, ch = (media.h - gap * (rows - 1)) / rows;
      prods.forEach((p, i) => {
        const cx = media.x + (i % cols) * (cw + gap), cy = media.y + Math.floor(i / cols) * (ch + gap);
        const nameS = (n === 1 ? 40 : n > 4 ? 24 : 30) * s * (land ? 0.85 : 1), nameH = nameS * 2.5;
        add({ t: "rect", left: cx, top: cy, w: cw, h: ch, fill: light ? "#FFFFFF" : "rgba(255,255,255,0.96)", rx: 20 * s, shadow: true, name: "Product card" });
        add({ t: "image", src: p.hasPhoto ? "item:" + p.id : "placeholder", itemId: p.id, left: cx + 10 * s, top: cy + 10 * s, w: cw - 20 * s, h: ch - nameH - 20 * s, fit: "cover", rx: 14 * s, name: "Photo – " + p.name });
        const nm = p.name + (p.size && p.size !== "-" ? " · " + p.size : "");
        add({ t: "text", text: nm, left: cx + 16 * s, top: cy + ch - nameH + 4 * s, w: cw - 32 * s, size: nameS, weight: 700, font: fB, fill: "#111827", align: "left", lh: 1.15, name: "Product name" });
        const pr = Number(p.price) || 0;
        if (pr > 0 && o.showPrices !== false) {
          const now = disc > 0 ? Math.round(pr * (1 - disc / 100)) : pr, unit = p.unit && p.unit !== "-" ? "/" + p.unit : "";
          add({ t: "price", text: "₹" + now.toLocaleString("en-IN") + unit, old: disc > 0 ? "₹" + pr.toLocaleString("en-IN") : "", left: cx + 20 * s, top: cy + 20 * s, size: (n === 1 ? 40 : 28) * s, fill: P.acc, color: P.ink, name: "Price" });
        }
      });
    } else if (tpl.style === "split" || tpl.products) {
      add({ t: "image", src: "placeholder", left: media.x, top: media.y, w: media.w, h: media.h, fit: "cover", rx: 24 * s, name: "Photo" });
    }
  } else if (!wantsMedia && !isFest && tpl.style !== "festive") {
    // text designs: a soft panel for the body
  }
  /* call to action */
  if (cta) {
    const cx = land && wantsMedia ? colText.x : pad, cw = land && wantsMedia ? colText.w : W - pad * 2;
    const cy = land && wantsMedia ? Math.min(ty + 20 * s, footTop - ctaH - 20 * s) : footTop - ctaH - 18 * s;
    add({ t: "rect", left: cx, top: cy, w: cw, h: 62 * s, fill: tpl.style === "minimal" || light ? P.acc : P.acc, rx: 31 * s, name: "Call-to-action button" });
    add({ t: "text", text: cta, left: cx + 20 * s, top: cy + 13 * s, w: cw - 40 * s, size: 30 * s, weight: 800, font: fB, fill: P.ink, align: "center", name: "Call to action" });
  }
  /* footer: contact + QR */
  add({ t: "rect", left: 0, top: footTop, w: W, h: footH, fill: light ? (tpl.style === "minimal" ? "#111827" : P.bg1 === "#FFFFFF" ? P.acc : P.bg1) : "rgba(0,0,0,0.45)", name: "Footer" });
  const qrS = Math.min(footH - 40 * s, 130 * s);
  const lines = [B.phone && "📞 " + B.phone, B.address && "📍 " + B.address, B.website && "🌐 " + B.website].filter(Boolean);
  add({ t: "text", text: lines.join("\n") || "📍 " + (lang === "en" ? "Visit our showroom" : lang === "mr" ? "आमच्या शोरूमला भेट द्या" : "हमारे शोरूम पर आइए"), left: pad, top: footTop + 22 * s, w: W - pad * 2 - (o.qr ? qrS + 30 * s : 0), size: (land ? 22 : 28) * s, weight: 600, font: fB, fill: "#FFFFFF", align: "left", lh: 1.35, name: "Contact details", kind: "contact" });
  if (o.qr) add({ t: "qr", data: o.qr, left: W - pad - qrS, top: footTop + (footH - qrS) / 2, w: qrS, name: "QR code" });
  return { bg, objects: out };
}
// rough number of lines a text needs (for laying out a template before fonts are measured)
export function approxLines(text, width, size) {
  const avg = size * 0.52, perLine = Math.max(4, Math.floor(width / avg));
  return String(text || "").split("\n").reduce((n, ln) => n + Math.max(1, Math.ceil(ln.length / perLine)), 0);
}

/* ---------------- ready-made lines (no AI) ---------------- */
export const READY = {
  en: { head: ["Upgrade Your Home Today", "Style That Lasts", "Quality You Can Trust", "Beautiful Spaces Start Here", "New Designs Just Arrived"],
    cta: ["Visit our showroom today", "Call now to know more", "Limited stock – hurry!", "Book your order today"],
    tags: ["#Tiles", "#HomeDecor", "#InteriorDesign", "#Sanitaryware", "#NewHome", "#Bathroom", "#Kitchen"] },
  hi: { head: ["अपने घर को दें नया रूप", "टिकाऊ और सुंदर", "भरोसे की क्वालिटी", "सुंदर घर की शुरुआत यहाँ से", "नई डिज़ाइन आ गई है"],
    cta: ["आज ही शोरूम आइए", "जानकारी के लिए अभी कॉल करें", "सीमित स्टॉक – जल्दी करें!", "आज ही ऑर्डर बुक करें"],
    tags: ["#टाइल्स", "#Tiles", "#HomeDecor", "#नयाघर", "#Sanitaryware"] },
  mr: { head: ["तुमच्या घराला द्या नवा लुक", "टिकाऊ आणि सुंदर", "विश्वासाचा दर्जा", "सुंदर घराची सुरुवात इथून", "नवीन डिझाइन आले आहेत"],
    cta: ["आजच शोरूमला भेट द्या", "माहितीसाठी आत्ताच कॉल करा", "मर्यादित स्टॉक – घाई करा!", "आजच ऑर्डर बुक करा"],
    tags: ["#टाइल्स", "#Tiles", "#HomeDecor", "#नवीनघर", "#Sanitaryware"] }
};
export const WRITING_STYLES = ["Professional", "Premium", "Luxury", "Traditional", "Modern", "Attractive", "Minimal", "Festive"];
