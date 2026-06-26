import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import {
  Webhook,
  Sparkles,
  Calendar,
  CheckCircle2,
  Clock,
  MessageCircle,
  FileSpreadsheet,
  ArrowRight,
  Brain,
  ShieldCheck,
  Activity,
  Lock,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import WhatsAppFab from "@/components/landing/WhatsAppFab";
import { WHATSAPP_LP_HREF } from "@/lib/whatsapp";
import { PILLARS } from "@/lib/orbit/pillars";
import orbitLogo from "@/assets/orbit-logo.png";

/* ============================================================
   Landing page — identidade Aurora alinhada à Apresentação 2026
   ============================================================ */

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: [0.21, 0.47, 0.32, 0.98] as const },
  },
};
const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
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

function Section({
  id,
  children,
  className = "",
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`relative w-full px-6 md:px-12 py-24 md:py-32 ${className}`}
    >
      <div className="w-full max-w-7xl mx-auto">{children}</div>
    </section>
  );
}

const glass =
  "bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-2xl";

/* ============================================================
   HERO — Word rotator
   ============================================================ */
const ROTATOR = [
  "mentoria de negócios",
  "mentoria para dentistas",
  "mentoria para médicos",
  "mentoria para advogados",
  "mentoria de investimentos",
];

function WordRotator() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % ROTATOR.length), 2200);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="relative inline-block align-baseline min-w-[260px] md:min-w-[420px] text-left">
      <AnimatePresence mode="wait">
        <motion.span
          key={ROTATOR[idx]}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -14 }}
          transition={{ duration: 0.4 }}
          className="inline-block bg-gradient-to-r from-emerald-400 to-violet-400 bg-clip-text text-transparent font-semibold"
        >
          {ROTATOR[idx]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Hero() {
  return (
    <Section id="hero" className="pt-32 md:pt-40 text-center">
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
          O agendador das mentorias High-Ticket
        </motion.div>

        <motion.h1
          variants={fadeUp}
          className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight text-white leading-[1.05] max-w-5xl"
        >
          A agenda cheia
          <br />
          <span className="bg-gradient-to-r from-emerald-400 via-cyan-300 to-violet-400 bg-clip-text text-transparent">
            das mentorias que faturam.
          </span>
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="max-w-3xl text-lg md:text-xl text-white/65 leading-relaxed"
        >
          O Orbit persegue cada lead do seu anúncio até a call de fechamento entrar na sua agenda — funciona pra{" "}
          <WordRotator />.{" "}
          <span className="text-white/85">
            Você só entra na hora da venda.
          </span>
        </motion.p>

        <motion.div
          variants={fadeUp}
          className="flex flex-col sm:flex-row items-center gap-3 mt-2"
        >
          <a
            href={WHATSAPP_LP_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-gradient-to-r from-emerald-500 to-violet-500 text-white font-semibold shadow-2xl shadow-emerald-500/30 hover:scale-105 transition-transform"
          >
            Quero minha agenda cheia
            <ArrowRight className="w-4 h-4" />
          </a>
          <a
            href="/apresentacao/orbit-2026"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 transition-colors text-sm"
          >
            Ver apresentação completa
          </a>
        </motion.div>

        <motion.div
          variants={fadeUp}
          className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs text-white/50"
        >
          {["resposta em 8s", "funciona 24/7", "sem perder lead"].map((c) => (
            <span
              key={c}
              className="px-3 py-1 rounded-full bg-white/[0.04] border border-white/10 backdrop-blur-xl"
            >
              {c}
            </span>
          ))}
        </motion.div>
      </motion.div>
    </Section>
  );
}

/* ============================================================
   DORES — Split screen Caos Manual vs Infraestrutura Orbit
   ============================================================ */
function ChaosSide() {
  return (
    <div className={`${glass} relative overflow-hidden p-7 md:p-9`}>
      <div className="absolute -top-12 -left-12 w-48 h-48 bg-rose-500/15 blur-3xl rounded-full" />
      <span className="relative text-rose-300 text-xs uppercase tracking-[0.2em] font-medium">
        Sua rotina hoje
      </span>
      <h3 className="relative mt-3 text-2xl md:text-3xl font-bold text-white">
        Processo manual, agenda vazia
      </h3>

      {/* Fake spreadsheet */}
      <div className="relative mt-7 rounded-xl border border-white/10 bg-zinc-950/60 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 text-[10px] text-white/40">
          <FileSpreadsheet className="w-3.5 h-3.5 text-rose-300" />
          leads-mentoria.xlsx · não salvo
        </div>
        <div className="grid grid-cols-4 text-[11px] text-white/40 px-3 py-1.5 border-b border-white/5 bg-white/[0.02]">
          <span>nome</span>
          <span>whats</span>
          <span>origem</span>
          <span>status</span>
        </div>
        {[
          ["Bruno R.", "(41) 9****", "ig", "?"],
          ["Marina S.", "(11) 9****", "fb", "?"],
          ["Carlos T.", "(21) 9****", "ig", "?"],
          ["Juliana P.", "(31) 9****", "form", "?"],
          ["Pedro L.", "(47) 9****", "ig", "?"],
        ].map((row, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 + i * 0.1 }}
            className="grid grid-cols-4 text-[11px] text-white/65 px-3 py-1.5 border-b border-white/5 last:border-0"
          >
            {row.map((c, j) => (
              <span key={j} className={j === 3 ? "text-rose-300/80" : ""}>
                {c}
              </span>
            ))}
          </motion.div>
        ))}
      </div>

      {/* Floating icons */}
      <div className="relative mt-6 flex items-center gap-6">
        <div className="relative">
          <MessageCircle className="w-9 h-9 text-rose-300/80" />
          <motion.span
            animate={{ scale: [1, 1.15, 1], opacity: [0.85, 1, 0.85] }}
            transition={{ duration: 1.4, repeat: Infinity }}
            className="absolute -top-2 -right-3 px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold tabular-nums"
          >
            47
          </motion.span>
        </div>
        <div className="text-[11px] text-white/50 leading-snug">
          mensagens não respondidas
          <br />
          <span className="text-rose-300/80">há mais de 6 horas</span>
        </div>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          className="ml-auto"
        >
          <Clock className="w-8 h-8 text-amber-300/70" />
        </motion.div>
      </div>

      <p className="relative mt-7 text-white/70 text-base md:text-lg leading-relaxed">
        Você responde 2h depois e o lead já comprou do concorrente. O dinheiro do anúncio{" "}
        <span className="text-rose-300 font-medium">vira prejuízo</span>.
      </p>
    </div>
  );
}

