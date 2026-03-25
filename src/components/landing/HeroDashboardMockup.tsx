import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import {
  LayoutDashboard, Users, MessageSquare, BarChart3,
  Settings, Bot, ArrowRight,
} from "lucide-react";

/* ── Kanban data ── */
const KANBAN_COLS = [
  { title: "Qualificação", color: "bg-[hsl(var(--stage-qualification))]" },
  { title: "Proposta", color: "bg-[hsl(var(--stage-proposal))]" },
  { title: "Fechamento", color: "bg-[hsl(var(--stage-closing))]" },
];

const KANBAN_CARDS = [
  { name: "Marina Silva", value: "R$ 12.500", col: 0 },
  { name: "Tech Solutions", value: "R$ 8.900", col: 0 },
  { name: "João Mendes", value: "R$ 24.000", col: 1 },
  { name: "Agência Pixel", value: "R$ 5.200", col: 1 },
  { name: "Carlos Edu.", value: "R$ 18.700", col: 2 },
];

/* ── AI messages ── */
const AI_MESSAGES = [
  { from: "lead", text: "Olá, tenho interesse no plano Professional" },
  { from: "ai", text: "Oi! Qual o tamanho da sua equipe comercial?" },
  { from: "lead", text: "Somos 5 vendedores" },
  { from: "ai", text: "Perfeito! Vou encaminhar para o consultor ideal ✨" },
];

/* ── Sidebar icons ── */
const SIDEBAR_ITEMS = [LayoutDashboard, Users, MessageSquare, BarChart3, Settings];

/* ── Counter hook ── */
function useCounter(target: number, duration = 2000) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = Math.ceil(target / (duration / 50));
    const interval = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(interval); }
      else setCount(start);
    }, 50);
    return () => clearInterval(interval);
  }, [target, duration]);
  return count;
}

export default function HeroDashboardMockup() {
  const [msgIndex, setMsgIndex] = useState(0);
  const leadsCount = useCounter(2847);
  const conversionCount = useCounter(68);

  useEffect(() => {
    const timer = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % AI_MESSAGES.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const visibleMessages = AI_MESSAGES.slice(0, msgIndex + 1);

  return (
    <div className="relative w-full max-w-[560px] mx-auto">
      {/* Glow behind */}
      <div className="absolute -inset-4 rounded-2xl bg-primary/5 blur-2xl" />

      {/* Main frame */}
      <div className="relative rounded-xl border border-border/40 bg-card/90 backdrop-blur-xl shadow-2xl overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/30 bg-card/60">
          <div className="w-2.5 h-2.5 rounded-full bg-destructive/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-warning/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-success/60" />
          <span className="ml-2 text-[10px] text-muted-foreground font-mono">orbit.app/dashboard</span>
        </div>

        <div className="flex h-[320px]">
          {/* Sidebar */}
          <div className="w-10 border-r border-border/30 bg-card/40 flex flex-col items-center gap-3 pt-3">
            {SIDEBAR_ITEMS.map((Icon, i) => (
              <div
                key={i}
                className={`w-6 h-6 rounded flex items-center justify-center ${
                  i === 0 ? "bg-primary/20 text-primary" : "text-muted-foreground/50"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </div>
            ))}
          </div>

          {/* Content area */}
          <div className="flex-1 p-3 flex flex-col gap-3 overflow-hidden">
            {/* Stats row */}
            <div className="flex gap-2">
              <motion.div
                className="flex-1 rounded-lg bg-secondary/40 border border-border/20 px-3 py-2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                <p className="text-[9px] text-muted-foreground">Leads qualificados</p>
                <p className="text-sm font-bold text-primary">{leadsCount.toLocaleString()}</p>
              </motion.div>
              <motion.div
                className="flex-1 rounded-lg bg-secondary/40 border border-border/20 px-3 py-2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
              >
                <p className="text-[9px] text-muted-foreground">Conversão</p>
                <p className="text-sm font-bold text-success">{conversionCount}%</p>
              </motion.div>
            </div>

            {/* Kanban */}
            <div className="flex gap-2 flex-1 min-h-0">
              {KANBAN_COLS.map((col, ci) => (
                <div key={ci} className="flex-1 rounded-lg bg-secondary/20 border border-border/10 p-1.5 flex flex-col">
                  <div className="flex items-center gap-1 mb-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${col.color}`} />
                    <span className="text-[8px] font-medium text-muted-foreground">{col.title}</span>
                  </div>
                  <div className="flex-1 space-y-1 overflow-hidden">
                    {KANBAN_CARDS.filter((c) => c.col === ci).map((card, ki) => (
                      <motion.div
                        key={card.name}
                        className="rounded bg-card/80 border border-border/20 px-1.5 py-1"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 1 + ci * 0.3 + ki * 0.15 }}
                      >
                        <p className="text-[8px] font-medium truncate">{card.name}</p>
                        <p className="text-[7px] text-primary">{card.value}</p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Floating AI chat */}
      <motion.div
        className="absolute -bottom-4 -right-4 w-[200px] rounded-lg border border-primary/30 bg-card/95 backdrop-blur-xl shadow-xl overflow-hidden"
        initial={{ opacity: 0, y: 20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 1.5, duration: 0.5 }}
      >
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border/30 bg-primary/5">
          <Bot className="w-3 h-3 text-primary" />
          <span className="text-[9px] font-semibold text-primary">Orbit IA</span>
          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
        </div>
        <div className="p-2 space-y-1.5 h-[100px] overflow-hidden flex flex-col justify-end">
          <AnimatePresence mode="popLayout">
            {visibleMessages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className={`flex ${msg.from === "ai" ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`rounded px-2 py-1 text-[8px] max-w-[85%] ${
                    msg.from === "ai"
                      ? "bg-primary/10 text-primary"
                      : "bg-secondary text-foreground"
                  }`}
                >
                  {msg.text}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Floating notification */}
      <motion.div
        className="absolute -top-3 -left-3 rounded-lg border border-success/30 bg-card/95 backdrop-blur-xl shadow-lg px-3 py-2 flex items-center gap-2"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 2, duration: 0.5 }}
      >
        <div className="w-5 h-5 rounded-full bg-success/20 flex items-center justify-center">
          <ArrowRight className="w-3 h-3 text-success" />
        </div>
        <div>
          <p className="text-[8px] text-muted-foreground">Novo lead qualificado</p>
          <p className="text-[9px] font-semibold">Ana Costa → Proposta</p>
        </div>
      </motion.div>
    </div>
  );
}
