import { motion } from "framer-motion";
import CountUp from "@/components/apresentacao/CountUp";
import AnimatedSection from "@/components/landing/AnimatedSection";
import GlowCard from "@/components/landing/GlowCard";

const STATS = [
  { value: 73, suffix: "%", label: "dos leads de anúncio nunca são respondidos" },
  { value: 5, suffix: " min", label: "janela de ouro — depois disso a conversão cai 80%" },
  { value: 4, suffix: "h", label: "tempo médio da 1ª resposta humana" },
  { value: 42, suffix: "h", label: "por semana gastas em tarefas repetitivas" },
];

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.12 } } };
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

export default function StatsImpactoSection() {
  return (
    <section className="py-20 px-4 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-primary/5 blur-[140px] rounded-full pointer-events-none" />
      <div className="relative max-w-6xl mx-auto">
        <AnimatedSection>
          <p className="text-sm font-semibold text-primary text-center mb-2 uppercase tracking-wider">
            O custo invisível
          </p>
          <h2 className="text-3xl font-bold text-center mb-4">
            Toda hora sem responder um lead é{" "}
            <span className="gradient-text">dinheiro saindo pelo ralo</span>
          </h2>
          <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
            Os números do mercado mostram porque velocidade de resposta virou questão de sobrevivência.
          </p>
        </AnimatedSection>

        <motion.div
          className="grid grid-cols-2 lg:grid-cols-4 gap-5"
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
        >
          {STATS.map((s, i) => (
            <motion.div key={i} variants={fadeUp}>
              <GlowCard className="h-full">
                <div className="p-6 text-center">
                  <div className="text-4xl sm:text-5xl font-extrabold gradient-text mb-3">
                    <CountUp to={s.value} suffix={s.suffix} />
                  </div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                </div>
              </GlowCard>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
