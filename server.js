// server.mjs  (or server.js with "type":"module" in package.json)
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
  transports: ["websocket"],
});

const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Static
app.use(express.static(__dirname));
app.get("/", (_, res) => res.sendFile(path.join(__dirname, "index.html")));

// -------- Storage --------
const DATA_FILE = path.join(__dirname, "workers.json");
/** @type {{name:string,address:string,lat:number,lng:number,level?:string}[]} */
let workers = [];
if (fs.existsSync(DATA_FILE)) {
  try { workers = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); } catch { workers = []; }
}
function saveWorkers() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(workers, null, 2)); } catch {}
}

// Normalize + validation
const LEVELS = new Set(["critical","high","medium","low"]);
function normLevel(level) {
  const v = String(level || "").toLowerCase();
  return LEVELS.has(v) ? v : "low";
}
function sanitizeWorker(w) {
  const name = String(w?.name ?? "").trim();
  const address = String(w?.address ?? "").trim();
  const lat = Number(w?.lat);
  const lng = Number(w?.lng);
  const level = normLevel(w?.level);
  if (!name || !address) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { name, address, lat, lng, level };
}
const keyFor = (w) =>
  `${w.name.toLowerCase()}|${w.address.toLowerCase()}|${w.level}`;

// -------- Sockets --------
io.on("connection", (socket) => {
  // Send normalized/leveled list (old records default to "low")
  const normalized = workers.map((w) => ({ ...w, level: normLevel(w.level) }));
  socket.emit("currentWorkers", normalized);

  socket.on("addWorker", (raw) => {
    const w = sanitizeWorker(raw);
    if (!w) return; // ignore bad payload
    const exists = workers.some((x) => keyFor({ ...x, level: normLevel(x.level) }) === keyFor(w));
    if (exists) return;
    workers.push(w);
    saveWorkers();
    io.emit("workerAdded", w);
  });

  socket.on("removeWorker", (raw) => {
    const w = sanitizeWorker(raw);
    if (!w) return;
    const before = workers.length;
    workers = workers.filter(
      (x) => keyFor({ ...x, level: normLevel(x.level) }) !== keyFor(w)
    );
    if (workers.length !== before) {
      saveWorkers();
      io.emit("workerRemoved", w);
    }
  });

  socket.on("clearAll", () => {
    workers = [];
    saveWorkers();
    io.emit("allCleared");
  });
});

server.listen(PORT, () => console.log(`🌎 Running on :${PORT}`));
