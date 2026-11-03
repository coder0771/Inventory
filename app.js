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
  getDocs, query, where, orderBy, serverTimestamp, onSnapshot, runTransaction, writeBatch, deleteField
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
let devActive = false;
let staffList = [];
let trackWatchId = null, trackState = null, trackPending = 0, trackBusy = false, wakeLock = null;
let unreadMoves = 0;

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
  "companyLoginPage", "adminPasswordPage", "employeePage", "devLoginPage", "developerPage", "app"];
function showOnly(id) { PAGES.forEach(hide); show(id); }

function stopListeners() { unsubs.forEach((u) => u()); unsubs = []; stopTracking(); }

/* ---------- AUTH STATE ---------- */
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    // don't kick the person out of the dashboard on token refresh
    if (!companyID && !devActive) showOnly("rolePage");
  } else {
    stopListeners();
    resetSession();
    showOnly("loginPage");
  }
});

function resetSession() {
  companyID = ""; companyData = null; inventory = [];
  selectedItem = null; currentRole = ""; displayName = ""; devActive = false;
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

/* =====================================================================
   SECURE ACCESS MODEL
   companyDirectory/{sha256(name)} -> {companyId, companyName, ownerUid}   (look up by name only)
   companies/{id}/private/access   -> {adminPassHash, joinCodeHash}        (owner can read; rules compare)
   companies/{id}/members/{uid}    -> {role: ADMIN | EMPLOYEE, accessCode} (decides what a user may do)
   The password / join code are never stored as plain data that other users can read.
   ===================================================================== */
const nameKey = (name) => sha256(normalizeString(name).toLowerCase());
const codeHash = (cid, kind, secret) => sha256(`${cid}:${kind}:${secret}`);
let pending = null; // company found by name, waiting for the admin password

async function lookupCompany(name) {
  const dir = await getDoc(doc(db, "companyDirectory", await nameKey(name)));
  return dir.exists() ? { id: dir.data().companyId, name: dir.data().companyName } : null;
}

async function loadCompany(id) {
  const snap = await getDoc(doc(db, "companies", id));
  if (!snap.exists()) throw new Error("Company data not found");
  return snap.data();
}

/* ---------- CREATE COMPANY ---------- */
window.createCompany = async function () {
  const companyName = normalizeString($("companyName")?.value);
  const adminPassword = normalizeString($("adminPassword")?.value);
  const code = normalizeString($("joinCode")?.value);
  if (!companyName || !adminPassword || !code) return toast("Please fill all fields");

  try {
    loading(true);
    const dirRef = doc(db, "companyDirectory", await nameKey(companyName));
    if ((await getDoc(dirRef)).exists()) return toast("Company already exists");

    const compRef = doc(collection(db, "companies"));
    const id = compRef.id;
    const uid = currentUser.uid;
    const adminHash = await codeHash(id, "admin", adminPassword);

    await setDoc(dirRef, { companyId: id, companyName, ownerUid: uid });
    const payload = {
      companyName, companyNameLower: companyName.toLowerCase(),
      ownerUid: uid, geo: null, shopGeo: null, createdAt: serverTimestamp()
    };
    await setDoc(compRef, payload);
    await setDoc(doc(db, "companies", id, "private", "access"), {
      adminPassHash: adminHash, joinCodeHash: await codeHash(id, "join", code), joinCode: code
    });
    await setDoc(doc(db, "companies", id, "members", uid), {
      uid, admin: true, adminCode: adminHash, email: currentUser.email || "", createdAt: serverTimestamp()
    });

    companyID = id; companyData = payload; currentRole = "ADMIN"; displayName = "Owner";
    openDashboard();
    toast("Company Created Successfully");
  } catch (err) { console.error(err); toast("Could not create company: " + err.message); }
  finally { loading(false); }
};

/* ---------- ADMIN LOGIN (company name + password, ANY Google account) ---------- */
window.findCompany = async function () {
  const name = normalizeString($("loginCompany")?.value);
  if (!name) return toast("Enter Company Name");
  try {
    loading(true);
    const found = await lookupCompany(name);
    if (found) pending = { ...found, legacy: null };
    else {
      // company made before the security upgrade: only the Google account that created it can open it once
      const snap = await getDocs(query(collection(db, "companies"), where("adminUID", "==", currentUser.uid)));
      const m = snap.docs.find((d) => normalizeString(d.data().companyName).toLowerCase() === name.toLowerCase());
      if (!m) return toast("Company not found");
      pending = { id: m.id, name: m.data().companyName, legacy: m.data() };
    }
    $("companyLabel").innerText = pending.name;
    showOnly("adminPasswordPage");
  } catch (err) { console.error(err); toast("Could not look up company: " + err.message); }
  finally { loading(false); }
};

async function migrateLegacy(id, d, password) {
  const uid = currentUser.uid;
  const adminHash = await codeHash(id, "admin", password);
  const join = normalizeString(d.companyCode || d.joinCode);
  await setDoc(doc(db, "companyDirectory", await nameKey(d.companyName)), { companyId: id, companyName: d.companyName, ownerUid: uid });
  await updateDoc(doc(db, "companies", id), {
    ownerUid: uid, adminPassHash: deleteField(), adminSalt: deleteField(), adminPassword: deleteField(),
    joinCode: deleteField(), companyCode: deleteField()
  });
  await setDoc(doc(db, "companies", id, "private", "access"), {
    adminPassHash: adminHash, joinCodeHash: join ? await codeHash(id, "join", join) : "", joinCode: join
  });
  await setDoc(doc(db, "companies", id, "members", uid), {
    uid, admin: true, adminCode: adminHash, email: currentUser.email || "", createdAt: serverTimestamp()
  });
}

window.adminLogin = async function () {
  const password = normalizeString($("loginAdminPassword")?.value);
  if (!pending) return toast("Enter the company name first");
  if (!password) return toast("Enter admin password");

  try {
    loading(true);
    const id = pending.id;
    if (pending.legacy) {
      const d = pending.legacy;
      const ok = d.adminPassHash ? (await sha256(d.adminSalt + password)) === d.adminPassHash : password === d.adminPassword;
      if (!ok) return toast("Wrong Password");
      await migrateLegacy(id, d, password);
      toast("Company upgraded to the secure format. Employees must join again with the join code.");
    } else {
      const hash = await codeHash(id, "admin", password);
      try {
        // the Firestore rules accept this write ONLY if the hash matches the stored admin password
        await setDoc(doc(db, "companies", id, "members", currentUser.uid),
          { uid: currentUser.uid, admin: true, adminCode: hash, email: currentUser.email || "" }, { merge: true });
      } catch (err) {
        if (err.code === "permission-denied") return toast("Wrong Password");
        throw err;
      }
    }
    companyData = await loadCompany(id);
    companyID = id; currentRole = "ADMIN"; displayName = "Owner"; pending = null;
    $("loginAdminPassword").value = "";
    openDashboard();
  } catch (err) { console.error(err); toast("Login failed: " + err.message); }
  finally { loading(false); }
};

/* ---------- EMPLOYEE LOGIN ---------- */
window.employeeLogin = async function () {
  const name = normalizeString($("employeeName")?.value);
  const companyName = normalizeString($("employeeCompanyName")?.value);
  const code = normalizeString($("employeeJoinCode")?.value);
  if (!name || !companyName || !code) return toast("Please fill all fields");

  try {
    loading(true);
    const found = await lookupCompany(companyName);
    if (!found) return toast("Invalid Company Name");

    const memRef = doc(db, "companies", found.id, "members", currentUser.uid);
    try {
      // accepted by the rules ONLY if the join code hash matches
      await setDoc(memRef, { uid: currentUser.uid, employee: true, joinCode: await codeHash(found.id, "join", code),
        email: currentUser.email || "" }, { merge: true });
    } catch (err) {
      if (err.code === "permission-denied") return toast("Invalid Company Code");
      throw err;
    }

    companyData = await loadCompany(found.id);
    companyID = found.id; currentRole = "EMPLOYEE"; displayName = name;

    await setDoc(doc(db, "companies", companyID, "staff", currentUser.uid),
      { uid: currentUser.uid, name, email: currentUser.email || "", joinedAt: serverTimestamp() }, { merge: true });

    openDashboard();
  } catch (err) { console.error(err); toast("Could not join: " + err.message); }
  finally { loading(false); }
};

/* ---------- DASHBOARD ---------- */
function openDashboard() {
  showOnly("app");
  $("companyTitle").innerText = companyData.companyName;
  $("roleBadge").innerText = currentRole;

  const admin = currentRole === "ADMIN";
  // Admin-only controls: history, attendance log, geo-fence, Excel import
  ["staffDisplay", "viewAttBtn", "adminGeoPanel", "adminShopPanel", "movementBtn", "taskMgmtBtn", "historyBtn", "importBtn", "templateBtn"].forEach(admin ? show : hide);
  if (!admin) closeHistoryModal();
  admin ? hide("markAttBtn") : show("markAttBtn");
  admin ? hide("taskEmpBtn") : show("taskEmpBtn");

  if (admin && companyData.geo) {
    $("geoLat").value = companyData.geo.lat;
    $("geoLng").value = companyData.geo.lng;
    $("geoRadius").value = companyData.geo.radius;
  }
  if (admin && companyData.shopGeo) {
    $("shopLat").value = companyData.shopGeo.lat;
    $("shopLng").value = companyData.shopGeo.lng;
    $("shopRadius").value = companyData.shopGeo.radius;
  }
  startRealtime();
  startTasks();
  if (!admin) { startTracking(); watchMembership(); }
}

function startRealtime() {
  stopListeners();
  const base = ["companies", companyID];
  unreadMoves = 0;
  updateMoveBadge();

  // live company settings (so a changed shop radius reaches employees immediately)
  unsubs.push(onSnapshot(doc(db, ...base), (s) => {
    if (s.exists()) { companyData = { ...companyData, ...s.data() }; if (currentRole === "EMPLOYEE") updateTrackNow(); }
  }, (e) => console.error("Company listener:", e)));

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
      staffList = snap.docs.map((d) => d.data());
      const names = staffList.map((s) => escapeHTML(s.name));
      $("staffNames").innerHTML = names.length ? names.join(", ") : "None";
      renderPresence();
    }, (e) => console.error("Staff listener:", e)));

    // employee left / entered shop radius events
    let firstMoveSnap = true;
    unsubs.push(onSnapshot(query(collection(db, ...base, "movements"), orderBy("time", "desc")), (snap) => {
      $("movementBody").innerHTML = snap.docs.map((d) => {
        const m = d.data();
        const left = m.type === "LEFT";
        return `<tr><td>${escapeHTML(m.name)}</td>
          <td><span class="${left ? "badge-low" : "badge-in"}">${left ? "LEFT radius" : "ENTERED radius"}</span></td>
          <td>${fmtTime(m.time)}</td><td>${Math.round(m.distance ?? 0)} m${m.note ? " <small>(" + escapeHTML(m.note) + ")</small>" : ""}</td></tr>`;
      }).join("") || '<tr><td colspan="4">No movement recorded yet</td></tr>';

      if (!firstMoveSnap) {
        snap.docChanges().forEach((c) => {
          if (c.type === "added" && !c.doc.metadata.hasPendingWrites) notifyMovement(c.doc.data());
        });
      }
      firstMoveSnap = false;
    }, (e) => console.error("Movement listener:", e)));

    unsubs.push(onSnapshot(query(collection(db, ...base, "attendance"), orderBy("time", "desc")), (snap) => {
      $("attendanceBody").innerHTML = snap.docs.map((d) => {
        const a = d.data();
        const t = a.time?.toDate ? a.time.toDate().toLocaleString() : "";
        const dist = a.distance !== undefined && a.distance !== null
          ? Math.round(a.distance) + " m" + (a.accuracy ? " (±" + Math.round(a.accuracy) + ")" : "") : "-";
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
      broken: 0,
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
  $("currentBroken").innerText = selectedItem.broken ?? 0;
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
const ACTION_LABEL = { IN: "STOCK IN", OUT: "STOCK OUT", HOLD: "HOLD", RELEASE: "RELEASE HOLD", FINAL: "FINAL OUT", BROKEN: "BROKEN STOCK", BROKENOUT: "BROKEN OUT" };

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
      let broken = Number(d.broken) || 0;
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
        case "BROKEN": // move from good stock to broken stock
          if (stock < amt) throw new Error("Insufficient Stock");
          stock -= amt; broken += amt; break;
        case "BROKENOUT": // remove from broken stock permanently
          if (broken < amt) throw new Error("Only " + broken + " in broken stock");
          broken -= amt; break;
      }

      tx.update(itemRef, { qty: stock, hold, broken });
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
window.brokenStock = () => updateStock("BROKEN");
window.brokenOut = () => updateStock("BROKENOUT");

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

// GPS readings jitter by 10-30 m, especially at first fix. Instead of trusting the first
// reading, watch for a few seconds and keep the MOST ACCURATE one.
function getPosition({ targetAccuracy = 15, maxWait = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolocation not supported"));
    let best = null, done = false, watchId, timer;

    const finish = () => {
      if (done) return;
      done = true;
      navigator.geolocation.clearWatch(watchId);
      clearTimeout(timer);
      best ? resolve(best) : reject(new Error("Could not get your location. Turn on GPS and allow location access."));
    };

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos;
        if (best.coords.accuracy <= targetAccuracy) finish();
      },
      (e) => { if (!best) { done = true; navigator.geolocation.clearWatch(watchId); clearTimeout(timer); reject(new Error("Location Error: " + e.message)); } },
      { enableHighAccuracy: true, maximumAge: 0, timeout: maxWait }
    );
    timer = setTimeout(finish, maxWait);
  });
}

async function fetchInto(latId, lngId) {
  try {
    loading(true);
    toast("Getting precise location... stay still for a few seconds");
    const p = await getPosition({ targetAccuracy: 10, maxWait: 15000 });
    $(latId).value = p.coords.latitude;
    $(lngId).value = p.coords.longitude;
    toast(`Location fetched (accuracy ±${Math.round(p.coords.accuracy)} m)` +
      (p.coords.accuracy > 25 ? " - weak signal! Move outdoors and fetch again before saving" : ""));
  } catch (err) { toast(err.message); }
  finally { loading(false); }
}
window.getCurrentLocation = () => fetchInto("geoLat", "geoLng");
window.getShopLocation = () => fetchInto("shopLat", "shopLng");

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
    toast("Getting precise location... stay still for a few seconds");
    const pos = await getPosition({ targetAccuracy: 10, maxWait: 15000 });
    const acc = pos.coords.accuracy;

    // a 20 m fence is only meaningful if the reading itself is reasonably precise
    if (acc > 30) {
      return toast(`GPS signal too weak (±${Math.round(acc)} m). Move near a window or outdoors, keep GPS on, and try again.`);
    }

    const fresh = (await getDoc(doc(db, "companies", companyID))).data(); // latest geo-fence
    let distance = null;
    if (fresh?.geo) {
      distance = distanceMeters(pos.coords.latitude, pos.coords.longitude, fresh.geo.lat, fresh.geo.lng);
      // FIX: both the saved point and this reading have GPS error, so allow for it
      const allowed = fresh.geo.radius + acc;
      if (distance > allowed) {
        return toast(`You are about ${Math.round(distance)} m away (allowed ${fresh.geo.radius} m + GPS error ±${Math.round(acc)} m).`);
      }
    }
    await addDoc(collection(db, "companies", companyID, "attendance"), {
      name: displayName || currentUser.email || "Employee",
      uid: currentUser.uid,
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      distance,
      accuracy: acc,
      time: serverTimestamp()
    });
    toast("Attendance Marked");
  } catch (err) { console.error(err); toast(err.message); }
  finally { loading(false); }
};


