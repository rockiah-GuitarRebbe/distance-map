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

// serve index.html + static files
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// persistent shared data
const DATA_FILE = path.join(__dirname, "workers.json");
let workers = [];
if (fs.existsSync(DATA_FILE)) {
  try { workers = JSON.parse(fs.readFileSync(DATA_FILE)); }
  catch { workers = []; }
}
function saveWorkers() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(workers, null, 2));
}

// socket logic
io.on("connection", socket => {
  console.log("🟢 Client connected");
  socket.emit("initData", { workers });

  socket.on("addWorker", worker => {
    workers.push(worker);
    saveWorkers();
    io.emit("workerAdded", worker);
  });

  socket.on("removeWorker", worker => {
    workers = workers.filter(
      w => !(w.name === worker.name && w.address === worker.address)
    );
    saveWorkers();
    io.emit("workerRemoved", worker);
  });

  socket.on("clearAll", () => {
    workers = [];
    saveWorkers();
    io.emit("allCleared");
  });

  socket.on("disconnect", () => console.log("🔴 Client disconnected"));
});

server.listen(PORT, () => console.log(`🌎 Live on port ${PORT}`));
