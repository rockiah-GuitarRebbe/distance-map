import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const app = express();
const server = http.createServer(app);

// ⭐ Render-safe + WebSocket-forced Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ["websocket"]
});

const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files (index.html, etc.)
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// =========================
//  SHARED CLIENT STORAGE
// =========================

const DATA_FILE = path.join(__dirname, "workers.json");
let workers = [];

// Load initial storage
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

// =========================
//     SOCKET.IO LOGIC
// =========================
io.on("connection", (socket) => {
  console.log("🟢 Client connected");

  // Give new browser the full list
  socket.emit("currentWorkers", workers);

  // Someone adds a client
  socket.on("addWorker", (w) => {
    workers.push(w);
    saveWorkers();
    io.emit("workerAdded", w);
  });

  // Someone deletes a client (worldwide)
  socket.on("removeWorker", (w) => {
    workers = workers.filter(
      (x) => !(x.name === w.name && x.address === w.address)
    );
    saveWorkers();
    io.emit("workerRemoved", w);
  });

  // Someone clears everything (worldwide)
  socket.on("clearAll", () => {
    workers = [];
    saveWorkers();
    io.emit("allCleared");
  });

  socket.on("disconnect", () => console.log("🔴 Client disconnected"));
});

server.listen(PORT, () => console.log(`🌎 Running on port ${PORT}`));
