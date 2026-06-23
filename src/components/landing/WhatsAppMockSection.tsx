import { motion } from "framer-motion";
import AnimatedSection from "@/components/landing/AnimatedSection";

type Bubble = { from: "lead" | "ia"; text: string; delay: number };

const BUBBLES: Bubble[] = [
  { from: "lead", text: "Oi, vi o anúncio. Quanto custa?", delay: 0.1 },
  { from: "ia", text: "Oi! Posso te ajudar 👋 Antes de te passar valores, qual o porte da sua empresa?", delay: 0.5 },
  { from: "lead", text: "Uns 30 funcionários, agência de marketing", delay: 1.1 },
  { from: "ia", text: "Perfeito. Vocês já usam algum CRM hoje ou tá tudo no WhatsApp pessoal mesmo?", delay: 1.7 },
  { from: "lead", text: "Tá tudo no WhatsApp 😅", delay: 2.3 },
  { from: "ia", text: "Faz total sentido. Já estou chamando um especialista — em 2 min ele te responde por aqui com a melhor solução pro seu caso.", delay: 2.9 },
  { from: "ia", text: "✅ Lead qualificado e encaminhado pro Cauã.", delay: 3.6 },
];

export default function WhatsAppMockSection() {
  return (
    <section className="py-20 px-4 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/4 w-[500px] h-[500px] bg-emerald-500/5 blur-[140px] rounded-full pointer-events-none" />
      <div className="relative max-w-5xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
        <AnimatedSection>
          <p className="text-sm font-semibold text-primary mb-2 uppercase tracking-wider">
            Atendimento em segundos
          </p>
          <h2 className="text-3xl font-bold mb-4">
            Pare de queimar verba de anúncio com{" "}
            <span className="gradient-text">lead que nunca foi atendido</span>
          </h2>
          <p className="text-muted-foreground mb-6">
            Assim que o lead manda mensagem, a IA responde, qualifica e — quando faz sentido —
            entrega pronto pro seu vendedor humano fechar.
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• Resposta em segundos, dia e madrugada</li>
            <li>• Qualificação automática com perguntas certas</li>
            <li>• Handoff ao vendedor com resumo completo</li>
          </ul>
        </AnimatedSection>

        <div className="flex justify-center">
          <div className="relative w-[320px] rounded-[2.5rem] border-8 border-border/60 bg-card shadow-2xl shadow-primary/10 overflow-hidden">
            <div className="bg-emerald-700 text-white px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center font-bold text-sm">
                O
              </div>
              <div>
                <p className="text-sm font-semibold leading-none">Orbit IA</p>
                <p className="text-[10px] opacity-80">online agora</p>
              </div>
            </div>
            <div
              className="p-4 space-y-2 min-h-[360px]"
              style={{
                backgroundColor: "#0b141a",
                backgroundImage:
                  "radial-gradient(circle at 20% 20%, rgba(34,197,94,0.04), transparent 60%), radial-gradient(circle at 80% 80%, rgba(56,189,248,0.04), transparent 60%)",
              }}
            >
              {BUBBLES.map((b, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ delay: b.delay, duration: 0.35 }}
                  className={`flex ${b.from === "ia" ? "justify-start" : "justify-end"}`}
                >
                  <div
                    className={`max-w-[80%] px-3 py-2 rounded-lg text-xs leading-snug shadow ${
                      b.from === "ia"
                        ? "bg-[#202c33] text-white rounded-tl-none"
                        : "bg-[#005c4b] text-white rounded-tr-none"
                    }`}
                  >
                    {b.text}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