/* ---------- SHOP RADIUS (employee movement tracking) ---------- */
window.saveShopRadius = async function () {
  const lat = parseFloat($("shopLat").value), lng = parseFloat($("shopLng").value);
  const radius = parseFloat($("shopRadius").value);
  if (isNaN(lat) || isNaN(lng) || isNaN(radius) || radius <= 0) return toast("Enter valid latitude, longitude and radius");
  try {
    await updateDoc(doc(db, "companies", companyID), { shopGeo: { lat, lng, radius } });
    companyData.shopGeo = { lat, lng, radius };
    toast("Shop radius saved. Employees are now tracked against it.");
  } catch (err) { console.error(err); toast(err.message); }
};

window.disableShopTracking = async function () {
  try {
    await updateDoc(doc(db, "companies", companyID), { shopGeo: null });
    companyData.shopGeo = null;
    ["shopLat", "shopLng"].forEach((i) => ($(i).value = ""));
    toast("Employee tracking turned off");
  } catch (err) { console.error(err); toast(err.message); }
};

/* ---------- EMPLOYEE SIDE: watch position, log LEFT / ENTERED ----------
   Works only while the employee has this page open (browsers pause web pages in the background). */
function setTrackStatus(text) { const el = $("trackStatus"); if (el) { el.innerText = text; show("trackStatus"); } }

