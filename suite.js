// =====================================================================
// suite.js - BUSINESS SUITE (added on top of the inventory app)
// CRM (kanban), sales dashboard, quotations & invoices, payroll & leave,
// hiring tracker, support tickets, workflow automation, WhatsApp links,
// call log and content planner.
// =====================================================================
import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc, getDocs, query, where,
  onSnapshot, serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* <pure> */
const calcTotals = (items, taxPct, discount) => {
  const subtotal = items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.price) || 0), 0);
  const disc = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const taxable = subtotal - disc;
  const tax = Math.round(taxable * (Number(taxPct) || 0)) / 100;
  return { subtotal, disc, tax, total: Math.round((taxable + tax) * 100) / 100 };
};
const invStatus = (d, nowMs) => {
  const paid = d.paid || 0;
  if (d.total - paid <= 0.005) return "Paid";
  if (d.dueAt && nowMs > d.dueAt) return "Overdue";
  return paid > 0 ? "Partial" : "Unpaid";
};
const monthInfo = (y, m) => {
  const days = new Date(y, m, 0).getDate();
  let sundays = 0;
  for (let d = 1; d <= days; d++) if (new Date(y, m - 1, d).getDay() === 0) sundays++;
  return { days, working: days - sundays };
};
const payNet = (monthly, working, payDays, bonus, deduction) =>
  Math.max(0, Math.round((Number(monthly) || 0) * Math.min(Number(payDays) || 0, working) / (working || 1) + (Number(bonus) || 0) - (Number(deduction) || 0)));
const leaveDaysInMonth = (lv, y, m, presentDays) => {
  let n = 0;
  for (let t = lv.from; t <= lv.to; t += 86400000) {
    const d = new Date(t);
    if (d.getFullYear() === y && d.getMonth() === m - 1 && d.getDay() !== 0 && !presentDays.has(d.getDate())) n++;
  }
  return n;
};
const fillTpl = (tpl, o) => String(tpl || "").replace(/\{(\w+)\}/g, (_, k) => (o[k] === undefined || o[k] === null ? "" : o[k]));
const waDigits = (p) => { const d = String(p || "").replace(/\D/g, ""); return d.length === 10 ? "91" + d : d; };
/* </pure> */

/* <chatpure> */
// Built-in WhatsApp message writer: understands what you ask for, fills in the customer's details and writes the message.
const CH_INTENTS = [
  ["festive", ["festive", "festival", "diwali", "deepavali", "holi", "eid", "christmas", "navratri", "raksha", "rakhi", "pongal", "onam", "baisakhi", "dussehra", "ganesh", "new year", "greeting", "wish"]],
  ["payment", ["payment", "pay ", "paid", "due ", "dues", "invoice", "outstanding", "pending amount", "overdue", "bill"]],
  ["quote", ["quote", "quotation", "estimate", "price list", "proposal", "rates"]],
  ["delivery", ["delivery", "dispatch", "shipped", "shipping", "courier", "order status", "on its way"]],
  ["apology", ["sorry", "apolog", "delay", "inconvenience", "mistake"]],
  ["feedback", ["feedback", "review", "rating", "experience"]],
  ["appointment", ["appointment", "meeting", "visit", "schedule", "demo", "slot"]],
  ["offer", ["offer", "discount", "promo", "scheme", "special price", "clearance", "% off"]],
  ["stock", ["back in stock", "restock", "new arrival", "new stock", "launch", "available now"]],
  ["thanks", ["thank", "closed", "won", "order confirm", "confirmed", "purchase"]],
  ["reengage", ["cold", "re-engage", "reengage", "inactive", "miss you", "long time", "come back"]],
  ["followup", ["follow", "check in", "checking in", "any update", "update on"]],
  ["intro", ["intro", "first contact", "first message", "introduce", "hello", "welcome", "enquiry", "inquiry", "new lead", "reach out"]]
];
const CH_STOP = new Set(["diwali", "holi", "eid", "christmas", "navratri", "new", "year", "whatsapp", "hindi", "hinglish", "english", "happy", "write", "make", "quote", "payment",
  "feedback", "friendly", "formal", "short", "the", "a", "an", "my", "our", "this", "that", "festive", "dussehra", "onam", "pongal", "ganesh", "raksha", "bandhan", "rakhi"]);

function chKw(text, kw) {
  const esc_ = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp((/^\w/.test(kw) ? "\\b" : "") + esc_ + (kw.length <= 4 && /\w$/.test(kw) ? "\\b" : ""), "i");
  return re.test(text);
}
function chDetectIntent(text) {
  let best = null, bestN = 0;
  CH_INTENTS.forEach(([name, kws]) => {
    const n = kws.filter((k) => chKw(text, k)).length;
    if (n > bestN) { best = name; bestN = n; }
  });
  return best;
}
function chParse(text) {
  const t = " " + text.toLowerCase() + " ";
  const has = (arr) => arr.some((w) => t.includes(w));
  let tone = null, lang = null;
  if (has(["formal", "professional", "polite", "official"])) tone = "formal";
  else if (has(["short", "brief", "crisp", "one line", "one-line", "quick"])) tone = "short";
  else if (has(["friendly", "casual", "warm", "informal"])) tone = "friendly";
  if (has(["hinglish", "hindi", "roman"])) lang = "hinglish"; else if (has(["english"])) lang = "en";
  const another = has(["another", "again", "different", "new version", "other version", "rewrite", "regenerate", "one more"]);
  const ent = {};
  let m = text.match(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)/i) || text.match(/([\d,]+(?:\.\d+)?)\s*(?:rs\b|rupees|rupee|₹)/i) || text.match(/amount\s*(?:of|is|:)?\s*([\d,]+(?:\.\d+)?)/i);
  if (m) ent.amount = "₹" + Number(m[1].replace(/,/g, "")).toLocaleString("en-IN");
  m = text.match(/(\d{1,2})\s*%/); if (m) ent.percent = m[1];
  const day = text.match(/\b(day after tomorrow|tomorrow|today|(?:on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i);
  const time = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (day || time) ent.when = [day && day[1], time && ("at " + time[1] + (time[2] ? ":" + time[2] : "") + " " + time[3].toLowerCase())].filter(Boolean).join(" ");
  const fest = [["diwali", "Diwali"], ["deepavali", "Diwali"], ["holi", "Holi"], ["eid", "Eid"], ["christmas", "Christmas"], ["navratri", "Navratri"], ["raksha bandhan", "Raksha Bandhan"],
    ["rakhi", "Raksha Bandhan"], ["pongal", "Pongal"], ["onam", "Onam"], ["baisakhi", "Baisakhi"], ["dussehra", "Dussehra"], ["ganesh", "Ganesh Chaturthi"], ["new year", "New Year"]];
  for (const [k, v] of fest) if (chKw(text, k)) { ent.festival = v; break; }
  m = text.match(/\b(?:for|to|named|customer)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/);
  if (m) { const w = m[1].split(/\s+/).filter((x) => !CH_STOP.has(x.toLowerCase())); if (w.length) ent.name = w.join(" "); }
  m = text.match(/\b(?:INV|QUO)-\d+\b/i); if (m) ent.number = m[0].toUpperCase();
  return { intent: chDetectIntent(text), tone, lang, another, ent };
}

const CH_T = {
  followup: {
    friendly: ["Hi {hi}! 👋 Just checking in on our last conversation. Any questions I can help with? Happy to assist anytime.\n\n– {me}, {company}",
      "Hello {hi}, hope you're doing well! 😊 Wanted to follow up and see if you had a chance to think things over. Let me know how I can help!\n\n– {me}, {company}"],
    formal: ["Dear {greet},\n\nI am following up on our recent discussion. Please let me know if you need any further information or would like to proceed.\n\nRegards,\n{me}\n{company}"],
    short: ["Hi {hi}, just following up. Any questions? 🙂"],
    hinglish: ["Hi {hi}! 👋 Bas ek chhota sa follow-up – humari last baat ke baare mein kya socha? Koi sawaal ho toh zaroor batayein.\n\n– {me}, {company}"]
  },
  payment: {
    friendly: ["Hi {hi}, a gentle reminder that {inv} of {amount}{due} is pending. 🙏 Kindly share the payment update at your convenience. Thank you!\n\n– {company}",
      "Hello {hi}! Hope you're well. Just a friendly nudge about {inv} – {amount} is still pending{due}. Please let us know once it's done. Thanks a lot! 😊\n\n– {me}, {company}"],
    formal: ["Dear {greet},\n\nThis is a reminder that payment of {amount} against {inv}{due} is outstanding. We request you to kindly arrange the payment at the earliest.\n\nThank you,\n{me}\n{company}"],
    short: ["Hi {hi}, reminder: {amount} pending for {inv}{due}. Please pay soon. Thanks 🙏"],
    hinglish: ["Hi {hi}, ek chhota reminder – {invh} ka {amount} abhi pending hai{due}. Kripya payment kar dein. Dhanyavaad! 🙏\n\n– {company}"]
  },
  intro: {
    friendly: ["Hi {hi}! 👋 Welcome, and thank you for reaching out to {company}. I'm {me} and I'll be happy to help you. What are you looking for today?",
      "Hello {hi}! 😊 Thanks for your interest in {company}. Tell me what you need and I'll share the best options for you."],
    formal: ["Dear {greet},\n\nThank you for contacting {company}. My name is {me}. Please let me know your requirements and I will be glad to assist you.\n\nRegards,\n{me}"],
    short: ["Hi {hi}! Thanks for contacting {company}. How can I help? 🙂"],
    hinglish: ["Namaste {hi}! 🙏 {company} mein aapka swagat hai. Main {me} hoon – bataiye, aapko kis cheez ki zaroorat hai?"]
  },
  thanks: {
    friendly: ["Thank you so much, {hi}! 🎉 We're delighted to have you with us. If you need anything, just message me.\n\n– {me}, {company}",
      "Hi {hi}! Thanks for choosing {company} 🙏 It was great working with you. We look forward to serving you again!"],
    formal: ["Dear {greet},\n\nThank you for your business. We truly appreciate your trust in {company} and look forward to serving you again.\n\nWarm regards,\n{me}"],
    short: ["Thank you {hi}! 🙏 Great working with you."],
    hinglish: ["Bahut bahut dhanyavaad {hi}! 🎉 {company} ko chunne ke liye shukriya. Kabhi bhi zaroorat ho toh message kijiye."]
  },
  reengage: {
    friendly: ["Hi {hi}! 👋 It's been a while! We've got some great updates at {company} and thought of you. Want me to share the details?",
      "Hello {hi}, hope all is well! 😊 We miss hearing from you. If you're still interested, I'd love to help – just reply here."],
    formal: ["Dear {greet},\n\nWe have not connected for some time and wanted to check if you still need our services. Please let us know and we will be happy to assist.\n\nRegards,\n{me}\n{company}"],
    short: ["Hi {hi}, long time! Still interested? Reply here and I'll help 🙂"],
    hinglish: ["Hi {hi}! 👋 Kaafi time ho gaya baat kiye hue. Kya aap abhi bhi interested hain? Batayein, hum aapki madad ke liye taiyaar hain."]
  },
  appointment: {
    friendly: ["Hi {hi}! 📅 Just confirming our appointment {when}. Please let me know if the time works for you or if you'd like to reschedule.\n\n– {me}, {company}",
      "Hello {hi}, a quick reminder about our meeting {when}. Looking forward to seeing you! 😊"],
    formal: ["Dear {greet},\n\nThis is to confirm our appointment {when}. Kindly let us know if you need to reschedule.\n\nRegards,\n{me}\n{company}"],
    short: ["Hi {hi}, reminder: our appointment is {when}. See you! 📅"],
    hinglish: ["Hi {hi}! 📅 Yaad dilana tha – humari appointment {when} hai. Agar time change karna ho toh bata dijiye."]
  },
  feedback: {
    friendly: ["Hi {hi}! 😊 Thanks again for choosing {company}. How was your experience? Your feedback helps us improve – it'll take just a minute! ⭐",
      "Hello {hi}, hope you're enjoying your purchase! 🙌 Would you share a quick review of your experience with us? We'd really appreciate it."],
    formal: ["Dear {greet},\n\nThank you for choosing {company}. We would value your feedback on your recent experience so that we can serve you better.\n\nRegards,\n{me}"],
    short: ["Hi {hi}, how was your experience with {company}? Quick feedback please ⭐"],
    hinglish: ["Hi {hi}! 😊 {company} se kharidari ka experience kaisa raha? Aapka feedback hamare liye bahut zaroori hai ⭐"]
  },
  festive: {
    friendly: ["Wishing you and your family a very Happy {festival}{nm}! 🎉✨ May this season bring you joy, health and prosperity.\n\nWarm wishes,\n{me} & team {company}",
      "Happy {festival}{nm}! 🪔 Thank you for being a valued part of the {company} family. Wishing you lots of happiness!"],
    formal: ["Dear {greet},\n\nOn the occasion of {festival}, we extend our warm wishes to you and your family. Thank you for your continued support.\n\nBest regards,\n{company}"],
    short: ["Happy {festival}{nm}! 🎉 Best wishes from {company}."],
    hinglish: ["Namaste{nm}! Aapko aur aapke parivaar ko {festival} ki hardik shubhkamnayein! 🎉✨ {company} ki taraf se dher saari khushiyan."]
  },
  offer: {
    friendly: ["Hi {hi}! 🎁 Great news – {company} has a special offer{percent}for you! Limited time only. Want me to share the details?",
      "Hello {hi}! 😊 We're running a special offer{percent}at {company} this week. Reply 'YES' and I'll send you everything you need."],
    formal: ["Dear {greet},\n\nWe are pleased to inform you of a special offer{percent}at {company}. Please let us know if you would like further details.\n\nRegards,\n{me}"],
    short: ["Hi {hi}! Special offer{percent}at {company} 🎁 Interested? Reply YES."],
    hinglish: ["Hi {hi}! 🎁 {company} mein special offer{percent}chal raha hai. Details chahiye toh 'YES' reply kijiye."]
  },
  delivery: {
    friendly: ["Hi {hi}! 📦 Good news – your order has been dispatched and will reach you soon. I'll keep you updated. Thank you for choosing {company}!",
      "Hello {hi}, your order is on its way! 🚚 Let me know if you need any help with delivery.\n\n– {me}, {company}"],
    formal: ["Dear {greet},\n\nWe are pleased to inform you that your order has been dispatched. You will receive it shortly. Please contact us for any assistance.\n\nRegards,\n{company}"],
    short: ["Hi {hi}, your order is dispatched 📦 It'll reach you soon!"],
    hinglish: ["Hi {hi}! 📦 Aapka order dispatch ho gaya hai aur jaldi hi pahunch jayega. Koi dikkat ho toh bataiye."]
  },
  apology: {
    friendly: ["Hi {hi}, we're really sorry for the inconvenience. 🙏 We're working on it right away and will update you shortly. Thank you for your patience!",
      "Hello {hi}, sincere apologies for the delay. 😔 We value you and are fixing this as fast as we can – I'll keep you posted.\n\n– {me}, {company}"],
    formal: ["Dear {greet},\n\nWe sincerely apologise for the inconvenience caused. We are taking immediate steps to resolve this and appreciate your patience and understanding.\n\nRegards,\n{me}\n{company}"],
    short: ["Hi {hi}, sorry for the inconvenience 🙏 We're fixing it now."],
    hinglish: ["Hi {hi}, hume bahut khed hai is pareshani ke liye 🙏 Hum jaldi se jaldi ise theek kar rahe hain. Aapke sabr ke liye shukriya."]
  },
  quote: {
    friendly: ["Hi {hi}! 📄 As discussed, I'm sharing our quotation for you. Please have a look and let me know if you'd like any changes – happy to adjust!\n\n– {me}, {company}",
      "Hello {hi}, thanks for your enquiry! Your quotation is ready 😊 Let me know if you have any questions or want to proceed."],
    formal: ["Dear {greet},\n\nPlease find our quotation as discussed. We would be glad to clarify any details and look forward to your confirmation.\n\nRegards,\n{me}\n{company}"],
    short: ["Hi {hi}, your quotation is ready 📄 Shall I send it?"],
    hinglish: ["Hi {hi}! 📄 Aapki quotation taiyaar hai. Dekh kar bata dijiye, koi badlav chahiye toh hum kar denge."]
  },
  stock: {
    friendly: ["Hi {hi}! 🛍️ Good news – new stock has just arrived at {company}! Want me to share the latest range with you?",
      "Hello {hi}, the item you were looking for is back in stock! 🎉 Reply here and I'll reserve it for you."],
    formal: ["Dear {greet},\n\nWe are pleased to inform you that new stock is now available at {company}. Please let us know if you would like further details.\n\nRegards,\n{me}"],
    short: ["Hi {hi}, new stock has arrived at {company}! 🛍️ Interested?"],
    hinglish: ["Hi {hi}! 🛍️ {company} mein naya stock aa gaya hai. Dekhna chahenge? Bataiye, hum details bhej denge."]
  }
};

function chBuild(intent, tone, lang, ctx, idx) {
  const T = CH_T[intent];
  if (!T) return "";
  const list = T[lang === "hinglish" ? "hinglish" : tone] || T.friendly;
  const tpl = list[(idx || 0) % list.length];
  const name = (ctx.name || "").trim();
  const vars = { hi: name || "there", greet: name || "Sir/Madam", nm: name ? ", " + name : "", invh: ctx.number ? "invoice " + ctx.number : "aapke invoice", company: ctx.company || "our team", me: ctx.me || "Team",
    amount: ctx.amount || "the pending amount", inv: ctx.number ? "invoice " + ctx.number : "your invoice", due: ctx.due ? " (due " + ctx.due + ")" : "",
    festival: ctx.festival || "festive season", when: ctx.when || "soon", percent: ctx.percent ? " of " + ctx.percent + "% off " : " " };
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? "" : vars[k])).replace(/ {2,}/g, " ").replace(/ ([.,!?])/g, "$1");
}

