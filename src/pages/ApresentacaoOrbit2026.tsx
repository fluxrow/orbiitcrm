import { useEffect } from "react";
import { motion, useScroll, useTransform, type Variants } from "framer-motion";
import {
  ArrowDown,
  Clock,
  DollarSign,
  Flame,
  Mail,
  MessageCircle,
  Mic,
  Smartphone,
  Sparkles,
  Target,
  TrendingDown,
  Users,
  Zap,
  Brain,
  Filter,
  Send,
  CheckCircle2,
  XCircle,
  GitBranch,
} from "lucide-react";
import CountUp from "@/components/apresentacao/CountUp";
import PresentationControls from "@/components/apresentacao/PresentationControls";

/* ============================================================
   Apresentação comercial Orbit CRM — rota oculta
   ============================================================ */

const SECTIONS = [
  "hero",
  "dores",
  "comparativo",
  "qualificacao",
  "personalizacao",
  "whatsapp",
  "email",
  "funil",
  "fechamento",
  "investimento",
];

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.21, 0.47, 0.32, 0.98] as const } },
};

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

/* ---------- Aurora background ---------- */
function AuroraBg() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-[#0a0a14]">
      <div className="absolute -top-1/4 -left-1/4 w-[80vw] h-[80vw] rounded-full bg-emerald-500/20 blur-[120px] animate-aurora-1" />
      <div className="absolute -bottom-1/4 -right-1/4 w-[80vw] h-[80vw] rounded-full bg-violet-500/25 blur-[120px] animate-aurora-2" />
      <div className="absolute top-1/3 left-1/2 w-[50vw] h-[50vw] rounded-full bg-cyan-500/10 blur-[100px] animate-aurora-3" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,#0a0a14_100%)]" />
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "32px 32px",
        }}
      />
    </div>
  );
}

/* ---------- Section wrapper ---------- */
function Section({
  id,
  children,
  className = "",
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`relative min-h-screen w-full flex items-center justify-center px-6 md:px-12 py-20 snap-start ${className}`}
    >
      <div className="w-full max-w-7xl mx-auto">{children}</div>
    </section>
  );
}

/* ---------- Glass card helper ---------- */
const glass =
  "bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-2xl";

/* ============================================================
   HERO
   ============================================================ */
function Hero() {
  return (
    <Section id="hero" className="text-center">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={stagger}
        className="flex flex-col items-center gap-8"
      >
        <motion.div
          variants={fadeUp}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm text-white/70 backdrop-blur-xl"
        >
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          Orbit CRM{"\u00a0"}
        </motion.div>

        <motion.h1
          variants={fadeUp}
          className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight text-white leading-[1.05]"
        >
          Seu time de vendas
          <br />
          <span className="bg-gradient-to-r from-emerald-400 via-cyan-300 to-violet-400 bg-clip-text text-transparent">
            nunca dorme.
          </span>
          <br />
          <span className="text-white/60 text-3xl md:text-5xl lg:text-6xl font-light">
            O nosso também não.
          </span>
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="max-w-2xl text-lg md:text-xl text-white/60 leading-relaxed"
        >
          Atendimento, qualificação e vendas no piloto automático.{" "}
          <span className="text-white/90 font-medium">24 horas. 7 dias. 365 dias.</span>
        </motion.p>

        <motion.div
          variants={fadeUp}
          className="flex flex-col items-center gap-2 mt-12 text-white/40"
        >
          <span className="text-xs uppercase tracking-[0.2em]">Role para descobrir</span>
          <ArrowDown className="w-5 h-5 animate-bounce" />
        </motion.div>
      </motion.div>
    </Section>
  );
}

/* ============================================================
   DORES DO MERCADO
   ============================================================ */