function OrbitSide() {
  const nodes = [
    { icon: Webhook, label: "Lead entra" },
    { icon: Sparkles, label: "IA qualifica" },
    { icon: Calendar, label: "Call agendada" },
  ];
  return (
    <div className={`${glass} relative overflow-hidden p-7 md:p-9 border-emerald-400/20`}>
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-emerald-500/20 blur-3xl rounded-full" />
      <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-violet-500/20 blur-3xl rounded-full" />
      <span className="relative text-emerald-300 text-xs uppercase tracking-[0.2em] font-medium">
        Sua rotina com Orbit
      </span>
      <h3 className="relative mt-3 text-2xl md:text-3xl font-bold text-white">
        Agenda cheia, venda fechada
      </h3>

      {/* Pipeline */}
      <div className="relative mt-10 rounded-xl border border-white/10 bg-zinc-950/40 p-6">
        <div className="flex items-center justify-between gap-3">
          {nodes.map((n, i) => (
            <div key={i} className="flex flex-col items-center gap-2 z-10">
              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 + i * 0.25 }}
                className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/30 to-violet-500/30 border border-white/15 flex items-center justify-center shadow-lg shadow-emerald-500/10"
              >
                <n.icon className="w-5 h-5 text-emerald-200" />
              </motion.div>
              <span className="text-[10px] uppercase tracking-wider text-white/60">
                {n.label}
              </span>
            </div>
          ))}
        </div>
        {/* Connecting gradient line */}
        <div className="absolute left-10 right-10 top-12 h-0.5 -translate-y-1/2 overflow-hidden rounded-full bg-white/5">
          <motion.div
            initial={{ x: "-100%" }}
            whileInView={{ x: "100%" }}
            viewport={{ once: false, amount: 0.4 }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            className="h-full w-1/2 bg-gradient-to-r from-transparent via-emerald-400 to-violet-400"
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 1.1 }}
          className="mt-7 flex items-center justify-center gap-2 text-emerald-300 text-sm"
        >
          <CheckCircle2 className="w-4 h-4" />
          Call confirmada na sua agenda
        </motion.div>
      </div>

      <p className="relative mt-7 text-white/80 text-base md:text-lg leading-relaxed">
        O Orbit qualifica, persegue e agenda.{" "}
        <span className="text-emerald-300 font-medium">
          A call cai na sua agenda. A venda entra no seu caixa.
        </span>
      </p>
    </div>
  );
}

