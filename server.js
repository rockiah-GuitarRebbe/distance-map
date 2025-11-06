// ======================
// Distance Map Server — Real-time edition
// ======================

import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files
app.use(express.static(__dirname));

// Serve main HTML
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "Distance Excel.html"));
});

// Store workers (temporary in-memory)
let workers = [];

// --- Socket.IO events ---
io.on("connection", (socket) => {
  console.log("🟢 User connected");

  // Send current worker list to new user
  socket.emit("loadWorkers", workers);

  // When a worker is added
  socket.on("addWorker", (worker) => {
    workers.push(worker);
    io.emit("workerAdded", worker); // broadcast to everyone
  });

  // When a worker is deleted
  socket.on("deleteWorker", (worker) => {
    workers = workers.filter(
      (w) => !(w.name === worker.name && w.address === worker.address)
    );
    io.emit("workerDeleted", worker);
  });

  socket.on("disconnect", () => {
    console.log("🔴 User disconnected");
  });
});

server.listen(PORT, () => {
  console.log(`🌎 Server running on port ${PORT}`);
});
