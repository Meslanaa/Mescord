import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import AnimatedBackground from "./components/AnimatedBackground";
import DesktopUpdateModal from "./components/DesktopUpdateModal";
import ParticipantCard from "./components/ParticipantCard";
import ReactionBurst from "./components/ReactionBurst";
import { useDesktopUpdater } from "./hooks/useDesktopUpdater";
import { useVoiceRoom } from "./hooks/useVoiceRoom";

const COLOR_SWATCHES = ["#00c6ff", "#ff7a18", "#8eff6b", "#f94144", "#ffd166", "#00d4a4"];
const QUICK_REACTIONS = ["🔥", "👏", "😂", "🚀", "🎧", "💯"];
const THEMES = [
  { id: "aurora", label: "Aurora" },
  { id: "ember", label: "Ember" },
  { id: "mono", label: "Mono" },
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
  const [chatInput, setChatInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [tourStepIndex, setTourStepIndex] = useState(() => (readStringStorage(STORAGE_KEYS.tourDone, "0") === "1" ? -1 : 0));

  const {
    activeRoomId,
    ownerId,
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
    systemNotice,
    error,
    joinRoom,
    leaveRoom,
    toggleMute,
    sendReaction,
    sendChatMessage,
    kickParticipant,
    muteAllParticipants,
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

  const joined = Boolean(activeRoomId && isConnected);
  const selfParticipant = participants.find((participant) => participant.isSelf);
  const isOwner = Boolean(selfParticipant && ownerId && selfParticipant.id === ownerId);
  const remoteParticipants = participants.filter((participant) => !participant.isSelf);

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

              <button className="primary-btn" type="submit">
                Odaya Gir
              </button>
            </form>

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
                {participants.length} kisi bagli {isOwner ? "• Oda sahibi sensin" : ""}
              </small>
            </div>

            <div className="topbar-actions">
              {isDesktop ? (
                <button type="button" className="soft-btn" onClick={handleManualUpdateCheck}>
                  {updateStatusLabel(updateState.status)}
                </button>
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
                  leaveRoom();
                  setCopied(false);
                }}
              >
                Odadan Cik
              </button>
            </div>
          </motion.header>

          {systemNotice ? <div className="system-notice">{systemNotice}</div> : null}

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
                    chatMessages.map((message) => (
                      <article key={message.id} className="chat-message">
                        <header>
                          <strong style={{ color: message.fromColor || "#7de6ff" }}>{message.fromName || "Guest"}</strong>
                          <span>{formatChatTime(message.at)}</span>
                        </header>
                        <p>{message.text}</p>
                      </article>
                    ))
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
