const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { createAdapter } = require("@socket.io/redis-adapter");
const { pubClient, subClient } = require("./config/redis");

let io;
const connectedUsers = new Map();

const PRESENCE_PREFIX = "presence";
const ROOM_PREFIX = "room:project";

const initSocket = (server) => {
  const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
    : "*";
  io = new Server(server, {
    cors: {
      origin: corsOrigins,
      methods: ["GET", "POST"],
    },
  });

  if (pubClient && subClient) {
    io.adapter(createAdapter(pubClient, subClient));
    console.log("⚡ Socket.IO Redis adapter attached");
  } else {
    console.log("⚡ Socket.IO running in-memory (no Redis)");
  }

  console.log("⚡ Socket.IO initialized and ready for connections");

  io.on("connection", async (socket) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      console.warn("⚠️  Socket connection rejected: no token");
      socket.disconnect(true);
      return;
    }

    let verifiedUserId;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      verifiedUserId = decoded.id || decoded.userId || decoded._id;
      if (!verifiedUserId) throw new Error("No user id in token");
    } catch (err) {
      console.warn(`⚠️  Socket auth failed: ${err.message}`);
      socket.disconnect(true);
      return;
    }

    connectedUsers.set(verifiedUserId, socket.id);
    socket.userId = verifiedUserId;

    if (pubClient) {
      try {
        await pubClient.sadd(`${PRESENCE_PREFIX}:${verifiedUserId}`, socket.id);
        await pubClient.set(`${PRESENCE_PREFIX}:${verifiedUserId}:ts`, Date.now(), "EX", 300);
      } catch (_) {}
    }

    try {
      const { Profile } = require("./auth/models");
      const profile = await Profile.findById(verifiedUserId).select("email name").lean();
      const email = profile?.email || "unknown";
      const name = profile?.name || "unknown";
      socket.userEmail = email;
      socket.userName = name;
      console.log(`✅ CONNECTED  →  ${name} (${email})  |  Socket: ${socket.id}  |  Total: ${connectedUsers.size}`);
    } catch (e) {
      console.log(`✅ CONNECTED  →  ${verifiedUserId}  |  Socket: ${socket.id}  |  Total: ${connectedUsers.size}`);
    }

    io.emit("online-count", { count: connectedUsers.size });

    socket.on("join-project", async (projectId) => {
      try {
        const { Membership } = require("./projects/models");
        const membership = await Membership.findById(verifiedUserId)
          .select("admin asLead joined")
          .lean();
        const pid = String(projectId);
        const inBucket =
          membership &&
          ((membership.admin || []).some((x) => String(x) === pid) ||
            (membership.asLead || []).some((x) => String(x) === pid) ||
            (membership.joined || []).some((x) => String(x) === pid));
        if (!inBucket) {
          socket.emit("join:error", { error: "Not a member of this project" });
          return;
        }
      } catch (_) {
        socket.emit("join:error", { error: "Failed to join project" });
        return;
      }

      socket.join(`project:${projectId}`);
      if (verifiedUserId && pubClient) {
        try {
          await pubClient.sadd(`${ROOM_PREFIX}:${projectId}`, verifiedUserId);
        } catch (_) {}
      }

      if (verifiedUserId) {
        io.to(`project:${projectId}`).emit("member:online", {
          userId: verifiedUserId,
          socketId: socket.id,
        });
      }
    });

    socket.on("leave-project", async (projectId) => {
      socket.leave(`project:${projectId}`);
      if (verifiedUserId && pubClient) {
        try {
          await pubClient.srem(`${ROOM_PREFIX}:${projectId}`, verifiedUserId);
        } catch (_) {}
      }

      if (verifiedUserId) {
        io.to(`project:${projectId}`).emit("member:offline", {
          userId: verifiedUserId,
          socketId: socket.id,
        });
      }
    });

    socket.on("chat:message", async (data) => {
      const { projectId, content, type } = data || {};
      if (!projectId || !content || !verifiedUserId) return;
      if (typeof content !== "string" || content.length > 5000) return;

      try {
        const { ChatMessage } = require("./chat/models");
        const { Profile } = require("./auth/models");

        const message = await ChatMessage.create({
          projectId,
          userId: verifiedUserId,
          content,
          type: type || "text",
        });

        const user = await Profile.findById(verifiedUserId).select("name avatar").lean();

        io.to(`project:${projectId}`).emit("chat:message", {
          _id: message._id,
          projectId,
          userId: verifiedUserId,
          content,
          type: message.type,
          createdAt: message.createdAt,
          user: user || { name: "Unknown", avatar: null },
        });
      } catch (err) {
        socket.emit("chat:error", { error: "Failed to send message" });
      }
    });

    socket.on("disconnect", async (reason) => {
      const wasUserId = socket.userId;
      for (const [key, value] of connectedUsers.entries()) {
        if (value === socket.id) {
          connectedUsers.delete(key);
          break;
        }
      }

      if (wasUserId && pubClient) {
        await pubClient.srem(`${PRESENCE_PREFIX}:${wasUserId}`, socket.id);
        const remaining = await pubClient.scard(`${PRESENCE_PREFIX}:${wasUserId}`);
        if (remaining === 0) {
          await pubClient.del(`${PRESENCE_PREFIX}:${wasUserId}`);
          await pubClient.del(`${PRESENCE_PREFIX}:${wasUserId}:ts`);
        }
      }

      if (wasUserId) {
        const email = socket.userEmail || wasUserId;
        const name = socket.userName || wasUserId;
        console.log(`❌ DISCONNECTED  →  ${name} (${email})  |  Socket: ${socket.id}  |  Reason: ${reason}  |  Total: ${connectedUsers.size}`);
        io.emit("online-count", { count: connectedUsers.size });
      }
    });
  });
};

const getIo = () => {
  if (!io) throw new Error("Socket.IO has not been initialized!");
  return io;
};

const getOnlineUsers = () => {
  return Array.from(connectedUsers.keys());
};

const isUserOnline = (userId) => {
  return connectedUsers.has(userId);
};

const sendMessageToUser = (userId, message) => {
  const socketId = connectedUsers.get(userId);
  if (socketId) {
    io.to(socketId).emit("notification", message);
  }
};

const sendToProjectRoom = (projectId, event, data) => {
  io.to(`project:${projectId}`).emit(event, data);
};

const sendInvitationEvent = (userId, invitation) => {
  const socketId = connectedUsers.get(userId);
  if (socketId) {
    io.to(socketId).emit("invitation", invitation);
  }
};

const getOnlineProjectMembers = async (projectId) => {
  if (!pubClient) {
    return Array.from(connectedUsers.keys());
  }
  const members = await pubClient.smembers(`${ROOM_PREFIX}:${projectId}`);
  return members;
};

module.exports = {
  initSocket,
  getIo,
  getOnlineUsers,
  isUserOnline,
  sendMessageToUser,
  sendToProjectRoom,
  sendInvitationEvent,
  getOnlineProjectMembers,
};