// state = { ctx, last }.  Returns { kind: "msg", text } or { kind: "help" }
function chReply(state, text) {
  const p = chParse(text);
  Object.assign(state.ctx, p.ent);
  const modifier = !!(p.tone || p.lang || p.another);
  let intent = p.intent;
  if (!intent && modifier && state.last) intent = state.last.intent;
  if (!intent) return { kind: "help" };
  const isNew = !state.last || intent !== state.last.intent;
  let tone = p.tone || (isNew ? "friendly" : state.last.tone);
  let lang = p.lang || (isNew ? "en" : state.last.lang);
  if (p.tone && !p.lang && lang === "hinglish") lang = "en";
  let idx = 0;
  if (!isNew) idx = p.another || (!p.tone && !p.lang) ? state.last.idx + 1 : state.last.idx;
  state.last = { intent, tone, lang, idx };
  return { kind: "msg", text: chBuild(intent, tone, lang, state.ctx, idx), intent, tone, lang };
}
/* </chatpure> */

export function initSuite(ctx) {
  const { db, $, toast, askConfirm, loading, esc, fmtDT, fmtD, dtPicker, readDT, pushAlert } = ctx;
  const st = () => ctx.getState();
  const C = (n) => collection(db, "companies", st().companyID, n);
  const D = (n, id) => doc(db, "companies", st().companyID, n, id);
  const now = () => Date.now();
  const pad = (n) => String(n).padStart(2, "0");
  const inr = (n) => "₹" + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-IN");
  const dstr = (ms) => (ms ? fmtD(new Date(ms)) : "-");
  const dtstr = (ms) => (ms ? fmtDT(new Date(ms)) : "-");
  const isAdmin = () => st().role === "ADMIN";
  const chip = (txt, cls = "") => `<span class="chip ${cls}">${esc(txt)}</span>`;
  const backTo = (tab) => `<button class="auth-btn" style="background:#666; margin-top:10px" onclick="SU.go('${tab}')">← Back</button>`;
  const waLink = (phone, text) => `https://wa.me/${waDigits(phone)}?text=${encodeURIComponent(text)}`;

  const leadScore = (l) => {
    let sc = 0;
    if (l.value >= 50000) sc += 3; else if (l.value >= 10000) sc += 1;
    if (l.phone) sc += 2; if (l.email) sc += 1;
    if (l.source === "Referral" || l.source === "Walk-in") sc += 2;
    if (l.followUp && l.followUp > Date.now()) sc += 1;
    if (sc >= 6) return { cls: "ls-hot", label: "Hot" };
    if (sc >= 3) return { cls: "ls-warm", label: "Warm" };
    return { cls: "ls-cold", label: "Cold" };
  };
  const LEAD_STAGES = ["New", "Contacted", "Qualified", "Proposal", "Won", "Lost"];
  const CAND_STAGES = ["Applied", "Screening", "Interview", "Offer", "Hired", "Rejected"];
  const TICKET_STATUS = ["Open", "In Progress", "Resolved", "Closed"];
  const SLA_HOURS = { High: 4, Medium: 24, Low: 72 };
  const F = { leads: "stage", candidates: "stage", tickets: "status" };
  const STAGES = { leads: LEAD_STAGES, candidates: CAND_STAGES, tickets: TICKET_STATUS };
  const DEFAULT_TPL = [
    { name: "Greeting", text: "Hello {name}, thank you for contacting {company}. How can we help you today?" },
    { name: "Follow-up", text: "Hi {name}, just following up on our last conversation. Please let us know if you have any questions." },
    { name: "Payment reminder", text: "Dear {name}, a gentle reminder that invoice {number} of {amount} was due on {due}. Please share the payment update. Thank you, {company}" },
    { name: "Interview invite", text: "Hi {name}, we would like to invite you for an interview for the {role} role at {company}." }
  ];

  const S = { leads: [], tickets: [], docs: [], rules: [], templates: [], leaves: [], candidates: [], salaries: [], payslips: [], posts: [], calls: [] };
  let attached = {};
  const alerted = new Set();
  const V = { tab: "crm", sub: "", id: null, billTab: "INVOICE", paySub: "sal", pm: { y: new Date().getFullYear(), m: new Date().getMonth() + 1 },
    bill: null, lock: false, drag: null, form: null, my: "leads" };

  /* ---------------- realtime data ---------------- */
  function listen(name, q) {
    if (attached[name]) return;
    attached[name] = true;
    ctx.addUnsub(onSnapshot(q || C(name), (snap) => {
      S[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rerender();
    }, (e) => console.error("Suite listener " + name, e)));
  }

  function start() {
    Object.keys(S).forEach((k) => (S[k] = []));
    attached = {};
    alerted.clear();
    V.bill = null; V.lock = false;
    const s = st();
    if (s.role === "ADMIN") ["leads", "tickets", "docs", "rules", "templates", "leaves"].forEach((n) => listen(n));
    else {
      const uid = s.user.uid;
      listen("leads", query(C("leads"), where("assignedTo", "==", uid)));
      listen("tickets", query(C("tickets"), where("assignedTo", "==", uid)));
      listen("leaves", query(C("leaves"), where("uid", "==", uid)));
      listen("payslips", query(C("payslips"), where("uid", "==", uid)));
      listen("templates");
    }
    const h = setInterval(tick, 60000);
    ctx.addUnsub(() => clearInterval(h));
    setTimeout(tick, 5000);
  }

  /* ---------------- reminders (every minute while the app is open) ---------------- */
  const once = (key, fn) => { if (!alerted.has(key)) { alerted.add(key); fn(); } };
  const openLead = (l) => !["Won", "Lost"].includes(l.stage);
  const openTicket = (k) => ["Open", "In Progress"].includes(k.status);

  async function tick() {
    const t = now(), admin = isAdmin();
    S.leads.forEach((l) => {
      if (l.followUp && l.followUp <= t && openLead(l))
        once("fu" + l.id + l.followUp, () => pushAlert(`<b>📞 Follow-up due</b><br><small>${esc(l.name)}${admin && l.assignedName ? " · " + esc(l.assignedName) : ""}</small>`, "left"));
    });
    S.tickets.forEach((k) => {
      if (k.dueAt && k.dueAt < t && openTicket(k)) {
        once("sla" + k.id, () => pushAlert(`<b>🎫 Ticket overdue (SLA)</b><br><small>${esc(k.title)}</small>`, "left"));
        if (admin && !k.slaFired) updateDoc(D("tickets", k.id), { slaFired: true }).then(() => fire("TICKET_SLA", "", k)).catch(() => {});
      }
    });
    if (admin) {
      S.docs.forEach((d) => {
        if (d.type === "INVOICE" && invStatus(d, t) === "Overdue" && !d.overdueFired)
          updateDoc(D("docs", d.id), { overdueFired: true }).then(() => {
            pushAlert(`<b>🧾 Invoice overdue</b><br><small>${esc(d.number)} · ${esc(d.cName)}</small>`, "left");
            fire("INVOICE_OVERDUE", "", { ...d, name: d.cName });
          }).catch(() => {});
      });
      S.posts.forEach((p) => { if (p.status !== "Posted" && p.scheduledAt && p.scheduledAt <= t) once("post" + p.id, () => pushAlert(`<b>📣 Time to post</b><br><small>${esc(p.platform)}: ${esc((p.text || "").slice(0, 60))}</small>`, "enter")); });
      S.candidates.forEach((c) => { if (c.interviewAt && c.interviewAt > t && c.interviewAt - t < 3600000) once("iv" + c.id, () => pushAlert(`<b>🧑‍💼 Interview within 1 hour</b><br><small>${esc(c.name)} · ${esc(c.role || "")}</small>`, "enter")); });
    }
    updateBadges();
  }

  function updateBadges() {
    const t = now(), admin = isAdmin();
    let n = S.leads.filter((l) => l.followUp && l.followUp <= t && openLead(l)).length + S.tickets.filter((k) => k.dueAt && k.dueAt < t && openTicket(k)).length;
    if (admin) n += S.docs.filter((d) => d.type === "INVOICE" && invStatus(d, t) === "Overdue").length + S.leaves.filter((l) => l.status === "PENDING").length;
    const b = $(admin ? "suiteBadge" : "myWorkBadge");
    if (b) { b.innerText = n; b.classList.toggle("hidden", n <= 0); }
  }

  /* ---------------- workflow automation engine ---------------- */
  const recVars = (r) => ({ name: r.name || r.cName || r.title || "", phone: r.phone || r.cPhone || "", value: r.value || r.total || "", stage: r.stage || r.status || "",
    title: r.title || "", role: r.role || "", number: r.number || "", company: st().companyName || "",
    amount: r.total !== undefined ? inr(r.total - (r.paid || 0)) : "", due: r.dueAt ? dstr(r.dueAt) : "" });

  async function fire(trigger, value, rec) {
    const rules = S.rules.filter((r) => r.enabled !== false && r.trigger === trigger && (!r.value || r.value === value));
    for (const r of rules) {
      try {
        const vars = recVars(rec);
        if (r.action === "ALERT") { pushAlert(`<b>⚙ ${esc(r.name)}</b><br><small>${esc(fillTpl(r.text || r.name, vars))}</small>`, "enter"); continue; }
        const staff = st().staff;
        const targets = r.assignee === "ALL" ? staff : staff.filter((s) => s.uid === (r.assignee === "ASSIGNED" ? rec.assignedTo : r.assignee));
        if (!targets.length) { pushAlert(`<b>⚙ ${esc(r.name)}</b><br><small>No employee to give the task to</small>`, "left"); continue; }
        const start = now();
        await ctx.createTask({ title: fillTpl(r.text, vars), assignees: targets, scope: r.assignee === "ALL" ? "ALL" : "SINGLE", privacy: "PUBLIC",
          startAt: start, endAt: start + (Number(r.hours) || 24) * 3600000 });
        pushAlert(`<b>⚙ ${esc(r.name)}</b><br><small>Task created automatically</small>`, "enter");
      } catch (e) { console.error("Automation error", e); }
    }
  }

  function leastLoaded(kind) {
    const staff = st().staff;
    if (!staff.length) return null;
    const load = {};
    S[kind].filter(kind === "leads" ? openLead : openTicket).forEach((x) => { load[x.assignedTo] = (load[x.assignedTo] || 0) + 1; });
    return [...staff].sort((a, b) => (load[a.uid] || 0) - (load[b.uid] || 0))[0];
  }

  /* ---------------- generic form window ---------------- */
  function openForm(cfg) {
    V.form = cfg;
    $("formTitle").innerText = cfg.title;
    $("formBody").innerHTML = cfg.fields.map((f) => {
      const v = (cfg.values || {})[f.k], id = "ff_" + f.k;
      let ctl;
      if (f.type === "select")
        ctl = `<select id="${id}" style="width:95%" ${f.onchange ? `onchange="${f.onchange}"` : ""}>${f.opts.map((o) => { const [val, lab] = Array.isArray(o) ? o : [o, o];
          return `<option value="${esc(val)}" ${String(v ?? "") === String(val) ? "selected" : ""}>${esc(lab)}</option>`; }).join("")}</select>`;
      else if (f.type === "textarea") ctl = `<textarea id="${id}" class="task-input" rows="${f.rows || 3}" placeholder="${esc(f.ph || "")}">${esc(v ?? "")}</textarea>`;
      else if (f.type === "date" || f.type === "datetime")
        ctl = (f.opt ? `<label class="task-radio"><input type="checkbox" id="${id}_on" ${v ? "checked" : ""}> Set a date</label>` : "") + dtPicker(id, v || now(), f.type === "date");
      else ctl = `<input id="${id}" type="${f.type || "text"}" ${f.type === "number" ? 'step="any" min="0"' : ""} value="${esc(v ?? "")}" placeholder="${esc(f.ph || "")}" style="width:95%">`;
      return `<label class="task-label">${esc(f.label)}${f.req ? " *" : ""}</label>${ctl}`;
    }).join("");
    $("formSave").innerText = cfg.saveLabel || "Save";
    $("formModal").classList.add("open");
  }

  function readForm() {
    const out = {};
    for (const f of V.form.fields) {
      const id = "ff_" + f.k;
      let v;
      if (f.type === "date" || f.type === "datetime") {
        v = f.opt && !$(id + "_on").checked ? null : readDT(id);
        if (v !== null && isNaN(v)) { toast(`Enter a valid date for "${f.label}"`); return null; }
      } else {
        v = ($(id).value || "").trim();
        if (f.type === "number") v = v === "" ? 0 : Number(v);
      }
      if (f.req && (v === "" || v === null || (f.type === "number" && !(v > 0)))) { toast(`"${f.label}" is required`); return null; }
      out[f.k] = v;
    }
    return out;
  }

  async function submitForm() {
    const vals = readForm();
    if (!vals || !V.form) return;
    try {
      loading(true);
      const keep = await V.form.onSave(vals);
      if (keep !== false) closeForm();
    } catch (e) { console.error(e); toast(e.message); }
    finally { loading(false); }
  }
  function closeForm() { $("formModal").classList.remove("open"); V.form = null; }

  /* ---------------- navigation / rendering ---------------- */
  const TABS = [["crm", "📇 CRM"], ["sales", "📈 Sales"], ["bill", "🧾 Billing"], ["pay", "💰 Payroll & Leave"], ["hire", "🧑‍💼 Hiring"],
    ["help", "🎫 Support"], ["auto", "⚙ Automation"], ["msg", "💬 WhatsApp & Calls"], ["social", "📣 Content"]];
  const LAZY = { hire: ["candidates"], pay: ["salaries", "payslips"], social: ["posts"], msg: ["calls"], crm: ["calls"] };

  function open() {
    if (!isAdmin()) return;
    ["candidates", "posts"].forEach((n) => listen(n));
    $("suiteModal").classList.add("open");
    go(V.tab);
  }
  function close() { $("suiteModal").classList.remove("open"); V.lock = false; V.bill = null; }
  function go(tab, sub) {
    V.tab = tab; V.sub = sub || ""; V.id = null; V.lock = false; V.bill = null;
    (LAZY[tab] || []).forEach((n) => listen(n));
    renderSuite(true);
  }
  function rerender() { renderSuite(); renderMy(); updateBadges(); }

  function renderSuite(force) {
    const el = $("suiteBody");
    if (!el || !$("suiteModal").classList.contains("open") || (V.lock && !force)) return;
    $("suiteTabs").innerHTML = TABS.map(([k, l]) => `<button class="stab ${V.tab === k ? "on" : ""}" onclick="SU.go('${k}')">${l}</button>`).join("");
    const views = { crm: viewCrm, sales: viewSales, bill: viewBill, pay: viewPay, hire: viewHire, help: viewHelp, auto: viewAuto, msg: viewMsg, social: viewSocial };
    el.innerHTML = views[V.tab]();
  }

  /* ---------------- generic kanban ---------------- */
  function kanban(kind, items, card) {
    const f = F[kind], stages = STAGES[kind];
    return `<div class="kanban">${stages.map((s) => {
      const list = items.filter((x) => (x[f] || stages[0]) === s);
      return `<div class="kcol" ondragover="event.preventDefault()" ondrop="SU.drop('${kind}','${s}')">
        <div class="khead"><b>${s}</b>${chip(list.length)}</div>${list.map(card).join("") || '<div class="kempty">Empty</div>'}</div>`;
    }).join("")}</div>`;
  }

  async function move(kind, id, stage) {
    const rec = S[kind].find((x) => x.id === id), f = F[kind];
    if (!rec || (rec[f] || STAGES[kind][0]) === stage) return;
    const upd = { [f]: stage, updatedAt: serverTimestamp() };
    if (kind === "leads" && stage === "Won") upd.wonAt = now();
    if (kind === "tickets") {
      upd.history = [...(rec.history || []), { at: now(), by: st().name, note: "Status changed to " + stage }];
      if (stage === "Resolved") upd.resolvedAt = now();
    }
    try {
      await updateDoc(D(kind, id), upd);
      if (isAdmin()) fire(kind === "leads" ? "LEAD_STAGE" : kind === "candidates" ? "CAND_STAGE" : "TICKET_STATUS", stage, { ...rec, ...upd });
    } catch (e) { console.error(e); toast("Could not move: " + e.message); }
  }
  async function mv(kind, id, dir) {
    const rec = S[kind].find((x) => x.id === id), stages = STAGES[kind];
    if (!rec) return;
    const n = stages[stages.indexOf(rec[F[kind]] || stages[0]) + dir];
    if (n) await move(kind, id, n);
  }
  async function delRec(kind, id, back) {
    if (!(await askConfirm("Are you sure you want to delete this?"))) return;
    try { await deleteDoc(D(kind, id)); toast("Deleted"); if (back) go(back); } catch (e) { toast(e.message); }
  }

  /* =================== CRM (kanban leads) =================== */
  const leadDue = (l) => l.followUp && l.followUp <= now() && openLead(l);
  const leadCard = (l) => { const sc = leadScore(l);
    return `<div class="kcard" draggable="true" ondragstart="SU.drag('leads','${l.id}')">
    <div style="display:flex;align-items:flex-start;gap:8px">
      <div class="lead-score ${sc.cls}" title="${sc.label}">${sc.label[0]}</div>
      <div style="flex:1"><div class="ktitle" onclick="SU.openLead('${l.id}')">${esc(l.name)}</div>
      <div class="kmeta">${l.value ? inr(l.value) + " · " : ""}${esc(l.source || "")}<br>
        ${l.assignedName ? "👤 " + esc(l.assignedName) : "<i>Unassigned</i>"}
        ${l.followUp ? `<br><span class="${leadDue(l) ? "over" : ""}">⏰ ${dtstr(l.followUp)}</span>` : ""}</div></div></div>
    <div class="kact" style="margin-top:8px">
      <button onclick="SU.mv('leads','${l.id}',-1)">◀</button><button onclick="SU.mv('leads','${l.id}',1)">▶</button>
      <button class="btn-sm" style="background:#25D366" onclick="SU.wa('leads','${l.id}')">💬 WA</button>
      <a href="tel:${esc(l.phone || "")}">📞</a>
      <button class="btn-sm" style="background:rgba(142,68,173,.7)" onclick="SU.aiMsg('leads','${l.id}')">🤖 AI</button></div></div>`; };

  function viewCrm() {
    if (V.sub === "lead") return viewLead();
    const open_ = S.leads.filter(openLead);
    const hot = S.leads.filter((l) => openLead(l) && leadScore(l).cls === "ls-hot").length;
    const due = S.leads.filter(leadDue).length;
    return `<div class="crm-stats">
      <div class="crm-stat"><div class="sv">${S.leads.filter((l)=>l.stage==="Won").length}</div><div class="sl">Won</div></div>
      <div class="crm-stat"><div class="sv" style="color:#e74c3c">${hot}</div><div class="sl">Hot leads</div></div>
      <div class="crm-stat"><div class="sv">${open_.length}</div><div class="sl">Open</div></div>
      <div class="crm-stat"><div class="sv" style="color:#ffc107">${due}</div><div class="sl">Follow-ups due</div></div>
      <div class="crm-stat"><div class="sv">${inr(open_.reduce((s,l)=>s+(l.value||0),0))}</div><div class="sl">Pipeline</div></div>
    </div><div class="suite-bar">
      <button class="btn-primary btn-sm" onclick="SU.leadForm()">➕ Add Lead</button>
      <button class="btn-sm" style="background:rgba(142,68,173,.7)" onclick="SU.openAiChatbot('crm')">🤖 AI Message Writer</button>
    </div>` + kanban("leads", S.leads, leadCard);
  }

  function leadForm(id) {
    const l = id ? S.leads.find((x) => x.id === id) : null, staff = st().staff;
    openForm({
      title: l ? "Edit Lead" : "Add Lead",
      values: l ? { ...l, assign: l.assignedTo || "" } : { source: "WhatsApp", assign: "AUTO" },
      fields: [
        { k: "name", label: "Name", req: true }, { k: "phone", label: "Phone", type: "tel" }, { k: "email", label: "Email" },
        { k: "source", label: "Source", type: "select", opts: ["WhatsApp", "Call", "Website", "Referral", "Walk-in", "Social media", "Other"] },
        { k: "value", label: "Deal value (₹)", type: "number" },
        { k: "assign", label: "Assign to", type: "select", opts: [["AUTO", "Auto (least busy employee)"], ["", "Nobody"], ...staff.map((s) => [s.uid, s.name])] },
        { k: "followUp", label: "Next follow-up", type: "datetime", opt: true },
        { k: "notes", label: "Notes", type: "textarea" }
      ],
      onSave: async (v) => {
        const asg = v.assign === "AUTO" ? leastLoaded("leads") : staff.find((s) => s.uid === v.assign) || null;
        const data = { name: v.name, phone: v.phone, email: v.email, source: v.source, value: v.value, notes: v.notes, followUp: v.followUp, updatedAt: serverTimestamp() };
        if (!l || v.assign !== (l.assignedTo || "")) { data.assignedTo = asg ? asg.uid : ""; data.assignedName = asg ? asg.name : ""; }
        if (l) await updateDoc(D("leads", l.id), data);
        else {
          const ref = await addDoc(C("leads"), { ...data, stage: "New", createdAt: serverTimestamp(), createdBy: st().user.uid });
          fire("LEAD_CREATED", "", { ...data, id: ref.id });
        }
      }
    });
  }

  function viewLead() {
    const l = S.leads.find((x) => x.id === V.id);
    if (!l) return "<p>Lead not found.</p>" + backTo("crm");
    const calls = S.calls.filter((c) => c.refId === l.id).sort((a, b) => b.at - a.at);
    return `<h3 style="margin-top:0">${esc(l.name)} ${chip(l.stage || "New")}</h3>
      <div class="task-meta">📞 ${esc(l.phone || "-")} · ✉ ${esc(l.email || "-")}<br>💰 ${inr(l.value)} · Source: ${esc(l.source || "-")}<br>
        👤 ${esc(l.assignedName || "Unassigned")}<br>⏰ Follow-up: ${dtstr(l.followUp)}<br>📝 ${esc(l.notes || "-")}</div>
      <div class="suite-bar" style="margin-top:10px">
        <select onchange="SU.setStage('leads','${l.id}',this.value)">${LEAD_STAGES.map((s) => `<option ${s === (l.stage || "New") ? "selected" : ""}>${s}</option>`).join("")}</select>
        <button class="auth-btn" onclick="SU.leadForm('${l.id}')">✏ Edit</button>
        <button class="btn-wa btn-sm" onclick="SU.wa('leads','${l.id}')">💬 WhatsApp</button>
        <button class="btn-sm" style="background:rgba(142,68,173,.7)" onclick="SU.aiMsg('leads','${l.id}')">🤖 AI Message</button>
        <a class="auth-btn lnk" href="tel:${esc(l.phone || "")}">📞 Call</a>
        <button class="auth-btn" onclick="SU.callForm('leads','${l.id}')">📝 Log call</button>
        <button class="auth-btn" style="background:#8e44ad" onclick="SU.billFromLead('${l.id}','QUOTATION')">🧾 Quote</button>
        <button class="auth-btn" style="background:#8e44ad" onclick="SU.billFromLead('${l.id}','INVOICE')">🧾 Invoice</button>
        <button class="bin" onclick="SU.delRec('leads','${l.id}','crm')">🗑</button></div>
      <h4>Call history</h4>${calls.length ? calls.map(callRow).join("") : "<p class='hint'>No calls logged yet.</p>"}${backTo("crm")}`;
  }
  const callRow = (c) => `<div class="task-card"><div class="task-info"><b>${esc(c.direction)}</b> · ${esc(c.outcome)}
    <div class="task-meta">${dtstr(c.at)} · ${esc(c.byName || "")}<br>${esc(c.notes || "")}</div></div></div>`;

  /* ---------------- WhatsApp message picker + call log ---------------- */
  const tplList = () => (S.templates.length ? S.templates : DEFAULT_TPL);
  function waForm(kind, id, tplName) {
    const r = S[kind].find((x) => x.id === id);
    if (!r) return;
    V.waVars = recVars(r); V.waPhone = r.phone || r.cPhone || "";
    const list = tplList(), first = Math.max(0, list.findIndex((t) => t.name === tplName));
    openForm({
      title: "Send WhatsApp message to " + (r.name || r.cName || ""), saveLabel: "Open WhatsApp", values: { tpl: first, msg: fillTpl(list[first].text, V.waVars) },
      fields: [{ k: "tpl", label: "Message template", type: "select", opts: list.map((t, i) => [i, t.name]), onchange: "SU.tplPick()" },
        { k: "msg", label: "Message (you can edit it)", type: "textarea", rows: 5 }],
      onSave: (v) => { window.open(waLink(V.waPhone, v.msg), "_blank"); }
    });
  }
  const tplPick = () => { $("ff_msg").value = fillTpl(tplList()[+$("ff_tpl").value].text, V.waVars); };

  function callForm(kind, id) {
    const r = S[kind].find((x) => x.id === id);
    if (!r) return;
    openForm({
      title: "Log call with " + (r.name || ""), values: { direction: "Outgoing", outcome: "Connected" },
      fields: [{ k: "direction", label: "Direction", type: "select", opts: ["Outgoing", "Incoming"] },
        { k: "outcome", label: "Outcome", type: "select", opts: ["Connected", "No answer", "Busy", "Call back later", "Wrong number"] },
        { k: "notes", label: "Notes", type: "textarea" }],
      onSave: async (v) => {
        await addDoc(C("calls"), { refType: kind, refId: id, name: r.name || "", phone: r.phone || "", ...v, at: now(), by: st().user.uid, byName: st().name });
        toast("Call logged");
      }
    });
  }

  /* =================== SALES DASHBOARD =================== */
  function viewSales() {
    const t = now(), d = new Date(), mStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const won = S.leads.filter((l) => l.stage === "Won"), lost = S.leads.filter((l) => l.stage === "Lost");
    const wonMonth = won.filter((l) => (l.wonAt || 0) >= mStart).reduce((s, l) => s + (l.value || 0), 0);
    const inv = S.docs.filter((x) => x.type === "INVOICE");
    const invoiced = inv.reduce((s, x) => s + (x.total || 0), 0), collected = inv.reduce((s, x) => s + (x.paid || 0), 0);
    const overdue = inv.filter((x) => invStatus(x, t) === "Overdue").reduce((s, x) => s + x.total - (x.paid || 0), 0);
    const conv = won.length + lost.length ? Math.round((100 * won.length) / (won.length + lost.length)) : 0;
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      months.push({ key: m.getFullYear() + "-" + pad(m.getMonth() + 1), label: pad(m.getMonth() + 1) + "/" + m.getFullYear(), amt: 0 });
    }
    inv.forEach((x) => (x.payments || []).forEach((p) => {
      const pd = new Date(p.at), mm = months.find((z) => z.key === pd.getFullYear() + "-" + pad(pd.getMonth() + 1));
      if (mm) mm.amt += p.amount || 0;
    }));
    const max = Math.max(1, ...months.map((m) => m.amt));
    const perEmp = {};
    won.forEach((l) => { const n = l.assignedName || "Unassigned"; perEmp[n] = (perEmp[n] || 0) + (l.value || 0); });
    const card = (label, val, color) => `<div class="scard" style="border-top:4px solid ${color}"><div class="hint">${label}</div><div class="sval">${val}</div></div>`;
    return `<div class="sgrid">${card("Open pipeline", inr(S.leads.filter(openLead).reduce((s, l) => s + (l.value || 0), 0)), "#17a2b8")}
      ${card("Won this month", inr(wonMonth), "#28a745")}${card("Conversion rate", conv + "%", "#6f42c1")}
      ${card("Total invoiced", inr(invoiced), "#0056b3")}${card("Collected", inr(collected), "#28a745")}
      ${card("Outstanding", inr(invoiced - collected), "#fd7e14")}${card("Overdue", inr(overdue), "#dc3545")}
      ${card("Leads (all)", S.leads.length, "#555")}</div>
      <h4>Payments collected - last 6 months</h4>
      <div class="bars">${months.map((m) => `<div class="bar"><div class="barfill" style="height:${Math.round((m.amt / max) * 100)}%"></div><small>${inr(m.amt)}</small><b>${m.label}</b></div>`).join("")}</div>
      <h4>Won deals by employee</h4>${Object.keys(perEmp).length ? Object.entries(perEmp).sort((a, b) => b[1] - a[1]).map(([n, v]) => `<div class="task-card"><div class="task-info"><b>${esc(n)}</b></div><b>${inr(v)}</b></div>`).join("") : "<p class='hint'>No won deals yet.</p>"}`;
  }

  /* =================== HIRING TRACKER =================== */
  const candCard = (c) => `<div class="kcard" draggable="true" ondragstart="SU.drag('candidates','${c.id}')">
    <div class="ktitle">${esc(c.name)}</div><div class="kmeta">${esc(c.role || "")}<br>📞 ${esc(c.phone || "-")}${c.interviewAt ? `<br>🗓 ${dtstr(c.interviewAt)}` : ""}</div>
    <div class="kact"><button onclick="SU.mv('candidates','${c.id}',-1)">◀</button><button onclick="SU.mv('candidates','${c.id}',1)">▶</button>
      <button onclick="SU.wa('candidates','${c.id}')">💬</button><button onclick="SU.candForm('${c.id}')">✏</button><button onclick="SU.delRec('candidates','${c.id}')">🗑</button></div></div>`;
  function viewHire() {
    const hired = S.candidates.filter((c) => c.stage === "Hired").length;
    return `<div class="suite-bar"><button class="auth-btn" style="background:#28a745" onclick="SU.candForm()">➕ Add Candidate</button>${chip(S.candidates.length + " candidates")} ${chip(hired + " hired", "chip-green")}</div>` + kanban("candidates", S.candidates, candCard);
  }
  function candForm(id) {
    const c = id ? S.candidates.find((x) => x.id === id) : null;
    openForm({
      title: c ? "Edit Candidate" : "Add Candidate", values: c || {},
      fields: [{ k: "name", label: "Name", req: true }, { k: "role", label: "Role applied for", req: true }, { k: "phone", label: "Phone", type: "tel" },
        { k: "email", label: "Email" }, { k: "expected", label: "Expected salary (₹)", type: "number" },
        { k: "interviewAt", label: "Interview date & time", type: "datetime", opt: true }, { k: "notes", label: "Notes", type: "textarea" }],
      onSave: async (v) => {
        if (c) await updateDoc(D("candidates", c.id), { ...v, updatedAt: serverTimestamp() });
        else await addDoc(C("candidates"), { ...v, stage: "Applied", createdAt: serverTimestamp() });
      }
    });
  }

  /* =================== SUPPORT TICKETS =================== */
  const slaText = (k) => {
    if (!k.dueAt || !openTicket(k)) return "";
    const h = (k.dueAt - now()) / 3600000;
    return h < 0 ? `<span class="over">⏰ overdue ${Math.ceil(-h)}h</span>` : `⏳ ${h < 1 ? Math.ceil(h * 60) + " min" : Math.floor(h) + "h"} left`;
  };
  const prioChip = (p) => chip(p || "Medium", p === "High" ? "chip-red" : p === "Low" ? "chip-green" : "chip-yellow");
  const ticketCard = (k) => `<div class="kcard" draggable="true" ondragstart="SU.drag('tickets','${k.id}')">
    <div class="ktitle" onclick="SU.openTicket('${k.id}')">${esc(k.title)}</div>
    <div class="kmeta">${prioChip(k.priority)} ${esc(k.cName || "")}<br>${k.assignedName ? "👤 " + esc(k.assignedName) : "<i>Unassigned</i>"}<br>${slaText(k)}</div>
    <div class="kact"><button onclick="SU.mv('tickets','${k.id}',-1)">◀</button><button onclick="SU.mv('tickets','${k.id}',1)">▶</button></div></div>`;
  function viewHelp() {
    if (V.sub === "ticket") return viewTicket();
    const over = S.tickets.filter((k) => k.dueAt && k.dueAt < now() && openTicket(k)).length;
    return `<div class="suite-bar"><button class="auth-btn" style="background:#28a745" onclick="SU.ticketForm()">➕ New Ticket</button>
      ${chip(S.tickets.filter(openTicket).length + " open")} ${over ? `<span class="badge-low">${over} past SLA</span>` : ""}</div>` + kanban("tickets", S.tickets, ticketCard);
  }
  function ticketForm(id) {
    const k = id ? S.tickets.find((x) => x.id === id) : null, staff = st().staff;
    openForm({
      title: k ? "Edit Ticket" : "New Ticket", values: k ? { ...k, assign: k.assignedTo || "" } : { priority: "Medium", assign: "AUTO" },
      fields: [{ k: "title", label: "Issue", req: true }, { k: "cName", label: "Customer name" }, { k: "phone", label: "Customer phone", type: "tel" },
        { k: "priority", label: "Priority (sets the SLA: High 4h, Medium 24h, Low 72h)", type: "select", opts: ["High", "Medium", "Low"] },
        { k: "assign", label: "Assign to", type: "select", opts: [["AUTO", "Auto (least busy employee)"], ["", "Nobody"], ...staff.map((s) => [s.uid, s.name])] },
        { k: "description", label: "Details", type: "textarea" }],
      onSave: async (v) => {
        const asg = v.assign === "AUTO" ? leastLoaded("tickets") : staff.find((s) => s.uid === v.assign) || null;
        const data = { title: v.title, cName: v.cName, phone: v.phone, priority: v.priority, description: v.description, updatedAt: serverTimestamp() };
        if (!k || v.assign !== (k.assignedTo || "")) { data.assignedTo = asg ? asg.uid : ""; data.assignedName = asg ? asg.name : ""; }
        if (k) await updateDoc(D("tickets", k.id), data);
        else {
          const start = now();
          const full = { ...data, status: "Open", dueAt: start + SLA_HOURS[v.priority] * 3600000, history: [{ at: start, by: st().name, note: "Ticket created" }], createdAt: serverTimestamp() };
          const ref = await addDoc(C("tickets"), full);
          fire("TICKET_CREATED", "", { ...full, id: ref.id });
        }
      }
    });
  }
  function viewTicket() {
    const k = S.tickets.find((x) => x.id === V.id);
    if (!k) return "<p>Ticket not found.</p>" + backTo("help");
    return `<h3 style="margin-top:0">${esc(k.title)} ${prioChip(k.priority)} ${chip(k.status)}</h3>
      <div class="task-meta">👤 Customer: ${esc(k.cName || "-")} · 📞 ${esc(k.phone || "-")}<br>Assigned: ${esc(k.assignedName || "Nobody")}<br>
        SLA deadline: ${dtstr(k.dueAt)} ${slaText(k)}<br>${esc(k.description || "")}</div>
      <div class="suite-bar" style="margin-top:10px"><select onchange="SU.setStage('tickets','${k.id}',this.value)">${TICKET_STATUS.map((s) => `<option ${s === k.status ? "selected" : ""}>${s}</option>`).join("")}</select>
        <button class="auth-btn" onclick="SU.ticketForm('${k.id}')">✏ Edit</button>
        <button class="auth-btn" onclick="SU.noteForm('${k.id}')">➕ Add note</button>
        ${k.phone ? `<button class="auth-btn" style="background:#25D366" onclick="SU.wa('tickets','${k.id}')">💬 WhatsApp</button>` : ""}
        <button class="bin" onclick="SU.delRec('tickets','${k.id}','help')">🗑</button></div>
      <h4>Conversation history</h4>${(k.history || []).slice().reverse().map((h) => `<div class="task-card"><div class="task-info"><b>${esc(h.by)}</b> <span class="hint">${dtstr(h.at)}</span><br>${esc(h.note)}</div></div>`).join("")}${backTo("help")}`;
  }
  function noteForm(id) {
    const k = S.tickets.find((x) => x.id === id);
    if (!k) return;
    openForm({ title: "Add note to ticket", fields: [{ k: "note", label: "Note", type: "textarea", req: true }],
      onSave: async (v) => { await updateDoc(D("tickets", id), { history: [...(k.history || []), { at: now(), by: st().name, note: v.note }], updatedAt: serverTimestamp() }); } });
  }

  /* =================== QUOTATIONS & INVOICES =================== */
  const stChip = (d) => {
    if (d.type === "QUOTATION") return chip(d.status || "Draft", d.status === "Accepted" ? "chip-green" : d.status === "Rejected" ? "chip-red" : "");
    const s = invStatus(d, now());
    return chip(s, s === "Paid" ? "chip-green" : s === "Overdue" ? "chip-red" : "chip-yellow");
  };

  function viewBill() {
    if (V.bill) return viewBillForm();
    const type = V.billTab, label = type === "INVOICE" ? "Invoice" : "Quotation";
    const list = S.docs.filter((d) => d.type === type).sort((a, b) => (b.date || 0) - (a.date || 0));
    const bal = S.docs.filter((d) => d.type === "INVOICE").reduce((s, d) => s + d.total - (d.paid || 0), 0);
    return `<div class="suite-bar">
      <button class="auth-btn ${type === "INVOICE" ? "on" : ""}" onclick="SU.billTab('INVOICE')">Invoices</button>
      <button class="auth-btn ${type === "QUOTATION" ? "on" : ""}" onclick="SU.billTab('QUOTATION')">Quotations</button>
      <button class="auth-btn" style="background:#28a745" onclick="SU.billStart('${type}')">➕ New ${label}</button>
      ${chip("Outstanding " + inr(bal))}</div>` + (list.length ? list.map(docRow).join("") : `<p class="hint">No ${label.toLowerCase()}s yet.</p>`);
  }

  function docRow(d) {
    const bal = d.total - (d.paid || 0), inv = d.type === "INVOICE";
    const hasStock = inv && !d.stockDeducted && (d.items || []).some((i) => i.itemId);
    return `<div class="task-card" style="flex-wrap:wrap"><div class="task-info">
      <div class="task-title">${esc(d.number)} · ${esc(d.cName)} ${stChip(d)}</div>
      <div class="task-meta">📅 ${dstr(d.date)}${inv ? " · Due " + dstr(d.dueAt) : ""}<br>Total <b>${inr(d.total)}</b>${inv ? ` · Paid ${inr(d.paid)} · Balance <b>${inr(bal)}</b>` : ""}${d.stockDeducted ? " · 📦 stock deducted" : ""}</div></div>
      <div class="decide-col" style="flex-wrap:wrap; gap:6px">
        <button class="edit-btn" onclick="SU.printDoc('${d.id}')">🖨 Print</button>
        ${inv && bal > 0.005 ? `<button class="edit-btn" onclick="SU.payForm('${d.id}')">💵 Payment</button><button class="edit-btn" onclick="SU.remind('${d.id}')">💬 Remind</button><button class="edit-btn" style="background:#8e44ad" onclick="SU.aiMsg('docs','${d.id}')">🤖 AI</button>` : ""}
        ${hasStock ? `<button class="edit-btn" onclick="SU.deduct('${d.id}')">📦 Deduct stock</button>` : ""}
        ${!inv ? `<button class="edit-btn" onclick="SU.toInvoice('${d.id}')">🔁 To invoice</button>
          <select onchange="SU.qstatus('${d.id}',this.value)">${["Draft", "Sent", "Accepted", "Rejected"].map((s) => `<option ${s === (d.status || "Draft") ? "selected" : ""}>${s}</option>`).join("")}</select>` : ""}
        <button class="edit-btn" onclick="SU.billEdit('${d.id}')">✏</button><button class="bin" onclick="SU.delRec('docs','${d.id}')">🗑</button></div></div>`;
  }

  function billStart(type, d) {
    V.billTab = type; V.tab = "bill";
    V.bill = { id: d ? d.id : null, type, cName: d?.cName || "", cPhone: d?.cPhone || "", cEmail: d?.cEmail || "", cAddress: d?.cAddress || "",
      date: d?.date || now(), dueAt: d?.dueAt || now() + 15 * 86400000, taxPct: d?.taxPct || 0, discount: d?.discount || 0, notes: d?.notes || "",
      leadId: d?.leadId || "", items: d?.items ? d.items.map((i) => ({ ...i })) : [{ desc: "", qty: 1, price: 0, itemId: "" }] };
    V.lock = true;
    $("suiteModal").classList.add("open");
    renderSuite(true);
  }
  function billFromLead(id, type) {
    const l = S.leads.find((x) => x.id === id);
    if (!l) return;
    billStart(type, { cName: l.name, cPhone: l.phone, cEmail: l.email, leadId: id, items: [{ desc: "", qty: 1, price: l.value || 0, itemId: "" }] });
  }
  function billEdit(id) { const d = S.docs.find((x) => x.id === id); if (d) billStart(d.type, d); }

  const itemsHTML = () => V.bill.items.map((it, i) => `<div class="bill-row">
    <select onchange="SU.bpick(${i},this.value)"><option value="">Custom item</option>${st().inventory.map((x) => `<option value="${esc(x.id)}" ${it.itemId === x.id ? "selected" : ""}>${esc(x.name)} (${x.qty ?? 0} in stock)</option>`).join("")}</select>
    <input placeholder="Description" value="${esc(it.desc)}" oninput="SU.bitem(${i},'desc',this.value)">
    <input type="number" min="0" placeholder="Qty" value="${it.qty}" style="width:70px" oninput="SU.bitem(${i},'qty',this.value)">
    <input type="number" min="0" placeholder="Price" value="${it.price}" style="width:90px" oninput="SU.bitem(${i},'price',this.value)">
    <button class="bin" onclick="SU.bdel(${i})">✖</button></div>`).join("");
  const totalsHTML = () => {
    const t = calcTotals(V.bill.items, V.bill.taxPct, V.bill.discount);
    return `Subtotal ${inr(t.subtotal)} · Discount ${inr(t.disc)} · Tax ${inr(t.tax)}<br><span class="sval">Total ${inr(t.total)}</span>`;
  };
  function viewBillForm() {
    const b = V.bill, inv = b.type === "INVOICE";
    return `<h3 style="margin-top:0">${b.id ? "Edit" : "New"} ${inv ? "Invoice" : "Quotation"}</h3>
      <div class="grid2"><input placeholder="Customer name *" value="${esc(b.cName)}" oninput="SU.bset('cName',this.value)">
        <input placeholder="Phone" value="${esc(b.cPhone)}" oninput="SU.bset('cPhone',this.value)">
        <input placeholder="Email" value="${esc(b.cEmail)}" oninput="SU.bset('cEmail',this.value)">
        <input placeholder="Address" value="${esc(b.cAddress)}" oninput="SU.bset('cAddress',this.value)"></div>
      <label class="task-label">Date (DD / MM / YYYY)</label>${dtPicker("billDate", b.date, true)}
      ${inv ? `<label class="task-label">Due date (DD / MM / YYYY)</label>${dtPicker("billDue", b.dueAt, true)}` : ""}
      <h4>Items</h4><div id="billItems">${itemsHTML()}</div>
      <button class="auth-btn" onclick="SU.baddItem()">➕ Add item</button>
      <div class="grid2" style="margin-top:10px"><input type="number" min="0" placeholder="Tax % (GST)" value="${b.taxPct}" oninput="SU.bset('taxPct',this.value)">
        <input type="number" min="0" placeholder="Discount (₹)" value="${b.discount}" oninput="SU.bset('discount',this.value)"></div>
      <textarea class="task-input" rows="2" placeholder="Notes / terms" oninput="SU.bset('notes',this.value)">${esc(b.notes)}</textarea>
      <div id="billTotals" class="totals">${totalsHTML()}</div>
      <button class="role-btn" style="background:#28a745" onclick="SU.bsave()">💾 Save</button>
      <button class="auth-btn" style="background:#666" onclick="SU.go('bill')">Cancel</button>`;
  }
  const refreshTotals = () => { const el = $("billTotals"); if (el) el.innerHTML = totalsHTML(); };
  const bset = (k, v) => { V.bill[k] = v; refreshTotals(); };
  const bitem = (i, k, v) => { V.bill.items[i][k] = v; refreshTotals(); };
  const baddItem = () => { V.bill.items.push({ desc: "", qty: 1, price: 0, itemId: "" }); $("billItems").innerHTML = itemsHTML(); refreshTotals(); };
  const bdel = (i) => { V.bill.items.splice(i, 1); if (!V.bill.items.length) V.bill.items.push({ desc: "", qty: 1, price: 0, itemId: "" }); $("billItems").innerHTML = itemsHTML(); refreshTotals(); };
  function bpick(i, id) {
    const x = st().inventory.find((z) => z.id === id), it = V.bill.items[i];
    it.itemId = id || "";
    if (x) { it.desc = x.name + (x.size && x.size !== "-" ? " " + x.size + (x.unit && x.unit !== "-" ? x.unit : "") : ""); it.price = x.price || 0; }
    $("billItems").innerHTML = itemsHTML(); refreshTotals();
  }

  async function nextNumber(type) {
    const key = type === "INVOICE" ? "invoice" : "quotation";
    return runTransaction(db, async (tx) => {
      const ref = D("counters", "main"), s = await tx.get(ref);
      const n = ((s.exists() && s.data()[key]) || 0) + 1;
      tx.set(ref, { [key]: n }, { merge: true });
      return (type === "INVOICE" ? "INV-" : "QUO-") + String(n).padStart(4, "0");
    });
  }

  async function bsave() {
    const b = V.bill, inv = b.type === "INVOICE";
    if (!b.cName.trim()) return toast("Enter the customer name");
    const items = b.items.filter((i) => String(i.desc).trim() && Number(i.qty) > 0)
      .map((i) => ({ desc: String(i.desc).trim(), qty: Number(i.qty), price: Number(i.price) || 0, itemId: i.itemId || "" }));
    if (!items.length) return toast("Add at least one item with a description and quantity");
    const date = readDT("billDate"), dueAt = inv ? readDT("billDue") : null;
    if (isNaN(date) || (inv && isNaN(dueAt))) return toast("Enter valid dates");
    const tot = calcTotals(items, b.taxPct, b.discount);
    const data = { type: b.type, cName: b.cName.trim(), cPhone: b.cPhone, cEmail: b.cEmail, cAddress: b.cAddress, date, dueAt, items,
      taxPct: Number(b.taxPct) || 0, discount: tot.disc, subtotal: tot.subtotal, tax: tot.tax, total: tot.total, notes: b.notes, leadId: b.leadId, updatedAt: serverTimestamp() };
    try {
      loading(true);
      if (b.id) { await updateDoc(D("docs", b.id), data); toast("Saved"); }
      else {
        const number = await nextNumber(b.type);
        await addDoc(C("docs"), { ...data, number, status: inv ? "" : "Draft", payments: [], paid: 0, createdAt: serverTimestamp() });
        toast(number + " created");
        if (inv) fire("INVOICE_CREATED", "", { ...data, number, name: data.cName });
      }
      V.bill = null; V.lock = false; renderSuite(true);
    } catch (e) { console.error(e); toast("Could not save: " + e.message); }
    finally { loading(false); }
  }

  function payForm(id) {
    const d = S.docs.find((x) => x.id === id);
    if (!d) return;
    const bal = d.total - (d.paid || 0);
    openForm({
      title: "Record payment - " + d.number, values: { amount: Math.round(bal * 100) / 100, method: "UPI", at: now() },
      fields: [{ k: "amount", label: "Amount (balance " + inr(bal) + ")", type: "number", req: true }, { k: "at", label: "Payment date", type: "date" },
        { k: "method", label: "Method", type: "select", opts: ["Cash", "UPI", "Bank transfer", "Card", "Cheque"] }, { k: "note", label: "Note" }],
      onSave: async (v) => {
        if (v.amount > bal + 0.005) throw new Error("The amount is more than the balance due");
        const payments = [...(d.payments || []), { amount: v.amount, at: v.at, method: v.method, note: v.note }];
        await updateDoc(D("docs", id), { payments, paid: payments.reduce((s, p) => s + p.amount, 0), updatedAt: serverTimestamp() });
        toast("Payment recorded");
      }
    });
  }

  async function toInvoice(id) {
    const q = S.docs.find((x) => x.id === id);
    if (!q || !(await askConfirm(`Create an invoice from ${q.number}?`))) return;
    try {
      loading(true);
      const number = await nextNumber("INVOICE");
      const { id: _i, number: _n, status: _s, ...rest } = q;
      await addDoc(C("docs"), { ...rest, type: "INVOICE", number, date: now(), dueAt: now() + 15 * 86400000, status: "", payments: [], paid: 0,
        quotationNumber: q.number, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      await updateDoc(D("docs", id), { status: "Accepted" });
      toast(number + " created from " + q.number);
      fire("INVOICE_CREATED", "", { ...q, number, name: q.cName });
      V.billTab = "INVOICE"; renderSuite(true);
    } catch (e) { console.error(e); toast(e.message); }
    finally { loading(false); }
  }

  async function deduct(id) {
    const d = S.docs.find((x) => x.id === id);
    if (!d) return;
    const need = {};
    (d.items || []).filter((i) => i.itemId).forEach((i) => { need[i.itemId] = (need[i.itemId] || 0) + i.qty; });
    if (!(await askConfirm(`Remove the quantities on ${d.number} from your inventory stock?`))) return;
    try {
      loading(true);
      const cid = st().companyID, ids = Object.keys(need);
      await runTransaction(db, async (tx) => {
        const refs = ids.map((i) => doc(db, "companies", cid, "inventory", i));
        const snaps = await Promise.all(refs.map((r) => tx.get(r)));
        snaps.forEach((s, k) => {
          if (!s.exists()) throw new Error("An item on this invoice no longer exists");
          if ((s.data().qty || 0) < need[ids[k]]) throw new Error("Not enough stock for " + s.data().name);
        });
        snaps.forEach((s, k) => {
          tx.update(refs[k], { qty: (s.data().qty || 0) - need[ids[k]] });
          tx.set(doc(C("history")), { action: "STOCK OUT (" + d.number + ")", qty: need[ids[k]], item: s.data().name, user: st().name, time: serverTimestamp() });
        });
        tx.update(D("docs", id), { stockDeducted: true });
      });
      toast("Stock updated");
    } catch (e) { console.error(e); toast(e.message); }
    finally { loading(false); }
  }

  const remind = (id) => waForm("docs", id, "Payment reminder");
  const qstatus = (id, v) => updateDoc(D("docs", id), { status: v }).catch((e) => toast(e.message));

  function printDoc(id) {
    const d = S.docs.find((x) => x.id === id);
    if (!d) return;
    const inv = d.type === "INVOICE", bal = d.total - (d.paid || 0);
    const rows = (d.items || []).map((i, k) => `<tr><td>${k + 1}</td><td>${esc(i.desc)}</td><td class="r">${i.qty}</td><td class="r">${inr(i.price)}</td><td class="r">${inr(i.qty * i.price)}</td></tr>`).join("");
    const pays = (d.payments || []).map((p) => `<tr><td>${dstr(p.at)}</td><td>${esc(p.method)}</td><td class="r">${inr(p.amount)}</td></tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.number)}</title><style>
      body{font-family:Segoe UI,Arial,sans-serif;margin:30px;color:#222} h1{margin:0;color:#1f4011} .top{display:flex;justify-content:space-between;border-bottom:3px solid #39ff14;padding-bottom:10px}
      table{width:100%;border-collapse:collapse;margin-top:18px} th{background:#1a1a1a;color:#39ff14;text-align:left;padding:8px} td{padding:8px;border-bottom:1px solid #ddd} .r{text-align:right}
      .tot{margin-left:auto;width:300px;margin-top:14px} .tot div{display:flex;justify-content:space-between;padding:4px 0} .big{font-size:1.2em;font-weight:bold;border-top:2px solid #222}
      .badge{display:inline-block;padding:3px 10px;border-radius:12px;background:#eee;font-weight:bold} @media print{button{display:none}}</style></head><body>
      <div class="top"><div><h1>${esc(st().companyName || "")}</h1><div>${inv ? "TAX INVOICE" : "QUOTATION"}</div></div>
      <div style="text-align:right"><b>${esc(d.number)}</b><br>Date: ${dstr(d.date)}${inv ? `<br>Due: ${dstr(d.dueAt)}<br><span class="badge">${invStatus(d, now())}</span>` : ""}</div></div>
      <p><b>Bill to:</b><br>${esc(d.cName)}<br>${esc(d.cPhone || "")} ${esc(d.cEmail || "")}<br>${esc(d.cAddress || "")}</p>
      <table><thead><tr><th>#</th><th>Description</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="tot"><div><span>Subtotal</span><span>${inr(d.subtotal)}</span></div><div><span>Discount</span><span>- ${inr(d.discount)}</span></div>
        <div><span>Tax (${d.taxPct || 0}%)</span><span>${inr(d.tax)}</span></div><div class="big"><span>Total</span><span>${inr(d.total)}</span></div>
        ${inv ? `<div><span>Paid</span><span>${inr(d.paid)}</span></div><div class="big"><span>Balance due</span><span>${inr(bal)}</span></div>` : ""}</div>
      ${pays ? `<h4>Payments received</h4><table><thead><tr><th>Date</th><th>Method</th><th class="r">Amount</th></tr></thead><tbody>${pays}</tbody></table>` : ""}
      ${d.notes ? `<p><b>Notes:</b> ${esc(d.notes)}</p>` : ""}<p style="margin-top:40px;color:#777">Thank you for your business.</p></body></html>`;
    const w = window.open("", "_blank");
    if (!w) return toast("Allow pop-ups to print");
    w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => w.print(), 400);
  }

  /* =================== PAYROLL & LEAVE =================== */
  const monthKey = (y, m) => y + "-" + pad(m);
  const salOf = (uid) => S.salaries.find((s) => s.id === uid);
  const lvChip = (s) => chip(s, s === "APPROVED" ? "chip-green" : s === "REJECTED" ? "chip-red" : "chip-yellow");
  function monthPicker() {
    const y0 = new Date().getFullYear();
    return `<select onchange="SU.pmSet('m',this.value)">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${V.pm.m === i + 1 ? "selected" : ""}>${pad(i + 1)}</option>`).join("")}</select> /
      <select onchange="SU.pmSet('y',this.value)">${[y0 - 1, y0, y0 + 1].map((y) => `<option ${V.pm.y === y ? "selected" : ""}>${y}</option>`).join("")}</select>`;
  }
  const pmSet = (k, v) => { V.pm[k] = +v; renderSuite(true); };
  const paySub = (k) => { V.paySub = k; renderSuite(true); };

  function viewPay() {
    const pend = S.leaves.filter((l) => l.status === "PENDING").length, key = monthKey(V.pm.y, V.pm.m);
    const nav = `<div class="suite-bar">${[["sal", "Salaries"], ["run", "Run Payroll"], ["slips", "Payslips"], ["leave", "Leaves"]]
      .map(([k, l]) => `<button class="auth-btn ${V.paySub === k ? "on" : ""}" onclick="SU.paySub('${k}')">${l}${k === "leave" && pend ? ` <span class="badge-low">${pend}</span>` : ""}</button>`).join("")}</div>`;
    if (V.paySub === "sal") {
      const staff = st().staff;
      return nav + (staff.length ? `<table class="stable"><thead><tr><th>Employee</th><th>Monthly salary</th><th></th></tr></thead><tbody>${staff.map((s) =>
        `<tr><td>${esc(s.name)}</td><td>${salOf(s.uid) ? inr(salOf(s.uid).monthly) : "<i>Not set</i>"}</td><td><button class="edit-btn" onclick="SU.salForm('${esc(s.uid)}')">✏ Set</button></td></tr>`).join("")}</tbody></table>` : "<p class='hint'>No employees yet.</p>");
    }
    if (V.paySub === "run") {
      const mi = monthInfo(V.pm.y, V.pm.m);
      return nav + `<p>Month: ${monthPicker()} &nbsp; <b>${mi.working}</b> working days (${mi.days} days minus Sundays)</p>
        <button class="role-btn" style="background:#28a745; width:auto; padding:10px 20px" onclick="SU.genPayroll()">⚙ Generate payslips</button>
        <p class="hint">Present days come from the attendance your employees mark. Approved paid and sick leave counts as paid, unpaid leave does not.
        Payslips already marked PAID are never changed. You can edit days, bonus and deduction on each payslip afterwards.</p>`;
    }
    if (V.paySub === "slips") {
      const list = S.payslips.filter((p) => p.month === key);
      return nav + `<p>Month: ${monthPicker()}</p>` + (list.length ? `<div class="table-wrap"><table class="stable"><thead><tr><th>Employee</th><th>Salary</th><th>Days</th><th>Bonus</th><th>Deduction</th><th>Net pay</th><th>Status</th><th></th></tr></thead><tbody>${list.map((p) =>
        `<tr><td>${esc(p.name)}</td><td>${inr(p.monthly)}</td><td>${p.payDays}/${p.working}</td><td>${inr(p.bonus)}</td><td>${inr(p.deduction)}</td><td><b>${inr(p.net)}</b></td><td>${chip(p.status, p.status === "PAID" ? "chip-green" : "chip-yellow")}</td>
        <td style="white-space:nowrap">${p.status !== "PAID" ? `<button class="edit-btn" onclick="SU.psEdit('${p.id}')">✏</button><button class="edit-btn" onclick="SU.markPaid('${p.id}')">✔ Paid</button>` : ""}
        <button class="edit-btn" onclick="SU.printSlip('${p.id}')">🖨</button><button class="bin" onclick="SU.delRec('payslips','${p.id}')">🗑</button></td></tr>`).join("")}</tbody></table></div>` : "<p class='hint'>No payslips for this month. Use Run Payroll.</p>");
    }
    const sorted = [...S.leaves].sort((a, b) => (a.status === "PENDING" ? 0 : 1) - (b.status === "PENDING" ? 0 : 1) || (b.from || 0) - (a.from || 0));
    return nav + (sorted.length ? sorted.map((l) => `<div class="task-card"><div class="task-info"><div class="task-title">${esc(l.name)} ${lvChip(l.status)}</div>
      <div class="task-meta">${esc(l.type)} · ${dstr(l.from)} to ${dstr(l.to)} (${l.days} day${l.days > 1 ? "s" : ""})<br>${esc(l.reason || "")}</div></div>
      <div class="decide-col">${l.status === "PENDING" ? `<button class="edit-btn" style="background:#28a745" onclick="SU.leaveSet('${l.id}','APPROVED')">✔ Approve</button><button class="edit-btn" style="background:#dc3545" onclick="SU.leaveSet('${l.id}','REJECTED')">✖ Reject</button>` : ""}
      <button class="bin" onclick="SU.delRec('leaves','${l.id}')">🗑</button></div></div>`).join("") : "<p class='hint'>No leave requests.</p>");
  }

  function salForm(uid) {
    const s = st().staff.find((x) => x.uid === uid);
    if (!s) return;
    openForm({ title: "Monthly salary - " + s.name, values: { monthly: salOf(uid)?.monthly || "" }, fields: [{ k: "monthly", label: "Monthly salary (₹)", type: "number", req: true }],
      onSave: async (v) => { await setDoc(D("salaries", uid), { uid, name: s.name, monthly: v.monthly, updatedAt: serverTimestamp() }); toast("Salary saved"); } });
  }

  async function genPayroll() {
    const { y, m } = V.pm, { working } = monthInfo(y, m);
    const staff = st().staff.filter((s) => (salOf(s.uid)?.monthly || 0) > 0);
    if (!staff.length) return toast("Set at least one employee salary first");
    if (!(await askConfirm(`Generate payslips for ${pad(m)}/${y}? Unpaid payslips of this month will be recalculated.`))) return;
    try {
      loading(true);
      const att = await getDocs(query(C("attendance"), where("time", ">=", new Date(y, m - 1, 1)), where("time", "<", new Date(y, m, 1))));
      const present = {};
      att.docs.forEach((d) => { const a = d.data(), t = a.time && a.time.toDate ? a.time.toDate() : null; if (t) (present[a.uid] = present[a.uid] || new Set()).add(t.getDate()); });
      let n = 0;
      for (const s of staff) {
        const id = `${s.uid}_${monthKey(y, m)}`, old = S.payslips.find((p) => p.id === id);
        if (old && old.status === "PAID") continue;
        const monthly = salOf(s.uid).monthly, pset = present[s.uid] || new Set();
        const paidLeave = S.leaves.filter((l) => l.uid === s.uid && l.status === "APPROVED" && l.type !== "Unpaid Leave").reduce((sum, l) => sum + leaveDaysInMonth(l, y, m, pset), 0);
        const payDays = Math.min(working, pset.size + paidLeave), bonus = old ? old.bonus || 0 : 0, deduction = old ? old.deduction || 0 : 0;
        await setDoc(D("payslips", id), { uid: s.uid, name: s.name, month: monthKey(y, m), monthly, working, present: pset.size, paidLeave, payDays, bonus, deduction,
          net: payNet(monthly, working, payDays, bonus, deduction), status: "DRAFT", updatedAt: serverTimestamp() });
        n++;
      }
      toast(n + " payslip(s) generated");
      V.paySub = "slips"; renderSuite(true);
    } catch (e) { console.error(e); toast("Payroll failed: " + e.message); }
    finally { loading(false); }
  }

  function psEdit(id) {
    const p = S.payslips.find((x) => x.id === id);
    if (!p) return;
    openForm({ title: `Edit payslip - ${p.name}`, values: p,
      fields: [{ k: "payDays", label: `Paid days (present ${p.present} + paid leave ${p.paidLeave}; out of ${p.working} working days)`, type: "number" },
        { k: "bonus", label: "Bonus (₹)", type: "number" }, { k: "deduction", label: "Deduction (₹)", type: "number" }],
      onSave: async (v) => { await updateDoc(D("payslips", id), { payDays: v.payDays, bonus: v.bonus, deduction: v.deduction, net: payNet(p.monthly, p.working, v.payDays, v.bonus, v.deduction), updatedAt: serverTimestamp() }); } });
  }
  const markPaid = async (id) => {
    if (!(await askConfirm("Mark this payslip as paid? It cannot be changed afterwards."))) return;
    updateDoc(D("payslips", id), { status: "PAID", paidAt: now() }).then(() => toast("Marked as paid")).catch((e) => toast(e.message));
  };
  const leaveSet = (id, status) => updateDoc(D("leaves", id), { status, decidedAt: now() }).then(() => toast("Leave " + status.toLowerCase())).catch((e) => toast(e.message));

  function leaveForm() {
    openForm({ title: "Apply for leave", values: { type: "Paid Leave", from: now(), to: now() },
      fields: [{ k: "type", label: "Leave type", type: "select", opts: ["Paid Leave", "Sick Leave", "Unpaid Leave"] },
        { k: "from", label: "From (DD / MM / YYYY)", type: "date" }, { k: "to", label: "To (DD / MM / YYYY)", type: "date" }, { k: "reason", label: "Reason", type: "textarea", req: true }],
      onSave: async (v) => {
        if (v.to < v.from) throw new Error("The end date is before the start date");
        await addDoc(C("leaves"), { uid: st().user.uid, name: st().name, ...v, days: Math.round((v.to - v.from) / 86400000) + 1, status: "PENDING", createdAt: serverTimestamp() });
        toast("Leave request sent to the owner");
      } });
  }

  function printSlip(id) {
    const p = S.payslips.find((x) => x.id === id);
    if (!p) return;
    const [y, m] = p.month.split("-");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Payslip ${esc(p.name)} ${p.month}</title><style>
      body{font-family:Segoe UI,Arial,sans-serif;margin:30px;color:#222;max-width:650px} h1{margin:0;color:#1f4011;border-bottom:3px solid #39ff14;padding-bottom:8px}
      table{width:100%;border-collapse:collapse;margin-top:16px} td{padding:9px;border-bottom:1px solid #ddd} .r{text-align:right} .net{font-size:1.3em;font-weight:bold;background:#f2fff0}</style></head><body>
      <h1>${esc(st().companyName || "")}</h1><h3>PAYSLIP - ${m}/${y}</h3><p><b>Employee:</b> ${esc(p.name)}</p>
      <table><tr><td>Monthly salary</td><td class="r">${inr(p.monthly)}</td></tr><tr><td>Working days</td><td class="r">${p.working}</td></tr>
      <tr><td>Days present</td><td class="r">${p.present}</td></tr><tr><td>Paid leave days</td><td class="r">${p.paidLeave}</td></tr><tr><td>Paid days</td><td class="r">${p.payDays}</td></tr>
      <tr><td>Bonus</td><td class="r">+ ${inr(p.bonus)}</td></tr><tr><td>Deduction</td><td class="r">- ${inr(p.deduction)}</td></tr>
      <tr class="net"><td>NET PAY</td><td class="r">${inr(p.net)}</td></tr></table>
      <p style="color:#777;margin-top:30px">Status: ${esc(p.status)}${p.paidAt ? " on " + dstr(p.paidAt) : ""}. This is a computer generated payslip.</p></body></html>`;
    const w = window.open("", "_blank");
    if (!w) return toast("Allow pop-ups to print");
    w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => w.print(), 400);
  }

  /* =================== WORKFLOW AUTOMATION =================== */
  const TRIGGERS = [["LEAD_CREATED", "A new lead is added"], ["LEAD_STAGE", "A lead moves to a stage"], ["TICKET_CREATED", "A support ticket is created"],
    ["TICKET_STATUS", "A ticket status changes"], ["TICKET_SLA", "A ticket misses its SLA deadline"], ["INVOICE_CREATED", "An invoice is created"],
    ["INVOICE_OVERDUE", "An invoice becomes overdue"], ["CAND_STAGE", "A candidate moves to a stage"]];
  const trigLabel = (k) => (TRIGGERS.find((t) => t[0] === k) || [k, k])[1];

  function viewAuto() {
    return `<div class="suite-bar"><button class="auth-btn" style="background:#28a745" onclick="SU.ruleForm()">➕ New automation</button>
      <button class="auth-btn" onclick="SU.presets()">✨ Add recommended automations</button></div>
      <p class="hint">An automation runs <b>when you or your team use the app</b> and the trigger happens (for example a lead is added). It does not run while nobody has the app open.</p>` +
      (S.rules.length ? S.rules.map((r) => `<div class="task-card" style="${r.enabled === false ? "opacity:.55" : ""}"><div class="task-info">
        <div class="task-title">⚙ ${esc(r.name)} ${chip(r.enabled === false ? "OFF" : "ON", r.enabled === false ? "" : "chip-green")}</div>
        <div class="task-meta"><b>When:</b> ${esc(trigLabel(r.trigger))}${r.value ? " → " + esc(r.value) : ""}<br>
        <b>Then:</b> ${r.action === "TASK" ? `create a task (${r.hours || 24}h deadline) for ${r.assignee === "ALL" ? "all employees" : r.assignee === "ASSIGNED" ? "the assigned employee" : esc((st().staff.find((s) => s.uid === r.assignee) || {}).name || "an employee")}` : "show an alert"}<br>
        <i>"${esc(r.text)}"</i></div></div><div class="decide-col"><button class="edit-btn" onclick="SU.ruleToggle('${r.id}')">${r.enabled === false ? "Turn on" : "Turn off"}</button>
        <button class="edit-btn" onclick="SU.ruleForm('${r.id}')">✏</button><button class="bin" onclick="SU.delRec('rules','${r.id}')">🗑</button></div></div>`).join("") : "<p class='hint'>No automations yet.</p>");
  }
  function ruleForm(id) {
    const r = id ? S.rules.find((x) => x.id === id) : null, staff = st().staff;
    openForm({ title: r ? "Edit automation" : "New automation", values: r || { trigger: "LEAD_CREATED", action: "TASK", assignee: "ASSIGNED", hours: 24 },
      fields: [{ k: "name", label: "Name", req: true }, { k: "trigger", label: "When this happens", type: "select", opts: TRIGGERS },
        { k: "value", label: "Only for this stage / status (optional, e.g. Won)" },
        { k: "action", label: "Do this", type: "select", opts: [["TASK", "Create a task for employee(s)"], ["ALERT", "Show me an alert"]] },
        { k: "assignee", label: "Task goes to", type: "select", opts: [["ASSIGNED", "The employee assigned to it"], ["ALL", "All employees"], ...staff.map((s) => [s.uid, s.name])] },
        { k: "hours", label: "Task deadline (hours)", type: "number" },
        { k: "text", label: "Task / alert text (you can use {name} {phone} {title} {number} {stage})", type: "textarea", req: true }],
      onSave: async (v) => { const d = { ...v, enabled: r ? r.enabled !== false : true, updatedAt: serverTimestamp() }; if (r) await updateDoc(D("rules", id), d); else await addDoc(C("rules"), d); } });
  }
  const ruleToggle = (id) => { const r = S.rules.find((x) => x.id === id); if (r) updateDoc(D("rules", id), { enabled: r.enabled === false }).catch((e) => toast(e.message)); };
  async function presets() {
    const base = { enabled: true, value: "", assignee: "ASSIGNED", hours: 24, createdAt: serverTimestamp() };
    const list = [
      { name: "Call new leads quickly", trigger: "LEAD_CREATED", action: "TASK", hours: 1, text: "Call new lead {name} ({phone}) within 1 hour" },
      { name: "Won deal: send the invoice", trigger: "LEAD_STAGE", value: "Won", action: "ALERT", text: "{name} is won. Create the invoice in Billing." },
      { name: "Ticket assigned: resolve it", trigger: "TICKET_CREATED", action: "TASK", hours: 24, text: "Resolve support ticket: {title}" },
      { name: "Overdue invoice alert", trigger: "INVOICE_OVERDUE", action: "ALERT", text: "Invoice {number} for {name} is overdue. Send a reminder." }
    ];
    try { for (const r of list) await addDoc(C("rules"), { ...base, ...r }); toast("Automations added"); } catch (e) { toast(e.message); }
  }

  /* =================== WHATSAPP TEMPLATES & CALL LOG =================== */
  function viewMsg() {
    const calls = [...S.calls].sort((a, b) => b.at - a.at).slice(0, 50);
    return `<div class="suite-bar">
      <button class="btn-sm" style="background:rgba(142,68,173,.7)" onclick="SU.openAiChatbot('msg')">🤖 AI Message Writer</button>
      <button class="auth-btn btn-sm" onclick="SU.tplForm()">➕ Template</button>
      <button class="btn-wa btn-sm" onclick="SU.quickWa()">💬 Quick WhatsApp</button></div>
      <p class="hint">The AI writer creates personalised messages — copy them straight into WhatsApp. Auto-sending needs the WhatsApp Business API (a paid external service).</p>
      <h4>Templates (use {name} {company} {number} {amount} {due} {role})</h4>
      ${S.templates.length ? S.templates.map((t) => `<div class="task-card"><div class="task-info"><b>${esc(t.name)}</b><div class="task-meta">${esc(t.text)}</div></div>
        <div class="decide-col"><button class="edit-btn" onclick="SU.tplForm('${t.id}')">✏</button><button class="bin" onclick="SU.delRec('templates','${t.id}')">🗑</button></div></div>`).join("")
        : `<p class="hint">Showing the built-in templates. Add your own to replace them.</p>` + DEFAULT_TPL.map((t) => `<div class="task-card"><div class="task-info"><b>${esc(t.name)}</b><div class="task-meta">${esc(t.text)}</div></div></div>`).join("")}
      <h4>Call log (latest 50)</h4>${calls.length ? calls.map((c) => `<div class="task-card"><div class="task-info"><b>${esc(c.name)}</b> ${esc(c.phone || "")} · ${esc(c.direction)} · ${esc(c.outcome)}
        <div class="task-meta">${dtstr(c.at)} · ${esc(c.byName || "")}<br>${esc(c.notes || "")}</div></div></div>`).join("") : "<p class='hint'>No calls logged. Log calls from a lead.</p>"}`;
  }
  function tplForm(id) {
    const t = id ? S.templates.find((x) => x.id === id) : null;
    openForm({ title: t ? "Edit template" : "New template", values: t || {}, fields: [{ k: "name", label: "Template name", req: true }, { k: "text", label: "Message", type: "textarea", rows: 5, req: true }],
      onSave: async (v) => { if (t) await updateDoc(D("templates", id), v); else await addDoc(C("templates"), { ...v, createdAt: serverTimestamp() }); } });
  }
  function quickWa() {
    const list = tplList();
    V.waVars = { company: st().companyName || "", name: "" };
    openForm({ title: "Quick WhatsApp message", saveLabel: "Open WhatsApp", values: { tpl: 0, msg: fillTpl(list[0].text, V.waVars) },
      fields: [{ k: "phone", label: "Phone number", type: "tel", req: true }, { k: "tpl", label: "Template", type: "select", opts: list.map((t, i) => [i, t.name]), onchange: "SU.tplPick()" },
        { k: "msg", label: "Message", type: "textarea", rows: 5 }],
      onSave: (v) => { window.open(waLink(v.phone, v.msg), "_blank"); } });
  }


  /* =================== WHATSAPP MESSAGE WRITER (chatbot) =================== */
  // Works instantly with the built-in writer. If an Anthropic key is saved in this browser, Claude AI is tried first.
  const chat = { ctx: {}, last: null, history: [], out: [] };
  const AI_KEY = "pi_ai_key", AI_MODEL = "pi_ai_model";
  const store = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };
  const aiKey = () => { try { return localStorage.getItem(AI_KEY) || ""; } catch (e) { return ""; } };
  const aiModel = () => { try { return localStorage.getItem(AI_MODEL) || "claude-haiku-5-5"; } catch (e) { return "claude-haiku-5-5"; } };
  const HELP = "I can write WhatsApp messages for: follow-up, payment reminder, first contact, thank-you, re-engagement, festive greetings, appointment, feedback, offers, delivery updates, apology and quotation.\n\nTry: “payment reminder for Ravi, 5000 rupees, in Hinglish”.\nAfter a message appears you can say “shorter”, “formal”, “Hinglish” or “another”.";

  function chatLine(cls, html) {
    const el = $("chatMsgs");
    if (!el) return null;
    const d = document.createElement("div");
    d.className = "msg " + cls;
    d.innerHTML = html;
    el.appendChild(d);
    el.scrollTop = el.scrollHeight;
    return d;
  }
  const chatUser = (t) => chatLine("user", esc(t).replace(/\n/g, "<br>"));
  const chatNote = (t, typing) => chatLine("bot" + (typing ? " typing" : ""), esc(t).replace(/\n/g, "<br>"));
  function chatBot(text) {
    const i = chat.out.push(text) - 1;
    chatLine("bot", `<div class="wa-text">${esc(text)}</div><div class="msg-actions">
      <button class="btn-wa" onclick="SU.chatCopy(${i})">📋 Copy</button>
      <button class="btn-wa" onclick="SU.chatWa(${i})">💬 Send on WhatsApp</button>
      <button style="background:#6c757d" onclick="SU.chatQuick('make it shorter')">✂ Shorter</button>
      <button style="background:#6c757d" onclick="SU.chatQuick('make it formal')">🎩 Formal</button>
      <button style="background:#6c757d" onclick="SU.chatQuick('in Hinglish')">🇮🇳 Hinglish</button>
      <button style="background:#6c757d" onclick="SU.chatQuick('another version')">🔄 Another</button></div>`);
  }

  async function callAI(text) {
    const c = chat.ctx;
    const system = `You write WhatsApp messages for a small Indian business called "${c.company || "our company"}". Sender: ${c.me || "the team"}. ` +
      `Customer: ${c.name || "unknown"} (phone ${c.phone || "n/a"}), deal value ${c.value || "n/a"}, stage ${c.stage || "n/a"}, notes ${c.notes || "none"}. ` +
      `Write natural, warm, concise messages (under 120 words) in the language and tone the user asks for (default: friendly Indian English). Use at most two emojis. ` +
      `Reply with ONLY the message text. No quotation marks, no explanation.`;
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": aiKey(), "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify({ model: aiModel(), max_tokens: 600, system, messages: [...chat.history.slice(-10), { role: "user", content: text }] })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err.error && err.error.message) || "error " + res.status);
    }
    const data = await res.json();
    const out = (data.content || []).map((b) => b.text || "").join("").trim();
    if (!out) throw new Error("empty answer");
    return out;
  }

  async function chatSend(textArg) {
    const inp = $("chatInput");
    const text = String(textArg !== undefined ? textArg : inp ? inp.value : "").trim();
    if (!text) return;
    if (inp) inp.value = "";
    chatUser(text);
    const typing = chatNote("Writing your message…", true);
    let aiText = "", note = "";
    if (aiKey()) {
      try { aiText = await callAI(text); }
      catch (e) { note = "Claude AI could not be reached (" + e.message + "), so I used the built-in writer."; }
    } else await new Promise((r) => setTimeout(r, 300));
    if (typing) typing.remove();
    if (aiText) {
      chat.history.push({ role: "user", content: text }, { role: "assistant", content: aiText });
      chatBot(aiText);
      return;
    }
    if (note) chatNote(note);
    const r = chReply(chat, text);
    if (r.kind === "msg") chatBot(r.text); else chatNote(HELP);
    const nm = $("chatName");
    if (nm && chat.ctx.name && nm.value !== chat.ctx.name) nm.value = chat.ctx.name;
  }

  function chatCopy(i) {
    const t = chat.out[i] || "";
    const done = () => toast("Message copied");
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done).catch(() => fallbackCopy(t, done));
    else fallbackCopy(t, done);
  }
  function fallbackCopy(t, done) {
    const ta = document.createElement("textarea");
    ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); done(); } catch (e) { toast("Press and hold the message to copy it"); }
    ta.remove();
  }
  const chatWa = (i) => window.open(waLink(chat.ctx.phone, chat.out[i] || ""), "_blank");

  function chatMode() {
    const m = $("chatMode");
    if (m) m.innerText = aiKey() ? "Mode: Claude AI (" + aiModel() + ")" : "Mode: built-in writer";
  }
  function openAiChatbot(kind, id) {
    const r = id && S[kind] ? S[kind].find((x) => x.id === id) : null;
    chat.last = null; chat.history = []; chat.out = [];
    chat.ctx = { company: st().companyName || "", me: st().name || "" };
    if (r) {
      Object.assign(chat.ctx, { name: r.name || r.cName || "", phone: r.phone || r.cPhone || "", value: r.value ? inr(r.value) : "", stage: r.stage || r.status || "", notes: r.notes || "" });
      if (r.total !== undefined) Object.assign(chat.ctx, { amount: inr(r.total - (r.paid || 0)), number: r.number || "", due: r.dueAt ? dstr(r.dueAt) : "" });
    }
    $("aiChatModal").classList.add("open");
    $("chatMsgs").innerHTML = "";
    $("chatName").value = chat.ctx.name || "";
    $("chatPhone").value = chat.ctx.phone || "";
    $("chatSettings").classList.add("hidden");
    chatMode();
    chatNote(r ? `Hi! I'll write messages for ${chat.ctx.name || "this contact"}. Pick a quick button below or tell me what you need.` : "Hi! I write WhatsApp messages for your business. Pick a quick button below or tell me what you need.");
    if (r && r.total !== undefined) chatSend("Write a payment reminder");
    else setTimeout(() => $("chatInput") && $("chatInput").focus(), 100);
  }
  const aiMsg = (kind, id) => openAiChatbot(kind, id);


  /* =================== CONTENT PLANNER =================== */
  const PLATFORMS = ["Facebook", "Instagram", "LinkedIn", "X (Twitter)", "YouTube", "WhatsApp Status", "Other"];
  const platUrl = (p, text) => ({ "X (Twitter)": "https://twitter.com/intent/tweet?text=" + encodeURIComponent(text), LinkedIn: "https://www.linkedin.com/feed/",
    Facebook: "https://www.facebook.com/", Instagram: "https://www.instagram.com/", YouTube: "https://studio.youtube.com/", "WhatsApp Status": "https://web.whatsapp.com/" }[p] || "https://www.google.com/");
  function viewSocial() {
    const posts = [...S.posts].sort((a, b) => (a.scheduledAt || 0) - (b.scheduledAt || 0)), t = now();
    const by = {};
    S.posts.forEach((p) => { const k = p.platform + (p.status === "Posted" ? "|done" : "|plan"); by[k] = (by[k] || 0) + 1; });
    return `<div class="suite-bar"><button class="auth-btn" style="background:#28a745" onclick="SU.postForm()">➕ Plan a post</button>
      ${chip(S.posts.filter((p) => p.status !== "Posted").length + " planned")} ${chip(S.posts.filter((p) => p.status === "Posted").length + " posted", "chip-green")}
      ${PLATFORMS.filter((p) => by[p + "|plan"] || by[p + "|done"]).map((p) => chip(`${p}: ${by[p + "|done"] || 0}/${(by[p + "|done"] || 0) + (by[p + "|plan"] || 0)}`)).join(" ")}</div>
      <p class="hint">You get a reminder when a post is due. Posting itself is done by you (the platforms need their own paid API for automatic posting).</p>` +
      (posts.length ? posts.map((p) => { const due = p.status !== "Posted" && p.scheduledAt && p.scheduledAt <= t;
        return `<div class="task-card" style="${p.status === "Posted" ? "opacity:.6" : ""}"><div class="task-info"><div class="task-title">${esc(p.platform)} ${chip(p.status || "Planned", p.status === "Posted" ? "chip-green" : due ? "chip-red" : "")}</div>
        <div class="task-meta">🗓 ${dtstr(p.scheduledAt)}${due ? " <span class='over'>(due now)</span>" : ""}<br>${esc(p.text)}</div></div><div class="decide-col" style="flex-wrap:wrap">
        <button class="edit-btn" onclick="SU.copyPost('${p.id}')">📋 Copy</button><a class="edit-btn lnk" target="_blank" rel="noopener" href="${esc(platUrl(p.platform, p.text))}">🌐 Open</a>
        ${p.status !== "Posted" ? `<button class="edit-btn" onclick="SU.markPosted('${p.id}')">✔ Posted</button>` : ""}
        <button class="edit-btn" onclick="SU.postForm('${p.id}')">✏</button><button class="bin" onclick="SU.delRec('posts','${p.id}')">🗑</button></div></div>`; }).join("") : "<p class='hint'>No posts planned.</p>");
  }
  function postForm(id) {
    const p = id ? S.posts.find((x) => x.id === id) : null;
    openForm({ title: p ? "Edit post" : "Plan a post", values: p || { platform: "Instagram", scheduledAt: now() + 86400000 },
      fields: [{ k: "platform", label: "Platform", type: "select", opts: PLATFORMS }, { k: "scheduledAt", label: "Post on", type: "datetime" }, { k: "text", label: "Caption / content", type: "textarea", rows: 5, req: true }],
      onSave: async (v) => { if (p) await updateDoc(D("posts", id), v); else await addDoc(C("posts"), { ...v, status: "Planned", createdAt: serverTimestamp() }); } });
  }
  const copyPost = (id) => { const p = S.posts.find((x) => x.id === id); if (p) navigator.clipboard.writeText(p.text).then(() => toast("Copied")).catch(() => toast("Copy failed")); };
  const markPosted = (id) => updateDoc(D("posts", id), { status: "Posted", postedAt: now() }).catch((e) => toast(e.message));

  /* =================== EMPLOYEE: MY WORK =================== */
  function openMy() { if (isAdmin()) return; $("myWorkModal").classList.add("open"); renderMy(); }
  const closeMy = () => $("myWorkModal").classList.remove("open");
  const myTab = (k) => { V.my = k; renderMy(); };
  function renderMy() {
    const el = $("myWorkBody");
    if (!el || !$("myWorkModal").classList.contains("open")) return;
    $("myWorkTabs").innerHTML = [["leads", "📇 My Leads"], ["tickets", "🎫 My Tickets"], ["leave", "🏖 Leave"], ["slips", "💵 Payslips"]]
      .map(([k, l]) => `<button class="stab ${V.my === k ? "on" : ""}" onclick="SU.myTab('${k}')">${l}</button>`).join("");
    el.innerHTML = { leads: myLeads, tickets: myTickets, leave: myLeave, slips: mySlips }[V.my]();
  }
  const noteLead = (id) => {
    const l = S.leads.find((x) => x.id === id);
    if (l) openForm({ title: "Notes - " + l.name, values: { notes: l.notes || "" }, fields: [{ k: "notes", label: "Notes", type: "textarea", rows: 4 }],
      onSave: async (v) => { await updateDoc(D("leads", id), { notes: v.notes, updatedAt: serverTimestamp() }); } });
  };
  const myLeads = () => S.leads.length ? S.leads.map((l) => `<div class="task-card" style="flex-wrap:wrap"><div class="task-info"><div class="task-title">${esc(l.name)} ${chip(l.stage || "New")}</div>
    <div class="task-meta">📞 ${esc(l.phone || "-")} · 💰 ${inr(l.value)}${l.followUp ? `<br><span class="${leadDue(l) ? "over" : ""}">⏰ Follow-up ${dtstr(l.followUp)}</span>` : ""}<br>📝 ${esc(l.notes || "-")}</div></div>
    <div class="decide-col" style="flex-wrap:wrap; gap:6px"><select onchange="SU.setStage('leads','${l.id}',this.value)">${LEAD_STAGES.map((s) => `<option ${s === (l.stage || "New") ? "selected" : ""}>${s}</option>`).join("")}</select>
    <button class="edit-btn" onclick="SU.wa('leads','${l.id}')">💬</button><a class="edit-btn lnk" href="tel:${esc(l.phone || "")}">📞</a>
    <button class="edit-btn" onclick="SU.callForm('leads','${l.id}')">📝 Log call</button><button class="edit-btn" onclick="SU.myNote('${l.id}')">✏ Notes</button></div></div>`).join("") : "<p class='hint'>No leads are assigned to you.</p>";
  const myTickets = () => S.tickets.length ? S.tickets.map((k) => `<div class="task-card" style="flex-wrap:wrap"><div class="task-info"><div class="task-title">${esc(k.title)} ${prioChip(k.priority)}</div>
    <div class="task-meta">👤 ${esc(k.cName || "-")} · 📞 ${esc(k.phone || "-")}<br>${slaText(k)}<br>${esc(k.description || "")}</div></div>
    <div class="decide-col" style="flex-wrap:wrap"><select onchange="SU.setStage('tickets','${k.id}',this.value)">${TICKET_STATUS.map((s) => `<option ${s === k.status ? "selected" : ""}>${s}</option>`).join("")}</select>
    <button class="edit-btn" onclick="SU.noteForm('${k.id}')">➕ Note</button></div></div>`).join("") : "<p class='hint'>No tickets are assigned to you.</p>";
  const myLeave = () => `<button class="auth-btn" style="background:#28a745" onclick="SU.leaveForm()">➕ Apply for leave</button>` +
    (S.leaves.length ? [...S.leaves].sort((a, b) => b.from - a.from).map((l) => `<div class="task-card"><div class="task-info"><div class="task-title">${esc(l.type)} ${lvChip(l.status)}</div>
      <div class="task-meta">${dstr(l.from)} to ${dstr(l.to)} (${l.days} day${l.days > 1 ? "s" : ""})<br>${esc(l.reason || "")}</div></div></div>`).join("") : "<p class='hint'>No leave requests yet.</p>");
  const mySlips = () => { const list = S.payslips.filter((p) => p.status !== "DRAFT").sort((a, b) => b.month.localeCompare(a.month));
    return list.length ? list.map((p) => `<div class="task-card"><div class="task-info"><div class="task-title">${p.month.split("-").reverse().join("/")} ${chip(p.status, "chip-green")}</div>
      <div class="task-meta">Paid days ${p.payDays}/${p.working} · Net pay <b>${inr(p.net)}</b></div></div><button class="edit-btn" onclick="SU.printSlip('${p.id}')">🖨 Print</button></div>`).join("") : "<p class='hint'>No payslips yet.</p>"; };

  /* ---------------- public handlers (used by the buttons) ---------------- */
  window.SU = {
    open, close, go, openMy, closeMy, myTab, formSave: submitForm, formClose: closeForm,
    back: () => { if (!$("suiteModal").classList.contains("open")) return false; if (V.bill || V.sub) { go(V.tab); return true; } return false; },
    drag: (kind, id) => { V.drag = { kind, id }; },
    aiMsg, openAiChatbot,
    closeAiChat: () => { $("aiChatModal").classList.remove("open"); },
    chatSend, chatQuick: (q) => chatSend(q), chatCopy, chatWa,
    chatCtx: (k, v) => { chat.ctx[k] = v; },
    chatSettings: () => { chatMode(); $("chatKey").value = ""; $("chatModel").value = localStorage.getItem(AI_MODEL) || ""; $("chatSettings").classList.toggle("hidden"); },
    chatSaveKey: () => { const k = $("chatKey").value.trim(), mdl = $("chatModel").value.trim(); if (k) store(AI_KEY, k); store(AI_MODEL, mdl || null); chatMode(); toast(k ? "Saved. Claude AI mode is on" : "Model saved"); },
    chatClearKey: () => { store(AI_KEY, null); chatMode(); toast("Key removed. Using the built-in writer"); },
    drop: (kind, stage) => { if (V.drag && V.drag.kind === kind) move(kind, V.drag.id, stage); V.drag = null; },
    mv, delRec, setStage: (k, id, v) => move(k, id, v),
    openLead: (id) => { V.sub = "lead"; V.id = id; renderSuite(true); },
    openTicket: (id) => { V.sub = "ticket"; V.id = id; renderSuite(true); },
    leadForm, candForm, ticketForm, noteForm, callForm, wa: waForm, tplPick, tplForm, quickWa, myNote: noteLead,
    billTab: (t) => { V.billTab = t; renderSuite(true); }, billStart, billFromLead, billEdit, bset, bitem, baddItem, bdel, bpick, bsave,
    payForm, toInvoice, deduct, remind, qstatus, printDoc, pmSet, paySub, salForm, genPayroll, psEdit, markPaid, printSlip, leaveForm, leaveSet,
    ruleForm, ruleToggle, presets, postForm, copyPost, markPosted
  };
  return { start };
}
