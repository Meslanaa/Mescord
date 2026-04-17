import { useCallback, useEffect, useState } from "react";
import { getRuntimeConnectionConfig } from "../utils/runtimeConnection";

const TOKEN_STORAGE_KEY = "mescord:auth-token-v1";

function readToken() {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function writeToken(token) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      return;
    }

    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore storage write errors
  }
}

async function parseResponse(response) {
  const text = await response.text();
  let data = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = {
        message: text,
      };
    }
  }

  if (!response.ok || data.ok === false) {
    const error = new Error(data?.message || `HTTP ${response.status}`);
    error.status = response.status;
    error.code = data?.code || "http_error";
    throw error;
  }

  return data;
}

export function useAccountHub() {
  const [apiBaseUrl, setApiBaseUrl] = useState(() => getRuntimeConnectionConfig().apiBaseUrl);
  const [token, setToken] = useState(readToken);
  const [accountUser, setAccountUser] = useState(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState("");

  const [friends, setFriends] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  const [groups, setGroups] = useState([]);
  const [presenceStatus, setPresenceStatus] = useState("offline");

  const [socialStoragePath, setSocialStoragePath] = useState("");
  const [socialPrivacyNote, setSocialPrivacyNote] = useState("");

  const [activeDmTarget, setActiveDmTarget] = useState(null);
  const [dmMessages, setDmMessages] = useState([]);

  const applyToken = useCallback((nextToken) => {
    setToken(nextToken || "");
    writeToken(nextToken || "");
  }, []);

  const clearSocialState = useCallback(() => {
    setAccountUser(null);
    setFriends([]);
    setIncomingRequests([]);
    setOutgoingRequests([]);
    setGroups([]);
    setPresenceStatus("offline");
    setActiveDmTarget(null);
    setDmMessages([]);
  }, []);

  const request = useCallback(
    async (path, options = {}) => {
      const { method = "GET", body, auth = true, tokenOverride = "" } = options;
      const authToken = tokenOverride || token;

      if (auth && !authToken) {
        throw new Error("Bu islem icin giris yapmalisin.");
      }

      const headers = {
        Accept: "application/json",
      };

      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
      }

      if (auth && authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }

      let response;

      try {
        response = await fetch(`${apiBaseUrl}/api${path}`, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
      } catch {
        throw new Error(
          `Sunucuya ulasilamadi: ${apiBaseUrl}. Baglanti URL'sini ve server durumunu kontrol et.`,
        );
      }

      return parseResponse(response);
    },
    [token, apiBaseUrl],
  );

  const refreshConnectionConfig = useCallback(() => {
    setApiBaseUrl(getRuntimeConnectionConfig().apiBaseUrl);
  }, []);

  const refreshAccount = useCallback(
    async (tokenOverride = "") => {
      const authToken = tokenOverride || token;
      if (!authToken) {
        clearSocialState();
        return;
      }

      const [meData, friendsData, groupsData] = await Promise.all([
        request("/auth/me", { tokenOverride: authToken }),
        request("/friends", { tokenOverride: authToken }),
        request("/groups", { tokenOverride: authToken }),
      ]);

      setAccountUser(meData.user || null);
      setPresenceStatus(meData.user?.presenceStatus || "offline");
      setFriends(Array.isArray(friendsData.friends) ? friendsData.friends : []);
      setIncomingRequests(Array.isArray(friendsData.incomingRequests) ? friendsData.incomingRequests : []);
      setOutgoingRequests(Array.isArray(friendsData.outgoingRequests) ? friendsData.outgoingRequests : []);
      setGroups(Array.isArray(groupsData.groups) ? groupsData.groups : []);
    },
    [token, request, clearSocialState],
  );

  const refreshSocialMeta = useCallback(async () => {
    try {
      const meta = await request("/meta/social", { auth: false });
      setSocialStoragePath(typeof meta.storagePath === "string" ? meta.storagePath : "");
      setSocialPrivacyNote(typeof meta.privacy === "string" ? meta.privacy : "");
    } catch {
      setSocialStoragePath("");
      setSocialPrivacyNote("");
    }
  }, [request]);

  useEffect(() => {
    let ignore = false;

    refreshSocialMeta();

    if (!token) {
      clearSocialState();
      return () => {
        ignore = true;
      };
    }

    (async () => {
      try {
        await refreshAccount(token);
      } catch (error) {
        if (ignore) {
          return;
        }

        clearSocialState();
        applyToken("");
        setAccountError(error?.message || "Hesap bilgileri yuklenemedi.");
      }
    })();

    return () => {
      ignore = true;
    };
  }, [token, refreshAccount, refreshSocialMeta, clearSocialState, applyToken]);

  const registerAccount = useCallback(
    async (payload = {}) => {
      setAccountBusy(true);
      setAccountError("");

      try {
        const data = await request("/auth/register", {
          method: "POST",
          auth: false,
          body: payload,
        });

        applyToken(data.token || "");
        await refreshAccount(data.token || "");
        return true;
      } catch (error) {
        setAccountError(error?.message || "Kayit islemi basarisiz.");
        return false;
      } finally {
        setAccountBusy(false);
      }
    },
    [request, applyToken, refreshAccount],
  );

  const loginAccount = useCallback(
    async (payload = {}) => {
      setAccountBusy(true);
      setAccountError("");

      try {
        const data = await request("/auth/login", {
          method: "POST",
          auth: false,
          body: payload,
        });

        applyToken(data.token || "");
        await refreshAccount(data.token || "");
        return true;
      } catch (error) {
        setAccountError(error?.message || "Giris islemi basarisiz.");
        return false;
      } finally {
        setAccountBusy(false);
      }
    },
    [request, applyToken, refreshAccount],
  );

  const logoutAccount = useCallback(async () => {
    setAccountBusy(true);
    setAccountError("");

    try {
      if (token) {
        await request("/auth/logout", { method: "POST" });
      }
    } catch {
      // ignore logout network errors
    } finally {
      applyToken("");
      clearSocialState();
      setAccountBusy(false);
    }
  }, [token, request, applyToken, clearSocialState]);

  const sendFriendRequest = useCallback(
    async (username) => {
      setAccountBusy(true);
      setAccountError("");

      try {
        const data = await request("/friends/request", {
          method: "POST",
          body: { username },
        });

        setFriends(Array.isArray(data.friends) ? data.friends : []);
        setIncomingRequests(Array.isArray(data.incomingRequests) ? data.incomingRequests : []);
        setOutgoingRequests(Array.isArray(data.outgoingRequests) ? data.outgoingRequests : []);
        return true;
      } catch (error) {
        setAccountError(error?.message || "Arkadas istegi gonderilemedi.");
        return false;
      } finally {
        setAccountBusy(false);
      }
    },
    [request],
  );

  const respondToFriendRequest = useCallback(
    async (requestId, accept) => {
      setAccountBusy(true);
      setAccountError("");

      try {
        const data = await request("/friends/respond", {
          method: "POST",
          body: {
            requestId,
            accept: Boolean(accept),
          },
        });

        setFriends(Array.isArray(data.friends) ? data.friends : []);
        setIncomingRequests(Array.isArray(data.incomingRequests) ? data.incomingRequests : []);
        setOutgoingRequests(Array.isArray(data.outgoingRequests) ? data.outgoingRequests : []);
        return true;
      } catch (error) {
        setAccountError(error?.message || "Istek yanitlanamadi.");
        return false;
      } finally {
        setAccountBusy(false);
      }
    },
    [request],
  );

  const createGroup = useCallback(
    async (name) => {
      setAccountBusy(true);
      setAccountError("");

      try {
        const data = await request("/groups", {
          method: "POST",
          body: { name },
        });

        setGroups(Array.isArray(data.groups) ? data.groups : []);
        return true;
      } catch (error) {
        setAccountError(error?.message || "Grup olusturulamadi.");
        return false;
      } finally {
        setAccountBusy(false);
      }
    },
    [request],
  );

  const createGroupChannel = useCallback(
    async (groupId, name) => {
      if (!groupId) {
        return false;
      }

      setAccountBusy(true);
      setAccountError("");

      try {
        const data = await request(`/groups/${groupId}/channels`, {
          method: "POST",
          body: { name },
        });

        setGroups(Array.isArray(data.groups) ? data.groups : []);
        return true;
      } catch (error) {
        setAccountError(error?.message || "Kanal olusturulamadi.");
        return false;
      } finally {
        setAccountBusy(false);
      }
    },
    [request],
  );

  const updatePresenceStatus = useCallback(
    async (status) => {
      setAccountBusy(true);
      setAccountError("");

      try {
        const data = await request("/presence", {
          method: "POST",
          body: { status },
        });

        setAccountUser(data.self || null);
        setPresenceStatus(data.self?.presenceStatus || "offline");
        setFriends(Array.isArray(data.friends) ? data.friends : []);
        return true;
      } catch (error) {
        setAccountError(error?.message || "Presence guncellenemedi.");
        return false;
      } finally {
        setAccountBusy(false);
      }
    },
    [request],
  );

  const openDmWithFriend = useCallback(
    async (friendUser) => {
      if (!friendUser?.id) {
        return false;
      }

      setAccountBusy(true);
      setAccountError("");

      try {
        const data = await request(`/dm/${friendUser.id}`);
        setActiveDmTarget(data.targetUser || friendUser);
        setDmMessages(Array.isArray(data.messages) ? data.messages : []);
        return true;
      } catch (error) {
        setAccountError(error?.message || "DM acilamadi.");
        return false;
      } finally {
        setAccountBusy(false);
      }
    },
    [request],
  );

  const sendDmToActiveTarget = useCallback(
    async (text) => {
      if (!activeDmTarget?.id) {
        return false;
      }

      setAccountBusy(true);
      setAccountError("");

      try {
        const data = await request(`/dm/${activeDmTarget.id}`, {
          method: "POST",
          body: { text },
        });

        setDmMessages(Array.isArray(data.messages) ? data.messages : []);
        return true;
      } catch (error) {
        setAccountError(error?.message || "DM gonderilemedi.");
        return false;
      } finally {
        setAccountBusy(false);
      }
    },
    [request, activeDmTarget],
  );

  const clearAccountError = useCallback(() => {
    setAccountError("");
  }, []);

  return {
    apiBase: apiBaseUrl,
    authToken: token,
    accountUser,
    accountBusy,
    accountError,
    clearAccountError,
    presenceStatus,

    socialStoragePath,
    socialPrivacyNote,

    friends,
    incomingRequests,
    outgoingRequests,
    groups,

    activeDmTarget,
    dmMessages,

    registerAccount,
    loginAccount,
    logoutAccount,

    sendFriendRequest,
    respondToFriendRequest,
    createGroup,
    createGroupChannel,
    updatePresenceStatus,

    openDmWithFriend,
    sendDmToActiveTarget,
    refreshConnectionConfig,
  };
}
