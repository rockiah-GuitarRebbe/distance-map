import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const app = express();
const server = http.createServer(app);

// ✅ Enable full CORS for cross-browser sync
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files (HTML, CSS, JS)
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "Distance Excel.html"));
});

// === Shared workers memory ===
const DATA_FILE = path.join(__dirname, "workers.json");

// Load existing workers (if any)
let workers = [];
if (fs.existsSync(DATA_FILE)) {
  try {
    workers = JSON.parse(fs.readFileSync(DATA_FILE));
  } catch (e) {
    workers = [];
  }
}

// Save workers to file
function saveWorkers() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(workers, null, 2));
}

// === SOCKET.IO CONNECTION ===
io.on("connection", (socket) => {
  console.log("🟢 New client connected:", socket.id);
  socket.emit("currentWorkers", workers);

  // Add new worker
  socket.on("addWorker", (worker) => {
    console.log("📥 Received new worker:", worker);
    if (!workers.some(w => w.name === worker.name && w.address === worker.address)) {
      workers.push(worker);
      saveWorkers();
      io.emit("workerAdded", worker); // broadcast to all
      io.emit("currentWorkers", workers);
      console.log("✅ Worker broadcasted to all clients");
    } else {
      console.log("⚠️ Duplicate worker ignored");
    }
  });

  // Remove worker
  socket.on("removeWorker", (worker) => {
    console.log("🗑️ Removing worker:", worker);
    workers = workers.filter(
      (w) => !(w.name === worker.name && w.address === worker.address)
    );
    saveWorkers();
    io.emit("workerRemoved", worker);
    io.emit("currentWorkers", workers);
  });

  // Clear all
  socket.on("clearAll", () => {
    console.log("🚨 Clearing all workers (triggered by client)");
    workers = [];
    saveWorkers();
    io.emit("allCleared");
    io.emit("currentWorkers", workers);
  });

  // Client disconnect
  socket.on("disconnect", () => console.log("🔴 Client disconnected:", socket.id));
});

// === START SERVER ===
server.listen(PORT, () => console.log(`🌎 Server running on port ${PORT}`));
