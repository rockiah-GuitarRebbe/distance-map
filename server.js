<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Shared Distance Map</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
  <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
  <style>
    body { margin:0; display:flex; font-family:system-ui,Arial,sans-serif; height:100vh; }
    .sidebar { width:25%; min-width:260px; background:#f8f8f8; border-right:1px solid #ccc; display:flex; flex-direction:column; }
    #map { flex:1; height:100vh; }
    header { padding:10px; background:#fafafa; border-bottom:1px solid #ddd; display:flex; justify-content:space-between; align-items:center; }
    #facilityList { list-style:none; padding:10px; margin:0; overflow-y:auto; flex:1; }
    #facilityList li { display:flex; align-items:center; justify-content:flex-start; gap:6px; padding:4px 0; border-bottom:1px solid #eee; font-size:14px; }
    button { border:none; border-radius:5px; padding:6px 10px; background:#0078d4; color:white; cursor:pointer; }
    button:hover { background:#005fa3; }
    .delete-btn { background:transparent; color:#d33; font-size:18px; cursor:pointer; padding:0 4px; }
    .delete-btn:hover { color:#a00; transform:scale(1.1); }
  </style>
</head>
<body>
  <div class="sidebar">
    <header>
      <h3>Workers</h3>
      <div>
        <input type="file" id="excelInput" accept=".xlsx,.xls" style="display:none" />
        <button id="uploadExcelBtn">📂 Excel</button>
        <button id="clearListBtn" style="background:#e74c3c;">🧹 Clear</button>
      </div>
    </header>

    <div style="padding:10px;border-bottom:1px solid #ddd;">
      <label><b>Therapist Location:</b></label><br />
      <input id="therapistInput" placeholder="Enter ZIP or address" style="width:90%;padding:6px;" />
      <div style="margin-top:6px;display:flex;gap:5px;">
        <button id="therapistBtn">📍 Show</button>
        <button id="clearTherapistBtn" style="background:#888;">🧍‍♀️ Clear</button>
      </div>
    </div>

    <ul id="facilityList"></ul>
  </div>

  <div id="map"></div>

  <script>
    const socket = io(window.location.origin, { transports: ["websocket", "polling"] });
    const map = L.map('map').setView([39.8283, -98.5795], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    const markers = [];
    let therapistMarker = null;

    // --- Add worker marker ---
    function addWorker(worker, broadcast = true) {
      if (document.querySelector(`li[data-name="${worker.name}"][data-address="${worker.address}"]`)) return;
      const li = document.createElement("li");
      li.dataset.name = worker.name;
      li.dataset.address = worker.address;

      const del = document.createElement("button");
      del.textContent = "×";
      del.className = "delete-btn";
      del.onclick = () => { removeWorker(worker); socket.emit("removeWorker", worker); };
      li.append(del);

      const label = document.createElement("span");
      label.textContent = `${worker.name} — ${worker.address}`;
      li.append(label);

      document.getElementById("facilityList").append(li);

      // Fetch coordinates
      fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&limit=1&q=${encodeURIComponent(worker.address)}`)
        .then(r => r.json())
        .then(data => {
          if (data.length) {
            const { lat, lon } = data[0];
            const m = L.marker([lat, lon], {
              icon: L.icon({
                iconUrl: "https://maps.gstatic.com/mapfiles/ms2/micons/orange-dot.png",
                iconSize: [32, 32],
                iconAnchor: [16, 32]
              })
            }).addTo(map).bindPopup(`<b>${worker.name}</b><br>${worker.address}`);
            markers.push({ name: worker.name, address: worker.address, marker: m });

            // Auto-update distances if therapist already exists
            if (therapistMarker) {
              const pos = therapistMarker.getLatLng();
              updateWorkerDistances([pos.lat, pos.lng]);
            }
          }
        })
        .catch(e => console.error("Geocode failed", e));

      if (broadcast) socket.emit("addWorker", worker);
    }

    // --- Remove worker ---
    function removeWorker(worker) {
      const li = document.querySelector(`li[data-name="${worker.name}"][data-address="${worker.address}"]`);
      if (li) li.remove();
      const i = markers.findIndex(m => m.name === worker.name && m.address === worker.address);
      if (i >= 0) {
        map.removeLayer(markers[i].marker);
        markers.splice(i, 1);
      }
    }

    // --- Excel upload ---
    document.getElementById("uploadExcelBtn").onclick = () => document.getElementById("excelInput").click();
    document.getElementById("excelInput").addEventListener("change", e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = ev => {
        const wb = XLSX.read(new Uint8Array(ev.target.result), { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        XLSX.utils.sheet_to_json(sheet).forEach(row => {
          const keys = Object.keys(row);
          if (keys.length >= 2) addWorker({ name: row[keys[0]], address: row[keys[1]] });
        });
      };
      r.readAsArrayBuffer(f);
    });

    // --- Therapist selection and distance updates ---
    document.getElementById("therapistBtn").onclick = async () => {
      const q = document.getElementById("therapistInput").value.trim();
      if (!q) return alert("Enter a location first.");

      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&limit=1&q=${encodeURIComponent(q + ", USA")}`);
        const data = await res.json();
        if (!data.length) return alert("Location not found.");

        const { lat, lon, display_name } = data[0];
        const therapistPos = [parseFloat(lat), parseFloat(lon)];

        if (therapistMarker) map.removeLayer(therapistMarker);
        therapistMarker = L.marker(therapistPos, {
          icon: L.icon({
            iconUrl: "https://maps.gstatic.com/mapfiles/ms2/micons/blue-dot.png",
            iconSize: [32, 32],
            iconAnchor: [16, 32]
          })
        }).addTo(map).bindPopup(`<b>Therapist</b><br>${display_name}`).openPopup();
        map.setView(therapistPos, 7);

        updateWorkerDistances(therapistPos);
      } catch (err) {
        console.error("Therapist lookup failed", err);
        alert("Therapist lookup failed — try again later.");
      }
    };

    // --- Distance calculator ---
    function updateWorkerDistances(therapistPos) {
      const R = 3958.8;
      const deg2rad = d => d * Math.PI / 180;

      document.querySelectorAll("#facilityList li").forEach(li => {
        const name = li.dataset.name;
        const address = li.dataset.address;
        const worker = markers.find(m => m.name === name && m.address === address);
        if (!worker || !worker.marker) return;

        const wPos = worker.marker.getLatLng();
        const dLat = deg2rad(wPos.lat - therapistPos[0]);
        const dLon = deg2rad(wPos.lng - therapistPos[1]);
        const a = Math.sin(dLat / 2) ** 2 +
          Math.cos(deg2rad(therapistPos[0])) *
          Math.cos(deg2rad(wPos.lat)) *
          Math.sin(dLon / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const dist = (R * c).toFixed(1);

        const existing = li.querySelector(".distance");
        if (existing) existing.textContent = `${dist} mi`;
        else {
          const span = document.createElement("span");
          span.className = "distance";
          span.style.marginLeft = "6px";
          span.style.color = "#444";
          span.textContent = `${dist} mi`;
          li.appendChild(span);
        }
      });
    }

    // --- Clear therapist ---
    document.getElementById("clearTherapistBtn").onclick = () => {
      if (therapistMarker) { map.removeLayer(therapistMarker); therapistMarker = null; }
      document.querySelectorAll(".distance").forEach(d => d.remove());
    };

    // --- Clear all workers ---
    document.getElementById("clearListBtn").onclick = () => {
      if (!confirm("Clear all?")) return;
      markers.forEach(m => map.removeLayer(m.marker));
      markers.length = 0;
      document.getElementById("facilityList").innerHTML = "";
      socket.emit("clearAll");
    };

    // --- Socket events ---
    socket.on("initData", ({ workers }) => {
      workers.forEach(w => addWorker(w, false));
    });
    socket.on("workerAdded", w => {
      addWorker(w, false);
      if (therapistMarker) {
        const pos = therapistMarker.getLatLng();
        updateWorkerDistances([pos.lat, pos.lng]);
      }
    });
    socket.on("workerRemoved", w => removeWorker(w));
    socket.on("allCleared", () => {
      markers.forEach(m => map.removeLayer(m.marker));
      markers.length = 0;
      document.getElementById("facilityList").innerHTML = "";
      document.querySelectorAll(".distance").forEach(d => d.remove());
    });
  </script>
</body>
</html>
