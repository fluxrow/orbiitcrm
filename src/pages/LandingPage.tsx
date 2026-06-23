import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Users, Target, BarChart3, CheckCircle, Mail, MessageSquare,
  Kanban, Zap, MessageCircle, Star,
  BotMessageSquare, ShieldCheck, Timer, TrendingUp, Building2,
  HeartHandshake, AlertTriangle, UserX, PhoneOff, Brain,
  ClipboardList, Shuffle, Send, FileText, Globe, Shield
} from "lucide-react";
import orbitLogo from "@/assets/orbit-logo.png";
import AnimatedSection from "@/components/landing/AnimatedSection";
import GlowCard from "@/components/landing/GlowCard";
import HeroSection from "@/components/landing/HeroSection";
import StatsImpactoSection from "@/components/landing/StatsImpactoSection";
import HumanoVsOrbitSection from "@/components/landing/HumanoVsOrbitSection";
import WhatsAppMockSection from "@/components/landing/WhatsAppMockSection";
import WhatsAppFab from "@/components/landing/WhatsAppFab";
import { WHATSAPP_LP_HREF } from "@/lib/whatsapp";

/* ─── Data (unchanged) ─── */
const PROBLEMS = [
  { icon: PhoneOff, title: "Leads perdidos no WhatsApp pessoal", desc: "Vendedores usam o celular próprio, a empresa perde o histórico de conversas e não sabe o que foi prometido ao cliente." },
  { icon: AlertTriangle, title: "Equipe sem processo comercial", desc: "Sem funil definido, sem follow-up automático e oportunidades esquecidas no meio do caminho." },
  { icon: UserX, title: "Tempo gasto com leads frios", desc: "Vendedores perdem horas respondendo quem nunca vai comprar, enquanto leads quentes esfriam sem atendimento." },
];

const SOLUTION_POINTS = [
  { icon: Brain, title: "IA qualifica antes do vendedor", desc: "O lead já chega com dados extraídos e classificação de interesse." },
  { icon: ClipboardList, title: "Tudo registrado automaticamente", desc: "Conversas, interações e decisões documentadas sem esforço manual." },
  { icon: Shuffle, title: "Distribuição inteligente", desc: "Round-robin automático garante que cada vendedor receba leads de forma equilibrada." },
];

const STEPS = [
  { icon: Target, title: "Lead entra", desc: "Via WhatsApp, importação de planilha, busca ativa (Apollo) ou formulário." },
  { icon: BotMessageSquare, title: "IA atende e qualifica", desc: "Atendimento automático 24h extrai dados, responde dúvidas e classifica o interesse." },
  { icon: Send, title: "Handoff ao vendedor", desc: "Lead qualificado é encaminhado ao vendedor certo com resumo completo da conversa." },
  { icon: Kanban, title: "Negociação no funil", desc: "Pipeline Kanban com tarefas, timeline de interações e acompanhamento visual." },
  { icon: Mail, title: "Follow-up automático", desc: "Campanhas de email e WhatsApp mantêm o lead engajado até o fechamento." },
];

const FEATURE_GROUPS = [
  { title: "IA & Automação", icon: Zap, features: ["Atendimento IA no WhatsApp 24h", "Qualificação automática de leads", "Extração inteligente de dados", "Distribuição round-robin entre vendedores", "Handoff com contexto completo"] },
  { title: "CRM & Pipeline", icon: Kanban, features: ["Funil Kanban drag-and-drop", "Tarefas por oportunidade", "Timeline completa de interações", "Importação de contatos (CSV/Excel)", "Segmentos e origens configuráveis"] },
  { title: "Comunicação & Campanhas", icon: MessageSquare, features: ["WhatsApp bidirecional (envio + recebimento)", "Email marketing com templates visuais", "Campanhas agendadas com métricas", "Instagram Direct e Messenger (Plus)", "Anti-bloqueio com warm-up automático"] },
];

