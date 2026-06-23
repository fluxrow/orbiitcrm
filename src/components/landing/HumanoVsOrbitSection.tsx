import { motion } from "framer-motion";
import { Check, X, User, Bot } from "lucide-react";
import AnimatedSection from "@/components/landing/AnimatedSection";
import GlowCard from "@/components/landing/GlowCard";

const ROWS = [
  { label: "Tempo de resposta", human: "4h em média", orbit: "8 segundos" },
  { label: "Disponibilidade", human: "8h/dia, seg-sex", orbit: "24/7/365" },
  { label: "Leads simultâneos", human: "1 por vez", orbit: "Ilimitado" },
  { label: "Custo operacional", human: "Alto, fixo, com encargos", orbit: "Uma fração de um SDR" },
  { label: "Esquece follow-up", human: "Sempre", orbit: "Nunca" },
];

export default function HumanoVsOrbitSection() {
  return (
    <section className="py-20 px-4 relative">
      <div className="absolute inset-0 bg-secondary/20" />
      <div className="relative max-w-5xl mx-auto">
        <AnimatedSection>
          <p className="text-sm font-semibold text-primary text-center mb-2 uppercase tracking-wider">
            Comparativo direto
          </p>
          <h2 className="text-3xl font-bold text-center mb-4">
            SDR humano vs. <span className="gradient-text">Orbit IA</span>
          </h2>
          <p className="text-center text-muted-foreground mb-12 max-w-xl mx-auto">
            Não é sobre substituir pessoas — é sobre tirar o trabalho repetitivo delas.
          </p>
        </AnimatedSection>

        <div className="grid md:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <GlowCard className="h-full" glowColor="0 72% 51%">
              <div className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                    <User className="w-5 h-5 text-destructive" />
                  </div>
                  <h3 className="font-semibold text-lg">SDR Humano sozinho</h3>
                </div>
                <ul className="space-y-3">
                  {ROWS.map((r) => (
                    <li key={r.label} className="flex items-start gap-3 text-sm">
                      <X className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                      <div>
                        <span className="text-muted-foreground">{r.label}: </span>
                        <span className="text-foreground">{r.human}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </GlowCard>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            <GlowCard className="h-full ring-1 ring-primary/40">
              <div className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Bot className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-lg">Orbit IA</h3>
                </div>
                <ul className="space-y-3">
                  {ROWS.map((r) => (
                    <li key={r.label} className="flex items-start gap-3 text-sm">
                      <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <div>
                        <span className="text-muted-foreground">{r.label}: </span>
                        <span className="text-foreground font-semibold">{r.orbit}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </GlowCard>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
