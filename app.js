import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut, 
    GoogleAuthProvider, 
    signInWithPopup 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- FIREBASE INITIALIZATION ---
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

// --- STATE MANAGEMENT ---
let currentCompanyDocId = "";
let wsData = null;
let inventory = [];
let historyLog = [];
let staff = [];
let attendanceRecords = [];
let activeUser = { role: null, name: "" };
let editIdx = -1;

// --- AUTHENTICATION ---
window.emailLogin = () => {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    if(!email || !password) return alert("Please enter email and password");
    signInWithEmailAndPassword(auth, email, password).catch(e => alert("Login Error: " + e.message));
};

window.signup = () => {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    if(!email || !password) return alert("Please enter email and password");
    createUserWithEmailAndPassword(auth, email, password).catch(e => alert("Signup Error: " + e.message));
};

window.googleLogin = () => {
    signInWithPopup(auth, googleProvider).catch(e => alert("Google Login Error: " + e.message));
};

window.handleLogout = () => {
    signOut(auth).then(() => location.reload()).catch(e => alert(e.message));
};

onAuthStateChanged(auth, (user) => {
    if(user) {
        document.getElementById("loginPage").classList.add("hidden");
        document.getElementById("rolePage").classList.remove("hidden");
    }
});

// --- NAVIGATION ---
window.chooseAdminPath = () => {
    document.getElementById("rolePage").classList.add("hidden");
    document.getElementById("adminChoicePage").classList.remove("hidden");
};

window.backToRoles = () => {
    document.getElementById("adminChoicePage").classList.add("hidden");
    document.getElementById("rolePage").classList.remove("hidden");
};

window.openWorkspace = (role, mode) => {
    document.getElementById("rolePage").classList.add("hidden");
    document.getElementById("adminChoicePage").classList.add("hidden");
    document.getElementById("wsEntryPage").classList.remove("hidden");

    if(role === 'admin') {
        document.getElementById("adminArea").classList.remove("hidden");
        document.getElementById("empArea").classList.add("hidden");
        if(mode === 'new') {
            document.getElementById("setupView").classList.remove("hidden");
            document.getElementById("loginCompView").classList.add("hidden");
            document.getElementById("wsTitle").innerText = "Setup New Company";
        } else {
            document.getElementById("loginCompView").classList.remove("hidden");
            document.getElementById("setupView").classList.add("hidden");
            document.getElementById("wsTitle").innerText = "Admin Login";
        }
    } else {
        document.getElementById("empArea").classList.remove("hidden");
        document.getElementById("adminArea").classList.add("hidden");
        document.getElementById("wsTitle").innerText = "Employee Join";
    }
};

// --- FIRESTORE PERSISTENCE HELPERS ---
async function syncToCloud() {
    if (!currentCompanyDocId) return;
    const compRef = doc(db, "companies", currentCompanyDocId);
    await updateDoc(compRef, {
        inventory: inventory,
        historyLog: historyLog,
        staff: staff,
        attendanceRecords: attendanceRecords
    });
}

async function loadCompanyData(companyName) {
    const docId = companyName.toLowerCase().replace(/\s+/g, "_");
    const compRef = doc(db, "companies", docId);
    const snap = await getDoc(compRef);

    if (snap.exists()) {
        const data = snap.data();
        currentCompanyDocId = docId;
        wsData = data.settings;
        inventory = data.inventory || [];
        historyLog = data.historyLog || [];
        staff = data.staff || [];
        attendanceRecords = data.attendanceRecords || [];
        return true;
    }
    return false;
}

// --- SETUP AND LOGIN LOGIC ---
window.setupWS = async () => {
    const name = document.getElementById("cName").value.trim();
    const pass = document.getElementById("aPass").value.trim();
    const code = document.getElementById("jCode").value.trim();
    
    if(!name || !pass || !code) return alert("Fill all fields");

    const docId = name.toLowerCase().replace(/\s+/g, "_");
    const compRef = doc(db, "companies", docId);
    const existingSnap = await getDoc(compRef);

    if (existingSnap.exists()) {
        return alert("A company with this name already exists. Please choose a unique name or log in.");
    }

    wsData = { name, adminPass: pass, joinCode: code };
    currentCompanyDocId = docId;

    await setDoc(compRef, {
        settings: wsData,
        inventory: [],
        historyLog: [],
        staff: [],
        attendanceRecords: []
    });

    startApp("ADMIN", "Owner");
};

window.checkAdmin = async () => {
    const compName = document.getElementById("adminCompSearch").value.trim();
    const pass = document.getElementById("adminKey").value.trim();

    if(!compName || !pass) return alert("Please enter Company Name and Admin Password");

    const found = await loadCompanyData(compName);
    if (!found) return alert("Company does not exist!");

    if (pass === wsData.adminPass) {
        startApp("ADMIN", "Owner");
    } else {
        alert("Incorrect Admin Password!");
    }
};

