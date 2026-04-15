import { AnimatePresence, motion } from "framer-motion";

function seededOffset(seed) {
  const value = String(seed || "0")
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);

  return 12 + (value % 76);
}

export default function ReactionBurst({ reactions = [] }) {
  return (
    <div className="reaction-overlay" aria-hidden="true">
      <AnimatePresence>
        {reactions.map((reaction) => (
          <motion.div
            key={reaction.id}
            className="reaction-bubble"
            style={{ left: `${seededOffset(reaction.id)}%` }}
            initial={{ opacity: 0, y: 40, scale: 0.72, rotate: -12 }}
            animate={{ opacity: 1, y: -140, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, y: -220, scale: 1.15 }}
            transition={{ duration: 2.4, ease: "easeOut" }}
          >
            <span>{reaction.emoji}</span>
            <small>{reaction.name || "Guest"}</small>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