const DIFFERENTIALS = [
  { icon: Brain, title: "IA de verdade, não chatbot", desc: "Qualifica leads, extrai dados estruturados, responde com contexto e encaminha ao vendedor com resumo completo da conversa." },
  { icon: ShieldCheck, title: "Anti-bloqueio WhatsApp", desc: "Sistema de warm-up progressivo, delays aleatórios entre mensagens e controle de volume para proteger seu número." },
  { icon: Building2, title: "Multi-empresa isolada", desc: "Cada empresa tem seu ambiente separado com dados, configurações, usuários e permissões independentes." },
  { icon: Globe, title: "Tudo em um só lugar", desc: "CRM, WhatsApp, email, IA, campanhas e funil — sem precisar integrar 5 ferramentas diferentes." },
];

const VALUE_PROOFS = [
  { icon: Timer, title: "Economia de horas", desc: "IA responde 24h por dia, 7 dias por semana. Seu vendedor foca apenas em leads prontos para comprar." },
  { icon: TrendingUp, title: "Mais conversão", desc: "Leads chegam qualificados e com histórico completo. O vendedor negocia com contexto, não no escuro." },
  { icon: Shield, title: "Zero lead perdido", desc: "Cada contato é registrado, cada conversa tem follow-up. Nenhuma oportunidade escapa." },
];

const AUDIENCES = [
  { icon: Building2, name: "Agências de marketing", desc: "Que geram leads para clientes e precisam de CRM + automação." },
  { icon: Users, name: "Consultorias B2B", desc: "Com vendas complexas que precisam de funil e follow-up estruturado." },
  { icon: HeartHandshake, name: "Imobiliárias", desc: "Que recebem leads por WhatsApp e precisam distribuir entre corretores." },
  { icon: FileText, name: "Escolas e cursos", desc: "Com alto volume de contatos e necessidade de qualificação rápida." },
  { icon: BarChart3, name: "Equipes de vendas", desc: "Que usam WhatsApp como canal principal e querem escalar sem perder controle." },
  { icon: Star, name: "Clínicas e serviços", desc: "Que precisam agendar, qualificar e acompanhar pacientes/clientes." },
];

const FAQ_ITEMS = [
  { q: "O que exatamente o Orbit faz?", a: "O Orbit é um CRM com IA que centraliza todo o processo comercial: captação de leads, atendimento automático por WhatsApp, qualificação inteligente, funil de vendas, campanhas por email e WhatsApp, e distribuição automática entre vendedores." },
  { q: "Preciso instalar algo?", a: "Não. O Orbit é 100% web. Basta acessar pelo navegador em qualquer dispositivo — computador, tablet ou celular." },
  { q: "A IA realmente responde sozinha?", a: "Sim. A IA atende leads pelo WhatsApp 24h, faz perguntas de qualificação, extrai dados como nome, empresa e interesse, e encaminha o lead ao vendedor com um resumo completo. Você define o tom, horário e regras." },
  { q: "Posso usar meu próprio número de WhatsApp?", a: "Sim! Você conecta seu número via API oficial (Z-API). Durante a demonstração, a IA funciona em um número de teste." },
  { q: "Consigo importar meus contatos?", a: "Sim. Importe via planilha CSV ou Excel diretamente pelo painel. O sistema faz deduplicação automática para evitar contatos duplicados." },
  { q: "Meus dados ficam seguros?", a: "Cada empresa tem um ambiente totalmente isolado com dados separados. Usamos criptografia e controle de acesso por função (admin, gerente, vendedor, visualizador)." },
  { q: "Quais canais de comunicação são suportados?", a: "WhatsApp (via API oficial), email (SMTP), Instagram Direct e Facebook Messenger." },
  { q: "Como falo com vocês?", a: "É só clicar no botão verde do WhatsApp em qualquer parte do site. A gente responde em minutos e te explica tudo direto por lá." },
];

/* ─── Animation variants ─── */
const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

/* ─── Section label helper ─── */
function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-sm font-semibold text-primary text-center mb-2 uppercase tracking-wider">
      {children}
    </p>
  );
}

