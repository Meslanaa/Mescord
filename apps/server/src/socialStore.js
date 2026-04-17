import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const MAX_DM_MESSAGES = 1200;
const MAX_DM_TEXT_LENGTH = 1200;
const MAX_GROUP_MESSAGES = 4000;
const MAX_GROUP_MESSAGE_TEXT_LENGTH = 1800;
const PRESENCE_STATUSES = new Set(["online", "idle", "dnd", "invisible", "offline"]);

const DEFAULT_STATE = {
  users: [],
  sessions: [],
  friendRequests: [],
  friendships: [],
  groups: [],
  dmMessages: [],
  groupMessages: [],
};

function createHttpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function sanitizeUsername(username) {
  const normalized =
    typeof username === "string" ? username.trim().replace(/^@+/, "").toLowerCase() : "";
  if (!/^[a-z0-9_.-]{3,24}$/.test(normalized)) {
    throw createHttpError(
      400,
      "Kullanici adi 3-24 karakter olmali ve sadece harf, sayi, _, -, . icerebilir.",
      "invalid_username",
    );
  }

  return normalized;
}

function sanitizeDisplayName(displayName, fallbackUsername) {
  const normalized = typeof displayName === "string" ? displayName.trim().slice(0, 32) : "";
  if (normalized) {
    return normalized;
  }

  return fallbackUsername;
}

function sanitizeGroupName(name) {
  const normalized = typeof name === "string" ? name.trim().slice(0, 40) : "";
  if (!normalized) {
    throw createHttpError(400, "Grup ismi bos olamaz.", "invalid_group_name");
  }

  return normalized;
}

function sanitizeChannelName(name) {
  const normalized = typeof name === "string" ? name.trim().toLowerCase().slice(0, 24) : "";
  if (!/^[a-z0-9-]{2,24}$/.test(normalized)) {
    throw createHttpError(
      400,
      "Kanal ismi 2-24 karakter olmali ve sadece harf, sayi veya - icermeli.",
      "invalid_channel_name",
    );
  }

  return normalized;
}

function sanitizeDmText(text) {
  const normalized = typeof text === "string" ? text.trim().slice(0, MAX_DM_TEXT_LENGTH) : "";
  if (!normalized) {
    throw createHttpError(400, "Mesaj bos olamaz.", "invalid_message");
  }

  return normalized;
}

function sanitizeGroupMessageText(text) {
  const normalized =
    typeof text === "string" ? text.replace(/\s+/g, " ").trim().slice(0, MAX_GROUP_MESSAGE_TEXT_LENGTH) : "";
  if (!normalized) {
    throw createHttpError(400, "Mesaj bos olamaz.", "invalid_group_message");
  }

  return normalized;
}

function sanitizePresenceStatus(status) {
  const normalized = typeof status === "string" ? status.trim().toLowerCase() : "";
  if (!PRESENCE_STATUSES.has(normalized)) {
    throw createHttpError(400, "Gecersiz presence degeri.", "invalid_presence_status");
  }

  return normalized;
}

function createPasswordHash(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, encodedHash) {
  if (typeof encodedHash !== "string") {
    return false;
  }

  const parts = encodedHash.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }

  const [, salt, expectedHash] = parts;
  const candidateHash = crypto.scryptSync(password, salt, 64).toString("hex");

  const expectedBuffer = Buffer.from(expectedHash, "hex");
  const candidateBuffer = Buffer.from(candidateHash, "hex");
  if (expectedBuffer.length !== candidateBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, candidateBuffer);
}

function createDmKey(userA, userB) {
  return [userA, userB].sort().join(":");
}

function createFriendPairKey(userA, userB) {
  return [userA, userB].sort().join(":");
}

