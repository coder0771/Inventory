// ==========================================
// PROFESSIONAL INVENTORY MANAGEMENT SYSTEM
// APP.JS
// ==========================================

/* ==========================================
FIREBASE IMPORTS
========================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ==========================================
FIREBASE CONFIG
========================================== */
const firebaseConfig = {
  apiKey: "AIzaSyDOftyWbEg1H4bkrPpHd_fE5ymQNpSK6LU",
  authDomain: "inventory-app-ad3c6.firebaseapp.com",
  projectId: "inventory-app-ad3c6",
  storageBucket: "inventory-app-ad3c6.firebasestorage.app",
  messagingSenderId: "150702776400",
  appId: "1:150702776400:web:b492e1e811e14c80063155",
  measurementId: "G-4D6KQBVWLR"
};

/* ==========================================
INITIALIZE FIREBASE
========================================== */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

/* ==========================================
GLOBAL STATE & UNLISTENERS
========================================== */
let currentUser = null;
let companyID = "";
let companyData = null;
let inventory = [];
let selectedItem = null;
let currentRole = "";

// Firebase real-time unsubscribers
let unsubscribeInventory = null;
let unsubscribeHistory = null;
let unsubscribeAttendance = null;

/* ==========================================
HELPERS
========================================== */
function $(id) {
  return document.getElementById(id);
}

function show(id) {
  const el = $(id);
  if (el) el.classList.remove("hidden");
}

function hide(id) {
  const el = $(id);
  if (el) el.classList.add("hidden");
}

function toast(message) {
  const t = $("toast");
  if (!t) return;
  t.innerText = message;
  t.classList.add("show");
  setTimeout(() => {
    t.classList.remove("show");
  }, 3000);
}

function loading(state) {
  if (state) {
    show("loadingOverlay");
  } else {
    hide("loadingOverlay");
  }
}

function escapeHTML(str) {
  if (!str) return "";
  return String(str).replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

// Ensures inputs are clean strings
function normalizeString(val) {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

/* ==========================================
AUTH STATE
========================================== */
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    hide("loginPage");
    show("rolePage");
  } else {
    currentUser = null;
    unsubscribeAllListeners();
    hide("rolePage");
    hide("app");
    show("loginPage");
  }
});

function unsubscribeAllListeners() {
  if (unsubscribeInventory) unsubscribeInventory();
  if (unsubscribeHistory) unsubscribeHistory();
  if (unsubscribeAttendance) unsubscribeAttendance();
  unsubscribeInventory = null;
  unsubscribeHistory = null;
  unsubscribeAttendance = null;
}

/* ==========================================
EMAIL SIGNUP
========================================== */
window.signup = async function () {
  const email = normalizeString($("email")?.value);
  const password = normalizeString($("password")?.value);

  if (!email || !password) {
    toast("Enter email and password");
    return;
  }

  try {
    loading(true);
    await createUserWithEmailAndPassword(auth, email, password);
    toast("Account created successfully");
  } catch (err) {
    console.error("Signup error:", err);
    toast(err.message);
  } finally {
    loading(false);
  }
};

/* ==========================================
EMAIL LOGIN
========================================== */
window.emailLogin = async function () {
  const email = normalizeString($("email")?.value);
  const password = normalizeString($("password")?.value);

  if (!email || !password) {
    toast("Enter email and password");
    return;
  }

  try {
    loading(true);
    await signInWithEmailAndPassword(auth, email, password);
    toast("Login Successful");
  } catch (err) {
    console.error("Email login error:", err);
    toast(err.message);
  } finally {
    loading(false);
  }
};

/* ==========================================
GOOGLE LOGIN
========================================== */
window.googleLogin = async function () {
  try {
    loading(true);
    await signInWithPopup(auth, googleProvider);
    toast("Google Login Successful");
  } catch (err) {
    console.error("Google login error:", err);
    toast(err.message);
  } finally {
    loading(false);
  }
};

/* ==========================================
LOGOUT
========================================== */
window.logout = async function () {
  try {
    await signOut(auth);

    companyID = "";
    companyData = null;
    inventory = [];
    currentRole = "";

    hide("app");
    hide("rolePage");
    show("loginPage");

    toast("Logged Out");
  } catch (err) {
    console.error("Logout error:", err);
    toast(err.message);
  }
};

