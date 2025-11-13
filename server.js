// File: server.mjs
import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

const app = express();
const server = http.createServer(app);

// ---- Config (Render-friendly) ----
const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*"; // e.g. "https://your-service.onrender.com"
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Persistent disk: mount a Render Disk to /data and set DATA_DIR=/data
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "workers.json");

// ---- Socket.IO ----
const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGIN, methods: ["GET", "POST"] },
  transports: ["websocket"] // Render supports WebSockets; avoids long-poll
});

// ---- Static (serves index.html) ----
app.use(express.static(__dirname));
app.get("/", (_, res) => res.sendFile(path.join(__dirname, "index.html")));

// ---- Health / Readonly helpers ----
app.get("/healthz", async (_, res) => {
  try {
    await fs.stat(DATA_FILE);
    res.status(200).json({ ok: true });
  } catch {
    res.status(200).json({ ok: true, note: "no data yet" });
  }
});
app.get("/api/workers", async (_, res) => {
  const workers = await loadWorkers();
  res.json(workers);
});

// ---- Storage helpers ----
async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}
async function loadWorkers() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
async function saveWorkers(workers) {
  await ensureDataDir();
  await fs.writeFile(DATA_FILE, JSON.stringify(workers, null, 2));
}

// Load on boot
let workers = await loadWorkers();

// ---- Socket handlers ----
io.on("connection", (socket) => {
  console.log("🟢 Client connected:", socket.id);

  socket.emit("currentWorkers", workers);

  socket.on("addWorker", async (w) => {
    // naive dedup by name+address; matches your client behavior
    const exists = workers.some(
      (x) => x.name === w.name && x.address === w.address
    );
    if (exists) return; // no broadcast

    workers.push(w);
    await saveWorkers(workers);
    io.emit("workerAdded", w);
  });

  socket.on("removeWorker", async (w) => {
    workers = workers.filter(
      (x) => !(x.name === w.name && x.address === w.address)
    );
    await saveWorkers(workers);
    io.emit("workerRemoved", w);
  });

  socket.on("clearAll", async () => {
    workers = [];
    await saveWorkers(workers);
    io.emit("allCleared");
  });

  socket.on("disconnect", () => console.log("🔴 Client disconnected:", socket.id));
});

// ---- Boot ----
server.listen(PORT, () => console.log(`🌎 Render listening on :${PORT}`));