function startTracking() {
  stopTracking();
  if (currentRole !== "EMPLOYEE") return;
  if (!navigator.geolocation) return setTrackStatus("📍 Location is not supported on this device");
  trackState = null; trackPending = 0;
  trackWatchId = navigator.geolocation.watchPosition(onTrackPosition,
    (e) => setTrackStatus("📍 Location error: " + e.message + ". Allow location access to continue."),
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });
  requestWakeLock();
  setTrackStatus("📍 Starting location tracking...");
}

function stopTracking() {
  if (trackWatchId !== null) { navigator.geolocation.clearWatch(trackWatchId); trackWatchId = null; }
  releaseWakeLock();
  hide("trackStatus");
}

let lastTrackPos = null;
function updateTrackNow() { if (lastTrackPos) onTrackPosition(lastTrackPos); }

async function onTrackPosition(pos) {
  lastTrackPos = pos;
  const g = companyData?.shopGeo;
  if (!g) { trackState = null; return setTrackStatus("📍 Tracking is off (the owner has not set a shop radius)"); }
  const acc = pos.coords.accuracy;
  if (acc > 50) return setTrackStatus(`📍 Waiting for a better GPS signal (±${Math.round(acc)} m)`);
  if (trackBusy) return;
  trackBusy = true;
  try {
    const d = distanceMeters(pos.coords.latitude, pos.coords.longitude, g.lat, g.lng);

    if (trackState === null) {
      // first reading: compare with the last saved state so reloads don't create duplicate events
      const computed = d > g.radius + acc ? "OUT" : "IN";
      let stored = null;
      try { stored = (await getDoc(doc(db, "companies", companyID, "staff", currentUser.uid))).data()?.presence ?? null; } catch (e) {}
      trackState = computed;
      if (stored !== computed && !(stored === null && computed === "IN")) {
        await logMovement(computed, d, acc, stored === null ? "outside when app opened" : "");
      }
    } else {
      // Needs 2 readings in a row to change state, and uses GPS error as margin, to avoid false alerts
      const want = trackState === "IN" ? (d > g.radius + acc ? "OUT" : "IN") : (d <= g.radius ? "IN" : "OUT");
      if (want === trackState) trackPending = 0;
      else if (++trackPending >= 2) {
        trackState = want; trackPending = 0;
        await logMovement(want, d, acc, "");
      }
    }
    setTrackStatus(`📍 Tracking on: you are ${trackState === "IN" ? "inside" : "outside"} the shop radius (${Math.round(d)} m from shop)`);
  } finally { trackBusy = false; }
}

async function logMovement(state, distance, accuracy, note) {
  try {
    await addDoc(collection(db, "companies", companyID, "movements"), {
      uid: currentUser.uid, name: displayName || currentUser.email || "Employee",
      type: state === "OUT" ? "LEFT" : "ENTERED", distance, accuracy, note, time: serverTimestamp()
    });
    await setDoc(doc(db, "companies", companyID, "staff", currentUser.uid),
      { presence: state, presenceAt: serverTimestamp() }, { merge: true });
  } catch (err) { console.error("Movement log error:", err); }
}

async function requestWakeLock() {
  try { if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen"); } catch (e) {}
}
function releaseWakeLock() { try { wakeLock?.release(); } catch (e) {} wakeLock = null; }
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && trackWatchId !== null) requestWakeLock();
});

/* ---------- ADMIN SIDE: alerts + movement log ---------- */
function fmtTime(t) { return t?.toDate ? t.toDate().toLocaleString() : new Date().toLocaleString(); }

function updateMoveBadge() {
  const b = $("moveBadge");
  if (!b) return;
  b.innerText = unreadMoves;
  unreadMoves > 0 ? b.classList.remove("hidden") : b.classList.add("hidden");
}

function notifyMovement(m) {
  const left = m.type === "LEFT";
  const card = document.createElement("div");
  card.className = "move-alert " + (left ? "left" : "enter");
  card.innerHTML = `<b>${left ? "🚪 Left" : "✅ Entered"}</b> - ${escapeHTML(m.name)}<br>
    <small>${left ? "left" : "came back inside"} the shop radius at ${fmtTime(m.time)} (${Math.round(m.distance ?? 0)} m)</small>`;
  card.onclick = () => card.remove();
  $("alertStack").prepend(card);
  setTimeout(() => card.remove(), 20000);
  unreadMoves++;
  updateMoveBadge();
}

