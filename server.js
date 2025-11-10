import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files (index.html, etc.)
app.use(express.static(__dirname));

// Serve main page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// === Shared workers memory ===
const DATA_FILE = path.join(__dirname, "workers.json");
let workers = [];

// Load previous workers (if file exists)
if (fs.existsSync(DATA_FILE)) {
  try {
    workers = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch (err) {
    console.error("Error loading workers.json:", err);
    workers = [];
  }
}

// Helper to save workers to disk
function saveWorkers() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(workers, null, 2), "utf-8");
  } catch (err) {
    console.error("❌ Failed to save workers:", err);
  }
}

// === WebSocket Connections ===
io.on("connection", (socket) => {
  console.log("🟢 Client connected:", socket.id);

  // send all workers to new client
  socket.emit("currentWorkers", workers);

  // add worker
  socket.on("addWorker", (worker) => {
    workers.push(worker);
    saveWorkers();
    io.emit("workerAdded", worker);
  });

  // remove worker
  socket.on("removeWorker", (worker) => {
    workers = workers.filter(
      (w) => !(w.name === worker.name && w.address === worker.address)
    );
    saveWorkers();
    io.emit("workerRemoved", worker);
  });

  // full clear (global + stop uploads)
  socket.on("clearAll", () => {
    console.log("🧹 Global clearAll received");
    workers = [];
    saveWorkers();
    io.emit("allCleared");
  });

  socket.on("disconnect", () => {
    console.log("🔴 Disconnected:", socket.id);
  });
});

// === Server Start ===
server.listen(PORT, () =>
  console.log(`🌎 Live on port ${PORT} — ready for multi-browser sync!`)
);
