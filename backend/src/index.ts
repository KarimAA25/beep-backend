import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import cors from "cors";
import { Server } from "socket.io";
import { connectedUsers, KNOWN_USERS, type UserRole } from "./connections";
import { registerRideHandlers } from "./ride";

const PORT = process.env.PORT ?? 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "*";

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CORS_ORIGIN },
});

io.on("connection", (socket) => {
  const auth = socket.handshake.auth as { userId?: string; role?: UserRole };
  const { userId, role } = auth;

  if (!userId || !role || KNOWN_USERS[userId] !== role) {
    console.log(
      `[socket] rejected: ${socket.id} (userId=${userId}, role=${role})`
    );
    socket.emit("identity_rejected", { reason: "unknown userId/role" });
    socket.disconnect(true);
    return;
  }

  connectedUsers.set(userId, { userId, role, socketId: socket.id });
  console.log(`[socket] connected: ${socket.id} as ${userId} (${role})`);

  registerRideHandlers(io, socket, { userId, role });

  socket.on("disconnect", (reason) => {
    // Only clear the registry if this socket is still the current one for userId —
    // a reconnect may have already replaced it (e.g. app backgrounded/foregrounded).
    if (connectedUsers.get(userId)?.socketId === socket.id) {
      connectedUsers.delete(userId);
    }
    console.log(`[socket] disconnected: ${socket.id} as ${userId} (${reason})`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
