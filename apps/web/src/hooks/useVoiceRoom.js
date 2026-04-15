import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL || "http://localhost:3001";
const REACTION_TTL = 3000;
const NOTICE_TTL = 3500;
const CHAT_HISTORY_LIMIT = 180;
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

function classifyConnection(rttMs) {
  if (typeof rttMs !== "number") {
    return "unknown";
  }

  if (rttMs < 80) {
    return "excellent";
  }

  if (rttMs < 180) {
    return "good";
  }

  return "weak";
}

export function useVoiceRoom() {
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const peersRef = useRef(new Map());
  const remoteAudioRef = useRef(new Map());
  const activeRoomRef = useRef("");
  const selfIdRef = useRef("");
  const selfProfileRef = useRef({ name: "", color: "#00c6ff" });
  const localAudioContextRef = useRef(null);
  const localAnalyserRef = useRef(null);
  const localLevelTimerRef = useRef(null);
  const localSourceRef = useRef(null);
  const statsTimerRef = useRef(null);
  const reactionTimersRef = useRef([]);
  const noticeTimerRef = useRef(null);

  const [activeRoomId, setActiveRoomId] = useState("");
  const [selfId, setSelfId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [participants, setParticipants] = useState([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [pttEnabled, setPttEnabled] = useState(false);
  const [localLevel, setLocalLevel] = useState(0);
  const [peerLevels, setPeerLevels] = useState({});
  const [peerQuality, setPeerQuality] = useState({});
  const [audioInputDevices, setAudioInputDevices] = useState([]);
  const [selectedInputDeviceId, setSelectedInputDeviceId] = useState("");
  const [reactions, setReactions] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [systemNotice, setSystemNotice] = useState("");
  const [error, setError] = useState("");

  const createAudioConstraints = useCallback((deviceId = "") => {
    const constraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };

    if (deviceId) {
      constraints.deviceId = { exact: deviceId };
    }

    return constraints;
  }, []);

  const stopNoticeTimer = useCallback(() => {
    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
  }, []);

  const pushSystemNotice = useCallback(
    (message) => {
      if (!message) {
        return;
      }

      setSystemNotice(message);
      stopNoticeTimer();
      noticeTimerRef.current = window.setTimeout(() => {
        setSystemNotice("");
        noticeTimerRef.current = null;
      }, NOTICE_TTL);
    },
    [stopNoticeTimer],
  );

  const refreshAudioInputDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return [];
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const nextInputs = devices
        .filter((device) => device.kind === "audioinput")
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Mikrofon ${index + 1}`,
        }));

      setAudioInputDevices(nextInputs);

      setSelectedInputDeviceId((prev) => {
        if (!prev) {
          return "";
        }

        return nextInputs.some((device) => device.deviceId === prev) ? prev : "";
      });

      return nextInputs;
    } catch {
      return [];
    }
  }, []);

  const stopReactionTimers = useCallback(() => {
    reactionTimersRef.current.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    reactionTimersRef.current = [];
  }, []);

  const stopLocalLevelMonitor = useCallback(() => {
    if (localLevelTimerRef.current) {
      window.clearInterval(localLevelTimerRef.current);
      localLevelTimerRef.current = null;
    }

    if (localSourceRef.current) {
      localSourceRef.current.disconnect();
      localSourceRef.current = null;
    }

    if (localAudioContextRef.current) {
      localAudioContextRef.current.close().catch(() => {});
      localAudioContextRef.current = null;
    }

    localAnalyserRef.current = null;
    setLocalLevel(0);
  }, []);

  const startLocalLevelMonitor = useCallback(
    (stream) => {
      stopLocalLevelMonitor();

      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) {
        return;
      }

      try {
        const audioContext = new AudioContextCtor();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.fftSize);

        localAudioContextRef.current = audioContext;
        localAnalyserRef.current = analyser;
        localSourceRef.current = source;

        localLevelTimerRef.current = window.setInterval(() => {
          if (!localAnalyserRef.current) {
            return;
          }

          localAnalyserRef.current.getByteTimeDomainData(dataArray);

          let sumSquares = 0;
          for (let i = 0; i < dataArray.length; i += 1) {
            const centered = (dataArray[i] - 128) / 128;
            sumSquares += centered * centered;
          }

          const rms = Math.sqrt(sumSquares / dataArray.length);
          const normalizedLevel = Math.min(1, rms * 3.5);
          setLocalLevel(normalizedLevel);
        }, 120);
      } catch {
        setLocalLevel(0);
      }
    },
    [stopLocalLevelMonitor],
  );

  const stopStatsLoop = useCallback(() => {
    if (statsTimerRef.current) {
      window.clearInterval(statsTimerRef.current);
      statsTimerRef.current = null;
    }
  }, []);

  const startStatsLoop = useCallback(() => {
    stopStatsLoop();

    statsTimerRef.current = window.setInterval(async () => {
      const qualityDelta = {};
      const levelDelta = {};

      for (const [peerId, peerConnection] of peersRef.current.entries()) {
        try {
          const stats = await peerConnection.getStats();
          let rttMs;
          let level = 0;

          stats.forEach((report) => {
            const isAudioTrack =
              report.kind === "audio" || report.mediaType === "audio" || report.type === "media-source";

            if (
              report.type === "candidate-pair" &&
              report.state === "succeeded" &&
              report.nominated &&
              typeof report.currentRoundTripTime === "number"
            ) {
              rttMs = report.currentRoundTripTime * 1000;
            }

            if (
              (report.type === "inbound-rtp" || report.type === "track") &&
              isAudioTrack &&
              typeof report.audioLevel === "number"
            ) {
              level = Math.max(level, report.audioLevel);
            }
          });

          qualityDelta[peerId] = classifyConnection(rttMs);
          levelDelta[peerId] = level;
        } catch {
          qualityDelta[peerId] = "unknown";
          levelDelta[peerId] = 0;
        }
      }

      setPeerQuality((prev) => ({ ...prev, ...qualityDelta }));
      setPeerLevels((prev) => ({ ...prev, ...levelDelta }));
    }, 1400);
  }, [stopStatsLoop]);

  const resetState = useCallback(() => {
    activeRoomRef.current = "";
    selfIdRef.current = "";

    setActiveRoomId("");
    setSelfId("");
    setOwnerId("");
    setParticipants([]);
    setPeerLevels({});
    setPeerQuality({});
    setReactions([]);
    setChatMessages([]);
    setSystemNotice("");
    setIsConnected(false);
    setIsMuted(false);
    setError("");
  }, []);

  const cleanupConnectionObjects = useCallback(() => {
    stopStatsLoop();

    peersRef.current.forEach((peerConnection) => {
      peerConnection.ontrack = null;
      peerConnection.onicecandidate = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.close();
    });
    peersRef.current.clear();

    remoteAudioRef.current.forEach((audioElement) => {
      audioElement.pause();
      audioElement.srcObject = null;
    });
    remoteAudioRef.current.clear();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    stopLocalLevelMonitor();

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    stopReactionTimers();
    stopNoticeTimer();
  }, [stopLocalLevelMonitor, stopNoticeTimer, stopReactionTimers, stopStatsLoop]);

  const setMuteState = useCallback((nextMuted, emit = true) => {
    const stream = localStreamRef.current;
    if (stream) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }

    setIsMuted(nextMuted);

    if (emit && socketRef.current && activeRoomRef.current) {
      socketRef.current.emit("mute_state", { muted: nextMuted });
    }
  }, []);

  const removePeer = useCallback((peerId, removeParticipant) => {
    const peerConnection = peersRef.current.get(peerId);
    if (peerConnection) {
      peerConnection.close();
      peersRef.current.delete(peerId);
    }

    const audioElement = remoteAudioRef.current.get(peerId);
    if (audioElement) {
      audioElement.pause();
      audioElement.srcObject = null;
      remoteAudioRef.current.delete(peerId);
    }

    setPeerLevels((prev) => {
      const next = { ...prev };
      delete next[peerId];
      return next;
    });

    setPeerQuality((prev) => {
      const next = { ...prev };
      delete next[peerId];
      return next;
    });

    if (removeParticipant) {
      setParticipants((prev) => prev.filter((participant) => participant.id !== peerId));
    }
  }, []);

  const createPeerConnection = useCallback(
    (peerId, shouldCreateOffer) => {
      const existingPeer = peersRef.current.get(peerId);
      if (existingPeer) {
        return existingPeer;
      }

      const peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => {
          peerConnection.addTrack(track, stream);
        });
      }

      peerConnection.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (!remoteStream) {
          return;
        }

        let audioElement = remoteAudioRef.current.get(peerId);
        if (!audioElement) {
          audioElement = new Audio();
          audioElement.autoplay = true;
          audioElement.playsInline = true;
          remoteAudioRef.current.set(peerId, audioElement);
        }

        if (audioElement.srcObject !== remoteStream) {
          audioElement.srcObject = remoteStream;
        }

        audioElement.play().catch(() => {});
      };

      peerConnection.onicecandidate = (event) => {
        if (!event.candidate) {
          return;
        }

        socketRef.current?.emit("webrtc_ice_candidate", {
          to: peerId,
          candidate: event.candidate,
        });
      };

      peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === "failed") {
          removePeer(peerId, false);
        }
      };

      peersRef.current.set(peerId, peerConnection);

      if (shouldCreateOffer) {
        (async () => {
          try {
            const offer = await peerConnection.createOffer({ offerToReceiveAudio: true });
            await peerConnection.setLocalDescription(offer);

            socketRef.current?.emit("webrtc_offer", {
              to: peerId,
              sdp: offer,
            });
          } catch {
            removePeer(peerId, false);
          }
        })();
      }

      return peerConnection;
    },
    [removePeer],
  );

  const leaveRoom = useCallback(() => {
    if (socketRef.current && activeRoomRef.current) {
      socketRef.current.emit("leave_room");
    }

    cleanupConnectionObjects();
    resetState();
    setPttEnabled(false);
  }, [cleanupConnectionObjects, resetState]);

  const resetWithError = useCallback(
    (message) => {
      cleanupConnectionObjects();
      resetState();
      setPttEnabled(false);
      if (message) {
        setError(message);
      }
    },
    [cleanupConnectionObjects, resetState],
  );

  const changeInputDevice = useCallback(
    async (deviceId) => {
      const normalizedDeviceId = typeof deviceId === "string" ? deviceId : "";
      setSelectedInputDeviceId(normalizedDeviceId);

      if (!isConnected || !localStreamRef.current) {
        return { ok: true, mode: "saved" };
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: createAudioConstraints(normalizedDeviceId),
        });

        const [newTrack] = stream.getAudioTracks();
        if (!newTrack) {
          stream.getTracks().forEach((track) => track.stop());
          return { ok: false, reason: "no-track" };
        }

        const oldStream = localStreamRef.current;
        const oldTrack = oldStream.getAudioTracks()[0];

        for (const peerConnection of peersRef.current.values()) {
          const sender = peerConnection.getSenders().find((item) => item.track && item.track.kind === "audio");

          if (sender) {
            sender.replaceTrack(newTrack).catch(() => {});
          }
        }

        localStreamRef.current = stream;
        startLocalLevelMonitor(stream);
        newTrack.enabled = !isMuted;

        if (oldTrack) {
          oldTrack.stop();
        }

        oldStream.getTracks().forEach((track) => {
          if (track !== oldTrack) {
            track.stop();
          }
        });

        return { ok: true, mode: "replaced" };
      } catch {
        setError("Secilen mikrofon kullanilamadi. Baska bir cihaz secip tekrar dene.");
        return { ok: false, reason: "failed" };
      }
    },
    [createAudioConstraints, isConnected, isMuted, startLocalLevelMonitor],
  );

  const joinRoom = useCallback(
    async ({ roomId, name, color }) => {
      const normalizedRoom = typeof roomId === "string" ? roomId.trim().toLowerCase().slice(0, 24) : "";
      const normalizedName = typeof name === "string" ? name.trim().slice(0, 20) : "";

      if (!normalizedRoom) {
        setError("Oda adi bos olamaz.");
        return false;
      }

      if (socketRef.current || activeRoomRef.current) {
        leaveRoom();
      }

      setError("");
      setReactions([]);
      setChatMessages([]);
      setSystemNotice("");
      setOwnerId("");

      selfProfileRef.current = {
        name: normalizedName,
        color: color || "#00c6ff",
      };

      try {
        let stream;

        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: createAudioConstraints(selectedInputDeviceId),
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: createAudioConstraints(""),
          });
          setSelectedInputDeviceId("");
        }

        localStreamRef.current = stream;
        startLocalLevelMonitor(stream);
        await refreshAudioInputDevices();
        setMuteState(false, false);
      } catch {
        setError("Mikrofon izni gerekiyor. Tarayicidan izin verip tekrar dene.");
        return false;
      }

      const socket = io(SIGNALING_URL, {
        transports: ["websocket"],
      });

      socketRef.current = socket;
      startStatsLoop();

      socket.on("connect", () => {
        setIsConnected(true);
      });

      socket.on("disconnect", () => {
        setIsConnected(false);
      });

      socket.on("error_event", (payload = {}) => {
        setError(payload.message || "Beklenmedik bir hata olustu.");
      });

      socket.on("joined_room", ({ selfId: joinedSelfId, roomId: joinedRoomId, ownerId: joinedOwnerId, users = [] } = {}) => {
        selfIdRef.current = joinedSelfId;
        activeRoomRef.current = joinedRoomId;

        setSelfId(joinedSelfId);
        setActiveRoomId(joinedRoomId);
        setOwnerId(joinedOwnerId || joinedSelfId);

        const selfUser = {
          id: joinedSelfId,
          name: selfProfileRef.current.name || `Guest-${joinedSelfId.slice(0, 4)}`,
          color: selfProfileRef.current.color,
          muted: false,
          role: joinedOwnerId === joinedSelfId ? "owner" : "member",
          isSelf: true,
          joinedAt: Date.now(),
        };

        const remoteUsers = users
          .filter((user) => user.id !== joinedSelfId)
          .map((user) => ({
            ...user,
            isSelf: false,
          }));

        setParticipants([selfUser, ...remoteUsers]);
        pushSystemNotice(`Odaya baglandin: #${joinedRoomId}`);

        remoteUsers.forEach((user) => {
          createPeerConnection(user.id, true);
        });
      });

      socket.on("room_meta", ({ ownerId: nextOwnerId } = {}) => {
        if (typeof nextOwnerId === "string" && nextOwnerId) {
          setOwnerId(nextOwnerId);
        }
      });

      socket.on("room_owner_changed", ({ ownerId: nextOwnerId } = {}) => {
        if (!nextOwnerId) {
          return;
        }

        setOwnerId(nextOwnerId);
        setParticipants((prev) =>
          prev.map((participant) => ({
            ...participant,
            role: participant.id === nextOwnerId ? "owner" : "member",
          })),
        );

        if (nextOwnerId === selfIdRef.current) {
          pushSystemNotice("Artik oda sahibisin.");
        }
      });

      socket.on("room_users", ({ users = [] } = {}) => {
        const normalizedUsers = users.map((user) => ({
          ...user,
          isSelf: user.id === selfIdRef.current,
        }));

        normalizedUsers.sort((a, b) => {
          if (a.isSelf && !b.isSelf) {
            return -1;
          }

          if (!a.isSelf && b.isSelf) {
            return 1;
          }

          if (a.role === "owner" && b.role !== "owner") {
            return -1;
          }

          if (a.role !== "owner" && b.role === "owner") {
            return 1;
          }

          return (a.joinedAt || 0) - (b.joinedAt || 0);
        });

        setParticipants(normalizedUsers);

        const currentOwner = users.find((user) => user.role === "owner");
        if (currentOwner?.id) {
          setOwnerId(currentOwner.id);
        }
      });

      socket.on("peer_joined", (user = {}) => {
        setParticipants((prev) => {
          if (prev.some((participant) => participant.id === user.id)) {
            return prev;
          }

          return [
            ...prev,
            {
              ...user,
              isSelf: false,
            },
          ];
        });
      });

      socket.on("peer_left", ({ id } = {}) => {
        if (!id) {
          return;
        }

        removePeer(id, true);
      });

      socket.on("peer_muted", ({ id, muted } = {}) => {
        if (!id) {
          return;
        }

        setParticipants((prev) =>
          prev.map((participant) =>
            participant.id === id
              ? {
                  ...participant,
                  muted,
                }
              : participant,
          ),
        );
      });

      socket.on("reaction", (payload = {}) => {
        const reactionId = `${payload.id}-${payload.at}-${Math.random().toString(36).slice(2, 8)}`;
        const reaction = {
          id: reactionId,
          ...payload,
        };

        setReactions((prev) => [...prev, reaction]);

        const timerId = window.setTimeout(() => {
          setReactions((prev) => prev.filter((item) => item.id !== reactionId));
        }, REACTION_TTL);

        reactionTimersRef.current.push(timerId);
      });

      socket.on("chat_message", (payload = {}) => {
        if (!payload.text || !payload.id) {
          return;
        }

        setChatMessages((prev) => [...prev, payload].slice(-CHAT_HISTORY_LIMIT));
      });

      socket.on("moderation_notice", (payload = {}) => {
        if (payload.type === "kicked") {
          resetWithError(payload.message || "Oda sahibi tarafindan odadan cikarildin.");
          return;
        }

        if (payload.message) {
          pushSystemNotice(payload.message);
        }
      });

      socket.on("force_mute", () => {
        setMuteState(true);
        pushSystemNotice("Oda sahibi mikrofonunu kapatti.");
      });

      socket.on("webrtc_offer", async ({ from, sdp } = {}) => {
        if (!from || !sdp) {
          return;
        }

        try {
          const peerConnection = createPeerConnection(from, false);
          await peerConnection.setRemoteDescription(sdp);
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);

          socket.emit("webrtc_answer", {
            to: from,
            sdp: answer,
          });
        } catch {
          removePeer(from, false);
        }
      });

      socket.on("webrtc_answer", async ({ from, sdp } = {}) => {
        if (!from || !sdp) {
          return;
        }

        const peerConnection = peersRef.current.get(from);
        if (!peerConnection) {
          return;
        }

        try {
          await peerConnection.setRemoteDescription(sdp);
        } catch {
          removePeer(from, false);
        }
      });

      socket.on("webrtc_ice_candidate", async ({ from, candidate } = {}) => {
        if (!from || !candidate) {
          return;
        }

        try {
          const peerConnection = peersRef.current.get(from) || createPeerConnection(from, false);
          await peerConnection.addIceCandidate(candidate);
        } catch {
          removePeer(from, false);
        }
      });

      socket.emit("join_room", {
        roomId: normalizedRoom,
        name: normalizedName,
        color,
      });

      return true;
    },
    [
      createAudioConstraints,
      createPeerConnection,
      leaveRoom,
      pushSystemNotice,
      refreshAudioInputDevices,
      removePeer,
      resetWithError,
      selectedInputDeviceId,
      setMuteState,
      startLocalLevelMonitor,
      startStatsLoop,
    ],
  );

  const toggleMute = useCallback(() => {
    if (pttEnabled) {
      return;
    }

    setMuteState(!isMuted);
  }, [isMuted, pttEnabled, setMuteState]);

  const sendReaction = useCallback((emoji) => {
    if (!emoji || !socketRef.current || !activeRoomRef.current) {
      return;
    }

    socketRef.current.emit("reaction", {
      emoji,
    });
  }, []);

  const sendChatMessage = useCallback((text) => {
    const message = typeof text === "string" ? text.trim().slice(0, 400) : "";
    if (!message) {
      return { ok: false, reason: "empty" };
    }

    if (!socketRef.current || !activeRoomRef.current) {
      return { ok: false, reason: "not-connected" };
    }

    socketRef.current.emit("chat_message", { text: message });
    return { ok: true };
  }, []);

  const kickParticipant = useCallback((targetId) => {
    if (!targetId || !socketRef.current || !activeRoomRef.current) {
      return { ok: false, reason: "not-connected" };
    }

    socketRef.current.emit("kick_user", { targetId });
    return { ok: true };
  }, []);

  const muteAllParticipants = useCallback(() => {
    if (!socketRef.current || !activeRoomRef.current) {
      return { ok: false, reason: "not-connected" };
    }

    socketRef.current.emit("mute_all");
    return { ok: true };
  }, []);

  useEffect(() => {
    if (!isConnected || !pttEnabled) {
      return undefined;
    }

    setMuteState(true);

    const handleKeyDown = (event) => {
      if (event.code !== "Space" || event.repeat) {
        return;
      }

      event.preventDefault();
      setMuteState(false);
    };

    const handleKeyUp = (event) => {
      if (event.code !== "Space") {
        return;
      }

      event.preventDefault();
      setMuteState(true);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      setMuteState(true);
    };
  }, [isConnected, pttEnabled, setMuteState]);

  useEffect(() => {
    if (isConnected && !pttEnabled) {
      setMuteState(false);
    }
  }, [isConnected, pttEnabled, setMuteState]);

  useEffect(() => {
    refreshAudioInputDevices();

    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) {
      return undefined;
    }

    const handleDeviceChange = () => {
      refreshAudioInputDevices();
    };

    mediaDevices.addEventListener("devicechange", handleDeviceChange);

    return () => {
      mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    };
  }, [refreshAudioInputDevices]);

  useEffect(
    () => () => {
      cleanupConnectionObjects();
      resetState();
    },
    [cleanupConnectionObjects, resetState],
  );

  return {
    activeRoomId,
    selfId,
    ownerId,
    participants,
    isConnected,
    isMuted,
    pttEnabled,
    setPttEnabled,
    audioInputDevices,
    selectedInputDeviceId,
    changeInputDevice,
    localLevel,
    peerLevels,
    peerQuality,
    reactions,
    chatMessages,
    systemNotice,
    error,
    joinRoom,
    leaveRoom,
    toggleMute,
    sendReaction,
    sendChatMessage,
    kickParticipant,
    muteAllParticipants,
  };
}
