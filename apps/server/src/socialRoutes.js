import { Router } from "express";
import { SocialStore, createHttpError } from "./socialStore.js";

function handleRouteError(res, error) {
  const status = Number(error?.status) || 500;
  const payload = {
    ok: false,
    code: error?.code || "internal_error",
    message: error?.message || "Beklenmeyen bir hata olustu.",
  };

  res.status(status).json(payload);
}

function getBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== "string") {
    return "";
  }

  if (!authorizationHeader.startsWith("Bearer ")) {
    return "";
  }

  return authorizationHeader.slice(7).trim();
}

export function createSocialRouter(options = {}) {
  const router = Router();
  const store = options.store || new SocialStore();

  const authMiddleware = (req, res, next) => {
    try {
      const token = getBearerToken(req.headers.authorization);
      if (!token) {
        throw createHttpError(401, "Yetkilendirme gerekli.", "auth_required");
      }

      const user = store.getUserByToken(token);
      if (!user) {
        throw createHttpError(401, "Oturum gecersiz veya suresi dolmus.", "invalid_session");
      }

      req.auth = {
        token,
        user,
      };
      next();
    } catch (error) {
      handleRouteError(res, error);
    }
  };

  router.get("/meta/social", (_req, res) => {
    try {
      res.json({
        ok: true,
        ...store.getSocialMeta(),
      });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.post("/auth/register", (req, res) => {
    try {
      const user = store.registerUser(req.body || {});
      const token = store.createSession(user.id);

      res.status(201).json({
        ok: true,
        token,
        user,
      });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.post("/auth/login", (req, res) => {
    try {
      const user = store.loginUser(req.body || {});
      const token = store.createSession(user.id);

      res.json({
        ok: true,
        token,
        user,
      });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.get("/auth/me", authMiddleware, (req, res) => {
    try {
      res.json({
        ok: true,
        user: store.toPublicUser(req.auth.user),
      });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.post("/auth/logout", authMiddleware, (req, res) => {
    try {
      store.clearSession(req.auth.token);
      res.json({ ok: true });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.get("/friends", authMiddleware, (req, res) => {
    try {
      const userId = req.auth.user.id;
      const requests = store.listFriendRequests(userId);

      res.json({
        ok: true,
        friends: store.listFriends(userId),
        incomingRequests: requests.incoming,
        outgoingRequests: requests.outgoing,
      });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.get("/presence", authMiddleware, (req, res) => {
    try {
      const presence = store.getPresenceSnapshot(req.auth.user.id);
      res.json({ ok: true, ...presence });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.post("/presence", authMiddleware, (req, res) => {
    try {
      const presence = store.updatePresenceStatus(req.auth.user.id, req.body?.status);
      res.json({ ok: true, ...presence });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.post("/friends/request", authMiddleware, (req, res) => {
    try {
      store.sendFriendRequest(req.auth.user.id, req.body || {});
      const requests = store.listFriendRequests(req.auth.user.id);

      res.status(201).json({
        ok: true,
        friends: store.listFriends(req.auth.user.id),
        incomingRequests: requests.incoming,
        outgoingRequests: requests.outgoing,
      });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.post("/friends/respond", authMiddleware, (req, res) => {
    try {
      const result = store.respondToFriendRequest(req.auth.user.id, req.body || {});

      res.json({
        ok: true,
        friends: result.friends,
        incomingRequests: result.requests.incoming,
        outgoingRequests: result.requests.outgoing,
      });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.get("/groups", authMiddleware, (req, res) => {
    try {
      res.json({
        ok: true,
        groups: store.listGroups(req.auth.user.id),
      });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.post("/groups", authMiddleware, (req, res) => {
    try {
      const groups = store.createGroup(req.auth.user.id, req.body || {});
      res.status(201).json({ ok: true, groups });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.post("/groups/:groupId/channels", authMiddleware, (req, res) => {
    try {
      const groups = store.createGroupChannel(req.auth.user.id, req.params.groupId, req.body || {});
      res.status(201).json({ ok: true, groups });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.get("/groups/:groupId/channels/:channelId/messages", authMiddleware, (req, res) => {
    try {
      const data = store.listGroupChannelMessages(
        req.auth.user.id,
        req.params.groupId,
        req.params.channelId,
      );
      res.json({ ok: true, ...data });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.post("/groups/:groupId/channels/:channelId/messages", authMiddleware, (req, res) => {
    try {
      const message = store.sendGroupChannelMessage(
        req.auth.user.id,
        req.params.groupId,
        req.params.channelId,
        req.body || {},
      );

      res.status(201).json({ ok: true, message });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.get("/dm/:targetUserId", authMiddleware, (req, res) => {
    try {
      const dm = store.listDirectMessages(req.auth.user.id, req.params.targetUserId);
      res.json({ ok: true, ...dm });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.post("/dm/:targetUserId", authMiddleware, (req, res) => {
    try {
      const dm = store.sendDirectMessage(req.auth.user.id, req.params.targetUserId, req.body || {});
      res.status(201).json({ ok: true, ...dm });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  return router;
}
