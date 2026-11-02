// ==========================================
// PRO INVENTORY - APP.JS (Firebase Auth + Firestore)
// All company / inventory / staff data lives in Firestore,
// so it can be opened from ANY Google account or device.
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, getDoc, updateDoc, deleteDoc,
  getDocs, query, where, orderBy, serverTimestamp, onSnapshot, runTransaction, writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDOftyWbEg1H4bkrPpHd_fE5ymQNpSK6LU",
  authDomain: "inventory-app-ad3c6.firebaseapp.com",
  projectId: "inventory-app-ad3c6",
  storageBucket: "inventory-app-ad3c6.firebasestorage.app",
  messagingSenderId: "150702776400",
  appId: "1:150702776400:web:b492e1e811e14c80063155",
  measurementId: "G-4D6KQBVWLR"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
// FIX: always show the Google account chooser so a different account can be used
googleProvider.setCustomParameters({ prompt: "select_account" });

/* ---------- STATE ---------- */
let currentUser = null;
let companyID = "";
let companyData = null;
let inventory = [];
let selectedItem = null;
let currentRole = "";
let displayName = "";
let unsubs = [];

/* ---------- HELPERS ---------- */
const $ = (id) => document.getElementById(id);
const show = (id) => $(id)?.classList.remove("hidden");
const hide = (id) => $(id)?.classList.add("hidden");
const loading = (on) => (on ? show("loadingOverlay") : hide("loadingOverlay"));
const normalizeString = (v) => (v === null || v === undefined ? "" : String(v).trim());

let toastTimer;
function toast(msg) {
  const t = $("toast");
  if (!t) return;
  t.innerText = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3500);
}

function escapeHTML(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/[&<>'"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
}

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const PAGES = ["loginPage", "rolePage", "adminChoicePage", "createCompanyPage",
  "companyLoginPage", "adminPasswordPage", "employeePage", "app"];
function showOnly(id) { PAGES.forEach(hide); show(id); }

function stopListeners() { unsubs.forEach((u) => u()); unsubs = []; }

/* ---------- AUTH STATE ---------- */
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    // don't kick the person out of the dashboard on token refresh
    if (!companyID) showOnly("rolePage");
  } else {
    stopListeners();
    resetSession();
    showOnly("loginPage");
  }
});

function resetSession() {
  companyID = ""; companyData = null; inventory = [];
  selectedItem = null; currentRole = ""; displayName = "";
}

/* ---------- EMAIL / GOOGLE AUTH ---------- */
window.signup = async function () {
  const email = normalizeString($("email")?.value);
  const password = normalizeString($("password")?.value);
  if (!email || !password) return toast("Enter email and password");
  try {
    loading(true);
    await createUserWithEmailAndPassword(auth, email, password);
    toast("Account created successfully");
  } catch (err) { console.error(err); toast(err.message); }
  finally { loading(false); }
};

window.emailLogin = async function () {
  const email = normalizeString($("email")?.value);
  const password = normalizeString($("password")?.value);
  if (!email || !password) return toast("Enter email and password");
  try {
    loading(true);
    await signInWithEmailAndPassword(auth, email, password);
    toast("Login Successful");
  } catch (err) { console.error(err); toast(err.message); }
  finally { loading(false); }
};

window.googleLogin = async function () {
  try {
    loading(true);
    await signInWithPopup(auth, googleProvider);
    toast("Google Login Successful");
  } catch (err) { console.error(err); toast(err.message); }
  finally { loading(false); }
};

window.logout = async function () {
  try {
    stopListeners();
    resetSession();
    await signOut(auth);
    toast("Logged Out");
  } catch (err) { console.error(err); toast(err.message); }
};

/* ---------- NAVIGATION ---------- */
window.chooseAdmin = () => showOnly("adminChoicePage");
window.chooseEmployee = () => showOnly("employeePage");
window.backToRole = () => showOnly("rolePage");
window.showCreateCompany = () => showOnly("createCompanyPage");
window.showCompanyLogin = () => showOnly("companyLoginPage");
window.backToAdminChoice = () => showOnly("adminChoicePage");

/* ---------- COMPANY LOOKUP (case-insensitive, supports old records) ---------- */
async function findCompanyDoc(name) {
  const lower = name.toLowerCase();
  let snap = await getDocs(query(collection(db, "companies"), where("companyNameLower", "==", lower)));
  if (snap.empty) snap = await getDocs(query(collection(db, "companies"), where("companyName", "==", name)));
  return snap.empty ? null : snap.docs[0];
}

