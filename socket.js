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
      connectedUsers.set(userId, socket.id);
      socket.userId = userId;
    }

    socket.on("join-project", (projectId) => {
      socket.join(`project:${projectId}`);
      if (!projectRooms.has(projectId)) projectRooms.set(projectId, new Set());
      projectRooms.get(projectId).add(socket.id);
    });

    socket.on("leave-project", (projectId) => {
      socket.leave(`project:${projectId}`);
      if (projectRooms.has(projectId)) {
        projectRooms.get(projectId).delete(socket.id);
      }
    });

    socket.on("disconnect", () => {
      for (const [key, value] of connectedUsers.entries()) {
        if (value === socket.id) {
          connectedUsers.delete(key);
          break;
        }
      }
      for (const [, members] of projectRooms) {
        members.delete(socket.id);
      }
    });
  });
};

const getIo = () => {
  if (!io) throw new Error("Socket.IO has not been initialized!");
  return io;
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

module.exports = { initSocket, getIo, sendMessageToUser, sendToProjectRoom };