function renderPresence() {
  const el = $("presenceList");
  if (!el) return;
  el.innerHTML = staffList.length ? staffList.map((s) => {
    const st = s.presence === "OUT" ? '<span class="badge-low">Outside</span>'
      : s.presence === "IN" ? '<span class="badge-in">Inside</span>' : '<span class="badge-cat" style="background:#888">No data</span>';
    return `<div style="margin:4px 0">${escapeHTML(s.name)} ${st}</div>`;
  }).join("") : "No staff have joined yet";
  renderStaffTable();
}

/* ---------- STAFF TABLE: view and remove employees ---------- */
function renderStaffTable() {
  const el = $("staffTableBody");
  if (!el) return;
  el.innerHTML = staffList.length ? staffList.map((s, n) => {
    const st = s.presence === "OUT" ? '<span class="badge-low">Outside</span>'
      : s.presence === "IN" ? '<span class="badge-in">Inside</span>' : '<span class="badge-cat" style="background:#888">No data</span>';
    return `<tr><td>${n + 1}</td><td><b>${escapeHTML(s.name)}</b></td><td>${escapeHTML(s.email || "-")}</td>
      <td>${s.joinedAt?.toDate ? s.joinedAt.toDate().toLocaleDateString() : "-"}</td><td>${st}</td>
      <td><button class="bin" onclick="removeEmployee('${escapeHTML(s.uid)}')">🗑 Remove</button></td></tr>`;
  }).join("") : '<tr><td colspan="6">No employees have joined yet</td></tr>';
}
window.showStaffModal = () => { if (currentRole !== "ADMIN") return; renderStaffTable(); $("staffModal").classList.add("open"); };
window.closeStaffModal = () => $("staffModal").classList.remove("open");

window.removeEmployee = async (uid) => {
  const s = staffList.find((x) => x.uid === uid);
  if (!s) return;
  if (!(await askConfirm(`Remove ${s.name} from your company? They will lose access immediately.`))) return;
  try {
    loading(true);
    await updateDoc(doc(db, "companies", companyID, "members", uid), { employee: false });
    await deleteDoc(doc(db, "companies", companyID, "staff", uid));
    toast(s.name + " removed");
  } catch (err) { console.error(err); toast("Could not remove: " + err.message); }
  finally { loading(false); }
};

// employee side: if the owner removes this employee, sign them out of the company straight away
function watchMembership() {
  unsubs.push(onSnapshot(doc(db, "companies", companyID, "members", currentUser.uid), (s) => {
    if (currentRole === "EMPLOYEE" && (!s.exists() || s.data().employee !== true)) {
      toast("You were removed from this company by the owner");
      logout();
    }
  }, () => {}));
}

window.showMovementModal = () => {
  if (currentRole !== "ADMIN") return;
  unreadMoves = 0; updateMoveBadge(); renderPresence();
  $("movementModal").classList.add("open");
};
window.closeMovementModal = () => $("movementModal").classList.remove("open");

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
    const qty = Number(i.qty) || 0, hold = Number(i.hold) || 0, broken = Number(i.broken) || 0, price = Number(i.price) || 0;
    const min = i.minQty ?? 5;
    const low = qty <= min;
    return `<tr ${low ? 'class="low-stock-row"' : ""}>
      <td><strong>${escapeHTML(i.name)}</strong> ${low ? '<span class="badge-low">LOW</span>' : ""}</td>
      <td><span class="badge-cat">${escapeHTML(i.category || "General")}</span></td>
      <td>${escapeHTML(i.size || "-")}</td>
      <td>${escapeHTML(i.unit || "-")}</td>
      <td><b>${qty}</b></td>
      <td style="color:purple"><b>${hold}</b></td>
      <td style="color:#c0392b"><b>${broken}</b></td>
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
  hold: "hold", broken: "broken",
  minqty: "minQty", "min qty": "minQty", "min alert": "minQty", min: "minQty",
  price: "price", rate: "price"
};

window.downloadTemplate = function () {
  if (!window.XLSX) return toast("Excel library failed to load");
  const ws = XLSX.utils.aoa_to_sheet([
    ["Name", "Category", "Size", "Unit", "Qty", "Hold", "Broken", "MinQty", "Price"],
    ["Sample Item", "Snacks", "100", "g", 50, 0, 0, 5, 20]
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
        broken: r.broken === undefined ? undefined : num(r.broken, 0),
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
        if (data.broken === undefined) delete data.broken;
        if (match) {
          batch.update(doc(db, "companies", companyID, "inventory", match.id), data);
        } else {
          batch.set(doc(collection(db, "companies", companyID, "inventory")),
            { hold: 0, broken: 0, ...data, createdBy: currentUser.uid, createdAt: serverTimestamp() });
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
  let csv = "Name,Category,Size,Unit,Qty,Hold,Broken,MinQty,Price\n";
  inventory.forEach((i) => {
    csv += [q(i.name), q(i.category), q(i.size), q(i.unit), i.qty, i.hold, i.broken || 0, i.minQty, i.price].join(",") + "\n";
  });
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${companyData?.companyName || "inventory"}_export.csv`;
  a.click();
  URL.revokeObjectURL(url);
};


/* =====================================================================
   TASK MANAGEMENT
   companies/{id}/tasks      -> assigned tasks
   companies/{id}/adminTasks -> owner's private notes
   Every task has: assignees {uid:name}, completions {uid:{status,...}}, extensions {uid:endMs}
   status: SUBMITTED (waiting) | APPROVED | DECLINED
   ===================================================================== */
let tasks = [];
let adminTasks = [];
let taskView = "menu";
let taskDraft = {};
let extendTarget = null;
let confirmResolve = null;
const FORM_VIEWS = ["assignAll", "assignSingle", "adminTasks"];

const dtLocal = (ms) => new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const fmtMs = (ms) => (ms ? new Date(ms).toLocaleString() : "-");
const effEnd = (t, uid) => (t.extensions && t.extensions[uid]) || t.endAt;

function pushAlert(html, cls) {
  const card = document.createElement("div");
  card.className = "move-alert " + cls;
  card.innerHTML = html;
  card.onclick = () => card.remove();
  $("alertStack").prepend(card);
  setTimeout(() => card.remove(), 20000);
}

function askConfirm(msg) {
  return new Promise((res) => {
    $("confirmText").innerText = msg;
    $("confirmModal").classList.add("open");
    confirmResolve = res;
  });
}
window.confirmAnswer = (yes) => {
  $("confirmModal").classList.remove("open");
  if (confirmResolve) confirmResolve(yes);
  confirmResolve = null;
};

