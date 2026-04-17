import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import AnimatedBackground from "./components/AnimatedBackground";
import DesktopUpdateModal from "./components/DesktopUpdateModal";
import ParticipantCard from "./components/ParticipantCard";
import ReactionBurst from "./components/ReactionBurst";
import { useAccountHub } from "./hooks/useAccountHub";
import { useDesktopUpdater } from "./hooks/useDesktopUpdater";
import { useVoiceRoom } from "./hooks/useVoiceRoom";
import { saveRuntimeConnectionConfig } from "./utils/runtimeConnection";

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
              setConnectionApiInput(nextState.publicUrl);
              setConnectionSignalingInput(nextState.publicUrl);
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
          setConnectionApiInput(nextState.publicUrl);
          setConnectionSignalingInput(nextState.publicUrl);
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
    const preferredTargetUrl =
      connectionApiInput.trim() ||
      connectionSignalingInput.trim() ||
      appInfo?.suggestedLocalhostUrl ||
      "";
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
        setConnectionApiInput(result.state.publicUrl);
        setConnectionSignalingInput(result.state.publicUrl);
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
          <motion.header
            className="room-topbar"
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          >
            <div>
              <p className="topbar-label">Aktif oda</p>
              <h2>#{activeRoomId}</h2>
              <small>
                {participants.length} kisi bagli • {roomLocked ? "Oda kilitli" : "Oda acik"}
                {isOwner ? " • Oda sahibi sensin" : ""}
              </small>
            </div>

            <div className="topbar-actions">
              {isDesktop ? (
                <button type="button" className="soft-btn" onClick={handleManualUpdateCheck}>
                  {updateStatusLabel(updateState.status)}
                </button>
              ) : null}

              {accountUser ? (
                <select className="presence-select" value={presenceStatus || "online"} onChange={handlePresenceChange}>
                  {PRESENCE_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              ) : null}

              <select className="theme-select" value={theme} onChange={(event) => setTheme(event.target.value)}>
                {THEMES.map((themeItem) => (
                  <option key={themeItem.id} value={themeItem.id}>
                    {themeItem.label}
                  </option>
                ))}
              </select>

              <button type="button" className="soft-btn" onClick={handleCopyInvite}>
                {copied ? "Kopyalandi" : "Davet linki"}
              </button>
              <button
                type="button"
                className="danger-btn"
                onClick={() => {
                  leaveGroupChannel();
                  leaveRoom();
                  clearLastSession();
                  setCopied(false);
                }}
              >
                Odadan Cik
              </button>
            </div>
          </motion.header>

          {systemNotice ? <div className="system-notice">{systemNotice}</div> : null}

          <section className="discord-workspace">
            <aside className="panel guild-rail">
              <header className="guild-rail-head">
                <strong>Server Rail</strong>
                <span>{groups.length} grup</span>
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
                <h3>{selectedGroup?.name || "Server Sec"}</h3>
                <small>{selectedGroup ? `${selectedGroup.memberCount} uye` : "Grup secmedin"}</small>
              </header>

              <div className="conversation-switch">
                <button
                  type="button"
                  className={`soft-btn tiny-btn ${conversationMode === "channel" ? "active-mode" : ""}`}
                  onClick={() => {
                    setConversationMode("channel");
                  }}
                >
                  Kanal
                </button>
                <button
                  type="button"
                  className={`soft-btn tiny-btn ${conversationMode === "dm" ? "active-mode" : ""}`}
                  onClick={() => {
                    setConversationMode("dm");
                  }}
                >
                  DM
                </button>
              </div>

              <input
                type="text"
                placeholder="Kanal ara"
                value={channelSearchInput}
                onChange={(event) => setChannelSearchInput(event.target.value)}
              />

              <section className="sidebar-block">
                <div className="sidebar-block-head">
                  <h4>Pinned DM</h4>
                  <small>{pinnedFriends.length}</small>
                </div>

                <div className="dm-roster">
                  {!accountUser ? <p className="guild-empty">DM listesi icin hesap girisi yap.</p> : null}
                  {accountUser && pinnedFriends.length === 0 ? (
                    <p className="guild-empty">Pinlenecek DM henuz yok.</p>
                  ) : null}
                  {pinnedFriends.map((friend) => (
                    <button
                      key={`pinned-${friend.id}`}
                      type="button"
                      className={`dm-node ${activeDmTarget?.id === friend.id ? "active" : ""}`}
                      onClick={() => {
                        handleSelectDmFriend(friend);
                      }}
                    >
                      <span className={`presence-dot ${friend.presenceStatus || "offline"}`} />
                      <span>{friend.displayName || friend.username}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="sidebar-block">
                <div className="sidebar-block-head">
                  <h4>Direkt Mesajlar</h4>
                  <small>{friends.length}{totalDmUnread ? ` • ${totalDmUnread} yeni` : ""}</small>
                </div>

                <div className="dm-roster">
                  {friends.length === 0 ? <p className="guild-empty">Arkadas bulunamadi.</p> : null}
                  {friends.map((friend) => {
                    const unreadCount = Number(dmUnreadMap[friend.id] || 0);

                    return (
                      <button
                        key={`dm-${friend.id}`}
                        type="button"
                        className={`dm-node ${activeDmTarget?.id === friend.id ? "active" : ""}`}
                        onClick={() => {
                          handleSelectDmFriend(friend);
                        }}
                      >
                        <span className={`presence-dot ${friend.presenceStatus || "offline"}`} />
                        <span className="dm-node-name">{friend.displayName || friend.username}</span>
                        {unreadCount > 0 ? (
                          <span className="unread-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="sidebar-block">
                <div className="sidebar-block-head">
                  <h4>Text Kanallar</h4>
                  <small>{filteredChannels.length}</small>
                </div>

                <div className="channel-list">
                  {filteredChannels.length === 0 ? <p className="guild-empty">Kanal bulunamadi.</p> : null}
                  {filteredChannels.map((channel) => {
                    const unreadCount = Number(channelUnreadMap[channel.id] || 0);

                    return (
                      <button
                        key={channel.id}
                        type="button"
                        className={`channel-node ${selectedChannel?.id === channel.id ? "active" : ""}`}
                        onClick={() => {
                          setConversationMode("channel");
                          setSelectedChannelId(channel.id);
                          clearChannelUnread(channel.id);
                        }}
                      >
                        <div className="channel-node-main">
                          <span># {channel.name}</span>
                          {unreadCount > 0 ? (
                            <span className="unread-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
                          ) : null}
                        </div>
                        <small>{channel.type || "text"}</small>
                      </button>
                    );
                  })}
                </div>
              </section>

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
            </aside>

            <section className="workspace-center">
              <motion.section
                className="panel conversation-stage"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
              >
                <div className="panel-head conversation-head">
                  <div>
                    <h3>
                      {hasDmConversation
                        ? `@${activeDmTarget.displayName || activeDmTarget.username}`
                        : selectedChannel
                          ? `#${selectedChannel.name}`
                          : "Kanal Mesajlasma"}
                    </h3>
                    <p>
                      {hasDmConversation
                        ? "Direkt mesaj akisi, voice odasindan cikmadan surdurulur."
                        : "Server text channel realtime + typing + slash baseline aktif."}
                    </p>
                    <small className="conversation-topic">{conversationTopic}</small>
                  </div>

                  <div className="conversation-mini-badges">
                    {!hasDmConversation && groupChannelContext.channelName ? (
                      <span className="mini-chip">Active #{groupChannelContext.channelName}</span>
                    ) : null}
                    <span className="mini-chip">{socialAuthReady ? "Socket Hazir" : "Socket Bekliyor"}</span>
                    {conversationMode !== "channel" && selectedChannelIdSafe && channelUnreadMap[selectedChannelIdSafe] ? (
                      <span className="mini-chip alert-chip">
                        {channelUnreadMap[selectedChannelIdSafe]} unread
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="chat-scroll conversation-scroll">
                  {hasDmConversation ? (
                    dmMessages.length === 0 ? (
                      <p className="chat-empty">Bu DM henuz bos.</p>
                    ) : (
                      dmMessages.map((message) => {
                        const isSelfMessage = message.fromUserId === accountUser?.id;
                        const isMentioned = hasTextMention(message.text, accountUser) && !isSelfMessage;

                        return (
                          <article
                            key={message.id}
                            className={`chat-message dm-conversation-message ${isSelfMessage ? "is-self" : ""}`}
                          >
                            <header>
                              <strong>
                                {message.fromUser?.displayName || message.fromUser?.username || "Guest"}
                              </strong>
                              <span>{formatChatTime(message.createdAt)}</span>
                            </header>
                            <p className={isMentioned ? "mention-text" : ""}>{message.text}</p>
                          </article>
                        );
                      })
                    )
                  ) : groupChannelMessages.length === 0 ? (
                    <p className="chat-empty">Bu kanalda henuz mesaj yok.</p>
                  ) : (
                    groupChannelMessages.map((message) => {
                      const isMentioned =
                        hasTextMention(message.text, accountUser) && message.fromUserId !== accountUser?.id;

                      return (
                        <article key={message.id} className="chat-message">
                          <header>
                            <strong style={{ color: "#9ce8ff" }}>
                              {message.fromUser?.displayName || message.fromUser?.username || "Guest"}
                            </strong>
                            <span>{formatChatTime(message.createdAt)}</span>
                          </header>
                          <p className={isMentioned ? "mention-text" : ""}>{message.text}</p>
                        </article>
                      );
                    })
                  )}
                </div>

                {!hasDmConversation && groupTypingLabel ? <p className="typing-hint">{groupTypingLabel}</p> : null}

                {hasDmConversation ? (
                  <form className="chat-form" onSubmit={handleSendDmSubmit}>
                    <input
                      type="text"
                      placeholder="DM yaz..."
                      value={dmInput}
                      onChange={(event) => setDmInput(event.target.value)}
                      maxLength={1200}
                    />
                    <button type="submit" className="primary-btn" disabled={!activeDmTarget}>
                      Gonder
                    </button>
                  </form>
                ) : (
                  <form className="chat-form" onSubmit={handleSendGroupMessage}>
                    <input
                      type="text"
                      placeholder="Kanal mesaji yaz... (/me komutu desteklenir)"
                      value={groupComposerInput}
                      onChange={(event) => setGroupComposerInput(event.target.value)}
                      maxLength={1800}
                    />
                    <button type="submit" className="primary-btn" disabled={!selectedChannel}>
                      Gonder
                    </button>
                  </form>
                )}
              </motion.section>

              <section className="room-grid">
                <motion.div
                  className="panel participants-panel"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.55 }}
                >
                  <div className="panel-head">
                    <h3>Katilimcilar</h3>
                    <p>Konusan kisiler kartlarda canli titresimle one cikar.</p>
                  </div>

                  <div className="participants-grid">
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
                </motion.div>

                <div className="side-stack">
                  <motion.aside
                    className="panel control-panel"
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                  >
                    <div className="panel-head">
                      <h3>Ses Kontrolu</h3>
                      <p>Push-to-talk aktifken Space basiliyken konusursun.</p>
                    </div>

                    <div className="meter-wrap" role="presentation">
                      {Array.from({ length: 28 }).map((_, index) => {
                        const energy = Math.max(localLevel * 8 - index * 0.35, 0);

                        return (
                          <span
                            key={`bar-${index}`}
                            className="meter-bar"
                            style={{
                              transform: `scaleY(${Math.min(1, energy + 0.08)})`,
                              opacity: Math.min(1, energy + 0.25),
                            }}
                          />
                        );
                      })}
                    </div>

                    <div className="control-actions">
                      <button
                        type="button"
                        className={`primary-btn ${isMuted ? "is-muted" : ""}`}
                        onClick={toggleMute}
                        disabled={pttEnabled}
                      >
                        {isMuted ? "Mikrofonu Ac" : "Mikrofonu Kapat"}
                      </button>

                      <label className="toggle-field">
                        <input
                          type="checkbox"
                          checked={pttEnabled}
                          onChange={(event) => setPttEnabled(event.target.checked)}
                        />
                        <span>Push-to-talk (Space)</span>
                      </label>

                      <label className="device-field">
                        <span>Mikrofon cihazi</span>
                        <select
                          value={selectedInputDeviceId}
                          onChange={(event) => {
                            changeInputDevice(event.target.value);
                          }}
                        >
                          <option value="">Sistem varsayilan</option>
                          {audioInputDevices.map((device) => (
                            <option key={device.deviceId} value={device.deviceId}>
                              {device.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="reaction-row">
                      {QUICK_REACTIONS.map((emoji) => (
                        <button key={emoji} type="button" className="reaction-btn" onClick={() => sendReaction(emoji)}>
                          {emoji}
                        </button>
                      ))}
                    </div>

                    {isOwner ? (
                      <div className="moderation-wrap">
                        <h4>Moderasyon</h4>
                        <button
                          type="button"
                          className="soft-btn moderation-btn"
                          onClick={() => {
                            setRoomLock(!roomLocked);
                          }}
                        >
                          {roomLocked ? "Oda Kilidini Ac" : "Odayi Kilitle"}
                        </button>

                        <button
                          type="button"
                          className="soft-btn moderation-btn"
                          onClick={() => {
                            muteAllParticipants();
                          }}
                        >
                          Herkesi Sustur
                        </button>

                        <div className="kick-list">
                          {remoteParticipants.length === 0 ? <small>Odada baska katilimci yok.</small> : null}
                          {remoteParticipants.map((participant) => (
                            <button
                              key={`kick-${participant.id}`}
                              type="button"
                              className="kick-btn"
                              onClick={() => {
                                kickParticipant(participant.id);
                              }}
                            >
                              {participant.name} kullanicisini cikar
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </motion.aside>

                  <motion.section
                    className="panel chat-panel"
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.65 }}
                  >
                    <div className="panel-head">
                      <h3>Oda Sohbeti</h3>
                      <p>Ses kanalindan ayrilmadan hizli mesajlas.</p>
                    </div>

                    <div className="chat-scroll">
                      {chatMessages.length === 0 ? (
                        <p className="chat-empty">Sohbet henuz bos. Ilk mesaji gonder!</p>
                      ) : (
                        chatMessages.map((message) => {
                          const isMentioned =
                            hasTextMention(message.text, accountUser) && message.fromName !== selfParticipantName;

                          return (
                            <article key={message.id} className="chat-message">
                              <header>
                                <strong style={{ color: message.fromColor || "#7de6ff" }}>
                                  {message.fromName || "Guest"}
                                </strong>
                                <span>{formatChatTime(message.at)}</span>
                              </header>
                              <p className={isMentioned ? "mention-text" : ""}>{message.text}</p>
                            </article>
                          );
                        })
                      )}
                    </div>

                    <form className="chat-form" onSubmit={handleSendChat}>
                      <input
                        type="text"
                        placeholder="Mesajini yaz..."
                        value={chatInput}
                        onChange={(event) => setChatInput(event.target.value)}
                        maxLength={400}
                      />
                      <button type="submit" className="primary-btn">
                        Gonder
                      </button>
                    </form>
                  </motion.section>
                </div>
              </section>
            </section>

            <aside className="panel utility-sidebar">
              <section className="utility-feed-block">
                <div className="panel-head utility-head feed-head">
                  <div>
                    <h3>Bildirimler</h3>
                    <p>Mention, friend request ve sistem olaylari.</p>
                  </div>
                  <button
                    type="button"
                    className="soft-btn tiny-btn"
                    onClick={clearActivityFeed}
                    disabled={activityFeed.length === 0}
                  >
                    Temizle
                  </button>
                </div>

                <div className="activity-feed">
                  {activityFeed.length === 0 ? (
                    <p className="guild-empty">Yeni bildirim yok.</p>
                  ) : (
                    activityFeed.map((entry) => (
                      <article
                        key={entry.id}
                        className={`activity-item ${entry.type === "mention" ? "is-mention" : ""}`}
                      >
                        <header>
                          <strong>{entry.title}</strong>
                          <span>{formatChatTime(entry.at)}</span>
                        </header>
                        {entry.detail ? <small>{entry.detail}</small> : null}
                        <p>{truncateText(entry.text || "Detay yok.", 110)}</p>
                      </article>
                    ))
                  )}
                </div>
              </section>

              <section className="utility-search-block">
                <div className="panel-head utility-head">
                  <h3>Arama</h3>
                  <p>DM, kanal ve voice sohbetinde hizli tarama.</p>
                </div>

                <input
                  type="text"
                  placeholder="Mesaj veya kullanici ara"
                  value={messageSearchInput}
                  onChange={(event) => setMessageSearchInput(event.target.value)}
                />

                <div className="search-results">
                  {!messageSearchInput.trim() ? (
                    <p className="guild-empty">Aramak icin bir kelime yaz.</p>
                  ) : searchResults.length === 0 ? (
                    <p className="guild-empty">Sonuc bulunamadi.</p>
                  ) : (
                    searchResults.map((item) => (
                      <article key={item.id} className="search-result-card">
                        <header>
                          <strong>{item.author}</strong>
                          <span>{conversationScopeLabel(item.scope)}</span>
                        </header>
                        <p>{item.text}</p>
                        <small>{formatChatTime(item.at)}</small>
                      </article>
                    ))
                  )}
                </div>
              </section>

              <section className="utility-members-block">
                <div className="panel-head utility-head">
                  <h3>Uye Listesi</h3>
                  <p>Voice odasindaki canli uye durumlari.</p>
                </div>

                <div className="member-list">
                  {participants.map((participant) => (
                    <article key={`member-${participant.id}`} className="member-row">
                      <span className="member-avatar" style={{ backgroundColor: participant.color || "#00c6ff" }}>
                        {initialsLabel(participant.name)}
                      </span>
                      <div>
                        <strong>{participant.name || "Guest"}</strong>
                        <small>
                          {participant.muted ? "Muted" : "Canli"}
                          {participant.id === ownerId ? " • Owner" : ""}
                          {participant.isSelf ? " • Sen" : ""}
                        </small>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="member-meta-block">
                  <small>
                    Active Channel: {groupChannelContext.channelName ? `#${groupChannelContext.channelName}` : "Secilmedi"}
                  </small>
                  <small>Socket Social: {socialAuthReady ? "Hazir" : "Bekliyor"}</small>
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
