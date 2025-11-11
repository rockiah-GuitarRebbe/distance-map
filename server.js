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

// serve static files
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// persistent worker + therapist state
const DATA_FILE = path.join(__dirname, "workers.json");
let workers = [];
let therapist = null;

if (fs.existsSync(DATA_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE));
    workers = saved.workers || [];
    therapist = saved.therapist || null;
  } catch {
    workers = [];
    therapist = null;
  }
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ workers, therapist }, null, 2));
}

// socket.io logic
io.on("connection", (socket) => {
  console.log("🟢 New client connected");
  socket.emit("initData", { workers, therapist });

  socket.on("addWorker", (worker) => {
    workers.push(worker);
    saveData();
    io.emit("workerAdded", worker);
  });

  socket.on("removeWorker", (worker) => {
    workers = workers.filter(
      (w) => !(w.name === worker.name && w.address === worker.address)
    );
    saveData();
    io.emit("workerRemoved", worker);
  });

  socket.on("clearAll", () => {
    workers = [];
    therapist = null;
    saveData();
    io.emit("allCleared");
  });

  socket.on("setTherapist", (t) => {
    therapist = t;
    saveData();
    io.emit("therapistUpdated", therapist);
  });

  socket.on("clearTherapist", () => {
    therapist = null;
    saveData();
    io.emit("therapistCleared");
  });

  socket.on("disconnect", () => console.log("🔴 Client disconnected"));
});

server.listen(PORT, () => console.log(`🌎 Server running on port ${PORT}`));