/* ---------- CREATE COMPANY ---------- */
window.createCompany = async function () {
  const companyName = normalizeString($("companyName")?.value);
  const adminPassword = normalizeString($("adminPassword")?.value);
  const code = normalizeString($("joinCode")?.value);
  if (!companyName || !adminPassword || !code) return toast("Please fill all fields");

  try {
    loading(true);
    if (await findCompanyDoc(companyName)) return toast("Company already exists");

    const salt = crypto.randomUUID();
    const payload = {
      companyName,
      companyNameLower: companyName.toLowerCase(),
      companyCode: code,
      joinCode: code,
      adminSalt: salt,
      adminPassHash: await sha256(salt + adminPassword), // no plain-text password stored
      adminUID: currentUser.uid, // creator only; NOT used to block other accounts
      geo: null,
      createdAt: serverTimestamp()
    };
    const ref = await addDoc(collection(db, "companies"), payload);
    companyID = ref.id;
    companyData = payload;
    currentRole = "ADMIN";
    displayName = "Owner";
    openDashboard();
    toast("Company Created Successfully");
  } catch (err) { console.error(err); toast("Firestore Write Failed: " + err.message); }
  finally { loading(false); }
};

/* ---------- ADMIN LOGIN (company name + password, ANY Google account) ---------- */
window.findCompany = async function () {
  const name = normalizeString($("loginCompany")?.value);
  if (!name) return toast("Enter Company Name");
  try {
    loading(true);
    const snap = await findCompanyDoc(name);
    if (!snap) return toast("Company not found");
    companyID = snap.id;
    companyData = snap.data();
    $("companyLabel").innerText = companyData.companyName;
    showOnly("adminPasswordPage");
  } catch (err) { console.error(err); toast("Firestore Read Error: " + err.message); }
  finally { loading(false); }
};

window.adminLogin = async function () {
  const password = normalizeString($("loginAdminPassword")?.value);
  if (!companyData || !companyID) return toast("Enter the company name first");
  if (!password) return toast("Enter admin password");

  let ok = false;
  if (companyData.adminPassHash) {
    ok = (await sha256(companyData.adminSalt + password)) === companyData.adminPassHash;
  } else {
    ok = password === companyData.adminPassword; // legacy records
  }
  if (!ok) return toast("Wrong Password");

  // FIX: the old `currentUser.uid !== adminUID` check was removed - it locked out every other account
  currentRole = "ADMIN";
  displayName = "Owner";
  $("loginAdminPassword").value = "";
  openDashboard();
};

/* ---------- EMPLOYEE LOGIN ---------- */
window.employeeLogin = async function () {
  const name = normalizeString($("employeeName")?.value);
  const companyName = normalizeString($("employeeCompanyName")?.value);
  const code = normalizeString($("employeeJoinCode")?.value);
  if (!name || !companyName || !code) return toast("Please fill all fields");

  try {
    loading(true);
    const snap = await findCompanyDoc(companyName);
    if (!snap) return toast("Invalid Company Name");
    const data = snap.data();
    if (normalizeString(data.companyCode || data.joinCode) !== code) return toast("Invalid Company Code");

    companyID = snap.id;
    companyData = data;
    currentRole = "EMPLOYEE";
    displayName = name;

    // one staff record per user (no duplicates on re-login)
    await setDoc(doc(db, "companies", companyID, "staff", currentUser.uid),
      { uid: currentUser.uid, name, email: currentUser.email || "", joinedAt: serverTimestamp() },
      { merge: true });

    openDashboard();
  } catch (err) { console.error(err); toast("Firestore Error: " + err.message); }
  finally { loading(false); }
};

/* ---------- DASHBOARD ---------- */
function openDashboard() {
  showOnly("app");
  $("companyTitle").innerText = companyData.companyName;
  $("roleBadge").innerText = currentRole;

  const admin = currentRole === "ADMIN";
  // Admin-only controls: history, attendance log, geo-fence, Excel import
  ["staffDisplay", "viewAttBtn", "adminGeoPanel", "historyBtn", "importBtn", "templateBtn"].forEach(admin ? show : hide);
  if (!admin) closeHistoryModal();
  admin ? hide("markAttBtn") : show("markAttBtn");

  if (admin && companyData.geo) {
    $("geoLat").value = companyData.geo.lat;
    $("geoLng").value = companyData.geo.lng;
    $("geoRadius").value = companyData.geo.radius;
  }
  startRealtime();
}