function startTasks() {
  tasks = []; adminTasks = []; taskView = "menu"; extendTarget = null;
  const base = ["companies", companyID];
  const admin = currentRole === "ADMIN";
  const col = collection(db, ...base, "tasks");
  // employees run two simple queries (tasks for everyone + their own private ones) and the results are merged
  const sources = admin ? [["all", col]] : [
    ["pub", query(col, where("visibleTo", "array-contains", "ALL"))],
    ["mine", query(col, where("visibleTo", "array-contains", currentUser.uid))]
  ];

  const parts = {}, firstSnap = {}, prevStatus = {}, prevExt = {};
  sources.forEach(([key, q]) => {
    firstSnap[key] = true;
    unsubs.push(onSnapshot(q, (snap) => {
      parts[key] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const seen = {};
      tasks = Object.values(parts).flat().filter((t) => !seen[t.id] && (seen[t.id] = true));

      if (!admin) {
        const uid = currentUser.uid;
        snap.docChanges().forEach((c) => {
          const t = c.doc.data();
          const my = t.completions && t.completions[uid] ? t.completions[uid].status : null;
          const ext = t.extensions ? t.extensions[uid] : null;
          if (!firstSnap[key] && !c.doc.metadata.hasPendingWrites) {
            if (c.type === "added") pushAlert(`<b>📋 New task</b><br><small>${escapeHTML(t.title)}</small>`, "enter");
            else if (c.type === "modified") {
              if (my === "DECLINED" && prevStatus[c.doc.id] !== "DECLINED")
                pushAlert(`<b>❌ Task declined</b><br><small>${escapeHTML(t.title)}<br>Please do it again and re-submit.</small>`, "left");
              else if (my === "APPROVED" && prevStatus[c.doc.id] !== "APPROVED")
                pushAlert(`<b>✅ Task approved</b><br><small>${escapeHTML(t.title)}</small>`, "enter");
              if (ext && ext !== prevExt[c.doc.id])
                pushAlert(`<b>⏳ Deadline extended</b><br><small>${escapeHTML(t.title)}<br>New end: ${fmtMs(ext)}</small>`, "enter");
            }
          }
          prevStatus[c.doc.id] = my; prevExt[c.doc.id] = ext;
        });
      }
      firstSnap[key] = false;
      refreshTaskUI();
    }, (e) => console.error("Task listener:", e)));
  });

  if (admin) {
    unsubs.push(onSnapshot(collection(db, ...base, "adminTasks"), (snap) => {
      adminTasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((x, y) => (y.createdAt?.toMillis?.() || Date.now()) - (x.createdAt?.toMillis?.() || Date.now()));
      renderAdminTaskList();
    }, (e) => console.error("Admin task listener:", e)));
  }
  const h = setInterval(refreshTaskUI, 30000); // so expired tasks move to "Incompleted" by themselves
  unsubs.push(() => clearInterval(h));
}

function refreshTaskUI() { updateTaskBadges(); renderTaskAdmin(false); renderEmpTasks(); }

/* one row per (task, employee) */
function taskRows() {
  const rows = [];
  tasks.forEach((t) => {
    const ids = new Set([...Object.keys(t.assignees || {}), ...Object.keys(t.completions || {})]);
    ids.forEach((uid) => {
      const c = t.completions ? t.completions[uid] : null;
      rows.push({
        t, uid, c,
        name: (t.assignees && t.assignees[uid]) || (c && c.name) || "Employee",
        assigned: !!(t.assignees && t.assignees[uid]),
        end: effEnd(t, uid),
        status: c ? c.status : "PENDING"
      });
    });
  });
  return rows;
}
const isIncomplete = (r) => r.assigned && Date.now() > r.end && r.status !== "SUBMITTED" && r.status !== "APPROVED";

function alertList() {
  const m = {};
  taskRows().filter(isIncomplete).forEach((r) => {
    if (!m[r.uid]) m[r.uid] = { name: r.name, titles: [] };
    m[r.uid].titles.push(r.t.title);
  });
  return Object.values(m).filter((x) => x.titles.length >= 3);
}

function setBadge(id, n) {
  const b = $(id);
  if (!b) return;
  b.innerText = n;
  n > 0 ? b.classList.remove("hidden") : b.classList.add("hidden");
}

function updateTaskBadges() {
  if (currentRole === "ADMIN") {
    setBadge("taskBadge", taskRows().filter((r) => r.status === "SUBMITTED").length + alertList().length);
  } else if (currentRole === "EMPLOYEE" && currentUser) {
    const uid = currentUser.uid, now = Date.now();
    setBadge("taskEmpBadge", tasks.filter((t) => {
      const st = t.completions && t.completions[uid] ? t.completions[uid].status : "PENDING";
      const mine = t.scope === "ALL" || (t.assignees && t.assignees[uid]);
      return mine && st !== "SUBMITTED" && st !== "APPROVED" && now >= t.startAt && now <= effEnd(t, uid);
    }).length);
  }
}

/* ---------- ADMIN: Task Management window ---------- */
window.showTaskModal = () => {
  if (currentRole !== "ADMIN") return;
  taskView = "menu"; extendTarget = null;
  $("taskModal").classList.add("open");
  renderTaskAdmin(true);
};
window.closeTaskModal = () => $("taskModal").classList.remove("open");
window.taskGo = (v) => { taskView = v; extendTarget = null; renderTaskAdmin(true); };

const backBtn = (to) => `<button class="auth-btn" style="background:#666; width:100%; margin-top:12px" onclick="taskGo('${to}')">← Back</button>`;

function infoHTML(r) {
  const t = r.t;
  const type = t.scope === "ALL" ? "All employees" : "Single employee - " + (t.privacy === "PUBLIC" ? "Public" : "Private");
  return `<div class="task-title">${escapeHTML(t.title)}</div>
    <div class="task-meta">👤 ${escapeHTML(r.name)} &middot; ${type}<br>
    🟢 Start: ${fmtMs(t.startAt)}<br>🔴 End: ${fmtMs(r.end)}
    ${r.c && r.c.submittedAt ? "<br>📨 Submitted: " + fmtMs(r.c.submittedAt) : ""}</div>`;
}

