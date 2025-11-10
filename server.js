import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const app = express();
const server = http.createServer(app);

// ✅ Enable full CORS
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "Distance Excel.html"));
});

// === Shared memory ===
const DATA_FILE = path.join(__dirname, "workers.json");
let workers = [];
let therapist = null; // 🧍‍♀️ current therapist marker

if (fs.existsSync(DATA_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE));
    workers = saved.workers || [];
    therapist = saved.therapist || null;
  } catch {
    workers = [];
    therapist = null;
  }
}

function saveAll() {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ workers, therapist }, null, 2));
}

// === SOCKETS ===
io.on("connection", (socket) => {
  console.log("🟢 Client connected:", socket.id);

  // Send current state
  socket.emit("currentWorkers", workers);
  socket.emit("currentTherapist", therapist);

  // --- Workers ---
  socket.on("addWorker", (worker) => {
    if (!workers.some(w => w.name === worker.name && w.address === worker.address)) {
      workers.push(worker);
      saveAll();
      io.emit("workerAdded", worker);
      io.emit("currentWorkers", workers);
    }
  });

  socket.on("removeWorker", (worker) => {
    workers = workers.filter(
      (w) => !(w.name === worker.name && w.address === worker.address)
    );
    saveAll();
    io.emit("workerRemoved", worker);
    io.emit("currentWorkers", workers);
  });

  socket.on("clearAll", () => {
    workers = [];
    therapist = null;
    saveAll();
    io.emit("allCleared");
    io.emit("currentWorkers", workers);
    io.emit("currentTherapist", therapist);
  });

  // --- Therapist ---
  socket.on("setTherapist", (data) => {
    console.log("🧍 Therapist set:", data);
    therapist = data;
    saveAll();
    io.emit("therapistUpdated", data); // broadcast new therapist to all
  });

  socket.on("clearTherapist", () => {
    console.log("🚿 Therapist cleared");
    therapist = null;
    saveAll();
    io.emit("therapistCleared");
  });

  socket.on("disconnect", () => console.log("🔴 Client disconnected:", socket.id));
});

// === START ===
server.listen(PORT, () => console.log(`🌎 Server running on port ${PORT}`));
