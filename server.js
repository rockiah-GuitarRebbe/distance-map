// server.js
import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["websocket"]
});

const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- static
app.use(express.static(__dirname));
app.get("/", (_, res) => res.sendFile(path.join(__dirname, "index.html")));

// ---- storage
const DATA_FILE = path.join(__dirname, "workers.json");
/** @type {{name:string,address:string,lat:number,lng:number,level?:string}[]} */
let workers = [];
if (fs.existsSync(DATA_FILE)) {
  try {
    workers = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    workers = [];
  }
}
function saveWorkers() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(workers, null, 2));
  } catch {}
}

// ---- helpers
const LEVELS = new Set(["critical", "high", "medium", "low"]);
const normLevel = (v) =>
  LEVELS.has(String(v || "").toLowerCase()) ? String(v).toLowerCase() : "low";
const keyFor = (w) =>
  `${w.name.toLowerCase()}|${w.address.toLowerCase()}|${normLevel(w.level)}`;

function sanitizeWorker(w) {
  const name = String(w?.name ?? "").trim();
  const address = String(w?.address ?? "").trim();
  const lat = Number(w?.lat),
    lng = Number(w?.lng);
  const level = normLevel(w?.level);
  if (!name || !address) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // US-ish bounds guard (optional)
  if (lat < 18 || lat > 73 || lng < -180 || lng > -50) return null;
  return { name, address, lat, lng, level };
}

// ---- debug endpoints
app.get("/healthz", (_, res) =>
  res.status(200).json({ ok: true, count: workers.length })
);
app.get("/api/workers", (_, res) =>
  res.json(workers.map((w) => ({ ...w, level: normLevel(w.level) })))
);

// ---- sockets
io.on("connection", (socket) => {
  // send full list on connect
  socket.emit(
    "currentWorkers",
    workers.map((w) => ({ ...w, level: normLevel(w.level) }))
  );

  // add one
  socket.on("addWorker", (raw) => {
    const w = sanitizeWorker(raw);
    if (!w) return;
    if (workers.some((x) => keyFor(x) === keyFor(w))) return;
    workers.push(w);
    saveWorkers();
    io.emit("workerAdded", w);
  });

  // add batch
  socket.on("addWorkersBatch", (arr) => {
    if (!Array.isArray(arr)) return;
    const accepted = [];
    for (const raw of arr) {
      const w = sanitizeWorker(raw);
      if (!w) continue;
      if (workers.some((x) => keyFor(x) === keyFor(w))) continue;
      workers.push(w);
      accepted.push(w);
    }
    if (accepted.length) {
      saveWorkers();
      io.emit("workersAddedBatch", accepted);
    }
  });

  // remove one
  socket.on("removeWorker", (raw) => {
    const w = sanitizeWorker(raw);
    if (!w) return;
    const before = workers.length;
    workers = workers.filter((x) => keyFor(x) !== keyFor(w));
    if (workers.length !== before) {
      saveWorkers();
      io.emit("workerRemoved", w);
    }
  });

  // clear all
  socket.on("clearAll", () => {
    workers = [];
    saveWorkers();
    io.emit("allCleared");
  });

  // ---- activity relay (system-wide "someone is adding info")
  socket.on("activity", (msg) => {
    const safe = {
      type: String(msg?.type || ""),
      by: String(msg?.by || "User"),
      total: Number(msg?.total) || 0,
      done: Number(msg?.done) || 0,
      added: Number(msg?.added) || 0,
      failed: Number(msg?.failed) || 0,
      id: socket.id,
      ts: Date.now(),
    };
    io.emit("activity", safe);
  });

  socket.on("disconnect", () => {
    // optional: broadcast someone left
    // io.emit("activity", { type: "left", by: `User-${socket.id.slice(0,5)}`, ts: Date.now(), id: socket.id });
  });
});

server.listen(PORT, () => console.log(`🌎 Running on :${PORT}`));