function renderTaskAdmin(force) {
  const body = $("taskBody");
  if (!body || !$("taskModal").classList.contains("open")) return;
  if (!force && (FORM_VIEWS.includes(taskView) || extendTarget)) return; // never wipe what the owner is typing

  const rows = taskRows();
  const approvals = rows.filter((r) => r.c).sort((x, y) => (y.c.submittedAt || 0) - (x.c.submittedAt || 0));
  const incomplete = rows.filter(isIncomplete);
  const alerts = alertList();
  const titles = { menu: "📋 Task Management", assignType: "📝 Task Assignment", pick: "Choose Employee", assignAll: "Task for All Employees",
    assignSingle: "Task for " + (taskDraft.name || ""), adminTasks: "🔒 Admin Task (only you can see)",
    approval: "✅ Task Complete Approval", incomplete: "⏰ Incompleted Tasks", alerts: "🚨 Alerts", assigned: "📑 Assigned Tasks" };
  $("taskTitle").innerText = titles[taskView] || "Task Management";
  let h = "";

  if (taskView === "menu") {
    const pend = approvals.filter((r) => r.status === "SUBMITTED").length;
    h = `<button class="role-btn" onclick="taskGo('assignType')">1. Task Assignment</button>
      <button class="role-btn" onclick="taskGo('adminTasks')">2. Admin Task</button>
      <button class="role-btn" onclick="taskGo('approval')">3. Task Complete Approval ${pend ? `<span class="badge-low">${pend}</span>` : ""}</button>
      <button class="role-btn" onclick="taskGo('incomplete')">4. Incompleted Task ${incomplete.length ? `<span class="badge-low">${incomplete.length}</span>` : ""}</button>
      <button class="role-btn" onclick="taskGo('alerts')">5. Alert ${alerts.length ? `<span class="badge-low">${alerts.length}</span>` : ""}</button>
      <button class="role-btn" onclick="taskGo('assigned')">6. Assigned Tasks ${tasks.length ? `<span class="badge-cat">${tasks.length}</span>` : ""}</button>`;
  }

  else if (taskView === "assignType") {
    h = `<p>Is this task for a single employee or for all employees?</p>
      <button class="role-btn" style="background:#6f42c1" onclick="taskGo('pick')">👤 Single Employee</button>
      <button class="role-btn" style="background:#28a745" onclick="taskGo('assignAll')">👥 All Employees</button>${backBtn("menu")}`;
  }

  else if (taskView === "pick") {
    h = staffList.length
      ? staffList.map((s) => `<button class="role-btn" style="background:#222" onclick="pickEmployee('${escapeHTML(s.uid)}')">${escapeHTML(s.name)}</button>`).join("")
      : "<p>No employees have joined yet.</p>";
    h += backBtn("assignType");
  }

  else if (taskView === "assignAll" || taskView === "assignSingle") {
    const single = taskView === "assignSingle";
    h = `<textarea id="taskText" class="task-input" rows="3" placeholder="Type the task here..."></textarea>
      <label class="task-label">Start date &amp; time</label>
      <input id="taskStart" type="datetime-local" value="${dtLocal(Date.now())}" style="width:95%">
      <label class="task-label">End date &amp; time (task must be completed by)</label>
      <input id="taskEnd" type="datetime-local" value="${dtLocal(Date.now() + 86400000)}" style="width:95%">
      ${single ? `<label class="task-label">Privacy</label>
        <div class="task-radio"><label><input type="radio" name="taskPrivacy" value="PUBLIC" checked> Public (all employees can see it)</label><br>
        <label><input type="radio" name="taskPrivacy" value="PRIVATE"> Private (only ${escapeHTML(taskDraft.name || "this employee")} can see it)</label></div>` : ""}
      <button class="role-btn" style="background:#28a745" onclick="submitTask('${single ? "SINGLE" : "ALL"}')">Submit Task</button>
      ${backBtn(single ? "pick" : "assignType")}`;
  }

  else if (taskView === "adminTasks") {
    h = `<div style="display:flex; gap:6px"><input id="adminTaskText" class="task-input" style="flex:1; margin:0" placeholder="Type your own task...">
      <button class="auth-btn" style="background:#28a745" onclick="addAdminTask()">Add</button></div>
      <div id="adminTaskList" style="margin-top:12px"></div>${backBtn("menu")}`;
  }

  else if (taskView === "approval") {
    h = approvals.length ? approvals.map((r) => {
      const ok = r.status === "APPROVED", no = r.status === "DECLINED";
      return `<div class="task-card">
        <button class="bin" title="Delete" onclick="deleteRow('${r.t.id}','${escapeHTML(r.uid)}')">🗑</button>
        <div class="task-info">${infoHTML(r)}<div class="task-note">${ok ? "✅ Approved" : no ? "❌ Declined" : "⏳ Waiting for your decision"}</div></div>
        <div class="decide-col">
          <div class="decide"><div class="dlabel ok">✔</div><div class="dbox ${ok ? "on-ok" : ""}" onclick="decideTask('${r.t.id}','${escapeHTML(r.uid)}','APPROVED')">${ok ? "✔" : ""}</div></div>
          <div class="decide"><div class="dlabel no">✖</div><div class="dbox ${no ? "on-no" : ""}" onclick="decideTask('${r.t.id}','${escapeHTML(r.uid)}','DECLINED')">${no ? "✖" : ""}</div></div>
        </div></div>`;
    }).join("") : "<p>No tasks have been completed by employees yet.</p>";
    h += backBtn("menu");
  }

  else if (taskView === "incomplete") {
    h = incomplete.length ? incomplete.map((r) => {
      const open = extendTarget && extendTarget.id === r.t.id && extendTarget.uid === r.uid;
      return `<div class="task-card" style="flex-wrap:wrap">
        <div class="task-info">${infoHTML(r)}<div class="task-note">❌ Not completed before the end time</div></div>
        <div class="decide-col">
          <button class="edit-btn" onclick="openExtend('${r.t.id}','${escapeHTML(r.uid)}')">⏳ Extend end time</button>
          <button class="bin" title="Delete" onclick="deleteRow('${r.t.id}','${escapeHTML(r.uid)}')">🗑</button>
        </div>
        ${open ? `<div style="width:100%; margin-top:8px"><label class="task-label">New end date &amp; time</label>
          <input id="extendEnd" type="datetime-local" value="${dtLocal(Date.now() + 86400000)}">
          <button class="auth-btn" style="background:#28a745" onclick="submitExtend()">Submit</button>
          <button class="auth-btn" style="background:#666" onclick="closeExtend()">Cancel</button></div>` : ""}
      </div>`;
    }).join("") : "<p>No incompleted tasks 🎉</p>";
    h += backBtn("menu");
  }

  else if (taskView === "alerts") {
    h = alerts.length ? alerts.map((a) => `<div class="task-card" style="border-left:6px solid #dc3545">
      <div class="task-info"><div class="task-title">🚨 ${escapeHTML(a.name)}</div>
      <div class="task-meta">${escapeHTML(a.name)} has not completed his ${a.titles.length} tasks:<br>• ${a.titles.map(escapeHTML).join("<br>• ")}</div></div></div>`).join("")
      : "<p>No alerts. No employee has 3 or more incompleted tasks.</p>";
    h += backBtn("menu");
  }

  else if (taskView === "assigned") {
    const list = [...tasks].sort((x, y) => (y.createdAt?.toMillis?.() || y.startAt || 0) - (x.createdAt?.toMillis?.() || x.startAt || 0));
    h = list.length ? list.map((t) => {
      const type = t.scope === "ALL" ? "All employees" : "Single employee - " + (t.privacy === "PUBLIC" ? "Public (everyone can see)" : "Private (only that employee)");
      const people = rows.filter((r) => r.t.id === t.id);
      const label = (r) => r.status === "APPROVED" ? "✅ Approved" : r.status === "SUBMITTED" ? "🕒 Submitted, waiting for approval"
        : r.status === "DECLINED" ? "❌ Declined" : Date.now() > r.end ? "⏰ Overdue" : Date.now() < t.startAt ? "🗓 Not started" : "⏳ Pending";
      const done = people.filter((r) => r.status === "APPROVED").length;
      return `<div class="task-card" style="flex-direction:column; align-items:stretch">
        <div class="task-title">${escapeHTML(t.title)}</div>
        <div class="task-meta">📌 ${type}<br>
          🗓 Created: ${t.createdAt?.toDate ? t.createdAt.toDate().toLocaleString() : "just now"}<br>
          🟢 Start: ${fmtMs(t.startAt)}<br>🔴 End: ${fmtMs(t.endAt)}<br>
          ✅ Approved: ${done} of ${people.length || (t.scope === "ALL" ? "all employees" : 0)}</div>
        <div class="task-meta" style="margin-top:6px">${people.length ? people.map((r) =>
          `<div>👤 <b>${escapeHTML(r.name)}</b> - ${label(r)}${effEnd(t, r.uid) !== t.endAt ? " (extended to " + fmtMs(effEnd(t, r.uid)) + ")" : ""}</div>`).join("") : "<div>No employee has joined yet.</div>"}</div>
      </div>`;
    }).join("") : "<p>You have not assigned any tasks yet.</p>";
    h += backBtn("menu");
  }

  body.innerHTML = h;
  if (taskView === "adminTasks") renderAdminTaskList();
}

