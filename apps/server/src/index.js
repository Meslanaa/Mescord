import "dotenv/config";
import cors from "cors";
import express from "express";
import http from "http";
import { Server } from "socket.io";

const PORT = Number(process.env.PORT || 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: CLIENT_ORIGIN.split(",").map((item) => item.trim()),
  }),
);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "mescord-signaling",
    timestamp: Date.now(),
  });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN.split(",").map((item) => item.trim()),
    methods: ["GET", "POST"],
  },
});

const MAX_MESSAGE_LENGTH = 400;
const rooms = new Map();
const socketToRoom = new Map();

function normalizeName(name, socketId) {
  const value = typeof name === "string" ? name.trim().slice(0, 20) : "";
  if (value) {
    return value;
  }

  return `Guest-${socketId.slice(0, 4)}`;
}

function normalizeRoomId(roomId) {
  if (typeof roomId !== "string") {
    return "";
  }

  return roomId.trim().toLowerCase().slice(0, 24);
}

function normalizeColor(color, socketId) {
  if (typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color.trim())) {
    return color.trim();
  }

  const palette = ["#ff7a18", "#00c6ff", "#ff4d6d", "#8ac926", "#ffd166", "#06d6a0", "#4cc9f0"];
  const index = socketId.charCodeAt(socketId.length - 1) % palette.length;
  return palette[index];
}

function normalizeMessage(text) {
  if (typeof text !== "string") {
    return "";
  }

  return text.trim().slice(0, MAX_MESSAGE_LENGTH);
}

function getRoomRecord(roomId) {
  return rooms.get(roomId);
}

function ensureRoom(roomId, ownerId) {
  const existing = getRoomRecord(roomId);
  if (existing) {
    return existing;
  }

  const created = {
    ownerId,
    createdAt: Date.now(),
    users: new Map(),
  };

  rooms.set(roomId, created);
  return created;
}

function serializeUser(user, ownerId) {
  return {
    ...user,
    role: user.id === ownerId ? "owner" : "member",
  };
}

function getRoomUsers(roomId) {
  const room = getRoomRecord(roomId);
  if (!room) {
    return [];
  }

  return Array.from(room.users.values()).map((user) => serializeUser(user, room.ownerId));
}

function emitRoomMeta(roomId) {
  const room = getRoomRecord(roomId);
  if (!room) {
    return;
  }

  io.to(roomId).emit("room_meta", {
    roomId,
    ownerId: room.ownerId,
    userCount: room.users.size,
  });
}

function broadcastRoomUsers(roomId) {
  io.to(roomId).emit("room_users", {
    users: getRoomUsers(roomId),
  });

  emitRoomMeta(roomId);
}

function ensureOwner(roomId) {
  const room = getRoomRecord(roomId);
  if (!room) {
    return;
  }

  if (room.users.size === 0) {
    rooms.delete(roomId);
    return;
  }

  if (room.ownerId && room.users.has(room.ownerId)) {
    return;
  }

  const nextOwner = Array.from(room.users.values()).sort((a, b) => a.joinedAt - b.joinedAt)[0];
  room.ownerId = nextOwner.id;

  io.to(roomId).emit("room_owner_changed", {
    ownerId: room.ownerId,
  });
}

function leaveCurrentRoom(socket, options = {}) {
  const { reason = "left", emitNotice = false, noticeMessage = "" } = options;
  const roomId = socketToRoom.get(socket.id);
  if (!roomId) {
    return;
  }

  const room = getRoomRecord(roomId);
  socketToRoom.delete(socket.id);

  if (!room) {
    return;
  }

  room.users.delete(socket.id);
  socket.leave(roomId);

  socket.to(roomId).emit("peer_left", { id: socket.id, reason });

  ensureOwner(roomId);
  if (!rooms.has(roomId)) {
    return;
  }

  broadcastRoomUsers(roomId);

  if (emitNotice && noticeMessage) {
    socket.emit("moderation_notice", {
      type: "kicked",
      roomId,
      message: noticeMessage,
    });
  }
}

