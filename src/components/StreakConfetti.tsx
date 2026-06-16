import React, { useEffect, useState } from "react";
import { motion } from "motion/react";

interface Particle {
  id: number;
  x: number;
  y: number;
  destX: number;
  destY: number;
  scale: number;
  color: string;
  rotateStart: number;
  rotateEnd: number;
  delay: number;
  duration: number;
}

interface StreakConfettiProps {
  active: boolean;
  onComplete?: () => void;
}

const CONFETTI_COLORS = [
  "#4f46e5", // Indigo
  "#3b82f6", // Blue
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#ef4444", // Red
  "#ec4899", // Pink
  "#8b5cf6", // Purple
  "#06b6d4"  // Cyan
];

export default function StreakConfetti({ active, onComplete }: StreakConfettiProps) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (active) {
      // Generate 80 shiny physics particles
      const newParticles: Particle[] = Array.from({ length: 85 }).map((_, i) => {
        const angle = Math.random() * Math.PI * 2;
        // Explode outward with varied speeds
        const distance = 80 + Math.random() * 280;
        const destX = Math.cos(angle) * distance;
        const destY = Math.sin(angle) * distance + (Math.random() * -120 - 100); // bias heading upwards

        return {
          id: i,
          x: 0,
          y: 0,
          destX,
          destY,
          scale: 0.3 + Math.random() * 0.9,
          color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
          rotateStart: Math.random() * 360,
          rotateEnd: Math.random() * 720 + 360,
          delay: Math.random() * 0.25,
          duration: 1.5 + Math.random() * 1.5
        };
      });

      setParticles(newParticles);

      // Clean up after animation finishes (duration max approx 3 seconds)
      const timer = setTimeout(() => {
        setParticles([]);
        if (onComplete) onComplete();
      }, 4000);

      return () => clearTimeout(timer);
    } else {
      setParticles([]);
    }
  }, [active, onComplete]);

  if (!active || particles.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-55 flex items-center justify-center overflow-hidden">
      <div className="relative">
        {particles.map((p) => (
          <motion.div
            key={p.id}
            initial={{
              x: 0,
              y: 100, // origin offset near center-bottom
              scale: 0,
              rotate: p.rotateStart,
              opacity: 1
            }}
            animate={{
              x: p.destX,
              y: p.destY,
              scale: p.scale,
              rotate: p.rotateEnd,
              opacity: [1, 1, 0.8, 0] // Fade out near the end
            }}
            transition={{
              duration: p.duration,
              ease: [0.1, 0.8, 0.25, 1], // Physics explosion ease out curve
              delay: p.delay
            }}
            className="absolute rounded-xs shadow-3xs"
            style={{
              width: Math.random() > 0.5 ? "12px" : "8px",
              height: Math.random() > 0.5 ? "12px" : "16px",
              backgroundColor: p.color,
            }}
          />
        ))}
      </div>
    </div>
  );
}