function startRealtime() {
  stopListeners();
  const base = ["companies", companyID];

  unsubs.push(onSnapshot(collection(db, ...base, "inventory"), (snap) => {
    inventory = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    filterInventory();
    updateDashboard();
  }, (e) => console.error("Inventory listener:", e)));

  if (currentRole === "ADMIN") {
    unsubs.push(onSnapshot(query(collection(db, ...base, "history"), orderBy("time", "desc")), (snap) => {
      $("historyBody").innerHTML = snap.docs.map((d) => {
        const h = d.data();
        const t = h.time?.toDate ? h.time.toDate().toLocaleString() : "";
        return `<tr><td>${t}</td><td>${escapeHTML(h.user)}</td><td><b>${escapeHTML(h.action)}</b></td>
          <td>${escapeHTML(h.item)}</td><td>${escapeHTML(h.qty)}</td></tr>`;
      }).join("");
    }, (e) => console.error("History listener:", e)));

    unsubs.push(onSnapshot(collection(db, ...base, "staff"), (snap) => {
      const names = snap.docs.map((d) => escapeHTML(d.data().name));
      $("staffNames").innerHTML = names.length ? names.join(", ") : "None";
    }, (e) => console.error("Staff listener:", e)));

    unsubs.push(onSnapshot(query(collection(db, ...base, "attendance"), orderBy("time", "desc")), (snap) => {
      $("attendanceBody").innerHTML = snap.docs.map((d) => {
        const a = d.data();
        const t = a.time?.toDate ? a.time.toDate().toLocaleString() : "";
        const dist = a.distance !== undefined && a.distance !== null ? Math.round(a.distance) + " m" : "-";
        return `<tr><td>${escapeHTML(a.name)}</td><td>${t}</td><td>${dist}</td></tr>`;
      }).join("");
    }, (e) => console.error("Attendance listener:", e)));
  }
}

/* ---------- ADD / EDIT / DELETE PRODUCT ---------- */
window.addItem = async function () {
  const name = normalizeString($("itemName")?.value);
  if (!name) return toast("Enter Product Name");
  try {
    loading(true);
    await addDoc(collection(db, "companies", companyID, "inventory"), {
      name,
      category: normalizeString($("itemCategory")?.value) || "General",
      size: normalizeString($("itemSize")?.value) || "-",
      unit: normalizeString($("itemUnit")?.value) || "-",
      qty: Math.max(0, Number($("itemQty")?.value) || 0),
      hold: 0,
      price: Math.max(0, Number($("itemPrice")?.value) || 0),
      minQty: Math.max(0, Number($("itemMinQty")?.value) || 5),
      createdBy: currentUser.uid,
      createdAt: serverTimestamp()
    });
    ["itemName", "itemCategory", "itemSize", "itemUnit", "itemQty", "itemPrice"].forEach((i) => ($(i).value = ""));
    $("itemMinQty").value = 5;
    toast("Product Added");
  } catch (err) { console.error(err); toast("Failed to add product: " + err.message); }
  finally { loading(false); }
};

window.editItem = function (id) {
  selectedItem = inventory.find((i) => i.id === id);
  if (!selectedItem) return;
  $("modalTitle").innerText = "Item: " + (selectedItem.name || "Unnamed Item");
  $("currentStock").innerText = selectedItem.qty ?? 0;
  $("currentHold").innerText = selectedItem.hold ?? 0;
  $("transactionQty").value = "";

  if (currentRole === "ADMIN") {
    show("adminEditGroup"); show("adminDeleteGroup");
    $("editName").value = selectedItem.name || "";
    $("editCategory").value = selectedItem.category || "General";
    $("editSize").value = selectedItem.size || "-";
    $("editUnit").value = selectedItem.unit || "-";
    $("editPrice").value = selectedItem.price ?? 0;
    $("editMinQty").value = selectedItem.minQty ?? 5;
  } else {
    hide("adminEditGroup"); hide("adminDeleteGroup");
  }
  $("editModal").classList.add("open");
};

window.closeEditModal = function () {
  $("editModal").classList.remove("open");
  selectedItem = null;
};