function Dores() {
  const stats = [
    { v: "73%", l: "dos leads do seu anúncio nunca são respondidos a tempo" },
    { v: "5 min", l: "é a janela de ouro antes do lead comprar do concorrente" },
    { v: "42h/sem", l: "que você gasta no WhatsApp em vez de fechar venda" },
    { v: "R$ 8.500/mês", l: "custo de um assistente de vendas com encargos" },
  ];

  return (
    <Section id="dores">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={stagger}
      >
        <motion.div variants={fadeUp} className="mb-12 text-center">
          <span className="text-emerald-400 text-sm uppercase tracking-[0.2em] font-medium">
            01 · O custo de operar no improviso
          </span>
          <h2 className="mt-3 text-4xl md:text-6xl font-bold text-white leading-tight">
            Sua planilha não fecha venda.
            <br />
            <span className="text-white/55">O Orbit fecha.</span>
          </h2>
        </motion.div>

        <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ChaosSide />
          <OrbitSide />
        </motion.div>

        <motion.div
          variants={fadeUp}
          className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          {stats.map((s, i) => (
            <div key={i} className={`${glass} p-5 text-center`}>
              <div className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-emerald-300 to-violet-300 bg-clip-text text-transparent tabular-nums">
                {s.v}
              </div>
              <p className="mt-2 text-[11px] md:text-xs text-white/55 leading-snug">
                {s.l}
              </p>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </Section>
  );
}

/* ============================================================
   PILARES — consome PILLARS compartilhado
   ============================================================ */
function Pilares() {
  return (
    <Section id="infraestrutura">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={stagger}
      >
        <motion.div variants={fadeUp} className="mb-14 text-center">
          <span className="text-emerald-400 text-sm uppercase tracking-[0.2em] font-medium">
            02 · O que o Orbit faz pelo seu caixa
          </span>
          <h2 className="mt-3 text-4xl md:text-6xl font-bold text-white leading-tight">
            Cinco pilares que enchem
            <br />
            <span className="bg-gradient-to-r from-emerald-400 to-violet-400 bg-clip-text text-transparent">
              a agenda do mentor.
            </span>
          </h2>
          <p className="mt-6 text-lg text-white/60 max-w-2xl mx-auto leading-relaxed">
            Cada peça existe pra uma coisa só: tirar o lead do anúncio e colocar na sua call de fechamento.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {PILLARS.map((p, i) => (
            <motion.div
              key={i}
              variants={fadeUp}
              whileHover={{ y: -6 }}
              className={`${glass} p-7 hover:border-emerald-400/30 transition-colors group flex flex-col`}
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/20 to-violet-500/20 border border-white/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <p.icon className="w-5 h-5 text-emerald-300" />
              </div>
              <h3 className="text-white text-lg font-semibold mb-2">{p.title}</h3>
              <p className="text-white/60 text-sm leading-relaxed flex-1">
                {p.description}
              </p>
              <div className="mt-5 flex flex-wrap gap-1.5">
                {p.stack.map((s) => (
                  <span
                    key={s}
                    className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/10 text-[10px] uppercase tracking-wider text-white/60"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </Section>
  );
}

/* ============================================================
   TIMELINE — 4 etapas
   ============================================================ */
function Timeline() {
  const steps = [
    {
      n: "01",
      t: "Lead entra",
      d: "Anúncio, formulário, Instagram, indicação — todos os canais entram pela mesma porta, sem cair em planilha.",
    },
    {
      n: "02",
      t: "IA qualifica",
      d: "A IA conversa, descobre quem tem dinheiro e fit, e só passa pra você quem vale uma call.",
    },
    {
      n: "03",
      t: "Orbit agenda",
      d: "Lembrete, confirmação e reagendamento automático. O lead aparece na sua agenda e na call.",
    },
    {
      n: "04",
      t: "Você fecha",
      d: "Você entra só na hora da venda — com o lead aquecido, qualificado e esperando.",
    },
  ];

  return (
    <Section id="como-funciona">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={stagger}
      >
        <motion.div variants={fadeUp} className="mb-14 text-center">
          <span className="text-emerald-400 text-sm uppercase tracking-[0.2em] font-medium">
            03 · Como funciona
          </span>
          <h2 className="mt-3 text-4xl md:text-6xl font-bold text-white leading-tight">
            Do formulário
            <br />
            <span className="bg-gradient-to-r from-emerald-400 to-violet-400 bg-clip-text text-transparent">
              à call confirmada.
            </span>
          </h2>
        </motion.div>

        <div className="relative">
          {/* connecting line desktop */}
          <div className="hidden lg:block absolute top-9 left-[8%] right-[8%] h-[2px] bg-gradient-to-r from-emerald-400/30 via-violet-400/40 to-emerald-400/30" />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {steps.map((s, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                className={`${glass} relative p-6 text-center`}
              >
                <div className="mx-auto w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-violet-500 text-white flex items-center justify-center font-bold tabular-nums shadow-xl shadow-emerald-500/20">
                  {s.n}
                </div>
                <h3 className="mt-5 text-white font-semibold text-lg">{s.t}</h3>
                <p className="mt-2 text-sm text-white/60 leading-relaxed">{s.d}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    </Section>
  );
}

/* ============================================================
   DIFERENCIAIS 2x2
   ============================================================ */
function Diferenciais() {
  const items = [
    {
      icon: Brain,
      t: "IA real (não chatbot)",
      d: "Agente com RAG sobre a base de conhecimento do mentor — entende contexto, objeção e timing. Não é árvore de decisão.",
    },
    {
      icon: Lock,
      t: "Multi-tenant isolado",
      d: "RLS por empresa no banco. Dados da sua mentoria nunca cruzam com outra conta — by design, não por configuração.",
    },
    {
      icon: Activity,
      t: "Observabilidade nativa",
      d: "KPIs ao vivo, latência das Edge Functions e logs de webhook em sub-segundo. Você opera vendo a saúde, não a saudade.",
    },
    {
      icon: ShieldCheck,
      t: "Anti-bloqueio WhatsApp",
      d: "Cadência humanizada, mídia rica (áudio/vídeo/PDF) e validação de número antes do disparo. Protege seu canal.",
    },
  ];
  return (
    <Section id="diferenciais">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={stagger}
      >
        <motion.div variants={fadeUp} className="mb-14 text-center">
          <span className="text-emerald-400 text-sm uppercase tracking-[0.2em] font-medium">
            04 · Diferenciais
          </span>
          <h2 className="mt-3 text-4xl md:text-6xl font-bold text-white leading-tight">
            Por que mentores High-Ticket
            <br />
            <span className="bg-gradient-to-r from-emerald-400 to-violet-400 bg-clip-text text-transparent">
              escolhem o Orbit.
            </span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {items.map((d, i) => (
            <motion.div
              key={i}
              variants={fadeUp}
              whileHover={{ y: -4 }}
              className={`${glass} p-7 hover:border-emerald-400/30 transition-colors`}
            >
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/20 to-violet-500/20 border border-white/10 flex items-center justify-center shrink-0">
                  <d.icon className="w-5 h-5 text-emerald-300" />
                </div>
                <div>
                  <h3 className="text-white text-lg font-semibold">{d.t}</h3>
                  <p className="mt-2 text-white/65 text-sm leading-relaxed">{d.d}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </Section>
  );
}

/* ============================================================
   FAQ Enterprise
   ============================================================ */
const FAQ = [
  {
    q: "Como o Orbit lida com o webhook do meu Typebot?",
    a: "Recebemos o payload bruto, normalizamos os campos (WhatsApp, CPF/CNPJ, e-mail) e ainda preservamos qualquer campo extra em JSONB para você filtrar depois — utm_source, utm_campaign, respostas customizadas, tudo continua acessível por condição de fluxo.",
  },
  {
    q: "Como a latência afeta minha taxa de fechamento?",
    a: "Estudos do MIT mostram queda de até 80% na conversão depois dos 5 minutos. Nossas Edge Functions respondem em sub-segundo, então o lead recebe o primeiro contato enquanto a intenção ainda está quente — o que muda o jogo no High-Ticket.",
  },
  {
    q: "Os dados da minha mentoria ficam isolados de outras contas?",
    a: "Sim, por arquitetura. Cada empresa tem isolamento via Row-Level Security (RLS) no banco — nenhuma query consegue cruzar fronteira de tenant, mesmo via bug de aplicação. Isolamento é da infraestrutura, não da configuração.",
  },
  {
    q: "Posso usar minha planilha do Google Sheets como fonte de leads?",
    a: "Sim. Instalamos um Apps Script que envia cada nova linha para o webhook do Orbit em tempo real. Sua planilha vira uma fonte de leads tratada igual a Typebot ou Meta Ads — com mapeamento de colunas e validação automática.",
  },
  {
    q: "O agendamento no Google Calendar é nativo?",
    a: "Sim. Conectamos via OAuth e consultamos a FreeBusy do mentor antes de oferecer horários ao lead, criando o evento no calendário com convite por e-mail. Sem ferramenta intermediária, sem link genérico de Calendly.",
  },
  {
    q: "Como vocês evitam o bloqueio do meu WhatsApp?",
    a: "Cadência humanizada com delays aleatórios, controle de volume por hora, validação de número antes do disparo e suporte a mídia rica (áudio, vídeo, PDF) — que reduz padrões de spam. Conectamos via API oficial (Z-API).",
  },
  {
    q: "Consigo enviar PDFs, áudios e vídeos pela automação?",
    a: "Sim. As ações inteligentes suportam mídia rica como anexo nativo — você sobe o ebook, o áudio na sua voz ou o vídeo de captação e ele entra como passo de fluxo, não como link externo.",
  },
  {
    q: "Como acompanho a saúde técnica da operação?",
    a: "Tem um painel de observabilidade dentro do Orbit com latência das Edge Functions, taxa de sucesso por automação e log detalhado de cada webhook recebido. Você opera vendo a saúde do sistema, não esperando o lead reclamar.",
  },
];

function Faq() {
  return (
    <Section id="faq" className="py-24 md:py-28">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={stagger}
        className="max-w-3xl mx-auto"
      >
        <motion.div variants={fadeUp} className="mb-12 text-center">
          <span className="text-emerald-400 text-sm uppercase tracking-[0.2em] font-medium">
            05 · Dúvidas Enterprise
          </span>
          <h2 className="mt-3 text-3xl md:text-5xl font-bold text-white leading-tight">
            As perguntas que mentores sérios
            <br />
            <span className="text-white/55">fazem antes de assinar.</span>
          </h2>
        </motion.div>

        <motion.div variants={fadeUp}>
          <Accordion type="single" collapsible className="space-y-2">
            {FAQ.map((item, i) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className={`${glass} px-5 hover:border-emerald-400/30 transition-colors`}
              >
                <AccordionTrigger className="text-left text-white font-medium hover:no-underline py-5">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-white/65 leading-relaxed pb-5">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </motion.div>
    </Section>
  );
}

/* ============================================================
   CTA + ACESSO POR SLUG + FOOTER
   ============================================================ */
function CtaWhatsApp() {
  return (
    <Section className="text-center">
      <div className={`${glass} relative overflow-hidden p-12 md:p-16`}>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-emerald-500/15 blur-[120px] rounded-full" />
        <div className="relative max-w-2xl mx-auto space-y-6">
          <h2 className="text-3xl md:text-5xl font-bold text-white leading-tight">
            Pare de operar sua mentoria
            <br />
            <span className="bg-gradient-to-r from-emerald-400 to-violet-400 bg-clip-text text-transparent">
              no improviso.
            </span>
          </h2>
          <p className="text-white/65 text-lg">
            Em uma conversa rápida no WhatsApp a gente mostra como o Orbit roda na sua operação.
          </p>
          <a
            href={WHATSAPP_LP_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-gradient-to-r from-emerald-500 to-violet-500 text-white font-semibold shadow-2xl shadow-emerald-500/30 hover:scale-105 transition-transform"
          >
            <MessageCircle className="w-5 h-5" />
            Automatizar meu agendamento
          </a>
          <p className="text-xs text-white/40">
            Sem formulário, sem ligação fria. Resposta em minutos.
          </p>
        </div>
      </div>
    </Section>
  );
}

function AcessoSlug() {
  const navigate = useNavigate();
  const [slug, setSlug] = useState("");
  const [err, setErr] = useState("");
  const submit = () => {
    const t = slug.trim().toLowerCase();
    if (!t) {
      setErr("Digite o slug da sua empresa.");
      return;
    }
    setErr("");
    navigate(`/${t}/dashboard`);
  };
  return (
    <Section className="py-16">
      <div className={`${glass} max-w-lg mx-auto p-8 text-center`}>
        <h3 className="text-xl font-semibold text-white">Já é cliente?</h3>
        <p className="mt-2 text-sm text-white/55">
          Digite o slug da sua empresa para acessar o painel.
        </p>
        <div className="mt-5 flex gap-2">
          <Input
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setErr("");
            }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="minha-empresa"
            className="bg-white/[0.04] border-white/10 text-white placeholder:text-white/30"
          />
          <Button
            onClick={submit}
            className="bg-gradient-to-r from-emerald-500 to-violet-500 text-white hover:opacity-90"
          >
            Acessar
          </Button>
        </div>
        {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}
        <p className="mt-4 text-xs text-white/40">
          Não sabe seu slug?{" "}
          <button
            onClick={() => navigate("/auth")}
            className="text-emerald-300 hover:underline"
          >
            Faça login normalmente
          </button>
        </p>
      </div>
    </Section>
  );
}

function Footer() {
  return (
    <footer className="relative border-t border-white/10 py-10 px-6">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-white/40">
        <img src={orbitLogo} alt="Orbit" className="h-6 opacity-80" />
        <div className="flex gap-6">
          <span className="hover:text-white/80 cursor-pointer transition-colors">Termos</span>
          <span className="hover:text-white/80 cursor-pointer transition-colors">Privacidade</span>
          <span className="hover:text-white/80 cursor-pointer transition-colors">Suporte</span>
        </div>
        <span>© {new Date().getFullYear()} Fluxrow. Todos os direitos reservados.</span>
      </div>
    </footer>
  );
}

/* ============================================================
   PAGE
   ============================================================ */
export default function LandingPage() {
  useEffect(() => {
    document.title = "Orbit CRM — Infraestrutura comercial multicanal";
  }, []);

  // memoize aurora bg so it doesn't re-render
  const bg = useMemo(() => <AuroraBg />, []);

  return (
    <div className="relative w-full min-h-screen text-white font-sans overflow-x-hidden">
      {bg}
      <Hero />
      <Dores />
      <Pilares />
      <Timeline />
      <Diferenciais />
      <Faq />
      <CtaWhatsApp />
      <AcessoSlug />
      <Footer />
      <WhatsAppFab />
    </div>
  );
}
