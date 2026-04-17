import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import AnimatedBackground from "./components/AnimatedBackground";
import DesktopUpdateModal from "./components/DesktopUpdateModal";
import ParticipantCard from "./components/ParticipantCard";
import ReactionBurst from "./components/ReactionBurst";
import { useAccountHub } from "./hooks/useAccountHub";
import { useDesktopUpdater } from "./hooks/useDesktopUpdater";
import { useVoiceRoom } from "./hooks/useVoiceRoom";
import { isLocalhostUrl, saveRuntimeConnectionConfig } from "./utils/runtimeConnection";

const COLOR_SWATCHES = ["#00c6ff", "#ff7a18", "#8eff6b", "#f94144", "#ffd166", "#00d4a4"];
const QUICK_REACTIONS = ["🔥", "👏", "😂", "🚀", "🎧", "💯"];
const THEMES = [
  { id: "aurora", label: "Aurora" },
  { id: "ember", label: "Ember" },
  { id: "mono", label: "Mono" },
];
const PRESENCE_OPTIONS = [
  { value: "online", label: "Online" },
  { value: "idle", label: "Idle" },
  { value: "dnd", label: "DND" },
  { value: "invisible", label: "Invisible" },
];
const TOUR_STEPS = [
  {
    title: "Oda Ac ve Arkadaslarini Davet Et",
    text: "Oda kodu yaz, giris yap ve tek linkle herkesi ayni ses odasina topla.",
  },
  {
    title: "Ses Kontrolleri Elinde",
    text: "Push-to-talk, mikrofon secimi ve hizli mute ile ses akisini aninda yonet.",
  },
  {
    title: "Canli Vibe ve Moderasyon",
    text: "Emoji reaksiyonlari, chat paneli ve owner kontrolleriyle odani profesyonel yonet.",
  },
];
const STORAGE_KEYS = {
  displayName: "mescord:display-name",
  avatarColor: "mescord:avatar-color",
  recentRooms: "mescord:recent-rooms",
  selectedMic: "mescord:selected-mic",
  lastSession: "mescord:last-session",
  theme: "mescord:theme",
  tourDone: "mescord:tour-done",
};

function readStringStorage(key, fallbackValue) {
  try {
    const value = window.localStorage.getItem(key);
    return value || fallbackValue;
  } catch {
    return fallbackValue;
  }
}

function readArrayStorage(key) {
  try {
    const rawValue = window.localStorage.getItem(key);
    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((value) => typeof value === "string").slice(0, 6);
  } catch {
    return [];
  }
}

function readLastSessionStorage() {
  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEYS.lastSession);
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue);
    const roomId = typeof parsed.roomId === "string" ? parsed.roomId.trim().toLowerCase().slice(0, 24) : "";
    const name = typeof parsed.name === "string" ? parsed.name.trim().slice(0, 20) : "";
    const color = typeof parsed.color === "string" ? parsed.color : "";

    if (!roomId || !name) {
      return null;
    }

    return {
      roomId,
      name,
      color,
    };
  } catch {
    return null;
  }
}

function updateStatusLabel(status) {
  if (status === "available") {
    return "Yeni Surum";
  }

  if (status === "downloading") {
    return "Indiriliyor";
  }

  if (status === "downloaded") {
    return "Hazir";
  }

  if (status === "checking") {
    return "Kontrol";
  }

  if (status === "error") {
    return "Hata";
  }

  return "Guncelleme";
}

function createRoomCode() {
  return Math.random().toString(36).slice(2, 8);
}

function formatChatTime(timestamp) {
  if (!timestamp) {
    return "";
  }

  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function conversationScopeLabel(scope) {
  if (scope === "dm") {
    return "DM";
  }
  if (scope === "channel") {
    return "Kanal";
  }
  if (scope === "voice") {
    return "Voice";
  }
  return "Kaynak";
}

function truncateText(value, maxLength = 120) {
  const source = typeof value === "string" ? value.trim() : "";
  if (!source) {
    return "";
  }

  if (source.length <= maxLength) {
    return source;
  }

  const safeLength = Math.max(0, maxLength - 3);
  return `${source.slice(0, safeLength)}...`;
}

function hasTextMention(text, accountUser) {
  const source = typeof text === "string" ? text.toLowerCase() : "";
  if (!source) {
    return false;
  }

  const targets = ["@everyone", "@here"];
  const username =
    typeof accountUser?.username === "string" ? accountUser.username.trim().toLowerCase() : "";

  if (username) {
    targets.push(`@${username}`);
  }

  return targets.some((token) => source.includes(token));
}

function initialsLabel(value) {
  const source = typeof value === "string" ? value.trim() : "";
  if (!source) {
    return "MS";
  }

  const chunks = source.split(/\s+/).slice(0, 2);
  return chunks.map((chunk) => chunk[0]?.toUpperCase() || "").join("") || "MS";
}

function createDefaultQuickTunnelState() {
  return {
    status: "idle",
    publicUrl: "",
    targetUrl: "",
    message: "",
    error: "",
  };
}

function getUrlHostLabel(url) {
  const value = typeof url === "string" ? url.trim() : "";
  if (!value) {
    return "";
  }

  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return "";
  }
}

