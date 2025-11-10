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

// Serve static files (Render-safe)
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// === Data Storage ===
const DATA_FILE = path.join(__dirname, "workers.json");
let workers = [];
let therapist = null; // new!

if (fs.existsSync(DATA_FILE)) {
  try {
    workers = JSON.parse(fs.readFileSync(DATA_FILE));
  } catch {
    workers = [];
  }
}

function saveWorkers() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(workers, null, 2));
}

// === Socket logic ===
io.on("connection", (socket) => {
  console.log("🟢 New client connected");
  socket.emit("currentWorkers", workers);
  if (therapist) socket.emit("therapistSet", therapist);

  // Add worker
  socket.on("addWorker", (worker) => {
    workers.push(worker);
    saveWorkers();
    io.emit("workerAdded", worker);
  });

  // Remove worker
  socket.on("removeWorker", (worker) => {
    workers = workers.filter(
      (w) => !(w.name === worker.name && w.address === worker.address)
    );
    saveWorkers();
    io.emit("workerRemoved", worker);
  });

  // Clear all
  socket.on("clearAll", () => {
    workers = [];
    therapist = null;
    saveWorkers();
    io.emit("cancelUploads");
    setTimeout(() => io.emit("allCleared"), 1000);
  });

  // Therapist set / cleared
  socket.on("setTherapist", (tData) => {
    therapist = tData;
    io.emit("therapistSet", tData);
  });
  socket.on("clearTherapist", () => {
    therapist = null;
    io.emit("therapistCleared");
  });

  socket.on("disconnect", () => console.log("🔴 Client disconnected"));
});

server.listen(PORT, () => console.log(`🌎 Live on port ${PORT}`));
