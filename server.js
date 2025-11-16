// path: server.js
import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";

// Why: allow PORT override in hosting; default 3000 for local dev.
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const HOST = process.env.HOST || "0.0.0.0";

const app = express();
app.disable("x-powered-by"); // why: minor security hardening
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Serve static client files from ./public (e.g., index.html, client js)
app.use(express.static("public", { fallthrough: true }));

// Simple health check for uptime monitors
app.get("/health", (_req, res) => res.status(200).json({ ok: true }));

// Central error handler (last middleware)
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

const httpServer = createServer(app);

// Socket.IO on same server
const io = new SocketIOServer(httpServer, {
  // why: defaults safe for same-origin; tweak if serving from another host
  cors: false,
});

// Socket handlers
io.on("connection", (socket) => {
  console.log(`[io] connected ${socket.id}`);

  // Example: client → server → everyone (except sender)
  socket.on("broadcast", (payload) => {
    // why: decouple from client naming; validate minimally
    if (payload && typeof payload === "object") {
      socket.broadcast.emit("broadcast", payload);
    }
  });

  // Example: join/leave rooms
  socket.on("join", (room) => {
    if (typeof room === "string" && room) {
      socket.join(room);
      socket.emit("joined", room);
    }
  });

  socket.on("leave", (room) => {
    if (typeof room === "string" && room) {
      socket.leave(room);
      socket.emit("left", room);
    }
  });

  // Example: send to a room
  socket.on("room:event", ({ room, data }) => {
    if (typeof room === "string" && room) {
      socket.to(room).emit("room:event", { from: socket.id, data });
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(`[io] disconnected ${socket.id} (${reason})`);
  });
});

// Start + graceful shutdown
httpServer.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
});

const shutdown = (signal) => {
  console.log(`\nReceived ${signal}. Closing...`);
  // stop accepting new connections
  httpServer.close((err) => {
    if (err) {
      console.error("HTTP close error:", err);
      process.exit(1);
    }
    // close websockets
    io.close(() => process.exit(0));
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