export default function App() {
  const initialRoom = useMemo(() => {
    const roomFromQuery = new URLSearchParams(window.location.search).get("room");
    return roomFromQuery || createRoomCode();
  }, []);

  const [displayName, setDisplayName] = useState(() => readStringStorage(STORAGE_KEYS.displayName, ""));
  const [roomInput, setRoomInput] = useState(initialRoom);
  const [avatarColor, setAvatarColor] = useState(() =>
    readStringStorage(STORAGE_KEYS.avatarColor, COLOR_SWATCHES[0]),
  );
  const [recentRooms, setRecentRooms] = useState(() => readArrayStorage(STORAGE_KEYS.recentRooms));
  const [bootMicDeviceId] = useState(() => readStringStorage(STORAGE_KEYS.selectedMic, ""));
  const [theme, setTheme] = useState(() => readStringStorage(STORAGE_KEYS.theme, "aurora"));
  const [lastSession, setLastSession] = useState(() => readLastSessionStorage());
  const [chatInput, setChatInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [tourStepIndex, setTourStepIndex] = useState(() => (readStringStorage(STORAGE_KEYS.tourDone, "0") === "1" ? -1 : 0));
  const [accountMode, setAccountMode] = useState("login");
  const [accountUsername, setAccountUsername] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountDisplayName, setAccountDisplayName] = useState("");
  const [friendUsernameInput, setFriendUsernameInput] = useState("");
  const [groupNameInput, setGroupNameInput] = useState("");
  const [dmInput, setDmInput] = useState("");
  const [connectionApiInput, setConnectionApiInput] = useState("");
  const [connectionSignalingInput, setConnectionSignalingInput] = useState("");
  const [connectionNotice, setConnectionNotice] = useState("");
  const [quickTunnelState, setQuickTunnelState] = useState(() => createDefaultQuickTunnelState());
  const [quickTunnelBusy, setQuickTunnelBusy] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [channelSearchInput, setChannelSearchInput] = useState("");
  const [messageSearchInput, setMessageSearchInput] = useState("");
  const [conversationMode, setConversationMode] = useState("channel");
  const [groupComposerInput, setGroupComposerInput] = useState("");
  const [newChannelNameInput, setNewChannelNameInput] = useState("");
  const [channelUnreadMap, setChannelUnreadMap] = useState({});
  const [dmUnreadMap, setDmUnreadMap] = useState({});
  const [activityFeed, setActivityFeed] = useState([]);
  const activityKeysRef = useRef(new Set());
  const lastSystemNoticeRef = useRef("");
  const systemNoticeCounterRef = useRef(0);

  const {
    activeRoomId,
    ownerId,
    roomLocked,
    participants,
    isConnected,
    isMuted,
    pttEnabled,
    setPttEnabled,
    localLevel,
    peerLevels,
    peerQuality,
    audioInputDevices,
    selectedInputDeviceId,
    changeInputDevice,
    reactions,
    chatMessages,
    groupChannelContext,
    groupChannelMessages,
    groupTypingUsers,
    groupChannelError,
    socialAuthReady,
    systemNotice,
    error,
    joinRoom,
    leaveRoom,
    toggleMute,
    sendReaction,
    sendChatMessage,
    kickParticipant,
    muteAllParticipants,
    setRoomLock,
    authenticateSocial,
    subscribeGroupChannel,
    leaveGroupChannel,
    setGroupTyping,
    sendGroupChannelMessage,
    signalingUrl,
    refreshConnectionConfig: refreshVoiceConnectionConfig,
  } = useVoiceRoom();

  const {
    isDesktop,
    appInfo,
    state: updateState,
    isModalOpen,
    dismissModal,
    openModal,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
  } = useDesktopUpdater();

  const {
    apiBase,
    authToken,
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
    refreshConnectionConfig: refreshAccountConnectionConfig,
  } = useAccountHub();

  const joined = Boolean(activeRoomId && isConnected);
  const quickTunnelRunning =
    quickTunnelState.status === "starting" ||
    quickTunnelState.status === "ready" ||
    quickTunnelState.status === "stopping";

  const quickTunnelStatusLabel = useMemo(() => {
    if (quickTunnelState.status === "ready") {
      return "Hazir";
    }

    if (quickTunnelState.status === "starting") {
      return "Baslatiliyor";
    }

    if (quickTunnelState.status === "stopping") {
      return "Durduruluyor";
    }

    if (quickTunnelState.status === "error") {
      return "Hata";
    }

    return "Kapali";
  }, [quickTunnelState.status]);

  const selfParticipant = participants.find((participant) => participant.isSelf);
  const selfParticipantName = selfParticipant?.name || "";
  const isOwner = Boolean(selfParticipant && ownerId && selfParticipant.id === ownerId);
  const remoteParticipants = participants.filter((participant) => !participant.isSelf);

  const selectedGroup = useMemo(() => {
    if (!Array.isArray(groups) || groups.length === 0) {
      return null;
    }

    return groups.find((group) => group.id === selectedGroupId) || groups[0];
  }, [groups, selectedGroupId]);

  const selectedChannels = useMemo(
    () => (Array.isArray(selectedGroup?.channels) ? selectedGroup.channels : []),
    [selectedGroup],
  );

  const filteredChannels = useMemo(() => {
    const keyword = channelSearchInput.trim().toLowerCase();
    if (!keyword) {
      return selectedChannels;
    }

    return selectedChannels.filter((channel) =>
      String(channel?.name || "")
        .toLowerCase()
        .includes(keyword),
    );
  }, [selectedChannels, channelSearchInput]);

  const selectedChannel = useMemo(() => {
    if (!selectedChannels.length) {
      return null;
    }

    return selectedChannels.find((channel) => channel.id === selectedChannelId) || selectedChannels[0];
  }, [selectedChannels, selectedChannelId]);

  const selectedChannelIdSafe = selectedChannel?.id || "";
  const selectedChannelName = selectedChannel?.name || "";
  const activeDmTargetId = activeDmTarget?.id || "";
  const activeDmDisplayName = activeDmTarget?.displayName || activeDmTarget?.username || "";

  const groupUnreadMap = useMemo(() => {
    const next = {};

    groups.forEach((group) => {
      const channels = Array.isArray(group.channels) ? group.channels : [];
      const total = channels.reduce(
        (sum, channel) => sum + Number(channelUnreadMap[channel.id] || 0),
        0,
      );
      next[group.id] = total;
    });

    return next;
  }, [groups, channelUnreadMap]);

  const totalDmUnread = useMemo(
    () => Object.values(dmUnreadMap).reduce((sum, value) => sum + Number(value || 0), 0),
    [dmUnreadMap],
  );

  const pushActivity = useCallback((entry) => {
    const entryId = typeof entry?.id === "string" ? entry.id : "";
    if (!entryId || activityKeysRef.current.has(entryId)) {
      return;
    }

    activityKeysRef.current.add(entryId);

    setActivityFeed((prev) =>
      [
        {
          id: entryId,
          type: entry?.type || "notice",
          title: entry?.title || "Guncelleme",
          detail: entry?.detail || "",
          text: entry?.text || "",
          at: Number(entry?.at || Date.now()),
        },
        ...prev,
      ].slice(0, 32),
    );
  }, []);

  const clearChannelUnread = useCallback((channelId) => {
    const normalizedChannelId = typeof channelId === "string" ? channelId.trim() : "";
    if (!normalizedChannelId) {
      return;
    }

    setChannelUnreadMap((prev) => {
      if (!prev[normalizedChannelId]) {
        return prev;
      }

      const next = { ...prev };
      delete next[normalizedChannelId];
      return next;
    });
  }, []);

  const clearDmUnread = useCallback((userId) => {
    const normalizedUserId = typeof userId === "string" ? userId.trim() : "";
    if (!normalizedUserId) {
      return;
    }

    setDmUnreadMap((prev) => {
      if (!prev[normalizedUserId]) {
        return prev;
      }

      const next = { ...prev };
      delete next[normalizedUserId];
      return next;
    });
  }, []);

  const clearActivityFeed = useCallback(() => {
    setActivityFeed([]);
    activityKeysRef.current.clear();
  }, []);

  const canCreateChannel = Boolean(
    selectedGroup &&
      (selectedGroup.viewerRole === "owner" ||
        selectedGroup.viewerRole === "admin" ||
        selectedGroup.ownerId === accountUser?.id),
  );

  const groupTypingLabel = useMemo(() => {
    if (!Array.isArray(groupTypingUsers) || groupTypingUsers.length === 0) {
      return "";
    }

    if (groupTypingUsers.length === 1) {
      return `${groupTypingUsers[0].displayName || groupTypingUsers[0].username || "Bir kullanici"} yaziyor...`;
    }

    if (groupTypingUsers.length === 2) {
      const left = groupTypingUsers[0].displayName || groupTypingUsers[0].username || "Bir kullanici";
      const right = groupTypingUsers[1].displayName || groupTypingUsers[1].username || "Bir kullanici";
      return `${left} ve ${right} yaziyor...`;
    }

    return `${groupTypingUsers.length} kisi yaziyor...`;
  }, [groupTypingUsers]);

  const pinnedFriends = useMemo(() => {
    if (!Array.isArray(friends) || friends.length === 0) {
      return [];
    }

    const activeId = activeDmTarget?.id || "";
    const sorted = [...friends].sort((left, right) => {
      if (left.id === activeId) {
        return -1;
      }
      if (right.id === activeId) {
        return 1;
      }
      return String(left.displayName || left.username || "").localeCompare(
        String(right.displayName || right.username || ""),
      );
    });

    return sorted.slice(0, 4);
  }, [friends, activeDmTarget]);

  const hasDmConversation = Boolean(conversationMode === "dm" && activeDmTarget);

  const conversationTopic = useMemo(() => {
    if (hasDmConversation) {
      return `${activeDmDisplayName || "Kullanici"} ile ozel mesajlasma.`;
    }

    const channelLabel = groupChannelContext.channelName || selectedChannelName;
    if (channelLabel) {
      return `#${channelLabel} kanalinda ${participants.length} aktif uye var.`;
    }

    return "Kanal secerek mesajlasmaya basla.";
  }, [
    hasDmConversation,
    activeDmDisplayName,
    groupChannelContext.channelName,
    selectedChannelName,
    participants.length,
  ]);

  const searchResults = useMemo(() => {
    const keyword = messageSearchInput.trim().toLowerCase();
    if (!keyword) {
      return [];
    }

    const dmPool = dmMessages.map((message) => ({
      id: `dm-${message.id}`,
      scope: "dm",
      author: message.fromUser?.displayName || message.fromUser?.username || "Guest",
      text: message.text,
      at: Number(message.createdAt || 0),
    }));

    const channelPool = groupChannelMessages.map((message) => ({
      id: `chn-${message.id}`,
      scope: "channel",
      author: message.fromUser?.displayName || message.fromUser?.username || "Guest",
      text: message.text,
      at: Number(message.createdAt || 0),
    }));

    const voicePool = chatMessages.map((message) => ({
      id: `voice-${message.id}`,
      scope: "voice",
      author: message.fromName || "Guest",
      text: message.text,
      at: Number(message.at || 0),
    }));

    return [...dmPool, ...channelPool, ...voicePool]
      .filter((item) => {
        const target = `${item.author} ${item.text}`.toLowerCase();
        return target.includes(keyword);
      })
      .sort((left, right) => right.at - left.at)
      .slice(0, 20);
  }, [messageSearchInput, dmMessages, groupChannelMessages, chatMessages]);

  useEffect(() => {
    if (!groups.length) {
      setSelectedGroupId("");
      setSelectedChannelId("");
      return;
    }

    if (!groups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(groups[0].id);
    }
  }, [groups, selectedGroupId]);

  useEffect(() => {
    if (!selectedGroup) {
      setSelectedChannelId("");
      return;
    }

    const channels = Array.isArray(selectedGroup.channels) ? selectedGroup.channels : [];
    if (channels.length === 0) {
      setSelectedChannelId("");
      return;
    }

    if (!channels.some((channel) => channel.id === selectedChannelId)) {
      setSelectedChannelId(channels[0].id);
    }
  }, [selectedGroup, selectedChannelId]);

  useEffect(() => {
    if (conversationMode === "dm" && !activeDmTarget) {
      setConversationMode("channel");
    }
  }, [conversationMode, activeDmTarget]);

  useEffect(() => {
    if (conversationMode !== "channel" || !selectedChannelIdSafe) {
      return;
    }

    clearChannelUnread(selectedChannelIdSafe);
  }, [conversationMode, selectedChannelIdSafe, clearChannelUnread]);

  useEffect(() => {
    if (conversationMode !== "dm" || !activeDmTargetId) {
      return;
    }

    clearDmUnread(activeDmTargetId);
  }, [conversationMode, activeDmTargetId, clearDmUnread]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.displayName, displayName);
    } catch {
      // Ignore persistence errors.
    }
  }, [displayName]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.avatarColor, avatarColor);
    } catch {
      // Ignore persistence errors.
    }
  }, [avatarColor]);

  useEffect(() => {
    try {
      if (selectedInputDeviceId) {
        window.localStorage.setItem(STORAGE_KEYS.selectedMic, selectedInputDeviceId);
      } else {
        window.localStorage.removeItem(STORAGE_KEYS.selectedMic);
      }
    } catch {
      // Ignore persistence errors.
    }
  }, [selectedInputDeviceId]);

  useEffect(() => {
    if (bootMicDeviceId) {
      changeInputDevice(bootMicDeviceId);
    }
    // We intentionally restore only once at boot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootMicDeviceId]);

  useEffect(() => {
    const validTheme = THEMES.some((item) => item.id === theme) ? theme : "aurora";
    document.documentElement.setAttribute("data-theme", validTheme);

    try {
      window.localStorage.setItem(STORAGE_KEYS.theme, validTheme);
    } catch {
      // Ignore persistence errors.
    }
  }, [theme]);

  useEffect(() => {
    if (!joined || !activeRoomId) {
      return;
    }

    const nextSession = {
      roomId: activeRoomId,
      name: displayName.trim().slice(0, 20),
      color: avatarColor,
    };

    if (!nextSession.name) {
      return;
    }

    setLastSession(nextSession);

    try {
      window.localStorage.setItem(STORAGE_KEYS.lastSession, JSON.stringify(nextSession));
    } catch {
      // Ignore persistence errors.
    }
  }, [activeRoomId, avatarColor, displayName, joined]);

  useEffect(() => {
    setConnectionApiInput(apiBase || "");
  }, [apiBase]);

  useEffect(() => {
    setConnectionSignalingInput(signalingUrl || "");
  }, [signalingUrl]);

  useEffect(() => {
    const appQuickTunnel = appInfo?.quickTunnel;
    if (!appQuickTunnel || typeof appQuickTunnel !== "object") {
      return;
    }

    setQuickTunnelState((prev) => ({
      ...prev,
      ...appQuickTunnel,
    }));
  }, [appInfo]);

  useEffect(() => {
    if (!isDesktop) {
      return undefined;
    }

    const desktopApi = window.mescordDesktop;
    if (!desktopApi || typeof desktopApi !== "object") {
      return undefined;
    }

    let disposed = false;

    if (typeof desktopApi.getQuickTunnelStatus === "function") {
      desktopApi
        .getQuickTunnelStatus()
        .then((result) => {
          if (!disposed && result?.state) {
            setQuickTunnelState((prev) => ({
              ...prev,
              ...result.state,
            }));
          }
        })
        .catch(() => {
          // ignore initial tunnel status read errors
        });
    }

    const unsubscribe =
      typeof desktopApi.onConnectionEvent === "function"
        ? desktopApi.onConnectionEvent((eventPayload) => {
            if (!eventPayload || eventPayload.type !== "quick-tunnel-status") {
              return;
            }

            const nextState = eventPayload.state || {};
            setQuickTunnelState((prev) => ({
              ...prev,
              ...nextState,
            }));
            setQuickTunnelBusy(false);

            if (nextState.status === "ready" && nextState.publicUrl) {
              setConnectionNotice(
                `Cloudflare URL hazir: ${nextState.publicUrl}. Cloudflare URL preset'ini sec ve URL Kaydet'e bas.`,
              );
              return;
            }

            if (nextState.status === "error" && nextState.error) {
              setConnectionNotice(nextState.error);
            }
          })
        : null;

    return () => {
      disposed = true;
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [isDesktop]);

  useEffect(() => {
    if (!isDesktop) {
      return undefined;
    }

    if (quickTunnelState.status !== "starting" && quickTunnelState.status !== "stopping") {
      return undefined;
    }

    const desktopApi = window.mescordDesktop;
    if (!desktopApi || typeof desktopApi.getQuickTunnelStatus !== "function") {
      return undefined;
    }

    let disposed = false;

    const pollStatus = async () => {
      try {
        const result = await desktopApi.getQuickTunnelStatus();
        if (disposed || !result?.state) {
          return;
        }

        const nextState = result.state;
        setQuickTunnelState((prev) => ({
          ...prev,
          ...nextState,
        }));

        if (nextState.status !== "starting" && nextState.status !== "stopping") {
          setQuickTunnelBusy(false);
        }

        if (nextState.status === "ready" && nextState.publicUrl) {
          setConnectionNotice(
            `Cloudflare URL hazir: ${nextState.publicUrl}. Cloudflare URL preset'ini sec ve URL Kaydet'e bas.`,
          );
          return;
        }

        if (nextState.status === "error" && nextState.error) {
          setConnectionNotice(nextState.error);
        }
      } catch {
        // Ignore polling errors and keep waiting for next tick.
      }
    };

    const timerId = window.setInterval(() => {
      pollStatus();
    }, 1200);

    pollStatus();

    return () => {
      disposed = true;
      window.clearInterval(timerId);
    };
  }, [isDesktop, quickTunnelState.status]);

  useEffect(() => {
    if (joined && authToken) {
      authenticateSocial(authToken);
      return;
    }

    authenticateSocial("");
    leaveGroupChannel();
  }, [joined, authToken, authenticateSocial, leaveGroupChannel]);

  useEffect(() => {
    if (!joined || !authToken || !selectedGroup?.id || !selectedChannel?.id) {
      return;
    }

    subscribeGroupChannel({
      groupId: selectedGroup.id,
      channelId: selectedChannel.id,
    });
  }, [joined, authToken, selectedGroup, selectedChannel, subscribeGroupChannel]);

  useEffect(() => {
    if (
      !joined ||
      conversationMode !== "channel" ||
      !selectedGroup?.id ||
      !selectedChannel?.id ||
      !authToken
    ) {
      return undefined;
    }

    if (!groupComposerInput.trim()) {
      setGroupTyping(false);
      return undefined;
    }

    setGroupTyping(true);
    const timerId = window.setTimeout(() => {
      setGroupTyping(false);
    }, 900);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [
    groupComposerInput,
    joined,
    conversationMode,
    selectedGroup,
    selectedChannel,
    authToken,
    setGroupTyping,
  ]);

  useEffect(() => {
    incomingRequests.forEach((request) => {
      const senderName =
        request?.fromUser?.displayName || request?.fromUser?.username || "Bir kullanici";

      pushActivity({
        id: `friend-request:${request.id}`,
        type: "friend",
        title: "Yeni arkadas istegi",
        detail: `@${senderName}`,
        text: "Arkadaslik istegini onayla veya reddet.",
        at: Number(request.createdAt || Date.now()),
      });
    });
  }, [incomingRequests, pushActivity]);

  useEffect(() => {
    const latest = groupChannelMessages[groupChannelMessages.length - 1];
    if (!latest?.id || latest.fromUserId === accountUser?.id) {
      return;
    }

    const channelId = latest.channelId || groupChannelContext.channelId || selectedChannelIdSafe;
    if (channelId && conversationMode !== "channel") {
      setChannelUnreadMap((prev) => ({
        ...prev,
        [channelId]: Number(prev[channelId] || 0) + 1,
      }));
    }

    const mention = hasTextMention(latest.text, accountUser);
    const author = latest.fromUser?.displayName || latest.fromUser?.username || "Guest";
    const channelLabel =
      latest.channelName || groupChannelContext.channelName || selectedChannelName || "kanal";

    pushActivity({
      id: `group:${latest.id}`,
      type: mention ? "mention" : "channel",
      title: mention ? "Kanal mention" : "Yeni kanal mesaji",
      detail: `#${channelLabel} • ${author}`,
      text: latest.text,
      at: Number(latest.createdAt || Date.now()),
    });
  }, [
    groupChannelMessages,
    accountUser,
    groupChannelContext.channelId,
    groupChannelContext.channelName,
    selectedChannelIdSafe,
    selectedChannelName,
    conversationMode,
    pushActivity,
  ]);

  useEffect(() => {
    const latest = dmMessages[dmMessages.length - 1];
    if (!latest?.id || latest.fromUserId === accountUser?.id || !activeDmTargetId) {
      return;
    }

    if (conversationMode !== "dm") {
      setDmUnreadMap((prev) => ({
        ...prev,
        [activeDmTargetId]: Number(prev[activeDmTargetId] || 0) + 1,
      }));
    }

    const mention = hasTextMention(latest.text, accountUser);
    const author = latest.fromUser?.displayName || latest.fromUser?.username || "Guest";

    pushActivity({
      id: `dm:${latest.id}`,
      type: mention ? "mention" : "dm",
      title: mention ? "DM mention" : "Yeni DM",
      detail: `@${activeDmDisplayName || author}`,
      text: latest.text,
      at: Number(latest.createdAt || Date.now()),
    });
  }, [
    dmMessages,
    accountUser,
    activeDmTargetId,
    activeDmDisplayName,
    conversationMode,
    pushActivity,
  ]);

  useEffect(() => {
    const latest = chatMessages[chatMessages.length - 1];
    if (!latest?.id) {
      return;
    }

    const selfName = selfParticipantName || displayName.trim();
    if (selfName && latest.fromName === selfName) {
      return;
    }

    const mention = hasTextMention(latest.text, accountUser);

    pushActivity({
      id: `voice:${latest.id}`,
      type: mention ? "mention" : "voice",
      title: mention ? "Voice mention" : "Oda mesaji",
      detail: `${latest.fromName || "Guest"} • Voice sohbet`,
      text: latest.text,
      at: Number(latest.at || Date.now()),
    });
  }, [chatMessages, selfParticipantName, displayName, accountUser, pushActivity]);

  useEffect(() => {
    if (!systemNotice || systemNotice === lastSystemNoticeRef.current) {
      return;
    }

    lastSystemNoticeRef.current = systemNotice;
    systemNoticeCounterRef.current += 1;

    pushActivity({
      id: `notice:${systemNoticeCounterRef.current}`,
      type: "notice",
      title: "Sistem bildirimi",
      detail: `#${activeRoomId || "oda"}`,
      text: systemNotice,
      at: Date.now(),
    });
  }, [systemNotice, activeRoomId, pushActivity]);

  const closeTour = () => {
    setTourStepIndex(-1);
    try {
      window.localStorage.setItem(STORAGE_KEYS.tourDone, "1");
    } catch {
      // Ignore persistence errors.
    }
  };

  const goToNextTourStep = () => {
    const isLast = tourStepIndex >= TOUR_STEPS.length - 1;
    if (isLast) {
      closeTour();
      return;
    }

    setTourStepIndex((prev) => prev + 1);
  };

  const trackRecentRoom = (roomCode) => {
    const normalizedRoomCode = typeof roomCode === "string" ? roomCode.trim().toLowerCase() : "";
    if (!normalizedRoomCode) {
      return;
    }

    const nextRooms = [normalizedRoomCode, ...recentRooms.filter((item) => item !== normalizedRoomCode)].slice(0, 6);
    setRecentRooms(nextRooms);

    try {
      window.localStorage.setItem(STORAGE_KEYS.recentRooms, JSON.stringify(nextRooms));
    } catch {
      // Ignore persistence errors.
    }
  };

  const handleJoin = async (event) => {
    event.preventDefault();
    const normalizedRoomInput = roomInput.trim().toLowerCase();

    const ok = await joinRoom({
      roomId: normalizedRoomInput,
      name: displayName,
      color: avatarColor,
    });

    if (ok) {
      trackRecentRoom(normalizedRoomInput);
      const url = new URL(window.location.href);
      url.searchParams.set("room", normalizedRoomInput);
      window.history.replaceState({}, "", url.toString());
    }
  };

  const handleCopyInvite = async () => {
    if (!activeRoomId) {
      return;
    }

    const inviteUrl = `${window.location.origin}?room=${encodeURIComponent(activeRoomId)}`;

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const handleManualUpdateCheck = () => {
    openModal();
    checkForUpdates();
  };

  const handleSendChat = (event) => {
    event.preventDefault();
    const result = sendChatMessage(chatInput);

    if (result.ok) {
      setChatInput("");
    }
  };

  const handleAccountSubmit = async (event) => {
    event.preventDefault();

    const payload = {
      username: accountUsername,
      password: accountPassword,
      displayName: accountDisplayName || displayName,
    };

    const ok =
      accountMode === "register" ? await registerAccount(payload) : await loginAccount({ username: payload.username, password: payload.password });

    if (ok) {
      setAccountPassword("");
      if (accountMode === "register") {
        const nextDisplayName = (payload.displayName || "").trim().slice(0, 20);
        if (nextDisplayName) {
          setDisplayName(nextDisplayName);
        }
      }
    }
  };

  const handleFriendRequestSubmit = async (event) => {
    event.preventDefault();
    const ok = await sendFriendRequest(friendUsernameInput);
    if (ok) {
      setFriendUsernameInput("");
    }
  };

  const handleCreateGroupSubmit = async (event) => {
    event.preventDefault();
    const ok = await createGroup(groupNameInput);
    if (ok) {
      setGroupNameInput("");
    }
  };

  const handleSendDmSubmit = async (event) => {
    event.preventDefault();
    const ok = await sendDmToActiveTarget(dmInput);
    if (ok) {
      setDmInput("");
    }
  };

  const handleSelectDmFriend = async (friend) => {
    clearDmUnread(friend?.id || "");
    setConversationMode("dm");
    await openDmWithFriend(friend);
  };

  const handleSendGroupMessage = (event) => {
    event.preventDefault();
    const result = sendGroupChannelMessage(groupComposerInput);
    if (!result.ok) {
      return;
    }

    setGroupComposerInput("");
    setGroupTyping(false);
  };

  const handleCreateChannelSubmit = async (event) => {
    event.preventDefault();
    if (!selectedGroup?.id) {
      return;
    }

    const ok = await createGroupChannel(selectedGroup.id, newChannelNameInput);
    if (ok) {
      setNewChannelNameInput("");
    }
  };

  const handlePresenceChange = async (event) => {
    await updatePresenceStatus(event.target.value);
  };

  const handleApplyConnectionPreset = (preset) => {
    if (preset === "localhost") {
      const target = appInfo?.suggestedLocalhostUrl || "http://localhost:3001";
      setConnectionApiInput(target);
      setConnectionSignalingInput(target);
      setConnectionNotice("Bu PC (localhost) secildi. URL Kaydet'e basarak aktif et.");
      return;
    }

    if (preset === "lan") {
      const target = appInfo?.suggestedLanUrl || "";
      if (!target) {
        setConnectionNotice(
          "LAN IP bulunamadi. Ayni aga bagli oldugundan emin ol veya URL'yi elle gir.",
        );
        return;
      }

      setConnectionApiInput(target);
      setConnectionSignalingInput(target);
      setConnectionNotice(
        `Bu PC (LAN) secildi: ${target}. Arkadasin da ayni URL'yi kullanarak baglanabilir.`,
      );
      return;
    }

    if (preset === "cloudflare") {
      const target = quickTunnelState.publicUrl || appInfo?.suggestedCloudflareUrl || "";
      if (!target) {
        setConnectionNotice("Cloudflare URL henuz hazir degil. Once Quick Tunnel Baslat.");
        return;
      }

      setConnectionApiInput(target);
      setConnectionSignalingInput(target);
      setConnectionNotice(
        `Cloudflare URL secildi: ${target}. Arkadasin farkli internetten bu URL ile baglanabilir.`,
      );
    }
  };

  const handleQuickTunnelToggle = async () => {
    if (!isDesktop) {
      return;
    }

    const desktopApi = window.mescordDesktop;
    if (!desktopApi || typeof desktopApi !== "object") {
      setConnectionNotice("Desktop API bulunamadi.");
      return;
    }

    const canStart = typeof desktopApi.startQuickTunnel === "function";
    const canStop = typeof desktopApi.stopQuickTunnel === "function";
    if (!canStart || !canStop) {
      setConnectionNotice("Bu surumde Quick Tunnel destegi yok.");
      return;
    }

    const shouldStop = quickTunnelRunning;
    const localhostTarget = [
      connectionApiInput,
      connectionSignalingInput,
      appInfo?.suggestedLocalhostUrl,
      "http://localhost:3001",
    ].find((candidate) => isLocalhostUrl(candidate || ""));

    const preferredTargetUrl =
      localhostTarget ||
      appInfo?.suggestedLocalhostUrl ||
      connectionSignalingInput.trim() ||
      "http://localhost:3001";
    setQuickTunnelBusy(true);

    try {
      const result = shouldStop
        ? await desktopApi.stopQuickTunnel()
        : await desktopApi.startQuickTunnel({ targetUrl: preferredTargetUrl });

      if (result?.state) {
        setQuickTunnelState((prev) => ({
          ...prev,
          ...result.state,
        }));
      }

      if (!result?.ok) {
        setConnectionNotice(result?.message || "Quick Tunnel islemi basarisiz.");
        return;
      }

      if (shouldStop) {
        setConnectionNotice("Cloudflare Quick Tunnel durduruluyor.");
        return;
      }

      if (result?.state?.publicUrl) {
        setConnectionNotice(
          `Cloudflare URL hazir: ${result.state.publicUrl}. Cloudflare URL preset'ini sec ve URL Kaydet'e bas.`,
        );
      } else {
        setConnectionNotice("Quick Tunnel baslatildi. URL olusunca burada gorunecek.");
      }
    } catch {
      setConnectionNotice("Quick Tunnel komutu calistirilamadi. cloudflared kurulu mu kontrol et.");
    } finally {
      setQuickTunnelBusy(false);
    }
  };

  const handleSaveConnectionConfig = (event) => {
    event.preventDefault();

    const apiHost = getUrlHostLabel(connectionApiInput);
    const signalingHost = getUrlHostLabel(connectionSignalingInput);

    if (apiHost && signalingHost && apiHost !== signalingHost) {
      const mixedLocalhost =
        isLocalhostUrl(connectionApiInput) || isLocalhostUrl(connectionSignalingInput);

      setConnectionNotice(
        mixedLocalhost
          ? "Karisik ayar algilandi. API ve Signaling ayni host olmali: host PC icin ikisini de localhost, arkadasin icin ikisini de Cloudflare URL yap."
          : "API URL ve Signaling URL ayni host olmali.",
      );
      return;
    }

    const result = saveRuntimeConnectionConfig({
      apiBaseUrl: connectionApiInput,
      signalingUrl: connectionSignalingInput,
    });

    if (!result.ok) {
      setConnectionNotice(result.message || "Baglanti ayarlari kaydedilemedi.");
      return;
    }

    refreshAccountConnectionConfig();
    refreshVoiceConnectionConfig();
    clearAccountError();
    setConnectionNotice("Baglanti ayarlari kaydedildi. Yeni denemelerde bu URL'ler kullanilacak.");
  };

  const clearLastSession = () => {
    setLastSession(null);

    try {
      window.localStorage.removeItem(STORAGE_KEYS.lastSession);
    } catch {
      // Ignore persistence errors.
    }
  };

  const handleRestoreLastSession = async () => {
    if (!lastSession) {
      return;
    }

    setDisplayName(lastSession.name);
    if (lastSession.color) {
      setAvatarColor(lastSession.color);
    }
    setRoomInput(lastSession.roomId);

    const ok = await joinRoom({
      roomId: lastSession.roomId,
      name: lastSession.name,
      color: lastSession.color || avatarColor,
    });

    if (ok) {
      trackRecentRoom(lastSession.roomId);
      const url = new URL(window.location.href);
      url.searchParams.set("room", lastSession.roomId);
      window.history.replaceState({}, "", url.toString());
    }
  };

  return (
    <div className="app-shell">
      <AnimatedBackground />
      <ReactionBurst reactions={reactions} />
      <DesktopUpdateModal
        isOpen={isDesktop && isModalOpen}
        state={updateState}
        appInfo={appInfo}
        onClose={dismissModal}
        onCheck={checkForUpdates}
        onDownload={downloadUpdate}
        onInstall={installUpdate}
      />

      {!joined ? (
        <main className="landing-layout">
          <section className="hero-copy">
            <motion.p
              className="badge"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              Mescord Ultra Voice
            </motion.p>

            <motion.h1
              className="hero-title"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
            >
              Arkadaslarinla kesintisiz,
              <br />
              guclu ve akici sesli sohbet.
            </motion.h1>

            <motion.p
              className="hero-subtitle"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9 }}
            >
              WebRTC dusuk gecikme, canli katilimci paneli, push-to-talk, mikrofon secimi, oda ici sohbet ve
              masaustu update popup akisiyla tek linkte toplanip direkt konusmaya basla.
            </motion.p>

            <motion.div
              className="feature-grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.9, delay: 0.2 }}
            >
              <article>
                <h3>Ultra Akicilik</h3>
                <p>Mesh WebRTC ile dusuk gecikme odakli ses deneyimi.</p>
              </article>
              <article>
                <h3>Canli Vibe</h3>
                <p>Konusma animasyonlari, chat paneli ve reaksiyon patlamalari ile enerji yuksek.</p>
              </article>
              <article>
                <h3>Kontrol Sende</h3>
                <p>Owner kontrolleri, push-to-talk, mikrofon secimi ve hizli davet baglantisi.</p>
              </article>
            </motion.div>
          </section>

          <motion.section
            className="join-card"
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <h2>Odaya Katil</h2>

            {isDesktop ? (
              <div className="desktop-mini-card">
                <p>Mescord Desktop</p>
                <div>
                  <span>v{appInfo?.appVersion || "?"}</span>
                  <button type="button" className="soft-btn" onClick={handleManualUpdateCheck}>
                    {updateStatusLabel(updateState.status)}
                  </button>
                </div>
              </div>
            ) : null}

            <section className="connection-config-card">
              <h3>Baglanti Ayarlari</h3>
              <p>Kayit, giris ve odaya baglanma bu URL'ler uzerinden yapilir.</p>

              {isDesktop ? (
                <div className="connection-preset-row">
                  <button
                    type="button"
                    className="soft-btn tiny-btn"
                    onClick={() => {
                      handleApplyConnectionPreset("localhost");
                    }}
                  >
                    Bu PC (localhost)
                  </button>
                  <button
                    type="button"
                    className="soft-btn tiny-btn"
                    onClick={() => {
                      handleApplyConnectionPreset("lan");
                    }}
                  >
                    Bu PC (LAN)
                  </button>
                  <button
                    type="button"
                    className="soft-btn tiny-btn"
                    onClick={() => {
                      handleApplyConnectionPreset("cloudflare");
                    }}
                    disabled={!quickTunnelState.publicUrl}
                  >
                    Cloudflare URL
                  </button>
                </div>
              ) : null}

              {isDesktop ? (
                <div className="connection-tunnel-row">
                  <button
                    type="button"
                    className="soft-btn tiny-btn"
                    onClick={handleQuickTunnelToggle}
                    disabled={quickTunnelBusy || quickTunnelState.status === "stopping"}
                  >
                    {quickTunnelRunning ? "Quick Tunnel Durdur" : "Quick Tunnel Baslat"}
                  </button>
                  <span className={`connection-tunnel-status ${quickTunnelState.status}`}>
                    {quickTunnelStatusLabel}
                  </span>
                </div>
              ) : null}

              {isDesktop && quickTunnelState.publicUrl ? (
                <small className="connection-note">Cloudflare URL: {quickTunnelState.publicUrl}</small>
              ) : null}

              <form className="connection-config-form" onSubmit={handleSaveConnectionConfig}>
                <label>
                  API URL
                  <input
                    type="text"
                    placeholder="https://api.example.com"
                    value={connectionApiInput}
                    onChange={(event) => setConnectionApiInput(event.target.value)}
                    required
                  />
                </label>

                <label>
                  Signaling URL
                  <input
                    type="text"
                    placeholder="https://api.example.com"
                    value={connectionSignalingInput}
                    onChange={(event) => setConnectionSignalingInput(event.target.value)}
                    required
                  />
                </label>

                <button type="submit" className="soft-btn">
                  URL Kaydet
                </button>
              </form>

              {isDesktop ? (
                <small className="connection-hint">
                  Ayni ag icin Bu PC (LAN), farkli ag icin Quick Tunnel Baslat sonra Cloudflare URL preset'ini sec.
                </small>
              ) : null}

              {connectionNotice ? <small className="connection-note">{connectionNotice}</small> : null}
            </section>

            <div className="theme-row">
              <span>Tema</span>
              <div className="theme-chip-list">
                {THEMES.map((themeItem) => (
                  <button
                    key={themeItem.id}
                    type="button"
                    className={`theme-chip ${theme === themeItem.id ? "active" : ""}`}
                    onClick={() => setTheme(themeItem.id)}
                  >
                    {themeItem.label}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleJoin} className="join-form">
              <label>
                Gorunen adin
                <input
                  type="text"
                  placeholder="Mesela: Melis"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  maxLength={20}
                />
              </label>

              <label>
                Oda kodu
                <input
                  type="text"
                  value={roomInput}
                  onChange={(event) => setRoomInput(event.target.value)}
                  maxLength={24}
                  required
                />
              </label>

              <div className="color-row">
                <span>Profil rengi</span>
                <div className="swatch-wrap">
                  {COLOR_SWATCHES.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      className={`swatch ${avatarColor === swatch ? "active" : ""}`}
                      style={{ backgroundColor: swatch }}
                      onClick={() => setAvatarColor(swatch)}
                      aria-label={`Renk ${swatch}`}
                    />
                  ))}
                </div>
              </div>

              {recentRooms.length > 0 ? (
                <div className="recent-rooms-wrap">
                  <span>Son odalar</span>
                  <div className="recent-room-list">
                    {recentRooms.map((roomCode) => (
                      <button
                        key={roomCode}
                        type="button"
                        className="recent-room-btn"
                        onClick={() => setRoomInput(roomCode)}
                      >
                        #{roomCode}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {lastSession ? (
                <button type="button" className="soft-btn restore-btn" onClick={handleRestoreLastSession}>
                  Son Odaya Don: #{lastSession.roomId}
                </button>
              ) : null}

              <button className="primary-btn" type="submit">
                Odaya Gir
              </button>
            </form>

            <section className="social-hub">
              <header className="social-hub-head">
                <h3>Social Hub V2</h3>
                <p>{socialPrivacyNote || "Hesap verileri public repoya degil, sunucu tarafindaki private data dosyasina yazilir."}</p>
                {socialStoragePath ? <small>Data file: {socialStoragePath}</small> : null}
              </header>

              {!accountUser ? (
                <>
                  <div className="account-mode-row">
                    <button
                      type="button"
                      className={`soft-btn tiny-btn ${accountMode === "login" ? "active-mode" : ""}`}
                      onClick={() => {
                        setAccountMode("login");
                        clearAccountError();
                      }}
                    >
                      Giris
                    </button>
                    <button
                      type="button"
                      className={`soft-btn tiny-btn ${accountMode === "register" ? "active-mode" : ""}`}
                      onClick={() => {
                        setAccountMode("register");
                        clearAccountError();
                      }}
                    >
                      Kayit
                    </button>
                  </div>

                  <form className="social-form" onSubmit={handleAccountSubmit}>
                    <input
                      type="text"
                      placeholder="Kullanici adi"
                      value={accountUsername}
                      onChange={(event) => setAccountUsername(event.target.value)}
                      maxLength={24}
                      required
                    />
                    <input
                      type="password"
                      placeholder="Sifre (min 8)"
                      value={accountPassword}
                      onChange={(event) => setAccountPassword(event.target.value)}
                      minLength={8}
                      required
                    />
                    {accountMode === "register" ? (
                      <input
                        type="text"
                        placeholder="Gorunen ad (opsiyonel)"
                        value={accountDisplayName}
                        onChange={(event) => setAccountDisplayName(event.target.value)}
                        maxLength={32}
                      />
                    ) : null}
                    <button type="submit" className="primary-btn" disabled={accountBusy}>
                      {accountMode === "register" ? "Hesap Olustur" : "Hesaba Gir"}
                    </button>
                  </form>
                </>
              ) : (
                <div className="social-auth-shell">
                  <div className="account-banner">
                    <div>
                      <strong>{accountUser.displayName}</strong>
                      <span>@{accountUser.username}</span>
                    </div>
                    <button type="button" className="soft-btn tiny-btn" onClick={logoutAccount} disabled={accountBusy}>
                      Cikis
                    </button>
                  </div>

                  <form className="social-inline-form" onSubmit={handleFriendRequestSubmit}>
                    <input
                      type="text"
                      placeholder="Arkadas kullanici adi"
                      value={friendUsernameInput}
                      onChange={(event) => setFriendUsernameInput(event.target.value)}
                      maxLength={24}
                      required
                    />
                    <button type="submit" className="soft-btn" disabled={accountBusy}>
                      Istek Gonder
                    </button>
                  </form>

                  <div className="social-columns">
                    <article className="social-card">
                      <h4>Arkadaslar ({friends.length})</h4>
                      <div className="social-list">
                        {friends.length === 0 ? <p className="social-empty">Henuz arkadas yok.</p> : null}
                        {friends.map((friend) => (
                          <div
                            key={friend.id}
                            className={`friend-row ${activeDmTarget?.id === friend.id ? "active" : ""}`}
                          >
                            <div>
                              <strong>{friend.displayName}</strong>
                              <span>@{friend.username}</span>
                            </div>
                            <button
                              type="button"
                              className="soft-btn tiny-btn"
                              onClick={() => {
                                openDmWithFriend(friend);
                              }}
                            >
                              DM
                            </button>
                          </div>
                        ))}
                      </div>
                    </article>

                    <article className="social-card">
                      <h4>Gelen Istekler ({incomingRequests.length})</h4>
                      <div className="social-list">
                        {incomingRequests.length === 0 ? <p className="social-empty">Bekleyen istek yok.</p> : null}
                        {incomingRequests.map((request) => (
                          <div key={request.id} className="request-row">
                            <span>@{request.fromUser?.username || "guest"}</span>
                            <div className="request-actions">
                              <button
                                type="button"
                                className="soft-btn tiny-btn"
                                onClick={() => {
                                  respondToFriendRequest(request.id, true);
                                }}
                              >
                                Onayla
                              </button>
                              <button
                                type="button"
                                className="soft-btn tiny-btn"
                                onClick={() => {
                                  respondToFriendRequest(request.id, false);
                                }}
                              >
                                Reddet
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>
                  </div>

                  {outgoingRequests.length > 0 ? (
                    <p className="social-note">
                      Giden istekler: {outgoingRequests.map((request) => `@${request.toUser?.username || "guest"}`).join(", ")}
                    </p>
                  ) : null}

                  <form className="social-inline-form" onSubmit={handleCreateGroupSubmit}>
                    <input
                      type="text"
                      placeholder="Yeni grup adi"
                      value={groupNameInput}
                      onChange={(event) => setGroupNameInput(event.target.value)}
                      maxLength={40}
                      required
                    />
                    <button type="submit" className="soft-btn" disabled={accountBusy}>
                      Grup Ac
                    </button>
                  </form>

                  <div className="group-chip-list social-group-list">
                    {groups.length === 0 ? <p className="social-empty">Henuz grup yok.</p> : null}
                    {groups.map((group) => (
                      <span key={group.id} className="group-chip">
                        {group.name} • {group.memberCount} kisi
                      </span>
                    ))}
                  </div>

                  {activeDmTarget ? (
                    <section className="dm-panel">
                      <header>
                        <h4>DM: {activeDmTarget.displayName}</h4>
                        <small>@{activeDmTarget.username}</small>
                      </header>

                      <div className="dm-scroll">
                        {dmMessages.length === 0 ? <p className="social-empty">Bu DM henuz bos.</p> : null}
                        {dmMessages.map((message) => (
                          <article key={message.id} className="dm-message">
                            <header>
                              <strong>{message.fromUser?.displayName || "Guest"}</strong>
                              <span>{formatChatTime(message.createdAt)}</span>
                            </header>
                            <p>{message.text}</p>
                          </article>
                        ))}
                      </div>

                      <form className="social-inline-form dm-form" onSubmit={handleSendDmSubmit}>
                        <input
                          type="text"
                          placeholder="DM yaz..."
                          value={dmInput}
                          onChange={(event) => setDmInput(event.target.value)}
                          maxLength={1200}
                          required
                        />
                        <button type="submit" className="primary-btn" disabled={accountBusy}>
                          Gonder
                        </button>
                      </form>
                    </section>
                  ) : (
                    <p className="social-empty">Arkadas listenden DM tusuna basarak ozel sohbet acabilirsin.</p>
                  )}
                </div>
              )}

              {accountError ? <p className="error-text social-error">{accountError}</p> : null}
            </section>

            {error ? <p className="error-text">{error}</p> : null}
          </motion.section>
        </main>
      ) : (
        <main className="room-layout">
          <header className="room-topbar" style={{ display: 'flex', padding: '12px 16px', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-1)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '18px' }}>#{activeRoomId}</h2>
        <small style={{ color: 'var(--text-dim)' }}>
          {participants.length} kisi bagli   {roomLocked ? "Oda kilitli" : "Oda acik"}
        </small>
      </div>
      <div className="topbar-actions" style={{ display: 'flex', gap: '8px' }}>
        {isDesktop ? (
          <button type="button" className="soft-btn" onClick={handleManualUpdateCheck}>
            {updateStatusLabel(updateState.status)}
          </button>
        ) : null}
      </div>
    </header>

          {systemNotice ? <div className="system-notice">{systemNotice}</div> : null}

          <section className="discord-workspace">
            <aside className="panel guild-rail">
              <header className="guild-rail-head">
                <button
                  type="button"
                  className={`guild-node home-btn ${!selectedGroup ? "active" : ""}`}
                  onClick={() => {
                    setSelectedGroupId(null);
                    setConversationMode("dm");
                  }}
                  title="Ana Sayfa (Direkt Mesajlar)"
                  style={{ width: '48px', height: '48px', borderRadius: !selectedGroup ? '16px' : '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '20px', transition: 'all 0.2s', marginBottom: '8px' }}
                >
                  <img src="/mescord-logo.png" alt="M" style={{ width: '28px', height: '28px' }} onError={(e) => { e.target.style.display='none'; e.target.parentNode.innerHTML='M'; }} />
                </button>
                <div style={{ width: '32px', height: '2px', background: 'rgba(255,255,255,0.06)', marginBottom: '8px' }} />
              </header>

              <div className="guild-rail-list">
                {groups.length === 0 ? <p className="guild-empty">Grup yok</p> : null}
                {groups.map((group) => {
                  const unreadCount = Number(groupUnreadMap[group.id] || 0);

                  return (
                    <button
                      key={group.id}
                      type="button"
                      className={`guild-node ${selectedGroup?.id === group.id ? "active" : ""}`}
                      onClick={() => {
                        setSelectedGroupId(group.id);
                        setConversationMode("channel");
                      }}
                      title={group.name}
                    >
                      <span className="guild-node-label">{initialsLabel(group.name)}</span>
                      {unreadCount > 0 ? (
                        <span className="unread-badge guild-unread">
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {accountUser ? (
                <form className="guild-quick-form" onSubmit={handleCreateGroupSubmit}>
                  <input
                    type="text"
                    placeholder="Yeni server"
                    value={groupNameInput}
                    onChange={(event) => setGroupNameInput(event.target.value)}
                    maxLength={40}
                    required
                  />
                  <button type="submit" className="soft-btn" disabled={accountBusy}>
                    +
                  </button>
                </form>
              ) : (
                <small className="guild-empty">Server olusturmak icin hesap girisi yap.</small>
              )}
            </aside>

            <aside className="panel channel-sidebar">
              <header className="channel-sidebar-head">
                <h3 style={{ padding: '0 16px', margin: '16px 0 0 0', fontSize: '15px' }}>{selectedGroup ? selectedGroup.name : "Ana Sayfa"}</h3>
                <small style={{ padding: '0 16px', display: 'block', color: 'var(--text-dim)', marginBottom: '16px' }}>{selectedGroup ? `${selectedGroup?.memberCount || 0} uye` : "Direkt Mesajlar"}</small>
              </header>

              <div className="sidebar-scroll" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px', padding: '0 8px' }}>
                {!selectedGroup ? (
                   <>
                     <button type="button" className="channel-node" style={{ justifyContent: 'flex-start', gap: '12px' }} onClick={() => { setConversationMode('dm'); }}>
                       <span style={{ fontSize: '20px' }}>👋</span> Arkadaslar
                     </button>
                     <div style={{ marginTop: '16px', marginBottom: '8px', padding: '0 8px', fontSize: '11px', fontWeight: 'bold', color: 'var(--text-dim)', textTransform: 'uppercase' }}>DIREKT MESAJLAR</div>
                     {friends.length === 0 ? <p style={{ padding: '0 8px', color: 'var(--text-dim)', fontSize: '13px' }}>DM yok.</p> : null}
                     {friends.map((friend) => (
                        <button
                          key={`dm-${friend.id}`}
                          type="button"
                          className={`channel-node ${activeDmTarget?.id === friend.id ? "active" : ""}`}
                          onClick={() => {
                            handleSelectDmFriend(friend);
                          }}
                          style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px', borderRadius: '4px' }}
                        >
                          <div style={{ position: 'relative' }}>
                            <div className="avatar-chip" style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: friend.color || '#00c6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold', color: '#fff' }}>
                              {initialsLabel(friend.displayName || friend.username)}
                            </div>
                            <span className={`presence-dot ${friend.presenceStatus || "offline"}`} style={{ position: 'absolute', bottom: 0, right: 0, width: '10px', height: '10px', borderRadius: '50%', border: '2px solid var(--bg-1)' }} />
                          </div>
                          <span style={{ flex: 1, textAlign: 'left', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{friend.displayName || friend.username}</span>
                          {(dmUnreadMap[friend.id] || 0) > 0 && <span className="unread-badge" style={{ background: 'var(--danger)', color: '#fff', padding: '2px 6px', borderRadius: '12px', fontSize: '11px' }}>{dmUnreadMap[friend.id]}</span>}
                        </button>
                      ))}
                   </>
                ) : (
                   <>
                     <div style={{ marginTop: '16px', marginBottom: '8px', padding: '0 8px', fontSize: '11px', fontWeight: 'bold', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                       METIN KANALLARI
                     </div>
                     {filteredChannels.filter(c => c.type !== 'voice').length === 0 ? <p style={{ padding: '0 8px', color: 'var(--text-dim)', fontSize: '13px' }}>Kanal bulunamadi.</p> : null}
                     {filteredChannels.filter(c => c.type !== 'voice').map((channel) => (
                        <button
                          key={channel.id}
                          type="button"
                          className={`channel-node ${selectedChannel?.id === channel.id ? "active" : ""}`}
                          onClick={() => {
                            setConversationMode("channel");
                            setSelectedChannelId(channel.id);
                            clearChannelUnread(channel.id);
                          }}
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '4px', color: selectedChannel?.id === channel.id ? '#fff' : 'var(--text-dim)' }}
                        >
                          <span style={{ fontSize: '16px', color: 'var(--text-dim)' }}>#</span>
                          <span style={{ flex: 1, textAlign: 'left' }}>{channel.name}</span>
                          {(channelUnreadMap[channel.id] || 0) > 0 && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--text-1)' }} />}
                        </button>
                     ))}

                     <div style={{ marginTop: '24px', marginBottom: '8px', padding: '0 8px', fontSize: '11px', fontWeight: 'bold', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                       SES KANALLARI
                     </div>
                     {filteredChannels.filter(c => c.type === 'voice').length === 0 ? <p style={{ padding: '0 8px', color: 'var(--text-dim)', fontSize: '13px' }}>Ses kanalı bulunamadi.</p> : null}
                     {filteredChannels.filter(c => c.type === 'voice').map((channel) => (
                        <button
                          key={channel.id}
                          type="button"
                          className={`channel-node ${selectedChannel?.id === channel.id ? "active" : ""}`}
                          onClick={() => {
                            setConversationMode("channel");
                            setSelectedChannelId(channel.id);
                            clearChannelUnread(channel.id);
                          }}
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '4px', color: selectedChannel?.id === channel.id ? '#fff' : 'var(--text-dim)' }}
                        >
                          <span style={{ fontSize: '16px', color: 'var(--text-dim)' }}>🔊</span>
                          <span style={{ flex: 1, textAlign: 'left' }}>{channel.name}</span>
                          {(channelUnreadMap[channel.id] || 0) > 0 && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--text-1)' }} />}
                        </button>
                     ))}
                   </>
                )}
              </div>

              {canCreateChannel ? (
                <form className="channel-create-form" onSubmit={handleCreateChannelSubmit}>
                  <input
                    type="text"
                    placeholder="Yeni kanal"
                    value={newChannelNameInput}
                    onChange={(event) => setNewChannelNameInput(event.target.value)}
                    maxLength={24}
                    required
                  />
                  <button type="submit" className="soft-btn" disabled={accountBusy}>
                    Kanal Ac
                  </button>
                </form>
              ) : null}

              {groupChannelError ? <p className="error-text compact-error">{groupChannelError}</p> : null}
              {!socialAuthReady && joined && authToken ? (
                <small className="guild-empty">Kanal socket auth kuruluyor...</small>
              ) : null}

              {isConnected && activeRoomId ? (
                <div className="voice-connected-bar">
                  <div className="live-dot" /> Sese Baglanildi
                </div>
              ) : null}
              <div className="current-user-bar">
                <div className="user-bar-profile">
                  <div className="avatar-chip" style={{ backgroundColor: selfParticipant?.color || avatarColor }}>{initialsLabel(displayName)}</div>
                  <div className="user-bar-name">
                    <strong>{displayName}</strong>
                    <small>{isConnected ? "Ses Kanalinda" : (presenceStatus || "Online")}</small>
                  </div>
                </div>
                <div className="user-bar-actions">
                  <button type="button" className={`icon-btn ${isMuted ? 'muted' : ''}`} onClick={toggleMute} title="Mikrofon">
                    {isMuted ? "Mut" : "Mic"}
                  </button>
                  <button type="button" className={`icon-btn ${pttEnabled ? 'active' : ''}`} onClick={() => setPttEnabled(!pttEnabled)} title="Bas Konus">
                    PTT
                  </button>
                </div>
              </div>
            </aside>

            
            <section className="workspace-center" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: '0 16px 24px', background: 'var(--bg-2)' }}>
              <div className="conversation-head" style={{ padding: '16px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0, marginBottom: '16px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 'bold' }}>
                  {hasDmConversation
                    ? `@${activeDmTarget?.displayName || activeDmTarget?.username}`
                    : selectedChannel
                      ? `#${selectedChannel.name}`
                      : "Kanal Mesajlaşma"}
                </h3>
                <small className="conversation-topic" style={{ color: 'var(--text-dim)' }}>
                  {conversationTopic || "Burası sohbetin başlangıcı."}
                </small>
              </div>

              {/* Voice Participants Top Row */}
              {isConnected && participants.length > 0 && (
                <div className="voice-participants-row" style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '16px', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '16px' }}>
                  <AnimatePresence>
                    {participants.map((participant) => (
                      <ParticipantCard
                        key={participant.id}
                        participant={participant}
                        isOwner={participant.id === ownerId}
                        level={participant.isSelf ? localLevel : peerLevels[participant.id] || 0}
                        quality={participant.isSelf ? "local" : peerQuality[participant.id] || "unknown"}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {/* Chat Area */}
              <div className="chat-scroll" style={{ flex: 1, overflowY: "auto", display: 'flex', flexDirection: 'column', gap: '16px', paddingRight: '8px' }}>
                {(hasDmConversation ? dmMessages : selectedChannel ? groupMessages : chatMessages).length === 0 ? (
                  <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-dim)' }}>
                    <h3>Mesaj yok.</h3>
                  </div>
                ) : (
                  (hasDmConversation ? dmMessages : selectedChannel ? groupMessages : chatMessages).map((message) => {
                    const fromName = message.fromName || message.fromUser?.displayName || message.fromUser?.username || "Guest";
                    const isMentioned = !hasDmConversation && hasTextMention(message.text, accountUser);
                    return (
                      <article key={message.id} className="chat-message" style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                        <div className="avatar-chip" style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: message.fromColor || '#00c6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', flexShrink: 0, color: '#fff' }}>
                          {initialsLabel(fromName)}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <header style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                            <strong style={{ color: message.fromColor || "var(--text-1)", fontSize: '15px' }}>{fromName}</strong>
                            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{formatChatTime(message.createdAt || message.at)}</span>
                          </header>
                          <p className={isMentioned ? "mention-text" : ""} style={{ margin: 0, marginTop: '4px', fontSize: '14px', lineHeight: '1.4' }}>{message.text}</p>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>

              {/* Typing indicator */}
              {!hasDmConversation && groupTypingLabel ? <p className="typing-hint" style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '8px' }}>{groupTypingLabel}</p> : null}

              {/* Input Area */}
              <div style={{ marginTop: '16px', background: 'var(--bg-1)', borderRadius: '8px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                <form 
                  style={{ flex: 1, display: 'flex' }} 
                  onSubmit={hasDmConversation ? handleSendDmSubmit : (selectedChannel ? handleSendGroupMessage : handleSendChat)}
                >
                  <input
                    type="text"
                    placeholder={hasDmConversation ? "DM yaz..." : "Mesaj gönder..."}
                    value={hasDmConversation ? dmInput : (selectedChannel ? groupComposerInput : chatInput)}
                    onChange={(event) => hasDmConversation ? setDmInput(event.target.value) : (selectedChannel ? setGroupComposerInput(event.target.value) : setChatInput(event.target.value))}
                    maxLength={1800}
                    style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-1)', fontSize: '15px', outline: 'none' }}
                  />
                  <button type="submit" style={{ display: 'none' }}>Gönder</button>
                </form>
              </div>
            </section>

            <aside className="panel utility-sidebar" style={{ display: 'flex', flexDirection: 'column' }}>
              <section className="utility-members-block" style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                <h3 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '12px', fontWeight: 600 }}>
                  Çevrimiçi — {participants.length}
                </h3>

                <div className="member-list" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {participants.map((participant) => (
                    <article key={`member-${participant.id}`} className="member-row" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px', borderRadius: '4px', cursor: 'pointer' }}>
                      <span className="member-avatar" style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: participant.color || "#00c6ff", display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold', flexShrink: 0 }}>
                        {initialsLabel(participant.name)}
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <strong style={{ fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: participant.color || 'var(--text-1)' }}>
                          {participant.name || "Guest"}
                        </strong>
                        <small style={{ fontSize: '11px', color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {participant.muted ? "Susturuldu" : "Yayında"}
                          {participant.id === ownerId ? " 👑" : ""}
                        </small>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </aside>
          </section>

          {error ? <p className="error-text room-error">{error}</p> : null}
        </main>
      )}

      {tourStepIndex >= 0 && !joined ? (
        <motion.div className="tour-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <motion.section
            className="tour-card"
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.25 }}
          >
            <p>
              Beta Quick Tour {tourStepIndex + 1}/{TOUR_STEPS.length}
            </p>
            <h3>{TOUR_STEPS[tourStepIndex].title}</h3>
            <span>{TOUR_STEPS[tourStepIndex].text}</span>

            <div>
              <button type="button" className="soft-btn" onClick={closeTour}>
                Gec
              </button>
              <button type="button" className="primary-btn" onClick={goToNextTourStep}>
                {tourStepIndex >= TOUR_STEPS.length - 1 ? "Tamam" : "Ileri"}
              </button>
            </div>
          </motion.section>
        </motion.div>
      ) : null}
    </div>
  );
}
