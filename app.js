/* ==========================================
   PRO INVENTORY MANAGEMENT SYSTEM
   app.js
========================================== */

/* ---------- FIREBASE ---------- */

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

/* ---------- FIREBASE CONFIG ---------- */

const firebaseConfig = {

    apiKey: "AIzaSyDOftyWbEg1H4bkrPpHd_fE5ymQNpSK6LU",

    authDomain: "inventory-app-ad3c6.firebaseapp.com",

    projectId: "inventory-app-ad3c6",

    storageBucket: "inventory-app-ad3c6.firebasestorage.app",

    messagingSenderId: "150702776400",

    appId: "1:150702776400:web:b492e1e811e14c80063155",

    measurementId: "G-4D6KQBVWLR"

};

/* ---------- INITIALIZE ---------- */

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();

/* ---------- EMAIL LOGIN ---------- */

window.emailLogin = () => {

    const email = document.getElementById("email").value;

    const password = document.getElementById("password").value;

    if (!email || !password) {

        alert("Please enter email and password");

        return;

    }

    signInWithEmailAndPassword(auth, email, password)

        .catch(error => {

            alert("Login Error\n\n" + error.message);

        });

};

/* ---------- SIGNUP ---------- */

window.signup = () => {

    const email = document.getElementById("email").value;

    const password = document.getElementById("password").value;

    if (!email || !password) {

        alert("Please enter email and password");

        return;

    }

    createUserWithEmailAndPassword(auth, email, password)

        .catch(error => {

            alert("Signup Error\n\n" + error.message);

        });

};

/* ---------- GOOGLE LOGIN ---------- */

window.googleLogin = () => {

    signInWithPopup(auth, googleProvider)

        .catch(error => {

            alert("Google Login Error\n\n" + error.message);

        });

};

/* ---------- LOGOUT ---------- */

window.handleLogout = () => {

    signOut(auth)

        .then(() => {

            location.reload();

        })

        .catch(error => {

            alert(error.message);

        });

};

/* ---------- AUTH LISTENER ---------- */

onAuthStateChanged(auth, (user) => {

    if (user) {

        document.getElementById("loginPage").classList.add("hidden");

        document.getElementById("rolePage").classList.remove("hidden");

    }

});/* ==========================================
   APPLICATION VARIABLES
========================================== */

let inventory = JSON.parse(localStorage.getItem("inv")) || [];

let wsData = JSON.parse(localStorage.getItem("ws_settings"));

let staff = JSON.parse(localStorage.getItem("staff_list")) || [];

let attendanceRecords =
    JSON.parse(localStorage.getItem("attendance_log")) || [];

let geoFenceSettings =
    JSON.parse(localStorage.getItem("geo_settings")) || null;

let activeUser = {
    role: null,
    name: ""
};

let editIdx = -1;

/* ==========================================
   ROLE SELECTION
========================================== */

window.chooseAdminPath = function () {

    document.getElementById("rolePage").classList.add("hidden");

    document.getElementById("adminChoicePage").classList.remove("hidden");

};

window.backToRoles = function () {

    document.getElementById("adminChoicePage").classList.add("hidden");

    document.getElementById("rolePage").classList.remove("hidden");

};

/* ==========================================
   WORKSPACE
========================================== */

window.openWorkspace = function (role, mode) {

    document.getElementById("rolePage").classList.add("hidden");

    document.getElementById("adminChoicePage").classList.add("hidden");

    document.getElementById("wsEntryPage").classList.remove("hidden");

    if (role === "admin") {

        document.getElementById("adminArea").classList.remove("hidden");

        document.getElementById("empArea").classList.add("hidden");

        if (mode === "new") {

            document.getElementById("setupView").classList.remove("hidden");

            document.getElementById("loginCompView").classList.add("hidden");

            document.getElementById("loginPassView").classList.add("hidden");

            document.getElementById("wsTitle").innerText =
                "Setup New Company";

        } else {

            document.getElementById("setupView").classList.add("hidden");

            document.getElementById("loginCompView").classList.remove("hidden");

            document.getElementById("loginPassView").classList.add("hidden");

            document.getElementById("wsTitle").innerText =
                "Enter Company Name";

        }

    } else {

        document.getElementById("adminArea").classList.add("hidden");

        document.getElementById("empArea").classList.remove("hidden");

        document.getElementById("wsTitle").innerText =
            "Employee Join";

    }

};

/* ==========================================
   CREATE COMPANY
========================================== */

