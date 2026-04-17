import { motion } from "framer-motion";

const QUALITY_LABEL = {
  local: "Yerel",
  excellent: "Mükemmel",
  good: "İyi",
  weak: "Zayıf",
  unknown: "Ölçülüyor",
};

function initials(name) {
  if (!name) {
    return "MS";
  }

  const chunks = name.trim().split(/\s+/).slice(0, 2);
  return chunks.map((chunk) => chunk[0]?.toUpperCase() || "").join("");
}

export default function ParticipantCard({ participant, isOwner = false, level = 0, quality = "unknown" }) {
  const speaking = !participant.muted && level > 0.035;

  return (
    <motion.article
      className={`participant-card ${speaking ? "is-speaking" : ""}`}
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 280, damping: 20 }}
      layout
    >
      <div className="avatar-wrap">
        <motion.div
          className="avatar-ring"
          animate={
            speaking
              ? {
                  scale: [1, 1.18, 1],
                  opacity: [0.28, 0.95, 0.28],
                }
              : {
                  scale: 1,
                  opacity: 0.24,
                }
          }
          transition={{ duration: 1.15, repeat: speaking ? Infinity : 0, ease: "easeOut" }}
        />

        <div className="avatar-core" style={{ "--avatar-color": participant.color }}>
          {initials(participant.name)}
        </div>
      </div>

      <div className="participant-meta">
        <div className="participant-name-row" style={{ minWidth: 0 }}>
          <h3>{participant.name || "Guest"}</h3>
          {participant.isSelf ? <span className="self-chip">Sen</span> : null}
          {isOwner ? <span className="owner-chip">Owner</span> : null}
        </div>

        <div className="participant-state-row">
          <span className={`mute-dot ${participant.muted ? "muted" : "live"}`} />
          <span>{participant.muted ? "Mikrofon kapalı" : "Mikrofon açık"}</span>
        </div>

        <div className="quality-pill">Bağlantı: {QUALITY_LABEL[quality] || QUALITY_LABEL.unknown}</div>
      </div>
    </motion.article>
  );
}