function ensureDirectory(filePath) {
  const dirPath = path.dirname(filePath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function resolveSocialDataFilePath() {
  const customPath = process.env.MESCORD_DATA_FILE;
  if (customPath) {
    return path.resolve(customPath);
  }

  const appDataPath = process.env.APPDATA || path.join(os.homedir(), ".mescord");
  return path.join(appDataPath, "Mescord", "server-state.json");
}

function normalizeState(state) {
  const next = { ...DEFAULT_STATE, ...(state || {}) };

  next.users = Array.isArray(next.users) ? next.users : [];
  next.sessions = Array.isArray(next.sessions) ? next.sessions : [];
  next.friendRequests = Array.isArray(next.friendRequests) ? next.friendRequests : [];
  next.friendships = Array.isArray(next.friendships) ? next.friendships : [];
  next.groups = Array.isArray(next.groups) ? next.groups : [];
  next.dmMessages = Array.isArray(next.dmMessages) ? next.dmMessages : [];
  next.groupMessages = Array.isArray(next.groupMessages) ? next.groupMessages : [];

  return next;
}

export class SocialStore {
  constructor(filePath = resolveSocialDataFilePath()) {
    this.filePath = filePath;
    this.state = normalizeState(DEFAULT_STATE);
    this.load();
  }

  load() {
    ensureDirectory(this.filePath);

    if (!fs.existsSync(this.filePath)) {
      this.persist();
      return;
    }

    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = raw ? JSON.parse(raw) : DEFAULT_STATE;
      this.state = normalizeState(parsed);
      this.cleanupExpiredSessions();
    } catch {
      this.state = normalizeState(DEFAULT_STATE);
      this.persist();
    }
  }

  persist() {
    ensureDirectory(this.filePath);
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), "utf8");
  }

  cleanupExpiredSessions() {
    const now = Date.now();
    const before = this.state.sessions.length;
    this.state.sessions = this.state.sessions.filter((session) => Number(session.expiresAt || 0) > now);

    const activeUserIds = new Set(this.state.sessions.map((session) => session.userId));
    let presenceChanged = false;

    this.state.users = this.state.users.map((user) => {
      if (!activeUserIds.has(user.id) && user.presenceStatus !== "offline") {
        presenceChanged = true;
        return {
          ...user,
          presenceStatus: "offline",
          presenceUpdatedAt: now,
        };
      }

      return user;
    });

    if (before !== this.state.sessions.length || presenceChanged) {
      this.persist();
    }
  }

  ensureGroupRoles(group) {
    if (!group || typeof group !== "object") {
      return false;
    }

    if (!group.roles || typeof group.roles !== "object") {
      group.roles = {};
    }

    if (!group.ownerId) {
      return false;
    }

    if (group.roles[group.ownerId] !== "owner") {
      group.roles[group.ownerId] = "owner";
      return true;
    }

    return false;
  }

  applyPresenceStatus(userId, status, persist = true) {
    const nextStatus = sanitizePresenceStatus(status);
    const userIndex = this.state.users.findIndex((user) => user.id === userId);
    if (userIndex < 0) {
      return null;
    }

    const currentUser = this.state.users[userIndex];
    const nextUser = {
      ...currentUser,
      presenceStatus: nextStatus,
      presenceUpdatedAt: Date.now(),
    };

    this.state.users[userIndex] = nextUser;

    if (persist) {
      this.persist();
    }

    return this.toPublicUser(nextUser);
  }

  getGroupRole(group, userId) {
    if (!group) {
      return "member";
    }

    if (group.ownerId === userId) {
      return "owner";
    }

    const roles = group.roles && typeof group.roles === "object" ? group.roles : {};
    return roles[userId] === "admin" ? "admin" : "member";
  }

  ensureGroupMembership(userId, groupId) {
    const group = this.state.groups.find((item) => item.id === groupId);
    if (!group) {
      throw createHttpError(404, "Grup bulunamadi.", "group_not_found");
    }

    const members = Array.isArray(group.members) ? group.members : [];
    if (!members.includes(userId)) {
      throw createHttpError(403, "Bu grup icin yetkin yok.", "group_membership_required");
    }

    const changed = this.ensureGroupRoles(group);
    if (changed) {
      this.persist();
    }

    return group;
  }

  resolveGroupChannel(userId, groupId, channelId) {
    const group = this.ensureGroupMembership(userId, groupId);
    const channels = Array.isArray(group.channels) ? group.channels : [];
    const channel = channels.find((item) => item.id === channelId);
    if (!channel) {
      throw createHttpError(404, "Kanal bulunamadi.", "channel_not_found");
    }

    return {
      group,
      channel,
    };
  }

  createSession(userId) {
    const token = crypto.randomBytes(24).toString("hex");
    const now = Date.now();

    this.state.sessions.push({
      id: `sess_${crypto.randomUUID()}`,
      token,
      userId,
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
    });

    this.applyPresenceStatus(userId, "online", false);

    this.persist();
    return token;
  }

  clearSession(token) {
    const targetSession = this.state.sessions.find((session) => session.token === token);
    const before = this.state.sessions.length;
    this.state.sessions = this.state.sessions.filter((session) => session.token !== token);

    if (before !== this.state.sessions.length) {
      if (targetSession) {
        const hasActiveSession = this.state.sessions.some((session) => session.userId === targetSession.userId);
        if (!hasActiveSession) {
          this.applyPresenceStatus(targetSession.userId, "offline", false);
        }
      }

      this.persist();
    }
  }

  getUserByToken(token) {
    if (!token) {
      return null;
    }

    this.cleanupExpiredSessions();

    const session = this.state.sessions.find((item) => item.token === token);
    if (!session) {
      return null;
    }

    return this.state.users.find((user) => user.id === session.userId) || null;
  }

  getPublicUserById(userId) {
    const user = this.state.users.find((item) => item.id === userId);
    return user ? this.toPublicUser(user) : null;
  }

  toPublicUser(user) {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      presenceStatus: user.presenceStatus || "offline",
      presenceUpdatedAt: Number(user.presenceUpdatedAt || user.createdAt || Date.now()),
      createdAt: user.createdAt,
    };
  }

  registerUser(payload = {}) {
    const username = sanitizeUsername(payload.username);
    const password = typeof payload.password === "string" ? payload.password : "";
    if (password.length < 8) {
      throw createHttpError(400, "Sifre en az 8 karakter olmali.", "invalid_password");
    }

    const existing = this.state.users.find((user) => user.usernameLower === username);
    if (existing) {
      throw createHttpError(409, "Bu kullanici adi zaten kullaniliyor.", "username_taken");
    }

    const user = {
      id: `usr_${crypto.randomUUID()}`,
      username,
      usernameLower: username,
      displayName: sanitizeDisplayName(payload.displayName, username),
      passwordHash: createPasswordHash(password),
      presenceStatus: "offline",
      presenceUpdatedAt: Date.now(),
      createdAt: Date.now(),
    };

    this.state.users.push(user);
    this.persist();

    return this.toPublicUser(user);
  }

  loginUser(payload = {}) {
    const username = sanitizeUsername(payload.username);
    const password = typeof payload.password === "string" ? payload.password : "";

    const user = this.state.users.find((item) => item.usernameLower === username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw createHttpError(401, "Kullanici adi veya sifre hatali.", "invalid_credentials");
    }

    return this.toPublicUser(user);
  }

  listFriends(userId) {
    const friendIds = this.state.friendships
      .filter((friendship) => friendship.userA === userId || friendship.userB === userId)
      .map((friendship) => (friendship.userA === userId ? friendship.userB : friendship.userA));

    return friendIds
      .map((friendId) => this.getPublicUserById(friendId))
      .filter(Boolean)
      .sort((a, b) => a.username.localeCompare(b.username));
  }

  listFriendRequests(userId) {
    const pending = this.state.friendRequests.filter((request) => request.status === "pending");

    const incoming = pending
      .filter((request) => request.toUserId === userId)
      .map((request) => ({
        id: request.id,
        fromUser: this.getPublicUserById(request.fromUserId),
        createdAt: request.createdAt,
      }))
      .filter((request) => request.fromUser);

    const outgoing = pending
      .filter((request) => request.fromUserId === userId)
      .map((request) => ({
        id: request.id,
        toUser: this.getPublicUserById(request.toUserId),
        createdAt: request.createdAt,
      }))
      .filter((request) => request.toUser);

    return { incoming, outgoing };
  }

  sendFriendRequest(fromUserId, payload = {}) {
    const targetUsername = sanitizeUsername(payload.username);
    const targetUser = this.state.users.find((user) => user.usernameLower === targetUsername);

    if (!targetUser) {
      throw createHttpError(404, "Kullanici bulunamadi.", "user_not_found");
    }

    if (targetUser.id === fromUserId) {
      throw createHttpError(400, "Kendine arkadas istegi gonderemezsin.", "self_friend_request");
    }

    const friendshipKey = createFriendPairKey(fromUserId, targetUser.id);
    const alreadyFriends = this.state.friendships.some((friendship) => friendship.key === friendshipKey);
    if (alreadyFriends) {
      throw createHttpError(409, "Bu kullanici zaten arkadas listende.", "already_friends");
    }

    const existingPending = this.state.friendRequests.some((request) => {
      if (request.status !== "pending") {
        return false;
      }

      const pairKey = createFriendPairKey(request.fromUserId, request.toUserId);
      return pairKey === friendshipKey;
    });

    if (existingPending) {
      throw createHttpError(409, "Bu kullanici icin bekleyen bir istek zaten var.", "request_exists");
    }

    this.state.friendRequests.push({
      id: `req_${crypto.randomUUID()}`,
      fromUserId,
      toUserId: targetUser.id,
      status: "pending",
      createdAt: Date.now(),
      respondedAt: null,
    });

    this.persist();
    return this.listFriendRequests(fromUserId);
  }

  respondToFriendRequest(userId, payload = {}) {
    const requestId = typeof payload.requestId === "string" ? payload.requestId : "";
    const accept = Boolean(payload.accept);

    const request = this.state.friendRequests.find((item) => item.id === requestId && item.status === "pending");
    if (!request || request.toUserId !== userId) {
      throw createHttpError(404, "Istek bulunamadi.", "request_not_found");
    }

    request.status = accept ? "accepted" : "rejected";
    request.respondedAt = Date.now();

    if (accept) {
      const key = createFriendPairKey(request.fromUserId, request.toUserId);
      const exists = this.state.friendships.some((friendship) => friendship.key === key);

      if (!exists) {
        this.state.friendships.push({
          id: `fr_${crypto.randomUUID()}`,
          key,
          userA: request.fromUserId,
          userB: request.toUserId,
          createdAt: Date.now(),
        });
      }
    }

    this.persist();

    return {
      friends: this.listFriends(userId),
      requests: this.listFriendRequests(userId),
    };
  }

  ensureFriendship(userA, userB) {
    const key = createFriendPairKey(userA, userB);
    const isFriend = this.state.friendships.some((friendship) => friendship.key === key);

    if (!isFriend) {
      throw createHttpError(403, "DM icin once arkadas olmalisiniz.", "friendship_required");
    }
  }

  listGroups(userId) {
    let shouldPersist = false;

    const groups = this.state.groups
      .filter((group) => Array.isArray(group.members) && group.members.includes(userId))
      .map((group) => {
        if (this.ensureGroupRoles(group)) {
          shouldPersist = true;
        }

        return {
          id: group.id,
          name: group.name,
          ownerId: group.ownerId,
          owner: this.getPublicUserById(group.ownerId),
          viewerRole: this.getGroupRole(group, userId),
          memberCount: group.members.length,
          channels: Array.isArray(group.channels) ? group.channels : [],
          createdAt: group.createdAt,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    if (shouldPersist) {
      this.persist();
    }

    return groups;
  }

  createGroup(userId, payload = {}) {
    const name = sanitizeGroupName(payload.name);

    const group = {
      id: `grp_${crypto.randomUUID()}`,
      name,
      ownerId: userId,
      members: [userId],
      roles: {
        [userId]: "owner",
      },
      channels: [
        {
          id: `chn_${crypto.randomUUID()}`,
          name: "genel",
          type: "text",
          createdAt: Date.now(),
        },
      ],
      createdAt: Date.now(),
    };

    this.state.groups.push(group);
    this.persist();

    return this.listGroups(userId);
  }

  createGroupChannel(userId, groupId, payload = {}) {
    const group = this.ensureGroupMembership(userId, groupId);
    const role = this.getGroupRole(group, userId);
    if (role !== "owner" && role !== "admin") {
      throw createHttpError(403, "Kanal acma yetkin yok.", "channel_permission_denied");
    }

    const channelName = sanitizeChannelName(payload.name);
    const exists = (group.channels || []).some((channel) => channel.name === channelName);
    if (exists) {
      throw createHttpError(409, "Bu kanal zaten var.", "channel_exists");
    }

    group.channels = Array.isArray(group.channels) ? group.channels : [];
    group.channels.push({
      id: `chn_${crypto.randomUUID()}`,
      name: channelName,
      type: "text",
      createdAt: Date.now(),
    });

    this.persist();

    return this.listGroups(userId);
  }

  listGroupChannelMessages(userId, groupId, channelId) {
    const { channel } = this.resolveGroupChannel(userId, groupId, channelId);
    const messages = this.state.groupMessages
      .filter((message) => message.groupId === groupId && message.channelId === channelId)
      .slice(-180)
      .map((message) => ({
        id: message.id,
        groupId: message.groupId,
        channelId: message.channelId,
        text: message.text,
        fromUserId: message.fromUserId,
        fromRole: message.fromRole || "member",
        fromUser: this.getPublicUserById(message.fromUserId),
        createdAt: message.createdAt,
      }));

    return {
      groupId,
      channelId,
      channelName: channel.name,
      messages,
    };
  }

  sendGroupChannelMessage(userId, groupId, channelId, payload = {}) {
    const text = sanitizeGroupMessageText(payload.text);
    const { channel, group } = this.resolveGroupChannel(userId, groupId, channelId);
    const fromRole = this.getGroupRole(group, userId);

    const message = {
      id: `gmsg_${crypto.randomUUID()}`,
      groupId,
      channelId,
      text,
      fromUserId: userId,
      fromRole,
      createdAt: Date.now(),
    };

    this.state.groupMessages.push(message);

    if (this.state.groupMessages.length > MAX_GROUP_MESSAGES) {
      this.state.groupMessages = this.state.groupMessages.slice(-MAX_GROUP_MESSAGES);
    }

    this.persist();

    return {
      ...message,
      channelName: channel.name,
      fromUser: this.getPublicUserById(userId),
    };
  }

  getPresenceSnapshot(userId) {
    const user = this.state.users.find((item) => item.id === userId);
    if (!user) {
      throw createHttpError(404, "Kullanici bulunamadi.", "user_not_found");
    }

    return {
      self: this.toPublicUser(user),
      friends: this.listFriends(userId),
    };
  }

  updatePresenceStatus(userId, status) {
    const self = this.applyPresenceStatus(userId, status);
    if (!self) {
      throw createHttpError(404, "Kullanici bulunamadi.", "user_not_found");
    }

    return {
      self,
      friends: this.listFriends(userId),
    };
  }

  listDirectMessages(userId, targetUserId) {
    const targetUser = this.state.users.find((user) => user.id === targetUserId);
    if (!targetUser) {
      throw createHttpError(404, "DM hedefi bulunamadi.", "dm_target_not_found");
    }

    this.ensureFriendship(userId, targetUserId);

    const key = createDmKey(userId, targetUserId);
    const messages = this.state.dmMessages
      .filter((message) => message.threadKey === key)
      .slice(-160)
      .map((message) => ({
        id: message.id,
        text: message.text,
        fromUserId: message.fromUserId,
        toUserId: message.toUserId,
        fromUser: this.getPublicUserById(message.fromUserId),
        createdAt: message.createdAt,
      }));

    return {
      targetUser: this.toPublicUser(targetUser),
      messages,
    };
  }

  sendDirectMessage(userId, targetUserId, payload = {}) {
    const text = sanitizeDmText(payload.text);
    const targetUser = this.state.users.find((user) => user.id === targetUserId);
    if (!targetUser) {
      throw createHttpError(404, "DM hedefi bulunamadi.", "dm_target_not_found");
    }

    this.ensureFriendship(userId, targetUserId);

    const message = {
      id: `dm_${crypto.randomUUID()}`,
      threadKey: createDmKey(userId, targetUserId),
      fromUserId: userId,
      toUserId: targetUserId,
      text,
      createdAt: Date.now(),
    };

    this.state.dmMessages.push(message);

    if (this.state.dmMessages.length > MAX_DM_MESSAGES) {
      this.state.dmMessages = this.state.dmMessages.slice(-MAX_DM_MESSAGES);
    }

    this.persist();

    return this.listDirectMessages(userId, targetUserId);
  }

  getSocialMeta() {
    return {
      storagePath: this.filePath,
      userCount: this.state.users.length,
      groupCount: this.state.groups.length,
      friendshipCount: this.state.friendships.length,
      groupMessageCount: this.state.groupMessages.length,
      privacy: "Account verileri public repoda degil, sadece sunucu tarafi private data dosyasinda tutulur.",
    };
  }
}

export { createHttpError };