io.on("connection", (socket) => {
  socket.on("join_room", (payload = {}) => {
    const roomId = normalizeRoomId(payload.roomId);
    if (!roomId) {
      socket.emit("error_event", { message: "Gecerli bir oda adi gir." });
      return;
    }

    leaveCurrentRoom(socket);

    const room = ensureRoom(roomId, socket.id);
    if (!room.ownerId || !room.users.has(room.ownerId)) {
      room.ownerId = socket.id;
    }

    const user = {
      id: socket.id,
      name: normalizeName(payload.name, socket.id),
      color: normalizeColor(payload.color, socket.id),
      muted: false,
      joinedAt: Date.now(),
    };

    room.users.set(socket.id, user);
    socketToRoom.set(socket.id, roomId);
    socket.join(roomId);

    const users = getRoomUsers(roomId).filter((item) => item.id !== socket.id);

    socket.emit("joined_room", {
      roomId,
      selfId: socket.id,
      ownerId: room.ownerId,
      users,
    });

    socket.to(roomId).emit("peer_joined", serializeUser(user, room.ownerId));
    broadcastRoomUsers(roomId);
  });

  socket.on("leave_room", () => {
    leaveCurrentRoom(socket);
  });

  socket.on("mute_state", (payload = {}) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      return;
    }

    const room = getRoomRecord(roomId);
    if (!room) {
      return;
    }

    const user = room.users.get(socket.id);
    if (!user) {
      return;
    }

    const muted = Boolean(payload.muted);
    user.muted = muted;
    room.users.set(socket.id, user);

    io.to(roomId).emit("peer_muted", {
      id: socket.id,
      muted,
    });
  });

  socket.on("reaction", (payload = {}) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      return;
    }

    const room = getRoomRecord(roomId);
    if (!room) {
      return;
    }

    const user = room.users.get(socket.id);
    if (!user) {
      return;
    }

    const emoji = typeof payload.emoji === "string" ? payload.emoji.slice(0, 2) : "";
    if (!emoji) {
      return;
    }

    io.to(roomId).emit("reaction", {
      id: socket.id,
      name: user.name,
      color: user.color,
      emoji,
      at: Date.now(),
    });
  });

  socket.on("chat_message", (payload = {}) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      return;
    }

    const room = getRoomRecord(roomId);
    if (!room) {
      return;
    }

    const user = room.users.get(socket.id);
    if (!user) {
      return;
    }

    const text = normalizeMessage(payload.text);
    if (!text) {
      return;
    }

    io.to(roomId).emit("chat_message", {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      roomId,
      fromId: socket.id,
      fromName: user.name,
      fromColor: user.color,
      text,
      at: Date.now(),
    });
  });

  socket.on("kick_user", (payload = {}) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      return;
    }

    const room = getRoomRecord(roomId);
    if (!room) {
      return;
    }

    if (room.ownerId !== socket.id) {
      socket.emit("error_event", { message: "Bu islem icin oda sahibi olmalisin." });
      return;
    }

    const actor = room.users.get(socket.id);
    const targetId = typeof payload.targetId === "string" ? payload.targetId : "";
    if (!actor || !targetId || targetId === socket.id || !room.users.has(targetId)) {
      return;
    }

    const targetSocket = io.sockets.sockets.get(targetId);
    if (!targetSocket) {
      room.users.delete(targetId);
      ensureOwner(roomId);
      broadcastRoomUsers(roomId);
      return;
    }

    leaveCurrentRoom(targetSocket, {
      reason: "kicked",
      emitNotice: true,
      noticeMessage: `${actor.name} tarafindan odadan cikarildin.`,
    });
  });

  socket.on("mute_all", () => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      return;
    }

    const room = getRoomRecord(roomId);
    if (!room) {
      return;
    }

    if (room.ownerId !== socket.id) {
      socket.emit("error_event", { message: "Bu islem icin oda sahibi olmalisin." });
      return;
    }

    const actor = room.users.get(socket.id);
    if (!actor) {
      return;
    }

    room.users.forEach((user, userId) => {
      if (userId === socket.id) {
        return;
      }

      if (!user.muted) {
        user.muted = true;
        room.users.set(userId, user);
      }

      io.to(roomId).emit("peer_muted", {
        id: userId,
        muted: true,
      });

      const targetSocket = io.sockets.sockets.get(userId);
      targetSocket?.emit("force_mute", {
        by: socket.id,
      });
    });

    io.to(roomId).emit("moderation_notice", {
      type: "mute_all",
      by: socket.id,
      message: `${actor.name} tum katilimcilari susturdu.`,
    });

    broadcastRoomUsers(roomId);
  });

  socket.on("webrtc_offer", ({ to, sdp } = {}) => {
    if (!to || !sdp) {
      return;
    }

    io.to(to).emit("webrtc_offer", {
      from: socket.id,
      sdp,
    });
  });

  socket.on("webrtc_answer", ({ to, sdp } = {}) => {
    if (!to || !sdp) {
      return;
    }

    io.to(to).emit("webrtc_answer", {
      from: socket.id,
      sdp,
    });
  });

  socket.on("webrtc_ice_candidate", ({ to, candidate } = {}) => {
    if (!to || !candidate) {
      return;
    }

    io.to(to).emit("webrtc_ice_candidate", {
      from: socket.id,
      candidate,
    });
  });

  socket.on("disconnect", () => {
    leaveCurrentRoom(socket, { reason: "disconnect" });
  });
});

server.listen(PORT, () => {
  console.log(`Mescord signaling server listening on http://localhost:${PORT}`);
});
