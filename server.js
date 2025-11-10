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

app.use(express.static(__dirname));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "Distance Excel.html"));
});

const DATA_FILE = path.join(__dirname, "workers.json");
let workers = [];
let therapist = null;

if (fs.existsSync(DATA_FILE)) {
  try { workers = JSON.parse(fs.readFileSync(DATA_FILE)); }
  catch { workers = []; }
}

function saveWorkers() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(workers, null, 2));
}

io.on("connection", (socket) => {
  console.log("🟢 Client connected");

  // Send all current data to new client
  socket.emit("currentWorkers", workers);
  socket.emit("currentTherapist", therapist);

  // Worker handling
  socket.on("addWorker", (worker) => {
    workers.push(worker);
    saveWorkers();
    io.emit("workerAdded", worker);
  });

  socket.on("clearAll", () => {
    workers = [];
    therapist = null;
    saveWorkers();
    io.emit("allCleared");
  });

  // Therapist sync
  socket.on("setTherapist", (data) => {
    therapist = data;
    io.emit("therapistUpdated", data);
  });

  socket.on("clearTherapist", () => {
    therapist = null;
    io.emit("therapistCleared");
  });

  // Cancel uploads globally
  socket.on("cancelUploads", () => {
    io.emit("cancelUploads");
  });

  socket.on("disconnect", () => console.log("🔴 Client disconnected"));
});

server.listen(PORT, () => console.log(`🌎 Running on port ${PORT}`));
