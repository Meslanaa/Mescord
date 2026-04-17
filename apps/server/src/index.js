import "dotenv/config";
import cors from "cors";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { createSocialRouter } from "./socialRoutes.js";
import { SocialStore } from "./socialStore.js";

const PORT = Number(process.env.PORT || 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173,http://localhost:5174";

function createAllowedOrigins(rawValue) {
  const exact = new Set();
  const wildcard = [];

  String(rawValue || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      if (item === "*") {
        exact.add(item);
        return;
      }

      if (item.includes("*")) {
        const escaped = item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = `^${escaped.replace(/\\\*/g, ".*")}$`;
        wildcard.push(new RegExp(pattern, "i"));
        return;
      }

      exact.add(item);
    });

  return {
    exact,
    wildcard,
  };
}

const allowedOrigins = createAllowedOrigins(CLIENT_ORIGIN);

function isOriginAllowed(origin) {
  if (!origin || origin === "null") {
    // Electron renderer requests from file:// origin are sent as "null".
    return true;
  }

  if (allowedOrigins.exact.has("*")) {
    return true;
  }

  if (allowedOrigins.exact.has(origin)) {
    return true;
  }

  return allowedOrigins.wildcard.some((regex) => regex.test(origin));
}

const corsOptions = {
  origin(origin, callback) {
    if (isOriginAllowed(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin engellendi: ${origin || "unknown"}`));
  },
};

const app = express();
const socialStore = new SocialStore();
app.use(express.json());
app.use(
  cors(corsOptions),
);
app.use("/api", createSocialRouter({ store: socialStore }));

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
    origin(origin, callback) {
      if (isOriginAllowed(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Socket origin engellendi: ${origin || "unknown"}`));
    },
    methods: ["GET", "POST"],
  },
});

const MAX_MESSAGE_LENGTH = 400;
const rooms = new Map();
const socketToRoom = new Map();
const socketToUserId = new Map();
const userToSocketIds = new Map();
const socketToGroupChannel = new Map();
const channelTypingUsers = new Map();

function createGroupChannelRoomKey(groupId, channelId) {
  return `group_channel:${groupId}:${channelId}`;
}

function createTypingKey(groupId, channelId) {
  return `${groupId}:${channelId}`;
}

function emitTypingState(groupId, channelId) {
  const typingKey = createTypingKey(groupId, channelId);
  const roomKey = createGroupChannelRoomKey(groupId, channelId);
  const users = Array.from(channelTypingUsers.get(typingKey)?.values() || []);

  io.to(roomKey).emit("group_channel_typing", {
    groupId,
    channelId,
    users,
  });
}

function clearSocketTypingState(socket) {
  const activeChannel = socketToGroupChannel.get(socket.id);
  if (!activeChannel) {
    return;
  }

  const userId = socketToUserId.get(socket.id);
  if (!userId) {
    return;
  }

  const typingKey = createTypingKey(activeChannel.groupId, activeChannel.channelId);
  const typingUsers = channelTypingUsers.get(typingKey);
  if (!typingUsers) {
    return;
  }

  typingUsers.delete(userId);
  if (typingUsers.size === 0) {
    channelTypingUsers.delete(typingKey);
  }

  emitTypingState(activeChannel.groupId, activeChannel.channelId);
}

function leaveActiveGroupChannel(socket) {
  const activeChannel = socketToGroupChannel.get(socket.id);
  if (!activeChannel) {
    return;
  }

  clearSocketTypingState(socket);
  socket.leave(activeChannel.roomKey);
  socketToGroupChannel.delete(socket.id);
}

function bindAuthenticatedSocket(socket, userId) {
  const previousUserId = socketToUserId.get(socket.id);
  if (previousUserId && previousUserId !== userId) {
    leaveActiveGroupChannel(socket);
    const previousSockets = userToSocketIds.get(previousUserId);
    if (previousSockets) {
      previousSockets.delete(socket.id);
      if (previousSockets.size === 0) {
        userToSocketIds.delete(previousUserId);
      }
    }
  }

  socketToUserId.set(socket.id, userId);

  const socketIds = userToSocketIds.get(userId) || new Set();
  socketIds.add(socket.id);
  userToSocketIds.set(userId, socketIds);
}

