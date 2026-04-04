const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { createAdapter } = require("@socket.io/redis-adapter");
const { pubClient, subClient } = require("./config/redis");

let io;
const connectedUsers = new Map();

const PRESENCE_PREFIX = "presence";
const ROOM_PREFIX = "room:project";

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*",
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
    const { userId } = socket.handshake.auth;
    const token = socket.handshake.auth.token;

    let verifiedUserId = userId;

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        verifiedUserId = decoded.id || decoded.userId || decoded._id || userId;
      } catch (err) {
        console.warn(`⚠️  Socket auth failed: ${err.message}`);
        socket.disconnect(true);
        return;
      }
    }

    if (verifiedUserId) {
      if (connectedUsers.has(verifiedUserId)) {
        console.log(`🔄 ${verifiedUserId} reconnected — replacing old socket`);
      }
      connectedUsers.set(verifiedUserId, socket.id);
      socket.userId = verifiedUserId;

      if (pubClient) {
        await pubClient.sadd(`${PRESENCE_PREFIX}:${verifiedUserId}`, socket.id);
        await pubClient.set(`${PRESENCE_PREFIX}:${verifiedUserId}:ts`, Date.now(), "EX", 300);
      }

      console.log(`✅ User ONLINE  → ${verifiedUserId}  |  Socket: ${socket.id}  |  Total online: ${connectedUsers.size}`);
      io.emit("online-count", { count: connectedUsers.size });
    }

    socket.on("join-project", async (projectId) => {
      socket.join(`project:${projectId}`);
      if (verifiedUserId && pubClient) {
        await pubClient.sadd(`${ROOM_PREFIX}:${projectId}`, verifiedUserId);
      }
      console.log(`📌 ${verifiedUserId || "anon"} joined project room: ${projectId}`);

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
        await pubClient.srem(`${ROOM_PREFIX}:${projectId}`, verifiedUserId);
      }
      console.log(`🚪 ${verifiedUserId || "anon"} left project room: ${projectId}`);

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

      try {
        const ChatMessage = require("./models/chatMessage");
        const Profile = require("./models/profile");

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
        console.error("chat:message error:", err.message);
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
        console.log(`❌ User OFFLINE → ${wasUserId}  |  Reason: ${reason}  |  Total online: ${connectedUsers.size}`);
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