function Dores() {
  const stats = [
    {
      icon: XCircle,
      value: <CountUp to={73} suffix="%" />,
      label: "dos leads de anúncio nunca são respondidos",
      source: "Harvard Business Review",
      color: "text-red-400",
    },
    {
      icon: Clock,
      value: <CountUp to={5} suffix=" min" />,
      label: "é a janela de ouro. Depois disso, conversão cai 80%",
      source: "MIT Lead Response Study",
      color: "text-amber-400",
    },
    {
      icon: DollarSign,
      value: (
        <>
          R$ <CountUp to={8500} separator="." />
        </>
      ),
      label: "custo mensal médio de 1 SDR júnior com encargos",
      source: "Catho · Glassdoor",
      color: "text-rose-400",
    },
    {
      icon: TrendingDown,
      value: <CountUp to={42} suffix="h" />,
      label: "por semana um SDR gasta em tarefas repetitivas",
      source: "InsideSales Report",
      color: "text-orange-400",
    },
  ];

  return (
    <Section id="dores">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={stagger}
      >
        <motion.div variants={fadeUp} className="mb-16 text-center md:text-left">
          <span className="text-emerald-400 text-sm uppercase tracking-[0.2em] font-medium">
            01 · O problema
          </span>
          <h2 className="mt-3 text-4xl md:text-6xl font-bold text-white leading-tight">
            O mercado está
            <span className="text-red-400"> sangrando</span> dinheiro
            <br />
            <span className="text-white/50">e ninguém fala sobre isso.</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {stats.map((s, i) => (
            <motion.div
              key={i}
              variants={fadeUp}
              className={`${glass} p-6 md:p-7 hover:border-white/20 transition-all hover:-translate-y-1 duration-300`}
            >
              <s.icon className={`w-7 h-7 ${s.color} mb-5`} />
              <div className="text-4xl md:text-5xl font-bold text-white mb-3 tabular-nums">
                {s.value}
              </div>
              <p className="text-white/70 text-sm leading-relaxed mb-4">{s.label}</p>
              <p className="text-[11px] text-white/30 uppercase tracking-wider">
                {s.source}
              </p>
            </motion.div>
          ))}
        </div>

        <motion.p
          variants={fadeUp}
          className="mt-16 text-2xl md:text-3xl font-light text-white/80 text-center max-w-3xl mx-auto"
        >
          Você não tem um problema de venda.
          <br />
          <span className="text-white font-medium">
            Você tem um problema de resposta.
          </span>
        </motion.p>
      </motion.div>
    </Section>
  );
}

/* ============================================================
   COMPARATIVO HUMANO vs ORBIT
   ============================================================ */