window.setupWS = function () {

    const name =
        document.getElementById("cName").value.trim();

    const pass =
        document.getElementById("aPass").value;

    const code =
        document.getElementById("jCode").value.trim();

    if (!name || !pass || !code) {

        alert("Fill all fields");

        return;

    }

    wsData = {

        name: name,

        adminPass: pass,

        joinCode: code

    };

    localStorage.setItem(
        "ws_settings",
        JSON.stringify(wsData)
    );

    startApp("ADMIN", "Owner");

};

/* ==========================================
   VERIFY COMPANY
========================================== */

window.verifyCompName = function () {

    if (!wsData) {

        alert("No company found.");

        return;

    }

    const entered =
        document.getElementById("adminCompSearch")
            .value
            .trim();

    if (!entered) {

        alert("Please enter Company Name");

        return;

    }

    if (entered.toLowerCase() === wsData.name.toLowerCase()) {

        document.getElementById("loginCompView")
            .classList.add("hidden");

        document.getElementById("loginPassView")
            .classList.remove("hidden");

        document.getElementById("targetCompLabel")
            .innerText = wsData.name;

        document.getElementById("wsTitle")
            .innerText = "Admin Password";

    } else {

        alert("Company Name not found.");

    }

};

/* ==========================================
   ADMIN LOGIN
========================================== */

window.checkAdmin = function () {

    if (!wsData) {

        alert("No company created.");

        return;

    }

    const password =
        document.getElementById("adminKey").value;

    if (password === wsData.adminPass) {

        startApp("ADMIN", "Owner");

    } else {

        alert("Wrong Admin Password");

    }

};

/* ==========================================
   EMPLOYEE LOGIN
========================================== */

window.checkEmp = function () {

    const name =
        document.getElementById("eName").value.trim();

    const code =
        document.getElementById("eCode").value.trim();

    if (!wsData) {

        alert("Company not found.");

        return;

    }

    if (code === wsData.joinCode && name) {

        if (!staff.includes(name)) {

            staff.push(name);

        }

        localStorage.setItem(
            "staff_list",
            JSON.stringify(staff)
        );

        startApp("EMPLOYEE", name);

    } else {

        alert("Invalid Join Code or Name");

    }

};

/* ==========================================
   START APPLICATION
========================================== */

function startApp(role, name) {

    activeUser = {

        role: role,

        name: name

    };

    document.getElementById("wsEntryPage")
        .classList.add("hidden");

    document.getElementById("app")
        .classList.remove("hidden");

    document.getElementById("headerCompName")
        .innerText = wsData ? wsData.name : "COMPANY";

    document.getElementById("roleTag")
        .innerText = role;

    if (role === "ADMIN") {

        document.getElementById("staffDisplay")
            .classList.remove("hidden");

        document.getElementById("viewAttBtn")
            .classList.remove("hidden");

        document.getElementById("adminGeoPanel")
            .classList.remove("hidden");

        document.getElementById("staffNames")
            .innerText = staff.length
                ? staff.join(", ")
                : "None";

        if (geoFenceSettings) {

            document.getElementById("geoLat").value =
                geoFenceSettings.lat;

            document.getElementById("geoLng").value =
                geoFenceSettings.lng;

            document.getElementById("geoRadius").value =
                geoFenceSettings.radius;

        }

    } else {

        document.getElementById("markAttBtn")
            .classList.remove("hidden");

    }

    render();

}/* ==========================================
   GEO LOCATION
========================================== */

window.getCurrentLocation = function () {

    if (!navigator.geolocation) {

        alert("Geolocation is not supported by your browser.");

        return;

    }

    navigator.geolocation.getCurrentPosition(

        (position) => {

            document.getElementById("geoLat").value =
                position.coords.latitude;

            document.getElementById("geoLng").value =
                position.coords.longitude;

        },

        () => {

            alert("Unable to retrieve your location.");

        }

    );

};

/* ==========================================
   SAVE GEO FENCE
========================================== */

window.saveGeoSettings = function () {

    const lat =
        parseFloat(document.getElementById("geoLat").value);

    const lng =
        parseFloat(document.getElementById("geoLng").value);

    const radius =
        parseInt(document.getElementById("geoRadius").value);

    if (isNaN(lat) || isNaN(lng) || isNaN(radius)) {

        alert("Enter valid Latitude, Longitude and Radius.");

        return;

    }

    geoFenceSettings = {

        lat,
        lng,
        radius

    };

    localStorage.setItem(

        "geo_settings",

        JSON.stringify(geoFenceSettings)

    );

    alert("Geo-Fence saved successfully.");

};

