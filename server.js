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

// Serve everything in the same directory (index.html etc.)
app.use(express.static(__dirname));

// Default route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// === Persistent data file ===
const DATA_FILE = path.join(__dirname, "workers.json");

// Load workers from disk
let clients = [];
if (fs.existsSync(DATA_FILE)) {
  try {
    clients = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    clients = [];
  }
}

// Save to file
function saveClients() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(clients, null, 2));
}

// === Socket.io Sync Logic ===
io.on("connection", (socket) => {
  console.log("🟢 Client connected:", socket.id);

  // Send all current clients to new browser
  socket.emit("initData", clients);

  // Add client
  socket.on("addClient", (client) => {
    clients.push(client);
    saveClients();
    io.emit("clientAdded", client);
  });

  // Remove client
  socket.on("removeClient", (client) => {
    clients = clients.filter(
      (c) => !(c.name === client.name && c.address === client.address)
    );
    saveClients();
    io.emit("clientRemoved", client);
  });

  // Clear all clients
  socket.on("clearAll", () => {
    clients = [];
    saveClients();
    io.emit("allCleared");
  });

  socket.on("disconnect", () => {
    console.log("🔴 Disconnected:", socket.id);
  });
});

// === Start Server ===
server.listen(PORT, () => {
  console.log(`🌎 Shared Distance Map running on port ${PORT}`);
});