/* ─── Main component ─── */
export default function LandingPage() {
  const navigate = useNavigate();
  const [slug, setSlug] = useState("");

  useEffect(() => {
    document.title = "Orbit CRM — CRM com IA para WhatsApp, Email e Vendas";
  }, []);
  const [slugError, setSlugError] = useState("");

  const handleSlugAccess = () => {
    const trimmed = slug.trim().toLowerCase();
    if (!trimmed) { setSlugError("Digite o slug da sua empresa."); return; }
    setSlugError("");
    navigate(`/${trimmed}/dashboard`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground noise-bg">

      {/* ══════════ HERO ══════════ */}
      <HeroSection />

      {/* ══════════ STATS — dor real do mercado ══════════ */}
      <StatsImpactoSection />

      {/* ══════════ PROBLEMA ══════════ */}
      <section className="py-20 px-4 relative">
        <div className="absolute inset-0 bg-secondary/20" />
        <div className="relative max-w-5xl mx-auto">
          <AnimatedSection>
            <SectionLabel>O problema</SectionLabel>
            <h2 className="text-3xl font-bold text-center mb-4">
              Sua operação comercial <span className="gradient-text">está travada?</span>
            </h2>
            <p className="text-center text-muted-foreground mb-12 max-w-xl mx-auto">
              Se alguma dessas dores parece familiar, o Orbit foi feito para você.
            </p>
          </AnimatedSection>

          <motion.div
            className="grid sm:grid-cols-3 gap-6"
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
          >
            {PROBLEMS.map((p, i) => (
              <motion.div key={i} variants={fadeUp}>
                <GlowCard className="h-full" glowColor="0 72% 51%">
                  <div className="p-6 text-center">
                    <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <p.icon className="w-6 h-6 text-destructive" />
                    </div>
                    <h3 className="font-semibold text-base mb-2">{p.title}</h3>
                    <p className="text-sm text-muted-foreground">{p.desc}</p>
                  </div>
                </GlowCard>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ══════════ SOLUÇÃO ══════════ */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <AnimatedSection>
            <SectionLabel>A solução</SectionLabel>
            <h2 className="text-3xl font-bold text-center mb-4">
              O Orbit centraliza tudo em <span className="gradient-text">uma plataforma com IA</span>
            </h2>
            <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
              Uma IA que trabalha 24h atendendo, qualificando e organizando seus leads — enquanto sua equipe foca em fechar negócios.
            </p>
          </AnimatedSection>

          <motion.div
            className="grid sm:grid-cols-3 gap-6"
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
          >
            {SOLUTION_POINTS.map((s, i) => (
              <motion.div key={i} variants={fadeUp}>
                <GlowCard className="h-full">
                  <div className="p-6 text-center">
                    <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:rotate-12 group-hover:scale-110 transition-transform">
                      <s.icon className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="font-semibold text-base mb-2">{s.title}</h3>
                    <p className="text-sm text-muted-foreground">{s.desc}</p>
                  </div>
                </GlowCard>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ══════════ COMO FUNCIONA (Timeline) ══════════ */}
      <section id="como-funciona" className="py-20 px-4 relative">
        <div className="absolute inset-0 bg-secondary/20" />
        <div className="relative max-w-6xl mx-auto">
          <AnimatedSection>
            <SectionLabel>Como funciona</SectionLabel>
            <h2 className="text-3xl font-bold text-center mb-4">
              Do primeiro contato ao <span className="gradient-text">fechamento</span>
            </h2>
            <p className="text-center text-muted-foreground mb-12 max-w-xl mx-auto">
              5 passos para transformar leads em clientes — de forma automática.
            </p>
          </AnimatedSection>

          {/* Desktop timeline */}
          <div className="hidden lg:block relative">
            {/* Connecting line */}
            <div className="absolute top-16 left-[10%] right-[10%] h-0.5 bg-gradient-to-r from-primary/20 via-primary/50 to-primary/20" />

            <motion.div
              className="grid grid-cols-5 gap-5"
              variants={stagger}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
            >
              {STEPS.map((step, i) => (
                <motion.div key={i} variants={fadeUp}>
                  <GlowCard className="text-center">
                    <div className="p-5">
                      <div className="mx-auto w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center mb-3 text-sm font-bold relative z-10 group-hover:scale-110 group-hover:shadow-[0_0_20px_hsl(var(--primary)/0.4)] transition-all">
                        {i + 1}
                      </div>
                      <h3 className="text-sm font-semibold mb-2">{step.title}</h3>
                      <p className="text-xs text-muted-foreground">{step.desc}</p>
                    </div>
                  </GlowCard>
                </motion.div>
              ))}
            </motion.div>
          </div>

          {/* Mobile timeline */}
          <div className="lg:hidden space-y-4">
            {STEPS.map((step, i) => (
              <AnimatedSection key={i} delay={i * 0.1}>
                <div className="flex gap-4 items-start">
                  <div className="flex flex-col items-center shrink-0">
                    <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                      {i + 1}
                    </div>
                    {i < STEPS.length - 1 && <div className="w-0.5 h-12 bg-primary/20 mt-2" />}
                  </div>
                  <GlowCard className="flex-1">
                    <div className="p-4">
                      <h3 className="text-sm font-semibold mb-1">{step.title}</h3>
                      <p className="text-xs text-muted-foreground">{step.desc}</p>
                    </div>
                  </GlowCard>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ FUNCIONALIDADES ══════════ */}
      <section id="recursos" className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <AnimatedSection>
            <SectionLabel>Funcionalidades</SectionLabel>
            <h2 className="text-3xl font-bold text-center mb-4">
              Tudo que você precisa, <span className="gradient-text">em um só lugar</span>
            </h2>
            <p className="text-center text-muted-foreground mb-12 max-w-xl mx-auto">
              Cada recurso foi pensado para eliminar etapas manuais e acelerar suas vendas.
            </p>
          </AnimatedSection>

          <motion.div
            className="grid md:grid-cols-3 gap-6"
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
          >
            {FEATURE_GROUPS.map((group) => (
              <motion.div key={group.title} variants={fadeUp}>
                <GlowCard className="h-full">
                  <div className="p-6">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:rotate-12 group-hover:scale-110 transition-transform">
                        <group.icon className="w-5 h-5 text-primary" />
                      </div>
                      <h3 className="text-lg font-semibold">{group.title}</h3>
                    </div>
                    <ul className="space-y-2.5">
                      {group.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <CheckCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                </GlowCard>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ══════════ DIFERENCIAIS ══════════ */}
      <section className="py-20 px-4 relative">
        <div className="absolute inset-0 bg-secondary/20" />
        <div className="relative max-w-6xl mx-auto">
          <AnimatedSection>
            <SectionLabel>Diferenciais</SectionLabel>
            <h2 className="text-3xl font-bold text-center mb-4">
              Por que o Orbit é <span className="gradient-text">diferente</span>
            </h2>
            <p className="text-center text-muted-foreground mb-12 max-w-xl mx-auto">
              Não é mais um CRM genérico. O Orbit foi construído para equipes que vendem pelo WhatsApp e precisam de IA real.
            </p>
          </AnimatedSection>

          <motion.div
            className="grid sm:grid-cols-2 gap-6"
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
          >
            {DIFFERENTIALS.map((d, i) => (
              <motion.div key={i} variants={fadeUp}>
                <GlowCard className="h-full">
                  <div className="p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:rotate-12 group-hover:scale-110 transition-transform">
                        <d.icon className="w-5 h-5 text-primary" />
                      </div>
                      <h3 className="font-semibold text-base">{d.title}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">{d.desc}</p>
                  </div>
                </GlowCard>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ══════════ PROVA DE VALOR ══════════ */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <AnimatedSection>
            <SectionLabel>Resultados</SectionLabel>
            <h2 className="text-3xl font-bold text-center mb-12">
              O que muda quando você <span className="gradient-text">usa o Orbit</span>
            </h2>
          </AnimatedSection>

          <motion.div
            className="grid sm:grid-cols-3 gap-8"
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
          >
            {VALUE_PROOFS.map((v, i) => (
              <motion.div key={i} variants={fadeUp} className="text-center space-y-3">
                <motion.div
                  className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center"
                  whileHover={{ scale: 1.15, rotate: 5 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <v.icon className="w-7 h-7 text-primary" />
                </motion.div>
                <h3 className="font-bold text-lg">{v.title}</h3>
                <p className="text-sm text-muted-foreground">{v.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ══════════ PARA QUEM É ══════════ */}
      <section className="py-20 px-4 relative">
        <div className="absolute inset-0 bg-secondary/20" />
        <div className="relative max-w-6xl mx-auto">
          <AnimatedSection>
            <SectionLabel>Para quem é</SectionLabel>
            <h2 className="text-3xl font-bold text-center mb-4">
              Ideal para quem <span className="gradient-text">vende ativamente</span>
            </h2>
            <p className="text-center text-muted-foreground mb-12 max-w-xl mx-auto">
              Se sua equipe usa WhatsApp e email para vender, o Orbit vai transformar sua operação.
            </p>
          </AnimatedSection>

          <motion.div
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5"
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
          >
            {AUDIENCES.map((a, i) => (
              <motion.div key={i} variants={fadeUp}>
                <GlowCard className="h-full">
                  <div className="p-5">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:rotate-12 transition-transform">
                        <a.icon className="w-5 h-5 text-primary" />
                      </div>
                      <h3 className="font-semibold text-base">{a.name}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">{a.desc}</p>
                  </div>
                </GlowCard>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ══════════ PLANOS ══════════ */}
      <section id="planos" className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <AnimatedSection>
            <SectionLabel>Planos</SectionLabel>
            <h2 className="text-3xl font-bold text-center mb-4">
              Escolha o plano ideal para <span className="gradient-text">sua operação</span>
            </h2>
            <p className="text-center text-muted-foreground mb-6 text-sm">
              Todos os planos incluem trial gratuito de 7 dias. Sem cartão de crédito.
            </p>

            {/* Toggle mensal / anual */}
            <div className="flex items-center justify-center gap-3 mb-12">
              <span className={`text-sm ${!isAnnual ? "text-foreground font-medium" : "text-muted-foreground"}`}>Mensal</span>
              <button
                onClick={() => setIsAnnual(!isAnnual)}
                className={`relative w-12 h-6 rounded-full transition-colors ${isAnnual ? "bg-primary" : "bg-muted"}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-background shadow transition-transform ${isAnnual ? "translate-x-6" : "translate-x-0.5"}`} />
              </button>
              <span className={`text-sm ${isAnnual ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                Anual <Badge variant="secondary" className="ml-1 text-[10px] bg-primary/10 text-primary border-primary/20">-20%</Badge>
              </span>
            </div>
          </AnimatedSection>

          <motion.div
            className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6"
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
          >
            {PLANS_DATA.map((plan) => (
              <motion.div
                key={plan.name}
                variants={fadeUp}
                className={plan.highlight ? "lg:-mt-3 lg:mb-3 z-10" : ""}
              >
                <GlowCard
                  className={`flex flex-col h-full ${plan.highlight ? "ring-1 ring-primary/40 animate-glow-pulse" : ""}`}
                  glowColor={plan.highlight ? "187 92% 50%" : "var(--primary)"}
                >
                  <div className="p-6 flex flex-col h-full">
                    {plan.highlight && plan.badge && (
                      <Badge className="self-center -mt-9 mb-4 bg-primary text-primary-foreground text-[10px] shadow-lg shadow-primary/20">
                        <Star className="w-3 h-3 mr-1" /> {plan.badge}
                      </Badge>
                    )}
                    <div className="text-center mb-6">
                      <h3 className="text-xl font-bold">{plan.name}</h3>
                      <div className="text-3xl font-extrabold mt-2">{formatPrice(plan.priceMonthly)}</div>
                      <p className="text-sm text-muted-foreground mt-1">{plan.ideal}</p>
                    </div>
                    <ul className="space-y-2 flex-1">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <CheckCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <Button
                      className={`w-full mt-6 ${plan.highlight ? "animate-glow hover:scale-105 transition-transform" : "hover:scale-[1.02] transition-transform"}`}
                      variant={plan.ctaVariant}
                      onClick={() => navigate(plan.href)}
                    >
                      {plan.cta} <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </GlowCard>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ══════════ CTA FINAL ══════════ */}
      <section className="py-24 px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-secondary/20" />
        {/* Glow blob */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-primary/8 blur-[120px] rounded-full" />

        <AnimatedSection className="relative z-10">
          <div className="max-w-2xl mx-auto text-center space-y-6">
            <h2 className="text-3xl sm:text-4xl font-extrabold">
              Pronto para vender mais <span className="gradient-text">com menos esforço?</span>
            </h2>
            <p className="text-muted-foreground text-lg">
              Comece agora e veja sua equipe vender mais em menos tempo — com IA de verdade.
            </p>
            <Button
              size="lg"
              onClick={() => navigate("/trial")}
              className="gap-2 text-base px-10 h-12 animate-glow-pulse hover:scale-105 transition-transform"
            >
              Começar agora — 7 dias grátis <ArrowRight className="w-5 h-5" />
            </Button>
            <p className="text-xs text-muted-foreground">Sem cartão de crédito. Cancele quando quiser.</p>
          </div>
        </AnimatedSection>
      </section>

      {/* ══════════ FAQ ══════════ */}
      <section id="faq" className="py-20 px-4">
        <div className="max-w-2xl mx-auto">
          <AnimatedSection>
            <SectionLabel>Dúvidas</SectionLabel>
            <h2 className="text-3xl font-bold text-center mb-10">
              Perguntas <span className="gradient-text">frequentes</span>
            </h2>
          </AnimatedSection>

          <AnimatedSection delay={0.2}>
            <Accordion type="single" collapsible className="space-y-2">
              {FAQ_ITEMS.map((item, i) => (
                <AccordionItem
                  key={i}
                  value={`faq-${i}`}
                  className="bg-card/60 backdrop-blur-xl border border-border/50 px-4 rounded-xl hover:border-primary/30 transition-colors"
                >
                  <AccordionTrigger className="text-left text-sm font-medium hover:no-underline">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </AnimatedSection>
        </div>
      </section>

      {/* ══════════ ACESSO RÁPIDO ══════════ */}
      <section className="py-16 px-4 relative">
        <div className="absolute inset-0 bg-secondary/20" />
        <AnimatedSection className="relative z-10">
          <div className="max-w-md mx-auto text-center space-y-4">
            <h2 className="text-2xl font-bold">Já é cliente?</h2>
            <p className="text-sm text-muted-foreground">
              Digite o slug da sua empresa para acessar diretamente.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="minha-empresa"
                value={slug}
                onChange={(e) => { setSlug(e.target.value); setSlugError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleSlugAccess()}
                className="bg-card/60 backdrop-blur-sm border-border/50"
              />
              <Button onClick={handleSlugAccess}>Acessar</Button>
            </div>
            {slugError && <p className="text-sm text-destructive">{slugError}</p>}
            <p className="text-xs text-muted-foreground">
              Não sabe seu slug?{" "}
              <button onClick={() => navigate("/auth")} className="text-primary hover:underline">
                Faça login normalmente
              </button>
            </p>
          </div>
        </AnimatedSection>
      </section>

      {/* ══════════ FOOTER ══════════ */}
      <footer className="border-t border-border/50 py-10 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <img src={orbitLogo} alt="Orbit" className="h-6" />
          <div className="flex gap-6">
            <span className="hover:text-foreground cursor-pointer transition-colors">Termos</span>
            <span className="hover:text-foreground cursor-pointer transition-colors">Privacidade</span>
            <span className="hover:text-foreground cursor-pointer transition-colors">Suporte</span>
          </div>
          <span>© {new Date().getFullYear()} Fluxrow. Todos os direitos reservados.</span>
        </div>
      </footer>
    </div>
  );
}