/* ==========================================
   DISTANCE CALCULATOR
========================================== */

function calculateDistance(lat1, lon1, lat2, lon2) {

    const R = 6371000;

    const φ1 = lat1 * Math.PI / 180;

    const φ2 = lat2 * Math.PI / 180;

    const Δφ = (lat2 - lat1) * Math.PI / 180;

    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a =

        Math.sin(Δφ / 2) *

        Math.sin(Δφ / 2)

        +

        Math.cos(φ1) *

        Math.cos(φ2) *

        Math.sin(Δλ / 2) *

        Math.sin(Δλ / 2);

    const c =

        2 *

        Math.atan2(

            Math.sqrt(a),

            Math.sqrt(1 - a)

        );

    return R * c;

}

/* ==========================================
   ATTENDANCE
========================================== */

window.markAttendance = function () {

    if (!navigator.geolocation) {

        alert("Geolocation is required.");

        return;

    }

    if (!geoFenceSettings) {

        recordAttendanceSuccess();

        return;

    }

    navigator.geolocation.getCurrentPosition(

        (position) => {

            const userLat =

                position.coords.latitude;

            const userLng =

                position.coords.longitude;

            let distance =

                calculateDistance(

                    userLat,

                    userLng,

                    geoFenceSettings.lat,

                    geoFenceSettings.lng

                );

            const accuracy =

                position.coords.accuracy || 0;

            if (

                accuracy > 10 &&

                distance - accuracy / 2 <

                geoFenceSettings.radius

            ) {

                distance =

                    geoFenceSettings.radius - 1;

            }

            if (

                distance >

                geoFenceSettings.radius

            ) {

                alert(

                    "Attendance Refused!\n\n" +

                    "Distance : " +

                    Math.round(distance) +

                    " meters."

                );

                return;

            }

            recordAttendanceSuccess();

        },

        () => {

            alert("Unable to access location.");

        },

        {

            enableHighAccuracy: true,

            timeout: 6000

        }

    );

};

/* ==========================================
   SAVE ATTENDANCE
========================================== */

function recordAttendanceSuccess() {

    attendanceRecords.push({

        name: activeUser.name,

        date: new Date().toLocaleDateString(),

        time: new Date().toLocaleTimeString()

    });

    localStorage.setItem(

        "attendance_log",

        JSON.stringify(attendanceRecords)

    );

    alert("Attendance Marked Successfully.");

    document.getElementById("markAttBtn")

        .classList.add("hidden");

}

/* ==========================================
   ATTENDANCE MODAL
========================================== */

window.showAttendanceModal = function () {

    const body =

        document.getElementById(

            "attendanceTableBody"

        );

    body.innerHTML =

        attendanceRecords

        .map(record =>

            `<tr>

                <td>${record.name}</td>

                <td>${record.date}</td>

                <td>${record.time}</td>

            </tr>`

        )

        .join("");

    document.getElementById(

        "attendanceModal"

    ).style.display = "flex";

};

window.closeAttendanceModal = function () {

    document.getElementById(

        "attendanceModal"

    ).style.display = "none";

};/* ==========================================
   RENDER INVENTORY
========================================== */

function render(data = inventory) {

    let html = "";

    let totalValue = 0;

    data.forEach(item => {

        const subtotal =

            (item.qty + (item.hold || 0)) *

            item.price;

        totalValue += subtotal;

        html += `

        <tr>

            <td>${item.name}</td>

            <td>${item.size}</td>

            <td>${item.unit}</td>

            <td style="color:green">

                <b>${item.qty}</b>

            </td>

            <td style="color:purple">

                <b>${item.hold || 0}</b>

            </td>

            <td>₹${item.price}</td>

            <td>₹${subtotal.toLocaleString()}</td>

            <td>

                <button

                    class="edit-btn main-nav"

                    onclick="openModal(${inventory.indexOf(item)})">

                    Update

                </button>

            </td>

        </tr>

        `;

    });

    document.getElementById("list").innerHTML = html;

    document.getElementById("totalItems").innerText =
        data.length;

    document.getElementById("totalValue").innerText =
        totalValue.toLocaleString();

}

/* ==========================================
   ADD ITEM
========================================== */