window.saveItem = async function () {
  if (!selectedItem || currentRole !== "ADMIN") return;
  try {
    loading(true);
    await updateDoc(doc(db, "companies", companyID, "inventory", selectedItem.id), {
      name: normalizeString($("editName").value) || "Unnamed Item",
      category: normalizeString($("editCategory").value) || "General",
      size: normalizeString($("editSize").value) || "-",
      unit: normalizeString($("editUnit").value) || "-",
      price: Math.max(0, Number($("editPrice").value) || 0),
      minQty: Math.max(0, Number($("editMinQty").value) || 0)
    });
    await addHistory("UPDATE DETAILS", 0, normalizeString($("editName").value));
    toast("Product Updated");
    closeEditModal();
  } catch (err) { console.error(err); toast(err.message); }
  finally { loading(false); }
};

window.deleteItem = async function () {
  if (!selectedItem || currentRole !== "ADMIN") return;
  if (!confirm("Delete this product?")) return;
  try {
    loading(true);
    const { id, name, qty } = selectedItem;
    await deleteDoc(doc(db, "companies", companyID, "inventory", id));
    await addHistory("DELETE ITEM", qty, name);
    toast("Product Deleted");
    closeEditModal();
  } catch (err) { console.error(err); toast(err.message); }
  finally { loading(false); }
};

/* ---------- STOCK: IN / OUT / HOLD / RELEASE / FINAL OUT ----------
   FIXES:
   - RELEASE now releases only the quantity typed (empty = whole hold) instead of always everything
   - reads fresh data inside a transaction, so two users can't overwrite each other
   - FINAL OUT permanently removes held stock (hold goes down, stock is NOT changed)
   - negative / zero / decimal amounts are rejected                                      */
const ACTION_LABEL = { IN: "STOCK IN", OUT: "STOCK OUT", HOLD: "HOLD", RELEASE: "RELEASE HOLD", FINAL: "FINAL OUT" };

async function updateStock(type) {
  if (!selectedItem) return;
  const raw = normalizeString($("transactionQty")?.value);
  const useAllHold = raw === "" && (type === "RELEASE" || type === "FINAL");
  const qty = Number(raw);

  if (!useAllHold && (!Number.isInteger(qty) || qty <= 0)) {
    return toast("Enter a valid whole-number quantity");
  }

  const itemRef = doc(db, "companies", companyID, "inventory", selectedItem.id);
  try {
    loading(true);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(itemRef);
      if (!snap.exists()) throw new Error("This item no longer exists");
      const d = snap.data();
      let stock = Number(d.qty) || 0;
      let hold = Number(d.hold) || 0;
      const amt = useAllHold ? hold : qty;

      if (amt <= 0) throw new Error("Nothing is on hold");

      switch (type) {
        case "IN": stock += amt; break;
        case "OUT":
          if (stock < amt) throw new Error("Insufficient Stock");
          stock -= amt; break;
        case "HOLD":
          if (stock < amt) throw new Error("Insufficient Stock");
          stock -= amt; hold += amt; break;
        case "RELEASE":
          if (hold < amt) throw new Error("Only " + hold + " on hold");
          hold -= amt; stock += amt; break;
        case "FINAL":
          if (hold < amt) throw new Error("Only " + hold + " on hold");
          hold -= amt; break;
      }

      tx.update(itemRef, { qty: stock, hold });
      tx.set(doc(collection(db, "companies", companyID, "history")), {
        action: ACTION_LABEL[type], qty: amt, item: d.name,
        user: displayName || currentUser.email || "Unknown", time: serverTimestamp()
      });
    });
    toast("Stock Updated");
    closeEditModal();
  } catch (err) { console.error(err); toast(err.message); }
  finally { loading(false); }
}

window.stockIn = () => updateStock("IN");
window.stockOut = () => updateStock("OUT");
window.holdStock = () => updateStock("HOLD");
window.releaseStock = () => updateStock("RELEASE");
window.finalOut = () => updateStock("FINAL");

async function addHistory(action, qty, item) {
  try {
    await addDoc(collection(db, "companies", companyID, "history"), {
      action, qty, item, user: displayName || currentUser.email || "Unknown", time: serverTimestamp()
    });
  } catch (err) { console.error("Audit log error:", err); }
}

/* ---------- MODALS ---------- */
window.showHistoryModal = () => { if (currentRole === "ADMIN") $("historyModal").classList.add("open"); };
window.closeHistoryModal = () => $("historyModal").classList.remove("open");
window.showAttendanceModal = () => { if (currentRole === "ADMIN") $("attendanceModal").classList.add("open"); };
window.closeAttendanceModal = () => $("attendanceModal").classList.remove("open");

/* ---------- ATTENDANCE + GEO-FENCE ---------- */
function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000, rad = (x) => (x * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolocation not supported"));
    navigator.geolocation.getCurrentPosition(resolve, (e) => reject(new Error("Location Error: " + e.message)),
      { enableHighAccuracy: true, timeout: 15000 });
  });
}

