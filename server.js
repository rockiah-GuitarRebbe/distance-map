// File: server.mjs
import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import crypto from "crypto";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["websocket"], // why: avoid long-poll on Render
});

const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- Static ----------
app.use(express.static(__dirname));
app.get("/", (_, res) => res.sendFile(path.join(__dirname, "index.html")));

// ---------- Data & Persistence ----------
const DATA_FILE = path.join(__dirname, "workers.json");
/** @type {{name:string,address:string,lat:number,lng:number}[]} */
let workers = [];
/** fast dedup: key=name|address (lowercased, trimmed) */
const index = new Set();

/** Load persisted workers once at boot. */
await (async function loadWorkers() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      for (const w of arr) tryAddWorkerLocal(w);
      log(`Loaded ${workers.length} workers`);
    }
  } catch {
    workers = [];
    await saveWorkersAtomic(); // create file if missing/corrupt
  }
})();

/** Serialize saves to disk atomically. */
let saving = Promise.resolve();
function saveWorkersAtomic() {
  const snapshot = JSON.stringify(workers, null, 2);
  const tmp = `${DATA_FILE}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  // why: atomic write avoids partial/corrupt file on crashes
  saving = saving
    .then(() => fs.writeFile(tmp, snapshot))
    .then(() => fs.rename(tmp, DATA_FILE))
    .catch(() => {})
    .finally(() => {});
  return saving;
}

// ---------- Validation / Normalization ----------
const NAME_MAX = 200;
const ADDRESS_MAX = 400;
const WORKER_LIMIT = 10000;

function normalizeStr(s) {
  return String(s ?? "").trim().replace(/\s+/g, " ");
}
function workerKey(w) {
  return `${normalizeStr(w.name).toLowerCase()}|${normalizeStr(w.address).toLowerCase()}`;
}
/** Strict validation; returns sanitized worker or null. */
function sanitizeWorker(input) {
  const name = normalizeStr(input?.name);
  const address = normalizeStr(input?.address);
  const lat = Number(input?.lat);
  const lng = Number(input?.lng);

  if (!name || !address) return null;
  if (name.length > NAME_MAX || address.length > ADDRESS_MAX) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // US-ish bounds; keeps garbage out
  if (lat < 18 || lat > 73 || lng < -180 || lng > -50) return null;

  return { name, address, lat, lng };
}

function tryAddWorkerLocal(raw) {
  const w = sanitizeWorker(raw);
  if (!w) return { ok: false, reason: "invalid" };
  if (workers.length >= WORKER_LIMIT) return { ok: false, reason: "limit" };
  const k = workerKey(w);
  if (index.has(k)) return { ok: false, reason: "duplicate" };
  index.add(k);
  workers.push(w);
  return { ok: true, worker: w };
}

function removeWorkerLocal(raw) {
  const w = sanitizeWorker(raw);
  if (!w) return { ok: false, reason: "invalid" };
  const k = workerKey(w);
  if (!index.has(k)) return { ok: false, reason: "missing" };
  const before = workers.length;
  workers = workers.filter((x) => workerKey(x) !== k);
  index.delete(k);
  return { ok: workers.length !== before };
}

// ---------- HTTP (readonly helpers) ----------
app.get("/api/workers", (_, res) => res.json(workers));
app.get("/healthz", async (_, res) => {
  try {
    await fs.stat(DATA_FILE);
    res.status(200).json({ ok: true, count: workers.length });
  } catch {
    res.status(500).json({ ok: false });
  }
});

// ---------- Socket.IO ----------
io.on("connection", (socket) => {
  log(`🟢 ${socket.id} connected`);
  socket.emit("currentWorkers", workers);

  const guard = makeRateLimiter(30, 2000); // 30 ops / 2s per socket

  socket.on("addWorker", (w) => {
    if (!guard()) return; // drop if flooded
    const r = tryAddWorkerLocal(w);
    if (r.ok) {
      io.emit("workerAdded", r.worker);
      saveWorkersAtomic();
    } else {
      socket.emit("addWorkerRejected", r.reason);
    }
  });

  socket.on("addWorkersBatch", (arr) => {
    if (!guard()) return;
    if (!Array.isArray(arr)) return;
    const accepted = [];
    for (const w of arr) {
      const r = tryAddWorkerLocal(w);
      if (r.ok) accepted.push(r.worker);
      if (workers.length >= WORKER_LIMIT) break;
    }
    if (accepted.length) {
      io.emit("workersAddedBatch", accepted);
      saveWorkersAtomic();
    }
    socket.emit("addWorkersBatchAck", { added: accepted.length });
  });

  socket.on("removeWorker", (w) => {
    if (!guard()) return;
    const r = removeWorkerLocal(w);
    if (r.ok) {
      io.emit("workerRemoved", sanitizeWorker(w)); // echo normalized
      saveWorkersAtomic();
    }
  });

  socket.on("clearAll", () => {
    if (!guard()) return;
    workers = [];
    index.clear();
    io.emit("allCleared");
    saveWorkersAtomic();
  });

  socket.on("disconnect", () => log(`🔴 ${socket.id} disconnected`));
});

// ---------- Boot ----------
server.listen(PORT, () => log(`🌎 Running on port ${PORT}`));

// ---------- Utils ----------
function log(...a) {
  // eslint-disable-next-line no-console
  console.log(new Date().toISOString(), ...a);
}
function makeRateLimiter(maxOps, windowMs) {
  let ops = 0;
  let start = Date.now();
  return function allow() {
    const now = Date.now();
    if (now - start > windowMs) {
      start = now; ops = 0;
    }
    ops += 1;
    return ops <= maxOps;
  };
}
