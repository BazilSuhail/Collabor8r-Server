const { Server } = require("socket.io");

let io;
const connectedUsers = new Map();
const projectRooms = new Map();

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  console.log("⚡ Socket.IO initialized and ready for connections");

  io.on("connection", (socket) => {
    const { userId } = socket.handshake.auth;

    if (userId) {
      if (connectedUsers.has(userId)) {
        console.log(`🔄 ${userId} reconnected — replacing old socket`);
      }
      connectedUsers.set(userId, socket.id);
      socket.userId = userId;
      console.log(`✅ User ONLINE  → ${userId}  |  Socket: ${socket.id}  |  Total online: ${connectedUsers.size}`);
      io.emit("online-count", { count: connectedUsers.size });
    }

    socket.on("join-project", (projectId) => {
      socket.join(`project:${projectId}`);
      if (!projectRooms.has(projectId)) projectRooms.set(projectId, new Set());
      projectRooms.get(projectId).add(socket.id);
      console.log(`📌 ${userId || 'anon'} joined project room: ${projectId}`);
    });

    socket.on("leave-project", (projectId) => {
      socket.leave(`project:${projectId}`);
      if (projectRooms.has(projectId)) {
        projectRooms.get(projectId).delete(socket.id);
      }
      console.log(`🚪 ${userId || 'anon'} left project room: ${projectId}`);
    });

    socket.on("disconnect", (reason) => {
      const wasUserId = socket.userId;
      for (const [key, value] of connectedUsers.entries()) {
        if (value === socket.id) {
          connectedUsers.delete(key);
          break;
        }
      }
      for (const [, members] of projectRooms) {
        members.delete(socket.id);
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

module.exports = { initSocket, getIo, getOnlineUsers, isUserOnline, sendMessageToUser, sendToProjectRoom, sendInvitationEvent };