window.getCurrentLocation = async function () {
  try {
    const p = await getPosition();
    $("geoLat").value = p.coords.latitude;
    $("geoLng").value = p.coords.longitude;
    toast("Location fetched");
  } catch (err) { toast(err.message); }
};

window.saveGeoSettings = async function () {
  const lat = parseFloat($("geoLat").value), lng = parseFloat($("geoLng").value);
  const radius = parseFloat($("geoRadius").value);
  if (isNaN(lat) || isNaN(lng) || isNaN(radius) || radius <= 0) return toast("Enter valid latitude, longitude and radius");
  try {
    await updateDoc(doc(db, "companies", companyID), { geo: { lat, lng, radius } });
    companyData.geo = { lat, lng, radius };
    toast("Geo-fence saved");
  } catch (err) { console.error(err); toast(err.message); }
};

window.markAttendance = async function () {
  try {
    loading(true);
    const pos = await getPosition();
    const fresh = (await getDoc(doc(db, "companies", companyID))).data(); // latest geo-fence
    let distance = null;
    if (fresh?.geo) {
      distance = distanceMeters(pos.coords.latitude, pos.coords.longitude, fresh.geo.lat, fresh.geo.lng);
      if (distance > fresh.geo.radius) {
        return toast(`You are ${Math.round(distance)} m away. Allowed radius: ${fresh.geo.radius} m`);
      }
    }
    await addDoc(collection(db, "companies", companyID, "attendance"), {
      name: displayName || currentUser.email || "Employee",
      uid: currentUser.uid,
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      distance,
      time: serverTimestamp()
    });
    toast("Attendance Marked");
  } catch (err) { console.error(err); toast(err.message); }
  finally { loading(false); }
};

/* ---------- RENDER / SEARCH / CATEGORY FILTER ---------- */
function updateDashboard() {
  let low = 0, total = 0;
  inventory.forEach((i) => {
    if ((i.qty ?? 0) <= (i.minQty ?? 5)) low++;
    total += ((Number(i.qty) || 0) + (Number(i.hold) || 0)) * (Number(i.price) || 0);
  });
  $("totalItems").innerText = inventory.length;
  $("lowStock").innerText = low;
  $("totalValue").innerText = total.toLocaleString();
}