function unbindAuthenticatedSocket(socket) {
  leaveActiveGroupChannel(socket);

  const userId = socketToUserId.get(socket.id);
  socketToUserId.delete(socket.id);
  if (!userId) {
    return null;
  }

  const socketIds = userToSocketIds.get(userId);
  if (!socketIds) {
    return {
      userId,
      becameOffline: true,
    };
  }

  socketIds.delete(socket.id);
  let becameOffline = false;
  if (socketIds.size === 0) {
    userToSocketIds.delete(userId);
    becameOffline = true;
  }

  return {
    userId,
    becameOffline,
  };
}

function emitPresenceUpdate(userId) {
  const profile = socialStore.getPublicUserById(userId);
  if (!profile) {
    return;
  }

  const friendIds = socialStore.listFriends(userId).map((friend) => friend.id);
  const targetIds = [userId, ...friendIds];

  targetIds.forEach((targetId) => {
    const socketIds = userToSocketIds.get(targetId);
    if (!socketIds) {
      return;
    }

    socketIds.forEach((socketId) => {
      io.to(socketId).emit("presence_update", { user: profile });
    });
  });
}

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
    isLocked: false,
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
    isLocked: room.isLocked,
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
  socket.on("social_auth", (payload = {}) => {
    const token = typeof payload.token === "string" ? payload.token.trim() : "";
    if (!token) {
      socket.emit("social_auth_error", { message: "Socket auth token gerekli." });
      return;
    }

    const user = socialStore.getUserByToken(token);
    if (!user) {
      socket.emit("social_auth_error", { message: "Gecersiz veya suresi dolmus token." });
      return;
    }

    bindAuthenticatedSocket(socket, user.id);

    const presence = socialStore.getPresenceSnapshot(user.id);
    socket.emit("social_auth_ok", {
      user: socialStore.toPublicUser(user),
      presence,
    });

    emitPresenceUpdate(user.id);
  });

  socket.on("social_presence_set", (payload = {}) => {
    const userId = socketToUserId.get(socket.id);
    if (!userId) {
      socket.emit("social_auth_error", { message: "Presence degistirmek icin once socket auth yap." });
      return;
    }

    try {
      const result = socialStore.updatePresenceStatus(userId, payload.status);
      socket.emit("presence_ack", result);
      emitPresenceUpdate(userId);
    } catch (error) {
      socket.emit("group_channel_error", {
        code: error?.code || "presence_update_failed",
        message: error?.message || "Presence guncellenemedi.",
      });
    }
  });

  socket.on("group_channel_subscribe", (payload = {}) => {
    const userId = socketToUserId.get(socket.id);
    if (!userId) {
      socket.emit("social_auth_error", { message: "Kanal baglantisi icin once socket auth yap." });
      return;
    }

    const groupId = typeof payload.groupId === "string" ? payload.groupId.trim() : "";
    const channelId = typeof payload.channelId === "string" ? payload.channelId.trim() : "";
    if (!groupId || !channelId) {
      socket.emit("group_channel_error", {
        code: "invalid_channel_subscription",
        message: "Gecerli grup ve kanal secmelisin.",
      });
      return;
    }

    try {
      const bootstrap = socialStore.listGroupChannelMessages(userId, groupId, channelId);

      leaveActiveGroupChannel(socket);

      const roomKey = createGroupChannelRoomKey(groupId, channelId);
      socket.join(roomKey);
      socketToGroupChannel.set(socket.id, {
        groupId,
        channelId,
        roomKey,
      });

      socket.emit("group_channel_bootstrap", {
        ...bootstrap,
        viewer: socialStore.getPublicUserById(userId),
      });

      emitTypingState(groupId, channelId);
    } catch (error) {
      socket.emit("group_channel_error", {
        code: error?.code || "channel_subscribe_failed",
        message: error?.message || "Kanal baglantisi basarisiz.",
      });
    }
  });

  socket.on("group_channel_leave", () => {
    leaveActiveGroupChannel(socket);
  });

  socket.on("group_channel_typing", (payload = {}) => {
    const userId = socketToUserId.get(socket.id);
    const activeChannel = socketToGroupChannel.get(socket.id);
    if (!userId || !activeChannel) {
      return;
    }

    const isTyping = Boolean(payload.isTyping);
    const typingKey = createTypingKey(activeChannel.groupId, activeChannel.channelId);

    if (!channelTypingUsers.has(typingKey)) {
      channelTypingUsers.set(typingKey, new Map());
    }

    const typingUsers = channelTypingUsers.get(typingKey);
    if (isTyping) {
      const profile = socialStore.getPublicUserById(userId);
      if (!profile) {
        return;
      }

      typingUsers.set(userId, {
        id: profile.id,
        username: profile.username,
        displayName: profile.displayName,
      });
    } else {
      typingUsers.delete(userId);
      if (typingUsers.size === 0) {
        channelTypingUsers.delete(typingKey);
      }
    }

    emitTypingState(activeChannel.groupId, activeChannel.channelId);
  });

  socket.on("group_channel_message", (payload = {}) => {
    const userId = socketToUserId.get(socket.id);
    const activeChannel = socketToGroupChannel.get(socket.id);
    if (!userId || !activeChannel) {
      socket.emit("group_channel_error", {
        code: "channel_not_subscribed",
        message: "Mesaj gondermek icin once bir kanala baglan.",
      });
      return;
    }

    try {
      const message = socialStore.sendGroupChannelMessage(
        userId,
        activeChannel.groupId,
        activeChannel.channelId,
        payload,
      );

      const roomKey = createGroupChannelRoomKey(activeChannel.groupId, activeChannel.channelId);
      io.to(roomKey).emit("group_channel_message", message);

      const typingKey = createTypingKey(activeChannel.groupId, activeChannel.channelId);
      const typingUsers = channelTypingUsers.get(typingKey);
      if (typingUsers?.has(userId)) {
        typingUsers.delete(userId);
        if (typingUsers.size === 0) {
          channelTypingUsers.delete(typingKey);
        }
        emitTypingState(activeChannel.groupId, activeChannel.channelId);
      }
    } catch (error) {
      socket.emit("group_channel_error", {
        code: error?.code || "channel_message_failed",
        message: error?.message || "Mesaj gonderilemedi.",
      });
    }
  });

  socket.on("join_room", (payload = {}) => {
    const roomId = normalizeRoomId(payload.roomId);
    if (!roomId) {
      socket.emit("error_event", { message: "Gecerli bir oda adi gir." });
      return;
    }

    leaveCurrentRoom(socket);

    const existingRoom = getRoomRecord(roomId);
    if (existingRoom?.isLocked) {
      socket.emit("error_event", { message: "Bu oda kilitli. Oda sahibinin kilidi acmasi gerekiyor." });
      return;
    }

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
      isLocked: room.isLocked,
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

  socket.on("set_room_lock", (payload = {}) => {
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

    const nextLocked = Boolean(payload.locked);
    if (room.isLocked === nextLocked) {
      return;
    }

    room.isLocked = nextLocked;
    emitRoomMeta(roomId);

    io.to(roomId).emit("room_lock_changed", {
      roomId,
      isLocked: nextLocked,
      by: socket.id,
    });

    const actor = room.users.get(socket.id);
    if (actor) {
      io.to(roomId).emit("moderation_notice", {
        type: nextLocked ? "room_locked" : "room_unlocked",
        by: socket.id,
        message: nextLocked
          ? `${actor.name} odayi yeni katilimcilara kilitledi.`
          : `${actor.name} oda kilidini kaldirdi.`,
      });
    }
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

    const disconnected = unbindAuthenticatedSocket(socket);
    if (disconnected?.becameOffline) {
      try {
        socialStore.updatePresenceStatus(disconnected.userId, "offline");
        emitPresenceUpdate(disconnected.userId);
      } catch {
        // Ignore disconnect-time persistence errors.
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Mescord signaling server listening on http://localhost:${PORT}`);
});