window.pickEmployee = (uid) => {
  const s = staffList.find((x) => x.uid === uid);
  if (!s) return;
  taskDraft = { uid: s.uid, name: s.name };
  taskGo("assignSingle");
};

window.submitTask = async (scope) => {
  const title = normalizeString($("taskText")?.value);
  const s = new Date($("taskStart").value).getTime(), e = new Date($("taskEnd").value).getTime();
  if (!title) return toast("Type the task first");
  if (isNaN(s) || isNaN(e)) return toast("Set the start and end date & time");
  if (e <= s) return toast("End time must be after the start time");
  if (e <= Date.now()) return toast("End time has already passed. Choose a future time");

  const assignees = {};
  let privacy = "ALL", visibleTo = ["ALL"];
  if (scope === "ALL") {
    staffList.forEach((x) => (assignees[x.uid] = x.name));
  } else {
    assignees[taskDraft.uid] = taskDraft.name;
    privacy = document.querySelector('input[name="taskPrivacy"]:checked')?.value || "PUBLIC";
    visibleTo = privacy === "PRIVATE" ? [taskDraft.uid] : ["ALL"];
  }
  try {
    loading(true);
    await addDoc(collection(db, "companies", companyID, "tasks"), {
      title, scope, privacy, visibleTo, assignees, completions: {}, extensions: {},
      startAt: s, endAt: e, createdAt: serverTimestamp(), createdBy: currentUser.uid
    });
    toast("Task submitted to " + (scope === "ALL" ? "all employees" : taskDraft.name));
    taskGo("menu");
  } catch (err) { console.error(err); toast("Could not save task: " + err.message); }
  finally { loading(false); }
};

/* admin-only notes */
function renderAdminTaskList() {
  const el = $("adminTaskList");
  if (!el) return;
  el.innerHTML = adminTasks.length ? adminTasks.map((t) => `<div class="task-card">
      <div class="task-info"><div class="task-title">${escapeHTML(t.text)}</div></div>
      <button class="bin" title="Delete" onclick="delAdminTask('${t.id}')">🗑</button></div>`).join("")
    : "<p>No admin tasks yet.</p>";
}
window.addAdminTask = async () => {
  const text = normalizeString($("adminTaskText")?.value);
  if (!text) return toast("Type a task first");
  try {
    await addDoc(collection(db, "companies", companyID, "adminTasks"), { text, createdAt: serverTimestamp() });
    $("adminTaskText").value = "";
  } catch (err) { console.error(err); toast(err.message); }
};
window.delAdminTask = async (id) => {
  if (!(await askConfirm("Are you sure you want to delete this task?"))) return;
  try { await deleteDoc(doc(db, "companies", companyID, "adminTasks", id)); toast("Task deleted"); }
  catch (err) { console.error(err); toast(err.message); }
};

/* approve / decline */
window.decideTask = async (id, uid, status) => {
  const t = tasks.find((x) => x.id === id);
  if (!t || !t.completions || !t.completions[uid] || t.completions[uid].status === status) return;
  try {
    await updateDoc(doc(db, "companies", companyID, "tasks", id), {
      [`completions.${uid}.status`]: status, [`completions.${uid}.decidedAt`]: Date.now()
    });
    toast(status === "APPROVED" ? "Task approved" : "Task declined - employee notified");
  } catch (err) { console.error(err); toast(err.message); }
};

/* delete one employee's task row (a task for everyone stays for the others) */
window.deleteRow = async (id, uid) => {
  const t = tasks.find((x) => x.id === id);
  if (!t) return;
  if (!(await askConfirm("Are you sure you want to delete this task?"))) return;
  try {
    const ref = doc(db, "companies", companyID, "tasks", id);
    const others = Object.keys(t.assignees || {}).filter((k) => k !== uid).length;
    if (t.scope === "SINGLE" || others === 0) await deleteDoc(ref);
    else await updateDoc(ref, {
      [`assignees.${uid}`]: deleteField(), [`completions.${uid}`]: deleteField(), [`extensions.${uid}`]: deleteField()
    });
    toast("Task deleted");
  } catch (err) { console.error(err); toast(err.message); }
};

/* extend end time */
window.openExtend = (id, uid) => { extendTarget = { id, uid }; renderTaskAdmin(true); };
window.closeExtend = () => { extendTarget = null; renderTaskAdmin(true); };
window.submitExtend = async () => {
  const ms = new Date($("extendEnd").value).getTime();
  if (isNaN(ms) || ms <= Date.now()) return toast("Choose a new end time in the future");
  try {
    await updateDoc(doc(db, "companies", companyID, "tasks", extendTarget.id), { [`extensions.${extendTarget.uid}`]: ms });
    toast("End time extended - employee notified");
    extendTarget = null;
    renderTaskAdmin(true);
  } catch (err) { console.error(err); toast(err.message); }
};

/* ---------- EMPLOYEE: My Tasks window ---------- */
window.showEmpTaskModal = () => { if (currentRole === "EMPLOYEE") { $("empTaskModal").classList.add("open"); renderEmpTasks(); } };
window.closeEmpTaskModal = () => $("empTaskModal").classList.remove("open");

function empCard(t, uid) {
  const mine = t.scope === "ALL" || !!(t.assignees && t.assignees[uid]);
  const c = t.completions ? t.completions[uid] : null;
  const st = c ? c.status : "PENDING";
  const end = effEnd(t, uid), now = Date.now();
  const declined = st === "DECLINED" ? "❌ Declined by owner. " : "";
  let cls = "open", mark = "", note = declined;
  if (!mine) { cls = "locked"; note = `🔒 Given to ${escapeHTML(Object.values(t.assignees || {})[0] || "another employee")}. Only they can complete it`; }
  else if (st === "SUBMITTED") { cls = "done"; mark = "✔"; note = "Submitted - waiting for owner approval"; }
  else if (st === "APPROVED") { cls = "approved"; mark = "✔"; note = "✅ Approved by owner"; }
  else if (now < t.startAt) { cls = "locked"; note += "Starts " + fmtMs(t.startAt); }
  else if (now > end) { cls = "locked"; note += "⏰ Time is over"; }
  else if (!declined) note = "Tap the box when you finish";
  else note += "Do it again and tap the box to re-submit";

  const forWho = t.scope === "SINGLE" && t.privacy === "PUBLIC" ? `👤 For: ${escapeHTML(Object.values(t.assignees || {})[0] || "")}<br>` : "";
  return `<div class="task-card">
    <div class="task-info"><div class="task-title">${escapeHTML(t.title)}</div>
    <div class="task-meta">${forWho}🟢 Start: ${fmtMs(t.startAt)}<br>🔴 End: ${fmtMs(end)}</div>
    <div class="task-note">${note}</div></div>
    <div class="tbox ${cls}" ${cls === "open" ? `onclick="completeTask('${t.id}')"` : ""}>${mark}</div></div>`;
}