window.addItem = function () {

    const name =
        document.getElementById("itemName").value.trim();

    const size =
        document.getElementById("itemSize").value || "-";

    const unit =
        document.getElementById("itemUnit").value || "-";

    const qty =
        Number(document.getElementById("itemQty").value);

    const price =
        Number(document.getElementById("itemPrice").value);

    if (!name || qty <= 0 || price <= 0) {

        alert("Fill Name, Quantity and Price.");

        return;

    }

    inventory.push({

        name,

        size,

        unit,

        qty,

        hold: 0,

        price

    });

    localStorage.setItem(

        "inv",

        JSON.stringify(inventory)

    );

    render();

};

/* ==========================================
   SEARCH
========================================== */

window.searchItem = function () {

    const value =
        document.getElementById("search")
            .value
            .toLowerCase();

    render(

        inventory.filter(item =>

            item.name.toLowerCase().includes(value)

        )

    );

};

/* ==========================================
   OPEN EDIT MODAL
========================================== */

window.openModal = function (index) {

    editIdx = index;

    const item = inventory[index];

    document.getElementById("modalTitle").innerText =
        "Item : " + item.name;

    document.getElementById("curStock").innerText =
        item.qty;

    document.getElementById("curHold").innerText =
        item.hold || 0;

    if (activeUser.role === "ADMIN") {

        document.getElementById("adminEditGroup")
            .classList.remove("hidden");

        document.getElementById("adminDeleteGroup")
            .classList.remove("hidden");

        document.getElementById("editName").value =
            item.name;

        document.getElementById("editSize").value =
            item.size;

        document.getElementById("editUnit").value =
            item.unit;

        document.getElementById("editPrice").value =
            item.price;

    }

    document.getElementById("editModal")
        .style.display = "flex";

};

/* ==========================================
   CLOSE MODAL
========================================== */

window.closeModal = function () {

    document.getElementById("editModal")
        .style.display = "none";

};/* ==========================================
   INVENTORY TRANSACTIONS
========================================== */

window.doTrans = function (mode) {

    const amount =
        Number(document.getElementById("transAmt").value);

    if (amount <= 0) {

        alert("Enter a valid amount.");

        return;

    }

    const item = inventory[editIdx];

    if (activeUser.role === "ADMIN") {

        item.name =
            document.getElementById("editName").value;

        item.size =
            document.getElementById("editSize").value;

        item.unit =
            document.getElementById("editUnit").value;

        item.price =
            Number(document.getElementById("editPrice").value);

    }

    switch (mode) {

        case "in":

            item.qty += amount;

            break;

        case "out":

            if (item.qty < amount) {

                alert("Low Stock");

                return;

            }

            item.qty -= amount;

            break;

        case "hold":

            if (item.qty < amount) {

                alert("Low Stock");

                return;

            }

            item.qty -= amount;

            item.hold =
                (item.hold || 0) + amount;

            break;

        case "rel":

            item.qty += item.hold || 0;

            item.hold = 0;

            break;

        case "fin":

            item.hold = 0;

            break;

    }

    localStorage.setItem(

        "inv",

        JSON.stringify(inventory)

    );

    render();

    closeModal();

};

/* ==========================================
   DELETE ITEM
========================================== */

window.deleteItem = function () {

    if (!confirm("Delete this item?"))

        return;

    inventory.splice(editIdx, 1);

    localStorage.setItem(

        "inv",

        JSON.stringify(inventory)

    );

    render();

    closeModal();

};

/* ==========================================
   KEYBOARD NAVIGATION
========================================== */

document.addEventListener("keydown", (e) => {

    const modalOpen =
        document.getElementById("editModal").style.display === "flex";

    if (

        document.activeElement.id === "search" &&

        e.key === "ArrowDown"

    ) {

        e.preventDefault();

        const firstButton =
            document.querySelector("#list .edit-btn");

        if (firstButton)

            firstButton.focus();

        return;

    }

    const elements = Array.from(

        document.querySelectorAll(

            modalOpen

                ? ".modal-nav"

                : ".main-nav"

        )

    );

    const index =
        elements.indexOf(document.activeElement);

    if (index === -1)

        return;

    if (

        e.key === "ArrowRight" ||

        e.key === "ArrowDown"

    ) {

        e.preventDefault();

        (elements[index + 1] ||

            elements[0]).focus();

    }

    if (

        e.key === "ArrowLeft" ||

        e.key === "ArrowUp"

    ) {

        e.preventDefault();

        (elements[index - 1] ||

            elements[elements.length - 1]).focus();

    }

});

/* ==========================================
   INITIALIZE
========================================== */

render();