window.checkEmp = async () => {
    const compName = document.getElementById("eComp").value.trim();
    const empName = document.getElementById("eName").value.trim();
    const code = document.getElementById("eCode").value.trim();

    if (!compName || !empName || !code) {
        return alert("Please fill in all fields (Company Name, Your Name, Join Code).");
    }

    const found = await loadCompanyData(compName);
    if (!found) return alert("Company does not exist!");

    if (code === wsData.joinCode) {
        if (!staff.includes(empName)) {
            staff.push(empName);
            await syncToCloud();
        }
        startApp("EMPLOYEE", empName);
    } else {
        alert("Invalid Join Code!");
    }
};

function startApp(role, name) {
    activeUser = { role, name };
    document.getElementById("wsEntryPage").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    document.getElementById("headerCompName").innerText = wsData ? wsData.name : "COMPANY";
    document.getElementById("roleTag").innerText = role;

    if(role === 'ADMIN') {
        document.getElementById("staffDisplay").classList.remove("hidden");
        document.getElementById("viewAttBtn").classList.remove("hidden");
        document.getElementById("staffNames").innerText = staff.length ? staff.join(", ") : "None";
    } else {
        document.getElementById("markAttBtn").classList.remove("hidden");
    }
    render();
}

// --- LOGGING & INVENTORY RENDER ---
async function logAction(item, action, qty) {
    historyLog.unshift({
        time: new Date().toLocaleString(),
        user: activeUser.name || activeUser.role,
        item: item,
        action: action,
        qty: qty
    });
    await syncToCloud();
}

function updateCategoryDropdown() {
    const catSelect = document.getElementById("categoryFilter");
    const selectedVal = catSelect.value;
    const categories = Array.from(new Set(inventory.map(i => i.category || 'General')));
    let optionsHTML = '<option value="ALL">All Categories</option>';
    categories.forEach(cat => { optionsHTML += `<option value="${cat}">${cat}</option>`; });
    catSelect.innerHTML = optionsHTML;
    catSelect.value = categories.includes(selectedVal) || selectedVal === "ALL" ? selectedVal : "ALL";
}

function render(data = inventory) {
    let h = "", v = 0, lowCount = 0;
    updateCategoryDropdown();

    inventory.forEach(i => {
        if (i.qty <= (i.minQty !== undefined ? i.minQty : 5)) lowCount++;
    });

    data.forEach((i) => {
        const sub = (i.qty + (i.hold || 0)) * i.price;
        v += sub;
        const minAlert = i.minQty !== undefined ? i.minQty : 5;
        const isLow = i.qty <= minAlert;
        const rowClass = isLow ? 'class="low-stock-row"' : '';

        h += `<tr ${rowClass}>
            <td>${i.name || 'Unnamed Item'} ${isLow ? '<span class="badge-low">LOW</span>' : ''}</td>
            <td><span class="badge-cat">${i.category || 'General'}</span></td>
            <td>${i.size || '-'}</td>
            <td>${i.unit || '-'}</td>
            <td><b>${i.qty}</b></td>
            <td>${minAlert}</td>
            <td style="color:purple"><b>${i.hold || 0}</b></td>
            <td>₹${i.price}</td>
            <td>₹${sub.toLocaleString()}</td>
            <td><button class="edit-btn main-nav" onclick="openModal(${inventory.indexOf(i)})">Update</button></td>
        </tr>`;
    });

    document.getElementById("list").innerHTML = h;
    document.getElementById("totalItems").innerText = inventory.length;
    document.getElementById("lowStockCount").innerText = lowCount;
    document.getElementById("totalValue").innerText = v.toLocaleString();
}

window.addItem = async () => {
    const name = document.getElementById("itemName").value.trim() || "Unnamed Item";
    const category = document.getElementById("itemCat").value.trim() || "General";
    const qty = +document.getElementById("itemQty").value || 0;
    const price = +document.getElementById("itemPrice").value || 0;
    const minQty = +document.getElementById("itemMinQty").value || 5;

    inventory.push({ 
        name, category,
        size: document.getElementById("itemSize").value || "-", 
        unit: document.getElementById("itemUnit").value || "-", 
        qty, hold: 0, price, minQty
    });

    await logAction(name, "ADD ITEM", qty);
    
    document.getElementById("itemName").value = "";
    document.getElementById("itemCat").value = "";
    document.getElementById("itemSize").value = "";
    document.getElementById("itemUnit").value = "";
    document.getElementById("itemQty").value = "";
    document.getElementById("itemPrice").value = "";
    document.getElementById("itemMinQty").value = "5";

    render();
};

window.openModal = (index) => {
    editIdx = index;
    const item = inventory[index];
    document.getElementById("modalTitle").innerText = "Item: " + (item.name || 'Unnamed Item');
    document.getElementById("curStock").innerText = item.qty;
    document.getElementById("curHold").innerText = item.hold || 0;
    document.getElementById("transAmt").value = "";
    
    if(activeUser.role === "ADMIN") {
        document.getElementById("adminEditGroup").classList.remove("hidden");
        document.getElementById("adminDeleteGroup").classList.remove("hidden");
        document.getElementById("editName").value = item.name || "";
        document.getElementById("editCat").value = item.category || "General";
        document.getElementById("editSize").value = item.size || "-";
        document.getElementById("editUnit").value = item.unit || "-";
        document.getElementById("editPrice").value = item.price || 0;
        document.getElementById("editMinQty").value = item.minQty !== undefined ? item.minQty : 5;
    } else {
        document.getElementById("adminEditGroup").classList.add("hidden");
        document.getElementById("adminDeleteGroup").classList.add("hidden");
    }
    document.getElementById("editModal").style.display = "flex";
};

