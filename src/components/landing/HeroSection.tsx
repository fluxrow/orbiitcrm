import { useRef } from "react";
import { motion, useMotionValue, useTransform, useSpring } from "framer-motion";
import { ArrowRight, Play } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import StarfieldCanvas from "./StarfieldCanvas";
import HeroDashboardMockup from "./HeroDashboardMockup";

const STATS = [
  { value: "2.400+", label: "Leads qualificados" },
  { value: "24/7", label: "Atendimento IA" },
  { value: "3x", label: "Mais conversão" },
];

export default function HeroSection() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const rotateX = useSpring(useTransform(mouseY, [-300, 300], [3, -3]), { stiffness: 100, damping: 30 });
  const rotateY = useSpring(useTransform(mouseX, [-400, 400], [-3, 3]), { stiffness: 100, damping: 30 });

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isMobile || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    mouseX.set(e.clientX - centerX);
    mouseY.set(e.clientY - centerY);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <section
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative pt-20 pb-28 px-4 overflow-hidden min-h-[90vh] flex items-center"
    >
      <StarfieldCanvas />

      <div className="relative z-10 max-w-7xl mx-auto w-full grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
        {/* Left — Text */}
        <div className="space-y-8 text-center lg:text-left lg:pl-4 max-w-[640px] mx-auto lg:mx-0">
          <motion.div
            className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary backdrop-blur-sm"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            CRM com IA para equipes comerciais
          </motion.div>

          <motion.h1
            className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.15]"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
          >
            <span className="gradient-text">Sua equipe comercial</span>
            <br />
            <span className="text-primary">no piloto automático</span>
          </motion.h1>

          <motion.p
            className="text-xl text-muted-foreground max-w-lg mx-auto lg:mx-0"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35 }}
          >
            IA que atende, qualifica e distribui leads 24h — sem intervenção humana.
          </motion.p>

          {/* Mini stats */}
          <motion.div
            className="flex flex-wrap items-center justify-center lg:justify-start gap-8 pt-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            {STATS.map((s) => (
              <div key={s.label} className="text-center lg:text-left">
                <p className="text-2xl font-bold text-primary">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </motion.div>

          {/* CTA */}
          <motion.div
            className="flex flex-col sm:flex-row items-center gap-3 pt-6 justify-center lg:justify-start"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
          >
            <Button
              size="lg"
              onClick={() => navigate("/trial")}
              className="gap-2 text-base px-8 animate-glow-pulse hover:scale-105 transition-transform group"
            >
              Testar grátis por 7 dias
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate("/demo")}
              className="gap-2 text-base px-8 hover:scale-105 transition-transform border-border/50 backdrop-blur-sm"
            >
              <Play className="w-4 h-4" />
              Ver demonstração
            </Button>
          </motion.div>
        </div>

        {/* Right — Mockup with parallax */}
        <motion.div
          className="relative"
          style={
            isMobile
              ? {}
              : {
                  rotateX,
                  rotateY,
                  transformPerspective: 1200,
                }
          }
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
        >
          <HeroDashboardMockup />
        </motion.div>
      </div>
    </section>
  );
}