/* ==========================================
ROLE NAVIGATION
========================================== */
window.chooseAdmin = function () {
  hide("rolePage");
  show("adminChoicePage");
};

window.chooseEmployee = function () {
  hide("rolePage");
  show("employeePage");
};

window.backToRole = function () {
  hide("employeePage");
  hide("adminChoicePage");
  hide("createCompanyPage");
  hide("companyLoginPage");
  hide("adminPasswordPage");
  show("rolePage");
};

window.showCreateCompany = function () {
  hide("adminChoicePage");
  show("createCompanyPage");
};

window.showCompanyLogin = function () {
  hide("adminChoicePage");
  show("companyLoginPage");
};

window.backToAdminChoice = function () {
  hide("createCompanyPage");
  hide("companyLoginPage");
  hide("adminPasswordPage");
  show("adminChoicePage");
};

/* ==========================================
CREATE COMPANY
========================================== */
window.createCompany = async function () {
  const companyName = normalizeString($("companyName")?.value);
  const adminPassword = normalizeString($("adminPassword")?.value);
  const inputCode = normalizeString($("joinCode")?.value || $("companyCode")?.value);

  if (!companyName || !adminPassword || !inputCode) {
    toast("Please fill all fields");
    return;
  }

  try {
    loading(true);

    const q = query(
      collection(db, "companies"),
      where("companyName", "==", companyName)
    );

    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      toast("Company already exists");
      return;
    }

    const companyPayload = {
      companyName: companyName,
      companyCode: inputCode,
      joinCode: inputCode,
      adminPassword: adminPassword,
      adminUID: currentUser.uid,
      createdAt: serverTimestamp()
    };

    const companyRef = await addDoc(collection(db, "companies"), companyPayload);

    companyID = companyRef.id;
    companyData = companyPayload;

    currentRole = "ADMIN";
    openDashboard();
    toast("Company Created Successfully");
  } catch (err) {
    console.error("Error creating company:", err);
    toast("Firestore Write Failed: " + err.message);
  } finally {
    loading(false);
  }
};

/* ==========================================
FIND COMPANY / VERIFY COMPANY
========================================== */
window.findCompany = async function () {
  const companyName = normalizeString($("loginCompany")?.value);
  const inputCode = normalizeString($("loginCompanyCode")?.value || $("loginJoinCode")?.value);

  if (!companyName) {
    toast("Enter Company Name");
    return;
  }

  try {
    loading(true);

    const q = query(
      collection(db, "companies"),
      where("companyName", "==", companyName)
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      toast("Invalid Company Name");
      return;
    }

    const docSnap = snapshot.docs[0];
    const data = docSnap.data();

    const storedCode = normalizeString(data.companyCode || data.joinCode);

    if (inputCode && storedCode !== inputCode) {
      toast("Invalid Company Code");
      return;
    }

    companyID = docSnap.id;
    companyData = data;

    if ($("companyLabel")) $("companyLabel").innerText = companyData.companyName;

    hide("companyLoginPage");
    show("adminPasswordPage");
  } catch (err) {
    console.error("Error finding company:", err);
    toast("Firestore Read Error: " + err.message);
  } finally {
    loading(false);
  }
};

/* ==========================================
ADMIN LOGIN
========================================== */
window.adminLogin = function () {
  const password = normalizeString($("loginAdminPassword")?.value);

  if (password !== companyData.adminPassword) {
    toast("Wrong Password");
    return;
  }

  if (currentUser.uid !== companyData.adminUID) {
    toast("This Google account is not the owner.");
    return;
  }

  currentRole = "ADMIN";
  openDashboard();
};