window.saveItemDetails = async () => {
    if(editIdx < 0) return;
    const item = inventory[editIdx];

    item.name = document.getElementById("editName").value.trim() || "Unnamed Item";
    item.category = document.getElementById("editCat").value.trim() || "General";
    item.size = document.getElementById("editSize").value || "-";
    item.unit = document.getElementById("editUnit").value || "-";
    item.price = +document.getElementById("editPrice").value || 0;
    item.minQty = +document.getElementById("editMinQty").value || 5;

    await logAction(item.name, "UPDATE DETAILS", 0);
    render();
    closeModal();
};

window.doTrans = async (mode) => {
    const amt = +document.getElementById("transAmt").value || 0;
    const item = inventory[editIdx];

    if(activeUser.role === "ADMIN") {
        item.name = document.getElementById("editName").value.trim() || "Unnamed Item";
        item.category = document.getElementById("editCat").value.trim() || "General";
        item.size = document.getElementById("editSize").value || "-";
        item.unit = document.getElementById("editUnit").value || "-";
        item.price = +document.getElementById("editPrice").value || 0;
        item.minQty = +document.getElementById("editMinQty").value || 5;
    }

    if(mode === 'in') { item.qty += amt; await logAction(item.name, "STOCK IN", amt); }
    else if(mode === 'out') { 
        if(item.qty < amt) return alert("Low Stock"); 
        item.qty -= amt; 
        await logAction(item.name, "STOCK OUT", amt); 
    }
    else if(mode === 'hold') { 
        if(item.qty < amt) return alert("Low Stock"); 
        item.qty -= amt; 
        item.hold = (item.hold || 0) + amt; 
        await logAction(item.name, "HOLD", amt); 
    }
    else if(mode === 'rel') { 
        item.qty += (item.hold || 0); 
        await logAction(item.name, "RELEASE HOLD", item.hold); 
        item.hold = 0; 
    }
    else if(mode === 'fin') { 
        await logAction(item.name, "FINAL OUT", item.hold); 
        item.hold = 0; 
    }

    render(); 
    closeModal();
};

window.deleteItem = async () => {
    if(confirm("Delete this item?")) {
        const item = inventory[editIdx];
        inventory.splice(editIdx, 1);
        await logAction(item.name, "DELETE ITEM", item.qty);
        render(); 
        closeModal();
    }
};

window.closeModal = () => { document.getElementById("editModal").style.display = "none"; };

window.filterItems = () => { 
    const query = document.getElementById("search").value.toLowerCase(); 
    const cat = document.getElementById("categoryFilter").value;

    const filtered = inventory.filter(i => {
        const matchesQuery = (i.name || "").toLowerCase().includes(query);
        const matchesCat = (cat === "ALL") || ((i.category || "General") === cat);
        return matchesQuery && matchesCat;
    });

    render(filtered); 
};

// --- ATTENDANCE & MODALS ---
window.showHistoryModal = () => {
    const body = document.getElementById("historyTableBody");
    body.innerHTML = historyLog.map(rec => `<tr><td>${rec.time}</td><td>${rec.user}</td><td>${rec.item}</td><td><b>${rec.action}</b></td><td>${rec.qty}</td></tr>`).join("");
    document.getElementById("historyModal").style.display = "flex";
};
window.closeHistoryModal = () => { document.getElementById("historyModal").style.display = "none"; };

window.showAttendanceModal = () => {
    const body = document.getElementById("attendanceTableBody");
    body.innerHTML = attendanceRecords.map(rec => `<tr><td>${rec.name}</td><td>${rec.date}</td><td>${rec.time}</td></tr>`).join("");
    document.getElementById("attendanceModal").style.display = "flex";
};
window.closeAttendanceModal = () => { document.getElementById("attendanceModal").style.display = "none"; };

window.markAttendance = async () => {
    const now = new Date();
    attendanceRecords.unshift({
        name: activeUser.name,
        date: now.toLocaleDateString(),
        time: now.toLocaleTimeString()
    });

    await syncToCloud();
    alert("Attendance marked successfully for " + activeUser.name);
};

// --- KEYBOARD NAVIGATION ---
document.addEventListener("keydown", (e) => {
    const isModalOpen = document.getElementById("editModal").style.display === "flex";
    if (document.activeElement.id === "search" && e.key === "ArrowDown") {
        e.preventDefault();
        const firstBtn = document.querySelector("#list .edit-btn");
        if (firstBtn) firstBtn.focus();
        return;
    }
    const els = Array.from(document.querySelectorAll(isModalOpen ? ".modal-nav" : ".main-nav"));
    const i = els.indexOf(document.activeElement);
    if (i !== -1) {
        if(e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); (els[i+1] || els[0]).focus(); }
        if(e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); (els[i-1] || els[els.length-1]).focus(); }
    }
});
