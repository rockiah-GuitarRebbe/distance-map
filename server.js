import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

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

// Socket.io connection
io.on("connection", (socket) => {
  console.log("🟢 New client connected");

  // Send current worker list to the new client
  socket.emit("currentWorkers", workers);

  // Add new worker (from Excel or manual)
  socket.on("addWorker", (worker) => {
    // ✅ Prevent duplicates
    if (!workers.some(w => w.name === worker.name && w.address === worker.address)) {
      workers.push(worker);
      saveWorkers();
      io.emit("workerAdded", worker);
      io.emit("currentWorkers", workers); // 🔁 keep all browsers synchronized
    }
  });

  // Remove a worker
  socket.on("removeWorker", (worker) => {
    workers = workers.filter(
      (w) => !(w.name === worker.name && w.address === worker.address)
    );
    saveWorkers();
    io.emit("workerRemoved", worker);
    io.emit("currentWorkers", workers); // keep lists updated
  });

  // Clear everything
  socket.on("clearAll", () => {
    workers = [];
    saveWorkers();
    io.emit("allCleared");
    io.emit("currentWorkers", workers); // send empty list to everyone
  });

  socket.on("disconnect", () => console.log("🔴 Client disconnected"));
});

// Start server
server.listen(PORT, () => console.log(`🌎 Live on port ${PORT}`));