/* ==========================================
EMPLOYEE LOGIN
========================================== */
window.employeeLogin = async function () {
  const employeeName = normalizeString($("employeeName")?.value);
  const joinCode = normalizeString($("employeeJoinCode")?.value || $("employeeCompanyCode")?.value);

  if (!employeeName || !joinCode) {
    toast("Fill all fields");
    return;
  }

  try {
    loading(true);

    let snapshot = await getDocs(
      query(collection(db, "companies"), where("companyCode", "==", joinCode))
    );

    if (snapshot.empty) {
      snapshot = await getDocs(
        query(collection(db, "companies"), where("joinCode", "==", joinCode))
      );
    }

    if (snapshot.empty) {
      toast("Invalid Company Code / Join Code");
      return;
    }

    companyID = snapshot.docs[0].id;
    companyData = snapshot.docs[0].data();
    currentRole = "EMPLOYEE";

    await addDoc(collection(db, "companies", companyID, "staff"), {
      uid: currentUser.uid,
      name: employeeName,
      joinedAt: serverTimestamp()
    });

    openDashboard();
  } catch (err) {
    console.error("Employee login error:", err);
    toast("Firestore Read Error: " + err.message);
  } finally {
    loading(false);
  }
};

/* ==========================================
OPEN DASHBOARD
========================================== */
function openDashboard() {
  hide("rolePage");
  hide("employeePage");
  hide("adminChoicePage");
  hide("createCompanyPage");
  hide("companyLoginPage");
  hide("adminPasswordPage");

  show("app");

  if ($("companyTitle")) $("companyTitle").innerText = companyData.companyName;
  if ($("roleBadge")) $("roleBadge").innerText = currentRole;

  startRealtime();
}

/* ==========================================
REALTIME LISTENERS
========================================== */
function startRealtime() {
  if (!companyID) return;

  unsubscribeAllListeners();

  // Inventory Realtime Listener
  unsubscribeInventory = onSnapshot(
    collection(db, "companies", companyID, "inventory"),
    (snapshot) => {
      inventory = [];
      snapshot.forEach((docSnap) => {
        inventory.push({
          id: docSnap.id,
          ...docSnap.data()
        });
      });

      renderInventory();
      updateDashboard();
    },
    (err) => {
      console.error("Inventory snapshot error:", err);
    }
  );

  startHistoryListener();
  startAttendanceListener();
}

/* ==========================================
ADD PRODUCT
========================================== */
window.addItem = async function () {
  const name = normalizeString($("itemName")?.value);
  const category = normalizeString($("itemCategory")?.value) || "General";
  const size = normalizeString($("itemSize")?.value) || "-";
  const unit = normalizeString($("itemUnit")?.value) || "pcs";

  const qty = Number($("itemQty")?.value) || 0;
  const price = Number($("itemPrice")?.value) || 0;
  const minQty = Number($("itemMinQty")?.value) || 5;

  if (!name) {
    toast("Enter Product Name");
    return;
  }

  try {
    loading(true);

    await addDoc(collection(db, "companies", companyID, "inventory"), {
      name,
      category,
      size,
      unit,
      qty,
      hold: 0,
      price,
      minQty,
      createdBy: currentUser.uid,
      createdAt: serverTimestamp()
    });

    toast("Product Added");
    clearProductForm();
  } catch (err) {
    console.error("Add item error:", err);
    toast("Failed to add product: " + err.message);
  } finally {
    loading(false);
  }
};

function clearProductForm() {
  if ($("itemName")) $("itemName").value = "";
  if ($("itemCategory")) $("itemCategory").value = "";
  if ($("itemSize")) $("itemSize").value = "";
  if ($("itemUnit")) $("itemUnit").value = "";
  if ($("itemQty")) $("itemQty").value = "";
  if ($("itemPrice")) $("itemPrice").value = "";
  if ($("itemMinQty")) $("itemMinQty").value = 5;
}

/* ==========================================
UPDATE DASHBOARD METRICS
========================================== */
function updateDashboard() {
  if ($("totalItems")) $("totalItems").innerText = inventory.length;

  let low = 0;
  let totalVal = 0;

  inventory.forEach((item) => {
    if (item.qty <= item.minQty) {
      low++;
    }
    totalVal += item.qty * item.price;
  });

  if ($("lowStock")) $("lowStock").innerText = low;
  if ($("totalValue")) $("totalValue").innerText = totalVal.toLocaleString();
}

