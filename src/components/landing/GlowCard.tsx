import { motion } from "framer-motion";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface GlowCardProps {
  children: ReactNode;
  className?: string;
  glowColor?: string;
}

export default function GlowCard({
  children,
  className = "",
  glowColor = "var(--primary)",
}: GlowCardProps) {
  return (
    <motion.div
      whileHover={{ y: -4, transition: { duration: 0.25 } }}
      className={cn(
        "group relative rounded-xl border border-border/50 bg-card/60 backdrop-blur-xl overflow-hidden transition-shadow duration-300",
        "hover:shadow-[0_0_30px_-5px_hsl(var(--primary)/0.3)] hover:border-primary/50",
        className
      )}
    >
      {/* gradient border overlay */}
      <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          background: `linear-gradient(135deg, hsl(${glowColor} / 0.08), transparent 60%)`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}