function Comparativo() {
  const rows = [
    { label: "Tempo de resposta", human: "4 horas em média", orbit: "8 segundos" },
    { label: "Disponibilidade", human: "8h/dia, seg–sex", orbit: "24/7/365" },
    { label: "Leads simultâneos", human: "1 por vez", orbit: "Ilimitado" },
    
    { label: "Esquece follow-up?", human: "Sempre", orbit: "Nunca" },
    { label: "Tira férias / fica doente", human: "Acontece", orbit: "Não existe" },
    { label: "Mau humor na sexta às 18h", human: "Inevitável", orbit: "Impossível" },
    { label: "Onboarding", human: "3 meses + treinamento", orbit: "15 dias chave-na-mão" },
  ];

  return (
    <Section id="comparativo">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={stagger}
      >
        <motion.div variants={fadeUp} className="mb-12 text-center">
          <span className="text-emerald-400 text-sm uppercase tracking-[0.2em] font-medium">
            02 · A comparação
          </span>
          <h2 className="mt-3 text-4xl md:text-6xl font-bold text-white leading-tight">
            Humano vs.{" "}
            <span className="bg-gradient-to-r from-emerald-400 to-violet-400 bg-clip-text text-transparent">
              Orbit
            </span>
          </h2>
        </motion.div>

        <motion.div variants={fadeUp} className={`${glass} overflow-hidden`}>
          {/* Header */}
          <div className="grid grid-cols-3 border-b border-white/10 bg-white/[0.02]">
            <div className="p-5 text-white/40 text-xs uppercase tracking-wider font-medium">
              Critério
            </div>
            <div className="p-5 text-center border-l border-white/10">
              <div className="flex items-center justify-center gap-2 text-white/70">
                <Users className="w-4 h-4" />
                <span className="font-medium">SDR Humano</span>
              </div>
            </div>
            <div className="p-5 text-center border-l border-white/10 bg-gradient-to-b from-emerald-500/10 to-transparent">
              <div className="flex items-center justify-center gap-2 text-emerald-300">
                <Zap className="w-4 h-4" />
                <span className="font-medium">Orbit</span>
              </div>
            </div>
          </div>

          {rows.map((r, i) => (
            <motion.div
              key={i}
              variants={fadeUp}
              className="grid grid-cols-3 border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors"
            >
              <div className="p-4 md:p-5 text-white/60 text-sm md:text-base">{r.label}</div>
              <div className="p-4 md:p-5 text-center border-l border-white/5 text-white/50 text-sm md:text-base line-through decoration-red-400/40">
                {r.human}
              </div>
              <div className="p-4 md:p-5 text-center border-l border-white/5 text-emerald-300 font-semibold text-sm md:text-base">
                {r.orbit}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    </Section>
  );
}

/* ============================================================
   QUALIFICAÇÃO — chat WhatsApp animado
   ============================================================ */
function ChatBubble({
  from,
  text,
  delay,
  typing = false,
}: {
  from: "lead" | "bot";
  text: string;
  delay: number;
  typing?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.4 }}
      className={`flex ${from === "bot" ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-sm leading-snug shadow-md ${
          from === "bot"
            ? "bg-emerald-500/90 text-white rounded-br-sm"
            : "bg-white text-zinc-900 rounded-bl-sm"
        }`}
      >
        {typing ? (
          <span className="inline-flex gap-1 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-50 animate-bounce" />
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-50 animate-bounce [animation-delay:0.15s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-50 animate-bounce [animation-delay:0.3s]" />
          </span>
        ) : (
          text
        )}
      </div>
    </motion.div>
  );
}

function Qualificacao() {
  const messages = [
    { from: "lead" as const, text: "Oi! Vi o anúncio de vocês no Instagram 👋", delay: 0.2 },
    { from: "bot" as const, text: "Oi, Bruno! Que bom te ver por aqui 🙌 Pra te ajudar melhor: você tá buscando isso pra você ou pra empresa?", delay: 0.7 },
    { from: "lead" as const, text: "Pra empresa, somos uns 12 vendedores", delay: 1.3 },
    { from: "bot" as const, text: "Perfeito. E qual o orçamento que você já tem em mente por mês?", delay: 1.9 },
    { from: "lead" as const, text: "Algo entre 1500 e 3000", delay: 2.5 },
    { from: "bot" as const, text: "Show. Última coisa: decisão é só sua ou tem mais alguém no processo?", delay: 3.1 },
    { from: "lead" as const, text: "Decisão é minha mesmo, sou o diretor comercial", delay: 3.7 },
    { from: "bot" as const, text: "🔥 Bruno, você se encaixa direitinho. Vou chamar agora o Rafael, nosso especialista, ok?", delay: 4.3 },
  ];

  return (
    <Section id="qualificacao">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={stagger}
        className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center"
      >
        <motion.div variants={fadeUp}>
          <span className="text-emerald-400 text-sm uppercase tracking-[0.2em] font-medium">
            03 · Qualificação
          </span>
          <h2 className="mt-3 text-4xl md:text-5xl font-bold text-white leading-tight">
            Pare de queimar verba
            <br />
            <span className="text-red-400">com lead que ninguém atende.</span>
          </h2>
          <p className="mt-6 text-lg text-white/60 leading-relaxed">
            Leads vindos de Meta Ads, Google Ads, Instagram — todos respondidos em segundos. A IA puxa{" "}
            <span className="text-emerald-300">orçamento, prazo e poder de decisão</span>, classifica como
            quente / morno / frio e só passa pro humano quando vale a pena.
          </p>

          <div className="mt-8 space-y-3">
            {[
              { icon: Flame, t: "Lead quente → notifica vendedor instantâneo" },
              { icon: Filter, t: "Lead morno → entra em nutrição automática" },
              { icon: Brain, t: "Lead frio → descartado sem custo de tempo" },
            ].map((it, i) => (
              <div key={i} className="flex items-center gap-3 text-white/80">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <it.icon className="w-4 h-4 text-emerald-400" />
                </div>
                <span className="text-sm md:text-base">{it.t}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* WhatsApp mockup */}
        <motion.div variants={fadeUp} className="relative">
          <div className="absolute -inset-8 bg-gradient-to-tr from-emerald-500/20 to-violet-500/20 blur-3xl rounded-full" />
          <div className="relative mx-auto max-w-sm rounded-[2.5rem] bg-zinc-900 border-[8px] border-zinc-800 shadow-2xl overflow-hidden">
            {/* Phone notch */}
            <div className="h-7 bg-zinc-900 flex justify-center items-end pb-1">
              <div className="w-20 h-4 bg-black rounded-full" />
            </div>
            {/* Chat header */}
            <div className="bg-emerald-700 px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-violet-400 flex items-center justify-center text-xs font-bold text-white">
                OR
              </div>
              <div className="text-white">
                <div className="text-sm font-semibold">Orbit · Vendas</div>
                <div className="text-[10px] text-emerald-100 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-300" /> online
                </div>
              </div>
            </div>
            {/* Chat body */}
            <div
              className="px-3 py-4 space-y-2 h-[480px] overflow-hidden"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(15,23,42,0.92), rgba(15,23,42,0.92)), url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M0 20h40M20 0v40' stroke='%23ffffff' stroke-opacity='0.03' /%3E%3C/svg%3E\")",
              }}
            >
              {messages.map((m, i) => (
                <ChatBubble key={i} {...m} />
              ))}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </Section>
  );
}

/* ============================================================
   PERSONALIZAÇÃO
   ============================================================ */
function Personalizacao() {
  const cards = [
    { icon: Brain, t: "Treinada na sua empresa", d: "Base de conhecimento própria. Produtos, preços, objeções, tom de voz — tudo da sua marca." },
    { icon: Mic, t: "Áudios na sua voz", d: "Biblioteca de áudios pré-gravados. O cliente ouve seu vendedor, não uma IA genérica." },
    { icon: GitBranch, t: "Fluxos condicionais", d: "Palavras-chave disparam respostas específicas. 'preço', 'agenda', 'cancelar' — cada uma com seu caminho." },
    { icon: Users, t: "Handoff humano", d: "A IA sabe quando recuar. Passa o bastão pro humano em momentos críticos, sem perder contexto." },
    { icon: Target, t: "Personas múltiplas", d: "Comporta lead B2B, B2C, suporte e SDR — cada conversa com a personalidade certa." },
    { icon: Sparkles, t: "Aprende com você", d: "Sugestões de resposta, refino de tom, ajustes finos. A cada semana ela fica mais sua." },
  ];

  return (
    <Section id="personalizacao">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={stagger}
      >
        <motion.div variants={fadeUp} className="mb-14 text-center">
          <span className="text-emerald-400 text-sm uppercase tracking-[0.2em] font-medium">
            04 · Personalização
          </span>
          <h2 className="mt-3 text-4xl md:text-6xl font-bold text-white leading-tight">
            Não é um chatbot genérico.
            <br />
            <span className="bg-gradient-to-r from-emerald-400 to-violet-400 bg-clip-text text-transparent">
              É a sua empresa falando.
            </span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {cards.map((c, i) => (
            <motion.div
              key={i}
              variants={fadeUp}
              whileHover={{ y: -6 }}
              className={`${glass} p-7 hover:border-emerald-400/30 transition-colors group`}
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/20 to-violet-500/20 border border-white/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <c.icon className="w-5 h-5 text-emerald-300" />
              </div>
              <h3 className="text-white text-lg font-semibold mb-2">{c.t}</h3>
              <p className="text-white/60 text-sm leading-relaxed">{c.d}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </Section>
  );
}

/* ============================================================
   WHATSAPP EM ESCALA
   ============================================================ */
function WhatsApp() {
  const { scrollYProgress } = useScroll();
  const yLeft = useTransform(scrollYProgress, [0, 1], [40, -40]);
  const yRight = useTransform(scrollYProgress, [0, 1], [-30, 30]);

  return (
    <Section id="whatsapp">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={stagger}
        className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center"
      >
        <motion.div variants={fadeUp} className="order-2 lg:order-1 relative h-[520px]">
          {/* Phone 1 - esquerda */}
          <motion.div
            style={{ y: yLeft }}
            className="absolute left-0 top-0 w-44 md:w-52 aspect-[9/19] rounded-[2rem] bg-zinc-900 border-4 border-zinc-800 shadow-2xl overflow-hidden rotate-[-8deg]"
          >
            <div className="bg-emerald-700 px-3 py-2 flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-emerald-900 flex items-center justify-center text-[10px] text-white font-bold">M</div>
              <div className="text-[10px] text-white font-medium leading-tight">
                Marina S.
                <div className="text-[8px] text-emerald-200 font-normal">online</div>
              </div>
            </div>
            <div className="p-2 space-y-1.5">
              {[
                { t: "Oi, vi o anúncio", me: false },
                { t: "Olá Marina! 👋", me: true },
                { t: "Posso te ajudar?", me: true },
                { t: "Quanto custa?", me: false },
                { t: "Te conto em 2 perguntas rápidas", me: true },
              ].map((b, i) => (
                <div key={i} className={`rounded-lg px-2 py-1.5 max-w-[85%] ${b.me ? "ml-auto bg-emerald-500/25" : "bg-white/10"}`}>
                  <div className="text-[8px] text-white/90 leading-snug">{b.t}</div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Phone 2 - centro */}
          <div className="absolute left-1/2 -translate-x-1/2 top-8 w-44 md:w-52 aspect-[9/19] rounded-[2rem] bg-zinc-900 border-4 border-zinc-800 shadow-2xl overflow-hidden z-10">
            <div className="bg-emerald-700 px-3 py-2 flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-emerald-900 flex items-center justify-center text-[10px] text-white font-bold">R</div>
              <div className="text-[10px] text-white font-medium leading-tight">
                Rafael T.
                <div className="text-[8px] text-emerald-200 font-normal">digitando…</div>
              </div>
            </div>
            <div className="p-2 space-y-1.5">
              {[
                { t: "Vim pelo Instagram", me: false },
                { t: "Boa! Qual seu segmento?", me: true },
                { t: "Clínica de estética", me: false },
                { t: "Quantos atendimentos/mês?", me: true },
                { t: "Uns 120", me: false },
                { t: "Perfeito pra você ✨", me: true },
              ].map((b, i) => (
                <div key={i} className={`rounded-lg px-2 py-1.5 max-w-[85%] ${b.me ? "ml-auto bg-emerald-500/25" : "bg-white/10"}`}>
                  <div className="text-[8px] text-white/90 leading-snug">{b.t}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Phone 3 - direita */}
          <motion.div
            style={{ y: yRight }}
            className="absolute right-0 top-4 w-44 md:w-52 aspect-[9/19] rounded-[2rem] bg-zinc-900 border-4 border-zinc-800 shadow-2xl overflow-hidden rotate-[8deg]"
          >
            <div className="bg-emerald-700 px-3 py-2 flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-violet-900 flex items-center justify-center text-[10px] text-white font-bold">J</div>
              <div className="text-[10px] text-white font-medium leading-tight">
                Juliana P.
                <div className="text-[8px] text-emerald-200 font-normal">online</div>
              </div>
            </div>
            <div className="p-2 space-y-1.5">
              {[
                { t: "Tenho interesse", me: false },
                { t: "Que ótimo! 🎯", me: true },
                { t: "Pode falar agora?", me: true },
                { t: "Sim, pode ligar", me: false },
              ].map((b, i) => (
                <div key={i} className={`rounded-lg px-2 py-1.5 max-w-[85%] ${b.me ? "ml-auto bg-violet-500/25" : "bg-white/10"}`}>
                  <div className="text-[8px] text-white/90 leading-snug">{b.t}</div>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>


        <motion.div variants={fadeUp} className="order-1 lg:order-2">
          <span className="text-emerald-400 text-sm uppercase tracking-[0.2em] font-medium">
            05 · WhatsApp em escala
          </span>
          <h2 className="mt-3 text-4xl md:text-5xl font-bold text-white leading-tight">
            Mil conversas ao mesmo tempo.
            <br />
            <span className="text-white/50">Zero conversas esquecidas.</span>
          </h2>

          <div className="mt-8 grid grid-cols-2 gap-4">
            <div className={`${glass} p-5`}>
              <Smartphone className="w-5 h-5 text-emerald-400 mb-3" />
              <div className="text-3xl font-bold text-white tabular-nums">
                <CountUp to={1847} separator="." />
              </div>
              <div className="text-xs text-white/50 mt-1">mensagens / dia por cliente</div>
            </div>
            <div className={`${glass} p-5`}>
              <Send className="w-5 h-5 text-violet-400 mb-3" />
              <div className="text-3xl font-bold text-white tabular-nums">
                <CountUp to={94} suffix="%" />
              </div>
              <div className="text-xs text-white/50 mt-1">taxa de resposta em 60s</div>
            </div>
            <div className={`${glass} p-5`}>
              <MessageCircle className="w-5 h-5 text-cyan-400 mb-3" />
              <div className="text-3xl font-bold text-white tabular-nums">
                <CountUp to={100} suffix="%" />
              </div>
              <div className="text-xs text-white/50 mt-1">conversas históricas no painel</div>
            </div>
            <div className={`${glass} p-5`}>
              <Zap className="w-5 h-5 text-amber-400 mb-3" />
              <div className="text-3xl font-bold text-white tabular-nums">
                <CountUp to={8} suffix="s" />
              </div>
              <div className="text-xs text-white/50 mt-1">tempo médio de resposta</div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </Section>
  );
}

/* ============================================================
   EMAIL
   ============================================================ */
function Email() {
  return (
    <Section id="email">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={stagger}
        className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center"
      >
        <motion.div variants={fadeUp}>
          <span className="text-emerald-400 text-sm uppercase tracking-[0.2em] font-medium">
            06 · E-mail
          </span>
          <h2 className="mt-3 text-4xl md:text-5xl font-bold text-white leading-tight">
            Campanhas de e-mail
            <br />
            <span className="bg-gradient-to-r from-cyan-300 to-violet-400 bg-clip-text text-transparent">
              que realmente vendem.
            </span>
          </h2>
          <p className="mt-6 text-lg text-white/60 leading-relaxed">
            Dispare, segmente e meça. Templates prontos, editor visual, variáveis
            personalizadas e métricas em tempo real. Sem ferramenta extra, sem assinatura paralela.
          </p>

          <div className="mt-8 grid grid-cols-3 gap-4">
            {[
              { v: 38, s: "%", l: "Abertura", c: "text-emerald-400" },
              { v: 12, s: "%", l: "Cliques", c: "text-cyan-400" },
              { v: 4.2, s: "%", l: "Respostas", c: "text-violet-400", d: 1 },
            ].map((m, i) => (
              <div key={i} className={`${glass} p-5 text-center`}>
                <div className={`text-3xl font-bold tabular-nums ${m.c}`}>
                  <CountUp to={m.v} suffix={m.s} decimals={m.d ?? 0} />
                </div>
                <div className="text-[11px] uppercase tracking-wider text-white/50 mt-2">
                  {m.l}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div variants={fadeUp} className={`${glass} p-6 shadow-2xl`}>
          {/* Email editor mockup */}
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/10">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400/60" />
            </div>
            <div className="ml-3 text-xs text-white/40">Campanha · Black Friday 2026</div>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-white/40 text-xs">
              <span className="w-12">Para:</span>
              <span className="px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                Segmento: Quentes (2.341)
              </span>
            </div>
            <div className="flex items-center gap-2 text-white/40 text-xs">
              <span className="w-12">Assunto:</span>
              <span className="text-white">{"{nome}"}, sua oferta exclusiva acaba hoje 🔥</span>
            </div>
            <div className="border border-white/10 rounded-xl p-5 bg-white/[0.02] space-y-3">
              <Mail className="w-6 h-6 text-emerald-400" />
              <div className="h-3 w-3/4 bg-white/20 rounded" />
              <div className="h-2.5 w-full bg-white/10 rounded" />
              <div className="h-2.5 w-5/6 bg-white/10 rounded" />
              <div className="h-2.5 w-2/3 bg-white/10 rounded" />
              <div className="pt-2">
                <div className="inline-block px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-violet-500 text-white text-xs font-medium">
                  Garantir minha vaga
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </Section>
  );
}

/* ============================================================
   FUNIL + IA
   ============================================================ */
function Funil() {
  const stages = [
    { name: "Novo", count: 142, color: "from-zinc-500/20 to-zinc-600/10", border: "border-zinc-500/30" },
    { name: "Qualificado", count: 67, color: "from-cyan-500/20 to-cyan-600/10", border: "border-cyan-500/30" },
    { name: "Proposta", count: 23, color: "from-violet-500/20 to-violet-600/10", border: "border-violet-500/30" },
    { name: "Fechado", count: 11, color: "from-emerald-500/20 to-emerald-600/10", border: "border-emerald-500/30" },
  ];

  return (
    <Section id="funil">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={stagger}
      >
        <motion.div variants={fadeUp} className="mb-12 text-center">
          <span className="text-emerald-400 text-sm uppercase tracking-[0.2em] font-medium">
            07 · Funil + IA
          </span>
          <h2 className="mt-3 text-4xl md:text-6xl font-bold text-white leading-tight">
            Seu pipeline se organiza
            <br />
            <span className="text-white/50">enquanto você dorme.</span>
          </h2>
        </motion.div>

        <motion.div variants={fadeUp} className={`${glass} p-5 md:p-7 overflow-x-auto`}>
          <div className="grid grid-cols-4 gap-3 md:gap-5 min-w-[640px]">
            {stages.map((s, i) => (
              <div key={i} className="space-y-3">
                <div className="flex items-center justify-between px-2">
                  <span className="text-white/80 text-sm font-medium">{s.name}</span>
                  <span className="text-white/40 text-xs tabular-nums">{s.count}</span>
                </div>
                {[1, 2, 3].map((j) => (
                  <motion.div
                    key={j}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 + i * 0.15 + j * 0.08 }}
                    className={`p-3 rounded-lg bg-gradient-to-br ${s.color} border ${s.border} backdrop-blur-sm`}
                  >
                    <div className="h-2 w-3/4 bg-white/30 rounded mb-2" />
                    <div className="h-1.5 w-1/2 bg-white/15 rounded mb-2" />
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span className="text-[10px] text-white/50">IA qualificou</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </Section>
  );
}


/* ============================================================
   INVESTIMENTO
   ============================================================ */
function Investimento() {
  return (
    <Section id="investimento">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={stagger}
      >
        <motion.div variants={fadeUp} className="mb-12 text-center">
          <span className="text-emerald-400 text-sm uppercase tracking-[0.2em] font-medium">
            09 · Investimento
          </span>
          <h2 className="mt-3 text-4xl md:text-6xl font-bold text-white leading-tight">
            Quanto custa
            <br />
            <span className="bg-gradient-to-r from-emerald-400 to-violet-400 bg-clip-text text-transparent">
              parar de perder vendas?
            </span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {/* Implementação */}
          <motion.div variants={fadeUp} className={`${glass} p-8 md:p-10`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-1 rounded-full bg-violet-500/20 text-violet-300 text-[10px] uppercase tracking-wider font-semibold border border-violet-500/30">
                Pagamento único
              </span>
            </div>
            <h3 className="text-2xl font-semibold text-white mt-4">Implementação chave-na-mão</h3>
            <div className="mt-6 space-y-4">
              <div>
                <div className="text-xs text-white/40 uppercase tracking-wider">À vista</div>
                <div className="text-5xl font-bold text-white tabular-nums mt-1">R$ 3.000</div>
              </div>
              <div className="text-white/30 text-sm">ou</div>
              <div>
                <div className="text-xs text-white/40 uppercase tracking-wider">Parcelado</div>
                <div className="text-3xl font-bold text-white tabular-nums mt-1">
                  12× <span className="text-emerald-400">R$ 397</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Mensalidade */}
          <motion.div
            variants={fadeUp}
            className={`${glass} p-8 md:p-10 border-emerald-500/30 bg-gradient-to-b from-emerald-500/[0.08] to-transparent relative overflow-hidden`}
          >
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-emerald-500/20 blur-3xl rounded-full" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] uppercase tracking-wider font-semibold border border-emerald-500/30">
                  Recorrente
                </span>
              </div>
              <h3 className="text-2xl font-semibold text-white mt-4">Operação rodando</h3>
              <div className="mt-6">
                <div className="text-xs text-white/40 uppercase tracking-wider">Mensalidade</div>
                <div className="text-6xl font-bold tabular-nums mt-1 bg-gradient-to-r from-emerald-300 to-violet-300 bg-clip-text text-transparent">
                  R$ 1.197
                </div>
                <div className="text-white/50 text-sm mt-2">por mês{"\u00a0"}</div>
              </div>
              <div className="mt-6 pt-6 border-t border-white/10 text-sm text-white/60">
                Inclui: IA ilimitada, WhatsApp, e-mail, funil, suporte e atualizações.
              </div>
            </div>
          </motion.div>
        </div>

        {/* O que está na implementação */}
        <motion.div variants={fadeUp} className={`${glass} mt-6 p-8 max-w-5xl mx-auto`}>
          <h4 className="text-white font-semibold text-lg mb-2">
            Por que a implementação?
          </h4>
          <p className="text-white/60 text-sm leading-relaxed mb-6">
            São <span className="text-white">2 semanas de trabalho dedicado</span> para entregar a
            operação rodando sozinha no dia 15. Não é "configure você mesmo" — é a gente fazendo
            tudo com você, do zero ao primeiro lead atendido pela IA.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm text-white/70">
            {[
              "Setup do número WhatsApp Business",
              "Treinamento da IA na sua base de conhecimento",
              "Configuração dos fluxos condicionais",
              "Integração com Meta Ads / Google Ads",
              "Criação dos templates iniciais",
              "Gravação da biblioteca de áudios",
              "Configuração do funil e etapas",
              "Handoff humano + notificações",
              "Treinamento da sua equipe",
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div variants={fadeUp} className="mt-14 text-center max-w-4xl mx-auto">
          <div className="text-sm uppercase tracking-[0.2em] text-white/40 mb-3">
            Comparado a um SDR humano, você economiza
          </div>
          <div className="text-7xl md:text-8xl font-bold bg-gradient-to-r from-emerald-400 via-cyan-300 to-violet-400 bg-clip-text text-transparent tabular-nums leading-none">
            R$ <CountUp to={84636} separator="." duration={2.4} />
          </div>
          <div className="mt-3 text-white/60 text-lg">no primeiro ano. Todo ano.</div>
        </motion.div>

        <motion.div variants={fadeUp} className="mt-10 text-center">
          <a
            href="https://wa.me/5541992361868?text=Cau%C3%A3%2C%20ja%20vi%20a%20propostas%2C%20bora%20implementar.%20Quais%20os%20proximos%20passos%3F%20aproveite%20e%20veja%20se%20o%20link%20esta%20copartilhavel%20mesmo%20e%20pronto%20pra%20compartilhar%20https%3A//orbit.fluxrow.pro/apresentacao/orbit-2026"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-gradient-to-r from-emerald-500 to-violet-500 text-white font-semibold text-lg shadow-2xl shadow-emerald-500/30 hover:scale-105 transition-transform"
          >
            Quero implementar
            <ArrowDown className="w-5 h-5 -rotate-90" />
          </a>
        </motion.div>

      </motion.div>
    </Section>
  );
}

/* ============================================================
   FECHAMENTO
   ============================================================ */
function Fechamento() {
  return (
    <Section id="fechamento" className="text-center">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={stagger}
      >
        <motion.div
          variants={fadeUp}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-300 text-sm mb-8"
        >
          <Flame className="w-3.5 h-3.5" />
          Atenção
        </motion.div>

        <motion.h2
          variants={fadeUp}
          className="text-5xl md:text-7xl lg:text-8xl font-bold text-white leading-[1.05] max-w-5xl mx-auto"
        >
          Cada dia sem Orbit
          <br />
          <span className="bg-gradient-to-r from-red-400 via-amber-300 to-emerald-400 bg-clip-text text-transparent">
            é dinheiro de anúncio
          </span>
          <br />
          <span className="text-white/60">indo pro lixo.</span>
        </motion.h2>

        <motion.p
          variants={fadeUp}
          className="mt-10 text-xl text-white/60 max-w-2xl mx-auto"
        >
          A boa notícia? Em 15 dias isso pode mudar.
        </motion.p>

        <motion.div variants={fadeUp} className="mt-16 flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-violet-400 flex items-center justify-center shadow-2xl shadow-emerald-500/30">
            <span className="text-white font-bold text-xl">O</span>
          </div>
          <div className="text-white font-semibold text-lg">Orbit CRM</div>
          <div className="text-white/40 text-sm">
            Seu time de vendas. Em piloto automático.
          </div>
        </motion.div>
      </motion.div>
    </Section>
  );
}

/* ============================================================
   PAGE
   ============================================================ */
export default function ApresentacaoOrbit2026() {
  useEffect(() => {
    // Force dark, hide indexing, lock to root
    document.documentElement.classList.add("dark");
    document.title = "Orbit CRM · Apresentação 2026";

    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);

    const prevOverflow = document.body.style.overflow;
    return () => {
      document.head.removeChild(meta);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  return (
    <div className="relative w-full min-h-screen text-white font-sans overflow-x-hidden snap-y snap-mandatory">
      <AuroraBg />
      <PresentationControls sectionIds={SECTIONS} />

      <Hero />
      <Dores />
      <Comparativo />
      <Qualificacao />
      <Personalizacao />
      <WhatsApp />
      <Email />
      <Funil />
      <Fechamento />
      <Investimento />
    </div>
  );
}
