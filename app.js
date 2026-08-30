let inventory = JSON.parse(localStorage.getItem("inv")) || [];
let historyLog = JSON.parse(localStorage.getItem("history_log")) || [];
let wsData = JSON.parse(localStorage.getItem("ws_settings"));
let staff = JSON.parse(localStorage.getItem("staff_list")) || [];
let attendanceRecords = JSON.parse(localStorage.getItem("attendance_log")) || [];
let geoFenceSettings = JSON.parse(localStorage.getItem("geo_settings")) || null;
let activeUser = { role: null, name: "" };
let editIdx = -1;

function chooseAdminPath() {
    document.getElementById("rolePage").classList.add("hidden");
    document.getElementById("adminChoicePage").classList.remove("hidden");
}

function backToRoles() {
    document.getElementById("adminChoicePage").classList.add("hidden");
    document.getElementById("rolePage").classList.remove("hidden");
}

function openWorkspace(role, mode) {
    document.getElementById("rolePage").classList.add("hidden");
    document.getElementById("adminChoicePage").classList.add("hidden");
    document.getElementById("wsEntryPage").classList.remove("hidden");

    if(role === 'admin') {
        document.getElementById("adminArea").classList.remove("hidden");
        document.getElementById("empArea").classList.add("hidden");
        if(mode === 'new') {
            document.getElementById("setupView").classList.remove("hidden");
            document.getElementById("loginCompView").classList.add("hidden");
            document.getElementById("loginPassView").classList.add("hidden");
            document.getElementById("wsTitle").innerText = "Setup New Company";
        } else {
            document.getElementById("loginCompView").classList.remove("hidden");
            document.getElementById("setupView").classList.add("hidden");
            document.getElementById("loginPassView").classList.add("hidden");
            document.getElementById("wsTitle").innerText = "Enter Company Name";
        }
    } else {
        document.getElementById("empArea").classList.remove("hidden");
        document.getElementById("adminArea").classList.add("hidden");
        document.getElementById("wsTitle").innerText = "Employee Join";
    }
}

function setupWS() {
    const name = document.getElementById("cName").value.trim();
    const pass = document.getElementById("aPass").value.trim();
    const code = document.getElementById("jCode").value.trim();
    if(!name || !pass || !code) return alert("Fill all fields");
    wsData = { name, adminPass: pass, joinCode: code };
    localStorage.setItem("ws_settings", JSON.stringify(wsData));
    startApp("ADMIN", "Owner");
}

function verifyCompName() {
    if(!wsData) return alert("No company found. Please create one first.");
    const enteredComp = document.getElementById("adminCompSearch").value.trim();
    if(!enteredComp) return alert("Please enter your Company Name");
    
    if(enteredComp.toLowerCase() === wsData.name.toLowerCase()) {
        document.getElementById("loginCompView").classList.add("hidden");
        document.getElementById("loginPassView").classList.remove("hidden");
        document.getElementById("targetCompLabel").innerText = wsData.name;
        document.getElementById("wsTitle").innerText = "Admin Password";
    } else {
        alert("Company Name not found!");
    }
}

function checkAdmin() {
    if(!wsData) return alert("No company found. Please create one first.");
    if(document.getElementById("adminKey").value === wsData.adminPass) startApp("ADMIN", "Owner");
    else alert("Wrong Admin Password");
}

function checkEmp() {
    const compName = document.getElementById("eComp").value.trim();
    const name = document.getElementById("eName").value.trim();
    const code = document.getElementById("eCode").value.trim();
    
    if (!wsData) {
        return alert("No active company found. Please set up a company first.");
    }

    if (!compName || !name || !code) {
        return alert("Please fill in all fields (Company Name, Your Name, Join Code).");
    }

    const isCompanyValid = compName.toLowerCase() === wsData.name.toLowerCase();
    const isCodeValid = code === wsData.joinCode;

    if (isCompanyValid && isCodeValid) {
        if (!staff.includes(name)) {
            staff.push(name);
            localStorage.setItem("staff_list", JSON.stringify(staff));
        }
        startApp("EMPLOYEE", name);
    } else if (!isCompanyValid) {
        alert("Incorrect Company Name!");
    } else {
        alert("Invalid Join Code!");
    }
}

function startApp(role, name) {
    activeUser = { role, name };
    document.getElementById("wsEntryPage").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    document.getElementById("headerCompName").innerText = wsData ? wsData.name : "COMPANY";
    document.getElementById("roleTag").innerText = role;

    if(role === 'ADMIN') {
        document.getElementById("staffDisplay").classList.remove("hidden");
        document.getElementById("viewAttBtn").classList.remove("hidden");
        document.getElementById("adminGeoPanel").classList.remove("hidden");
        document.getElementById("staffNames").innerText = staff.length ? staff.join(", ") : "None";
    } else {
        document.getElementById("markAttBtn").classList.remove("hidden");
    }
    render();
}

function logAction(item, action, qty) {
    historyLog.unshift({
        time: new Date().toLocaleString(),
        user: activeUser.name || activeUser.role,
        item: item,
        action: action,
        qty: qty
    });
    localStorage.setItem("history_log", JSON.stringify(historyLog));
}