function renderEmpTasks() {
  const el = $("empTaskBody");
  if (!el || currentRole !== "EMPLOYEE" || !currentUser) return;
  const uid = currentUser.uid;
  const sections = [
    ["📢 Public tasks (for all employees)", (t) => t.scope === "ALL"],
    ["👥 Tasks given to employees (everyone can see)", (t) => t.scope === "SINGLE" && t.privacy === "PUBLIC"],
    ["🔒 My private tasks", (t) => t.scope === "SINGLE" && t.privacy === "PRIVATE"]
  ];
  el.innerHTML = sections.map(([title, f]) => {
    const list = tasks.filter(f).sort((x, y) => (x.endAt || 0) - (y.endAt || 0));
    return `<h4 class="task-sec">${title}</h4>` + (list.map((t) => empCard(t, uid)).join("") || '<p class="empty">No tasks</p>');
  }).join("");
}

window.completeTask = async (id) => {
  const t = tasks.find((x) => x.id === id);
  if (!t || !currentUser) return;
  const uid = currentUser.uid, now = Date.now();
  const st = t.completions && t.completions[uid] ? t.completions[uid].status : null;
  if (st === "SUBMITTED" || st === "APPROVED") return;
  if (!(t.scope === "ALL" || (t.assignees && t.assignees[uid]))) return toast("This task is not assigned to you");
  if (now < t.startAt) return toast("This task has not started yet");
  if (now > effEnd(t, uid)) return toast("Time is over for this task");
  try {
    await updateDoc(doc(db, "companies", companyID, "tasks", id), {
      [`completions.${uid}`]: { name: displayName || currentUser.email || "Employee", status: "SUBMITTED", submittedAt: now }
    });
    toast("Task submitted for approval");
  } catch (err) { console.error(err); toast(err.message); }
};



/* =====================================================================
   DEVELOPER CONSOLE
   Step checks below only compare HASHES (no passwords in this file).
   The real protection is on the server: the Firestore rules give developer
   powers only to an account whose proof matches appConfig/developer.
   ===================================================================== */
const DEV_STEPS = [
  { label: "Enter developer name", secret: false, lower: true, hash: "992c8c79e7568f0fcded18b890311ecbc0f5182347f08118177ae6b9b686d8ce" },
  { label: "Enter developer password 1", secret: true, lower: false, hash: "5790c19241fd40d679a2dc25ef848f849c45e659e167a0f8683d2c25998fb6f3" },
  { label: "Enter developer password 2", secret: true, lower: false, hash: "6b7d61e562b96f19e67f276d213c0157af5d53f96ae9878d54cf834d0554ca8c" },
  { label: "Enter website name", secret: false, lower: true, hash: "fc33fd094cd5722535875017c04174e17d2940e09ac5ba870b71aeb5e42412d0" }
];
let devStep = 0, devAnswers = [], devFails = 0, devCompanies = [];

window.chooseDeveloper = () => { devStep = 0; devAnswers = []; devFails = 0; showOnly("devLoginPage"); renderDevStep(); };

function renderDevStep() {
  const st = DEV_STEPS[devStep], input = $("devInput");
  $("devPrompt").innerText = st.label;
  input.type = st.secret ? "password" : "text";
  input.placeholder = st.label;
  input.value = "";
  input.focus();
}

window.devNext = async () => {
  const st = DEV_STEPS[devStep];
  let val = normalizeString($("devInput").value);
  if (st.lower) val = val.toLowerCase();
  if ((await sha256(`PI-DEV|${devStep}|${val}`)) !== st.hash) {
    devFails++;
    if (devFails >= 5) { toast("Too many wrong attempts"); return backToRole(); }
    return toast(devStep === 0 ? "Developer not recognised" : "Wrong entry. Try again");
  }
  devAnswers.push(val);
  devStep++;
  if (devStep < DEV_STEPS.length) return renderDevStep();

  try {
    loading(true);
    // the server checks this proof against appConfig/developer before it allows developer access
    const proof = await sha256("PI-DEV-PROOF|" + devAnswers.join("|"));
    await setDoc(doc(db, "developers", currentUser.uid), { uid: currentUser.uid, proof, email: currentUser.email || "" });
    devActive = true;
    showOnly("developerPage");
    await loadDevData();
  } catch (err) {
    console.error(err);
    toast("Server refused developer access. Create the appConfig/developer document first (see setup steps).");
  } finally { loading(false); }
};

window.devExit = () => { devActive = false; showOnly("rolePage"); };

window.loadDevData = async function () {
  try {
    loading(true);
    const snap = await getDocs(collection(db, "companies"));
    devCompanies = [];
    for (const c of snap.docs) {
      const [staff, members] = await Promise.all([
        getDocs(collection(db, "companies", c.id, "staff")),
        getDocs(collection(db, "companies", c.id, "members"))
      ]);
      devCompanies.push({
        id: c.id, ...c.data(),
        staff: staff.docs.map((d) => d.data()),
        admins: members.docs.map((d) => d.data()).filter((m) => m.admin === true || m.role === "ADMIN")
      });
    }
    renderDevData();
  } catch (err) { console.error(err); toast("Could not load companies: " + err.message); }
  finally { loading(false); }
};

function renderDevData() {
  $("devCount").innerText = devCompanies.length;
  $("devBody").innerHTML = devCompanies.length ? devCompanies.map((c) => `
    <div class="task-card" style="flex-direction:column; align-items:stretch; background:rgba(255,255,255,0.95); text-align:left">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap">
        <div><div class="task-title" style="font-size:1.15em">🏢 ${escapeHTML(c.companyName || "(no name)")}</div>
          <div class="task-meta">ID: ${escapeHTML(c.id)}<br>Created: ${c.createdAt?.toDate ? c.createdAt.toDate().toLocaleString() : "-"}<br>
          Admins: ${c.admins.length ? c.admins.map((m) => escapeHTML(m.email || m.uid)).join(", ") : "-"}</div></div>
        <button class="bin" onclick="devDeleteCompany('${escapeHTML(c.id)}')">🗑 Delete Company</button>
      </div>
      <table style="width:100%; margin:10px 0 0; font-size:0.85em; color:#333">
        <thead><tr><th>#</th><th>Employee</th><th>Email</th><th>Joined</th></tr></thead>
        <tbody>${c.staff.length ? c.staff.map((s, n) => `<tr><td>${n + 1}</td><td>${escapeHTML(s.name)}</td><td>${escapeHTML(s.email || "-")}</td>
          <td>${s.joinedAt?.toDate ? s.joinedAt.toDate().toLocaleDateString() : "-"}</td></tr>`).join("") : '<tr><td colspan="4">No employees</td></tr>'}</tbody>
      </table></div>`).join("") : "<p style='color:white'>No companies exist.</p>";
}

window.devDeleteCompany = async (id) => {
  const c = devCompanies.find((x) => x.id === id);
  if (!c) return;
  if (!(await askConfirm(`Delete "${c.companyName}" and ALL its inventory, employees, tasks and history permanently?`))) return;
  try {
    loading(true);
    for (const sub of ["inventory", "history", "attendance", "movements", "staff", "members", "adminTasks", "tasks", "private"]) {
      const docs = (await getDocs(collection(db, "companies", id, sub))).docs;
      for (let i = 0; i < docs.length; i += 400) {
        const batch = writeBatch(db);
        docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    }
    if (c.companyName) await deleteDoc(doc(db, "companyDirectory", await nameKey(c.companyName)));
    await deleteDoc(doc(db, "companies", id));
    toast("Company deleted");
    await loadDevData();
  } catch (err) { console.error(err); toast("Delete failed: " + err.message); }
  finally { loading(false); }
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