/* ==========================================
RENDER INVENTORY
========================================== */
function renderInventory() {
  const body = $("inventoryBody");
  if (!body) return;

  body.innerHTML = "";

  inventory.forEach((item) => {
    const isLow = item.qty <= item.minQty;
    const rowClass = isLow ? 'class="low-stock-row"' : "";

    body.innerHTML += `
      <tr ${rowClass}>
        <td><strong>${escapeHTML(item.name)}</strong></td>
        <td>${escapeHTML(item.category)}</td>
        <td>${escapeHTML(item.size)}</td>
        <td>${escapeHTML(item.unit)}</td>
        <td>${item.qty} ${isLow ? '<span class="badge-low">LOW</span>' : ''}</td>
        <td>${item.hold}</td>
        <td>${item.minQty}</td>
        <td>₹${item.price}</td>
        <td>₹${(item.qty * item.price).toLocaleString()}</td>
        <td>
          <button class="edit-btn" onclick="editItem('${item.id}')">Edit</button>
        </td>
      </tr>
    `;
  });
}

/* ==========================================
EDIT & MODAL HANDLERS
========================================== */
window.editItem = function (id) {
  selectedItem = inventory.find((item) => item.id === id);
  if (!selectedItem) return;

  if ($("editName")) $("editName").value = selectedItem.name;
  if ($("editCategory")) $("editCategory").value = selectedItem.category;
  if ($("editSize")) $("editSize").value = selectedItem.size;
  if ($("editUnit")) $("editUnit").value = selectedItem.unit;
  if ($("editPrice")) $("editPrice").value = selectedItem.price;
  if ($("editMinQty")) $("editMinQty").value = selectedItem.minQty;

  if ($("currentStock")) $("currentStock").innerText = selectedItem.qty;
  if ($("currentHold")) $("currentHold").innerText = selectedItem.hold;
  if ($("transactionQty")) $("transactionQty").value = "";

  show("editModal");
};

window.closeEditModal = function () {
  hide("editModal");
  selectedItem = null;
};

window.saveItem = async function () {
  if (!selectedItem) return;

  try {
    loading(true);

    await updateDoc(
      doc(db, "companies", companyID, "inventory", selectedItem.id),
      {
        name: normalizeString($("editName")?.value),
        category: normalizeString($("editCategory")?.value),
        size: normalizeString($("editSize")?.value),
        unit: normalizeString($("editUnit")?.value),
        price: Number($("editPrice")?.value) || 0,
        minQty: Number($("editMinQty")?.value) || 0
      }
    );

    toast("Product Updated");
    closeEditModal();
  } catch (err) {
    console.error("Save item error:", err);
    toast(err.message);
  } finally {
    loading(false);
  }
};

window.deleteItem = async function () {
  if (!selectedItem) return;

  if (!confirm("Delete this product?")) return;

  try {
    loading(true);
    await deleteDoc(
      doc(db, "companies", companyID, "inventory", selectedItem.id)
    );

    toast("Product Deleted");
    closeEditModal();
  } catch (err) {
    console.error("Delete item error:", err);
    toast(err.message);
  } finally {
    loading(false);
  }
};

/* ==========================================
UPDATE STOCK
========================================== */
async function updateStock(type) {
  if (!selectedItem) return;

  const qty = Number($("transactionQty")?.value);

  if (isNaN(qty) || qty <= 0) {
    toast("Enter a valid Quantity");
    return;
  }

  let stock = Number(selectedItem.qty) || 0;
  let hold = Number(selectedItem.hold) || 0;

  switch (type) {
    case "IN":
      stock += qty;
      break;

    case "OUT":
      if (stock < qty) {
        toast("Insufficient Stock");
        return;
      }
      stock -= qty;
      break;

    case "HOLD":
      if (stock < qty) {
        toast("Insufficient Stock");
        return;
      }
      stock -= qty;
      hold += qty;
      break;

    case "RELEASE":
      if (hold < qty) {
        toast("Not Enough Hold Stock");
        return;
      }
      hold -= qty;
      stock += qty;
      break;
  }

  try {
    loading(true);

    await updateDoc(
      doc(db, "companies", companyID, "inventory", selectedItem.id),
      { qty: stock, hold: hold }
    );

    await addHistory(type, qty, selectedItem.name);

    toast("Stock Updated");
    closeEditModal();
  } catch (err) {
    console.error("Update stock error:", err);
    toast(err.message);
  } finally {
    loading(false);
  }
}