function updateCategoryDropdown() {
    const catSelect = document.getElementById("categoryFilter");
    const selectedVal = catSelect.value;
    
    const categories = Array.from(new Set(inventory.map(i => i.category || 'General')));
    
    let optionsHTML = '<option value="ALL">All Categories</option>';
    categories.forEach(cat => {
        optionsHTML += `<option value="${cat}">${cat}</option>`;
    });
    
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

function addItem() {
    const name = document.getElementById("itemName").value.trim() || "Unnamed Item";
    const category = document.getElementById("itemCat").value.trim() || "General";
    const qty = +document.getElementById("itemQty").value || 0;
    const price = +document.getElementById("itemPrice").value || 0;
    const minQty = +document.getElementById("itemMinQty").value || 5;

    inventory.push({ 
        name, 
        category,
        size: document.getElementById("itemSize").value || "-", 
        unit: document.getElementById("itemUnit").value || "-", 
        qty, 
        hold: 0, 
        price,
        minQty
    });

    logAction(name, "ADD ITEM", qty);
    localStorage.setItem("inv", JSON.stringify(inventory));
    
    document.getElementById("itemName").value = "";
    document.getElementById("itemCat").value = "";
    document.getElementById("itemSize").value = "";
    document.getElementById("itemUnit").value = "";
    document.getElementById("itemQty").value = "";
    document.getElementById("itemPrice").value = "";
    document.getElementById("itemMinQty").value = "5";

    render();
}

function openModal(index) {
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
}

function saveItemDetails() {
    if(editIdx < 0) return;
    const item = inventory[editIdx];

    item.name = document.getElementById("editName").value.trim() || "Unnamed Item";
    item.category = document.getElementById("editCat").value.trim() || "General";
    item.size = document.getElementById("editSize").value || "-";
    item.unit = document.getElementById("editUnit").value || "-";
    item.price = +document.getElementById("editPrice").value || 0;
    item.minQty = +document.getElementById("editMinQty").value || 5;

    logAction(item.name, "UPDATE DETAILS", 0);
    localStorage.setItem("inv", JSON.stringify(inventory));
    render();
    closeModal();
}

function doTrans(mode) {
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

    if(mode === 'in') { item.qty += amt; logAction(item.name, "STOCK IN", amt); }
    else if(mode === 'out') { 
        if(item.qty < amt) return alert("Low Stock"); 
        item.qty -= amt; 
        logAction(item.name, "STOCK OUT", amt); 
    }
    else if(mode === 'hold') { 
        if(item.qty < amt) return alert("Low Stock"); 
        item.qty -= amt; 
        item.hold = (item.hold || 0) + amt; 
        logAction(item.name, "HOLD", amt); 
    }
    else if(mode === 'rel') { 
        item.qty += (item.hold || 0); 
        logAction(item.name, "RELEASE HOLD", item.hold); 
        item.hold = 0; 
    }
    else if(mode === 'fin') { 
        logAction(item.name, "FINAL OUT", item.hold); 
        item.hold = 0; 
    }

    localStorage.setItem("inv", JSON.stringify(inventory));
    render(); closeModal();
}

function deleteItem() {
    if(confirm("Delete this item?")) {
        const item = inventory[editIdx];
        logAction(item.name, "DELETE ITEM", item.qty);
        inventory.splice(editIdx, 1);
        localStorage.setItem("inv", JSON.stringify(inventory));
        render(); closeModal();
    }
}

function closeModal() { document.getElementById("editModal").style.display = "none"; }

function filterItems() { 
    const query = document.getElementById("search").value.toLowerCase(); 
    const cat = document.getElementById("categoryFilter").value;

    const filtered = inventory.filter(i => {
        const matchesQuery = (i.name || "").toLowerCase().includes(query);
        const matchesCat = (cat === "ALL") || ((i.category || "General") === cat);
        return matchesQuery && matchesCat;
    });

    render(filtered); 
}

function showHistoryModal() {
    const body = document.getElementById("historyTableBody");
    body.innerHTML = historyLog.map(rec => `<tr><td>${rec.time}</td><td>${rec.user}</td><td>${rec.item}</td><td><b>${rec.action}</b></td><td>${rec.qty}</td></tr>`).join("");
    document.getElementById("historyModal").style.display = "flex";
}
function closeHistoryModal() { document.getElementById("historyModal").style.display = "none"; }

function showAttendanceModal() {
    const body = document.getElementById("attendanceTableBody");
    body.innerHTML = attendanceRecords.map(rec => `<tr><td>${rec.name}</td><td>${rec.date}</td><td>${rec.time}</td></tr>`).join("");
    document.getElementById("attendanceModal").style.display = "flex";
}
function closeAttendanceModal() { document.getElementById("attendanceModal").style.display = "none"; }

function markAttendance() {
    const now = new Date();
    const date = now.toLocaleDateString();
    const time = now.toLocaleTimeString();

    attendanceRecords.unshift({
        name: activeUser.name,
        date: date,
        time: time
    });

    localStorage.setItem("attendance_log", JSON.stringify(attendanceRecords));
    alert("Attendance marked successfully for " + activeUser.name);
}

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
