import { motion } from "framer-motion";

const ORBS = [
  {
    id: "orb-1",
    size: 380,
    top: "-8%",
    left: "-8%",
    color: "rgba(0, 229, 255, 0.22)",
    duration: 15,
    x: [0, 45, -20, 0],
    y: [0, -35, 20, 0],
  },
  {
    id: "orb-2",
    size: 420,
    top: "50%",
    left: "68%",
    color: "rgba(255, 122, 24, 0.24)",
    duration: 18,
    x: [0, -40, 30, 0],
    y: [0, 45, -18, 0],
  },
  {
    id: "orb-3",
    size: 260,
    top: "74%",
    left: "12%",
    color: "rgba(142, 255, 107, 0.17)",
    duration: 14,
    x: [0, 28, -18, 0],
    y: [0, -24, 20, 0],
  },
];

export default function AnimatedBackground() {
  return (
    <div className="scene-bg" aria-hidden="true">
      <div className="bg-gradient" />
      <div className="bg-grid" />
      {ORBS.map((orb) => (
        <motion.div
          key={orb.id}
          className="floating-orb"
          style={{
            width: orb.size,
            height: orb.size,
            top: orb.top,
            left: orb.left,
            background: orb.color,
          }}
          animate={{
            x: orb.x,
            y: orb.y,
            scale: [1, 1.08, 0.95, 1],
          }}
          transition={{
            duration: orb.duration,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
