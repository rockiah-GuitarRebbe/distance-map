// path: server.js
import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const HOST = process.env.HOST || "0.0.0.0";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use(express.static("public", { fallthrough: true }));
app.get("/health", (_req, res) => res.status(200).json({ ok: true }));
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, { cors: false });

io.on("connection", (socket) => {
  console.log(`[io] connected ${socket.id}`);

  socket.on("broadcast", (payload) => {
    if (payload && typeof payload === "object") {
      socket.broadcast.emit("broadcast", payload);
    }
  });

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

  socket.on("room:event", ({ room, data }) => {
    if (typeof room === "string" && room) {
      socket.to(room).emit("room:event", { from: socket.id, data });
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(`[io] disconnected ${socket.id} (${reason})`);
  });
});

httpServer.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
});

const shutdown = (signal) => {
  console.log(`\nReceived ${signal}. Closing...`);
  httpServer.close((err) => {
    if (err) {
      console.error("HTTP close error:", err);
      process.exit(1);
    }
    io.close(() => process.exit(0));
  });
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