window.stockIn = () => updateStock("IN");
window.stockOut = () => updateStock("OUT");
window.holdStock = () => updateStock("HOLD");
window.releaseStock = () => updateStock("RELEASE");

/* ==========================================
AUDIT HISTORY
========================================== */
async function addHistory(action, qty, itemName) {
  try {
    await addDoc(collection(db, "companies", companyID, "history"), {
      action,
      qty,
      item: itemName,
      user: currentUser.email || "Unknown",
      time: serverTimestamp()
    });
  } catch (err) {
    console.error("Audit log error:", err);
  }
}

function startHistoryListener() {
  unsubscribeHistory = onSnapshot(
    query(
      collection(db, "companies", companyID, "history"),
      orderBy("time", "desc")
    ),
    (snapshot) => {
      const body = $("historyBody");
      if (!body) return;

      body.innerHTML = "";

      snapshot.forEach((docSnap) => {
        const h = docSnap.data();
        const formattedTime = h.time?.toDate ? h.time.toDate().toLocaleString() : "";

        body.innerHTML += `
          <tr>
            <td>${formattedTime}</td>
            <td>${escapeHTML(h.user)}</td>
            <td><strong>${escapeHTML(h.action)}</strong></td>
            <td>${escapeHTML(h.item)}</td>
            <td>${h.qty}</td>
          </tr>
        `;
      });
    },
    (err) => console.error("History snapshot error:", err)
  );
}

window.showHistoryModal = function () {
  show("historyModal");
};

window.closeHistoryModal = function () {
  hide("historyModal");
};

/* ==========================================
ATTENDANCE
========================================== */
window.markAttendance = function () {
  if (!navigator.geolocation) {
    toast("Geolocation not supported");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      try {
        await addDoc(collection(db, "companies", companyID, "attendance"), {
          name: currentUser.email || "Employee",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          time: serverTimestamp()
        });

        toast("Attendance Marked");
      } catch (err) {
        console.error("Attendance error:", err);
        toast(err.message);
      }
    },
    (err) => {
      toast("Location Error: " + err.message);
    }
  );
};

function startAttendanceListener() {
  unsubscribeAttendance = onSnapshot(
    query(
      collection(db, "companies", companyID, "attendance"),
      orderBy("time", "desc")
    ),
    (snapshot) => {
      const body = $("attendanceBody");
      if (!body) return;

      body.innerHTML = "";

      snapshot.forEach((docSnap) => {
        const a = docSnap.data();
        const formattedTime = a.time?.toDate ? a.time.toDate().toLocaleString() : "";

        body.innerHTML += `
          <tr>
            <td>${escapeHTML(a.name)}</td>
            <td>${formattedTime}</td>
            <td>${a.latitude}</td>
            <td>${a.longitude}</td>
          </tr>
        `;
      });
    },
    (err) => console.error("Attendance snapshot error:", err)
  );
}

window.showAttendanceModal = function () {
  show("attendanceModal");
};

window.closeAttendanceModal = function () {
  hide("attendanceModal");
};

/* ==========================================
SEARCH
========================================== */
window.filterInventory = function () {
  const text = normalizeString($("search")?.value).toLowerCase();
  const rows = $("inventoryBody")?.getElementsByTagName("tr") || [];

  for (let row of rows) {
    row.style.display = row.innerText.toLowerCase().includes(text) ? "" : "none";
  }
};

/* ==========================================
EXPORT TO CSV
========================================== */
window.exportInventory = function () {
  if (!inventory || inventory.length === 0) {
    toast("No inventory data to export");
    return;
  }

  let csv = "Name,Category,Size,Unit,Qty,Hold,MinQty,Price\n";

  inventory.forEach((item) => {
    csv += `"${item.name}","${item.category}","${item.size}","${item.unit}",${item.qty},${item.hold},${item.minQty},${item.price}\n`;
  });

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${companyData?.companyName || "inventory"}_export.csv`;
  a.click();
  URL.revokeObjectURL(url);
};