function updateCategoryDropdown() {
  const sel = $("categoryFilter");
  const prev = sel.value;
  const cats = [...new Set(inventory.map((i) => i.category || "General"))].sort();
  sel.innerHTML = '<option value="ALL">All Categories</option>' +
    cats.map((c) => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join("");
  sel.value = cats.includes(prev) ? prev : "ALL";
}

function renderInventory(list) {
  $("inventoryBody").innerHTML = list.map((i) => {
    const qty = Number(i.qty) || 0, hold = Number(i.hold) || 0, price = Number(i.price) || 0;
    const min = i.minQty ?? 5;
    const low = qty <= min;
    return `<tr ${low ? 'class="low-stock-row"' : ""}>
      <td><strong>${escapeHTML(i.name)}</strong> ${low ? '<span class="badge-low">LOW</span>' : ""}</td>
      <td><span class="badge-cat">${escapeHTML(i.category || "General")}</span></td>
      <td>${escapeHTML(i.size || "-")}</td>
      <td>${escapeHTML(i.unit || "-")}</td>
      <td><b>${qty}</b></td>
      <td style="color:purple"><b>${hold}</b></td>
      <td>${min}</td>
      <td>₹${price}</td>
      <td>₹${((qty + hold) * price).toLocaleString()}</td>
      <td><button class="edit-btn main-nav" onclick="editItem('${escapeHTML(i.id)}')">Update</button></td>
    </tr>`;
  }).join("");
}

window.filterInventory = function () {
  updateCategoryDropdown();
  const text = normalizeString($("search")?.value).toLowerCase();
  const cat = $("categoryFilter").value;
  renderInventory(inventory.filter((i) =>
    (i.name || "").toLowerCase().includes(text) &&
    (cat === "ALL" || (i.category || "General") === cat)));
};


/* ---------- IMPORT FROM EXCEL (admin only) ----------
   Columns (header names are case-insensitive): Name, Category, Size, Unit, Qty, Hold, MinQty, Price
   Rows with the same Name + Size as an existing item update that item; others are added.      */
const HEADER_MAP = {
  name: "name", item: "name", "item name": "name", product: "name",
  category: "category", cat: "category",
  size: "size", unit: "unit",
  qty: "qty", quantity: "qty", stock: "qty",
  hold: "hold",
  minqty: "minQty", "min qty": "minQty", "min alert": "minQty", min: "minQty",
  price: "price", rate: "price"
};

window.downloadTemplate = function () {
  if (!window.XLSX) return toast("Excel library failed to load");
  const ws = XLSX.utils.aoa_to_sheet([
    ["Name", "Category", "Size", "Unit", "Qty", "Hold", "MinQty", "Price"],
    ["Sample Item", "Snacks", "100", "g", 50, 0, 5, 20]
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Inventory");
  XLSX.writeFile(wb, "inventory_template.xlsx");
};

window.importInventory = async function (input) {
  const file = input.files?.[0];
  input.value = ""; // allow re-selecting the same file later
  if (!file || currentRole !== "ADMIN") return;
  if (!window.XLSX) return toast("Excel library failed to load. Check your internet connection.");

  try {
    loading(true);
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });

    const items = [];
    let skipped = 0;
    rows.forEach((row) => {
      const r = {};
      Object.keys(row).forEach((k) => {
        const f = HEADER_MAP[k.toString().trim().toLowerCase()];
        if (f) r[f] = row[k];
      });
      const name = normalizeString(r.name);
      if (!name) { skipped++; return; }
      const num = (v, d) => { const n = Number(v); return v === "" || isNaN(n) ? d : Math.max(0, n); };
      items.push({
        name,
        category: normalizeString(r.category) || "General",
        size: normalizeString(r.size) || "-",
        unit: normalizeString(r.unit) || "-",
        qty: num(r.qty, 0),
        hold: r.hold === undefined ? undefined : num(r.hold, 0),
        minQty: num(r.minQty, 5),
        price: num(r.price, 0)
      });
    });

    if (!items.length) return toast("No valid rows found. Needs a 'Name' column.");

    const key = (n, s) => (n + "|" + s).toLowerCase();
    const existing = new Map(inventory.map((i) => [key(i.name, i.size || "-"), i]));
    const updates = items.filter((i) => existing.has(key(i.name, i.size))).length;

    if (!confirm(`Import ${items.length} item(s)?\n${items.length - updates} new, ${updates} will update existing items.` +
      (skipped ? `\n${skipped} row(s) without a name will be skipped.` : ""))) return;

    // Firestore batches allow 500 writes; use 400 per batch to stay safe
    for (let i = 0; i < items.length; i += 400) {
      const batch = writeBatch(db);
      items.slice(i, i + 400).forEach((it) => {
        const match = existing.get(key(it.name, it.size));
        const data = { ...it };
        if (data.hold === undefined) delete data.hold;
        if (match) {
          batch.update(doc(db, "companies", companyID, "inventory", match.id), data);
        } else {
          batch.set(doc(collection(db, "companies", companyID, "inventory")),
            { hold: 0, ...data, createdBy: currentUser.uid, createdAt: serverTimestamp() });
        }
      });
      await batch.commit();
    }

    await addHistory("EXCEL IMPORT", items.length, file.name);
    toast(`Imported ${items.length} item(s)`);
  } catch (err) { console.error(err); toast("Import failed: " + err.message); }
  finally { loading(false); }
};

/* ---------- EXPORT CSV ---------- */
window.exportInventory = function () {
  if (!inventory.length) return toast("No inventory data to export");
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  let csv = "Name,Category,Size,Unit,Qty,Hold,MinQty,Price\n";
  inventory.forEach((i) => {
    csv += [q(i.name), q(i.category), q(i.size), q(i.unit), i.qty, i.hold, i.minQty, i.price].join(",") + "\n";
  });
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${companyData?.companyName || "inventory"}_export.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

/* ---------- KEYBOARD NAVIGATION ---------- */
document.addEventListener("keydown", (e) => {
  const modalOpen = $("editModal").classList.contains("open");
  if (document.activeElement.id === "search" && e.key === "ArrowDown") {
    e.preventDefault();
    document.querySelector("#inventoryBody .edit-btn")?.focus();
    return;
  }
  const els = [...document.querySelectorAll(modalOpen ? ".modal-nav" : ".main-nav")];
  const i = els.indexOf(document.activeElement);
  if (i === -1) return;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); (els[i + 1] || els[0]).focus(); }
  if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); (els[i - 1] || els[els.length - 1]).focus(); }
});

