import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Users, Target, BarChart3, CheckCircle, Mail, MessageSquare,
  Kanban, Clock, ListChecks, Zap, Search, ArrowRight, Rocket,
  Shield, ChevronRight, Star, Instagram, Facebook,
  BotMessageSquare, ShieldCheck, Timer, TrendingUp, Building2,
  HeartHandshake, AlertTriangle, UserX, PhoneOff, Brain,
  ClipboardList, Shuffle, Send, FileText, Globe
} from "lucide-react";
import orbitLogo from "@/assets/orbit-logo.png";

const PROBLEMS = [
  {
    icon: PhoneOff,
    title: "Leads perdidos no WhatsApp pessoal",
    desc: "Vendedores usam o celular próprio, a empresa perde o histórico de conversas e não sabe o que foi prometido ao cliente.",
  },
  {
    icon: AlertTriangle,
    title: "Equipe sem processo comercial",
    desc: "Sem funil definido, sem follow-up automático e oportunidades esquecidas no meio do caminho.",
  },
  {
    icon: UserX,
    title: "Tempo gasto com leads frios",
    desc: "Vendedores perdem horas respondendo quem nunca vai comprar, enquanto leads quentes esfriam sem atendimento.",
  },
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
  {
    title: "IA & Automação",
    icon: Zap,
    features: [
      "Atendimento IA no WhatsApp 24h",
      "Qualificação automática de leads",
      "Extração inteligente de dados",
      "Distribuição round-robin entre vendedores",
      "Handoff com contexto completo",
    ],
  },
  {
    title: "CRM & Pipeline",
    icon: Kanban,
    features: [
      "Funil Kanban drag-and-drop",
      "Tarefas por oportunidade",
      "Timeline completa de interações",
      "Importação de contatos (CSV/Excel)",
      "Segmentos e origens configuráveis",
    ],
  },
  {
    title: "Comunicação & Campanhas",
    icon: MessageSquare,
    features: [
      "WhatsApp bidirecional (envio + recebimento)",
      "Email marketing com templates visuais",
      "Campanhas agendadas com métricas",
      "Instagram Direct e Messenger (Plus)",
      "Anti-bloqueio com warm-up automático",
    ],
  },
];

const DIFFERENTIALS = [
  {
    icon: Brain,
    title: "IA de verdade, não chatbot",
    desc: "Qualifica leads, extrai dados estruturados, responde com contexto e encaminha ao vendedor com resumo completo da conversa.",
  },
  {
    icon: ShieldCheck,
    title: "Anti-bloqueio WhatsApp",
    desc: "Sistema de warm-up progressivo, delays aleatórios entre mensagens e controle de volume para proteger seu número.",
  },
  {
    icon: Building2,
    title: "Multi-empresa isolada",
    desc: "Cada empresa tem seu ambiente separado com dados, configurações, usuários e permissões independentes.",
  },
  {
    icon: Globe,
    title: "Tudo em um só lugar",
    desc: "CRM, WhatsApp, email, IA, campanhas e funil — sem precisar integrar 5 ferramentas diferentes.",
  },
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

const PLANS = [
  {
    name: "Demo",
    price: "Grátis",
    ideal: "Explore a plataforma sem compromisso",
    features: ["Ambiente completo de demonstração", "Dados fictícios para teste", "IA funcionando via número de teste", "Acesso imediato, sem cadastro"],
    cta: "Acessar Demo",
    ctaVariant: "outline" as const,
    href: "/demo",
    highlight: false,
  },
  {
    name: "Basic",
    price: "R$ 197/mês",
    ideal: "Para equipes que vendem por email",
    features: ["CRM completo com funil Kanban", "Tarefas e interações por oportunidade", "Email marketing com templates", "Distribuição de leads round-robin", "Importação de contatos", "Relatórios de performance"],
    cta: "Começar Trial 7 dias",
    ctaVariant: "default" as const,
    href: "/trial?plan=basic",
    highlight: false,
  },
  {
    name: "Professional",
    price: "R$ 397/mês",
    ideal: "Para quem vende pelo WhatsApp",
    features: ["Tudo do Basic", "WhatsApp bidirecional (envio + recebimento)", "IA para atendimento automático", "Campanhas de WhatsApp", "Handoff inteligente ao vendedor", "Aprovação de campanhas"],
    cta: "Começar Trial 7 dias",
    ctaVariant: "default" as const,
    href: "/trial?plan=professional",
    highlight: true,
    badge: "Mais popular",
  },
  {
    name: "Plus",
    price: "R$ 597/mês",
    ideal: "Operação omnichannel completa",
    features: ["Tudo do Professional", "Instagram Direct integrado", "Facebook Messenger integrado", "Busca de leads ativa (Apollo)", "Enriquecimento automático de dados", "Suporte prioritário"],
    cta: "Começar Trial 7 dias",
    ctaVariant: "default" as const,
    href: "/trial?plan=plus",
    highlight: false,
  },
];

const FAQ_ITEMS = [
  { q: "O que exatamente o Orbit faz?", a: "O Orbit é um CRM com IA que centraliza todo o processo comercial: captação de leads, atendimento automático por WhatsApp, qualificação inteligente, funil de vendas, campanhas por email e WhatsApp, e distribuição automática entre vendedores." },
  { q: "Preciso instalar algo?", a: "Não. O Orbit é 100% web. Basta acessar pelo navegador em qualquer dispositivo — computador, tablet ou celular." },
  { q: "A IA realmente responde sozinha?", a: "Sim. A IA atende leads pelo WhatsApp 24h, faz perguntas de qualificação, extrai dados como nome, empresa e interesse, e encaminha o lead ao vendedor com um resumo completo. Você define o tom, horário e regras." },
  { q: "Posso usar meu próprio número de WhatsApp?", a: "Sim! Nos planos Professional e Plus você conecta seu número via API oficial (Z-API). No modo Demo, a IA funciona por um número de teste." },
  { q: "O trial é realmente gratuito?", a: "Sim. São 7 dias com acesso completo a todas as funcionalidades do plano escolhido. Sem cartão de crédito e sem compromisso." },
  { q: "Consigo importar meus contatos?", a: "Sim. Importe via planilha CSV ou Excel diretamente pelo painel. O sistema faz deduplicação automática para evitar contatos duplicados." },
  { q: "Meus dados ficam seguros?", a: "Cada empresa tem um ambiente totalmente isolado com dados separados. Usamos criptografia e controle de acesso por função (admin, gerente, vendedor, visualizador)." },
  { q: "Quais canais de comunicação são suportados?", a: "WhatsApp (via API oficial), email (SMTP), Instagram Direct e Facebook Messenger. Os dois últimos estão disponíveis no plano Plus." },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [slug, setSlug] = useState("");
  const [slugError, setSlugError] = useState("");

  const handleSlugAccess = () => {
    const trimmed = slug.trim().toLowerCase();
    if (!trimmed) {
      setSlugError("Digite o slug da sua empresa.");
      return;
    }
    setSlugError("");
    navigate(`/${trimmed}/dashboard`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Hero ── */}
      <section className="pt-16 pb-24 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <img src={orbitLogo} alt="Orbit CRM" className="h-48 mx-auto" />
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight">
            <span className="gradient-text">Sua equipe comercial</span>
            <br />
            no piloto automático
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            O Orbit é o CRM com IA que atende, qualifica e distribui leads pelo WhatsApp, email e redes sociais — para que seu time só feche negócios.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
            <Badge variant="secondary" className="gap-1.5 py-1 px-3"><MessageSquare className="w-3.5 h-3.5 text-primary" /> WhatsApp + IA</Badge>
            <Badge variant="secondary" className="gap-1.5 py-1 px-3"><Kanban className="w-3.5 h-3.5 text-primary" /> CRM completo</Badge>
            <Badge variant="secondary" className="gap-1.5 py-1 px-3"><Rocket className="w-3.5 h-3.5 text-primary" /> Campanhas automáticas</Badge>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
            <Button size="lg" onClick={() => navigate("/trial")} className="gap-2 text-base px-8">
              Testar grátis por 7 dias <ArrowRight className="w-4 h-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("/demo")} className="text-base px-8">
              Ver demonstração
            </Button>
          </div>
        </div>
      </section>

      {/* ── Problema ── */}
      <section className="py-20 px-4 bg-secondary/20">
        <div className="max-w-5xl mx-auto">
          <p className="text-sm font-semibold text-primary text-center mb-2 uppercase tracking-wider">O problema</p>
          <h2 className="text-3xl font-bold text-center mb-4">
            Sua operação comercial <span className="gradient-text">está travada?</span>
          </h2>
          <p className="text-center text-muted-foreground mb-12 max-w-xl mx-auto">
            Se alguma dessas dores parece familiar, o Orbit foi feito para você.
          </p>
          <div className="grid sm:grid-cols-3 gap-6">
            {PROBLEMS.map((p, i) => (
              <Card key={i} className="glass-card border-destructive/20 hover:border-destructive/40 transition-all">
                <CardHeader className="text-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-2">
                    <p.icon className="w-6 h-6 text-destructive" />
                  </div>
                  <CardTitle className="text-base">{p.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground text-center">{p.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Solução ── */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <p className="text-sm font-semibold text-primary text-center mb-2 uppercase tracking-wider">A solução</p>
          <h2 className="text-3xl font-bold text-center mb-4">
            O Orbit centraliza tudo em <span className="gradient-text">uma plataforma com IA</span>
          </h2>
          <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
            Uma IA que trabalha 24h atendendo, qualificando e organizando seus leads — enquanto sua equipe foca em fechar negócios.
          </p>
          <div className="grid sm:grid-cols-3 gap-6">
            {SOLUTION_POINTS.map((s, i) => (
              <Card key={i} className="glass-card text-center hover:border-primary/50 transition-all">
                <CardHeader>
                  <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                    <s.icon className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle className="text-base">{s.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{s.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Como funciona ── */}
      <section id="como-funciona" className="py-20 px-4 bg-secondary/20">
        <div className="max-w-6xl mx-auto">
          <p className="text-sm font-semibold text-primary text-center mb-2 uppercase tracking-wider">Como funciona</p>
          <h2 className="text-3xl font-bold text-center mb-4">
            Do primeiro contato ao <span className="gradient-text">fechamento</span>
          </h2>
          <p className="text-center text-muted-foreground mb-12 max-w-xl mx-auto">
            5 passos para transformar leads em clientes — de forma automática.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-5">
            {STEPS.map((step, i) => (
              <Card key={i} className="glass-card text-center group hover:border-primary/50 transition-all relative">
                <CardHeader className="pb-3">
                  <div className="mx-auto w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center mb-2 text-sm font-bold">
                    {i + 1}
                  </div>
                  <CardTitle className="text-sm">{step.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">{step.desc}</p>
                </CardContent>
                {i < STEPS.length - 1 && (
                  <ChevronRight className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/40" />
                )}
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Funcionalidades ── */}
      <section id="recursos" className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <p className="text-sm font-semibold text-primary text-center mb-2 uppercase tracking-wider">Funcionalidades</p>
          <h2 className="text-3xl font-bold text-center mb-4">
            Tudo que você precisa, <span className="gradient-text">em um só lugar</span>
          </h2>
          <p className="text-center text-muted-foreground mb-12 max-w-xl mx-auto">
            Cada recurso foi pensado para eliminar etapas manuais e acelerar suas vendas.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {FEATURE_GROUPS.map((group) => (
              <Card key={group.title} className="glass-card hover:border-primary/40 transition-all">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <group.icon className="w-5 h-5 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{group.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2.5">
                    {group.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <CheckCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Diferenciais ── */}
      <section className="py-20 px-4 bg-secondary/20">
        <div className="max-w-6xl mx-auto">
          <p className="text-sm font-semibold text-primary text-center mb-2 uppercase tracking-wider">Diferenciais</p>
          <h2 className="text-3xl font-bold text-center mb-4">
            Por que o Orbit é <span className="gradient-text">diferente</span>
          </h2>
          <p className="text-center text-muted-foreground mb-12 max-w-xl mx-auto">
            Não é mais um CRM genérico. O Orbit foi construído para equipes que vendem pelo WhatsApp e precisam de IA real.
          </p>
          <div className="grid sm:grid-cols-2 gap-6">
            {DIFFERENTIALS.map((d, i) => (
              <Card key={i} className="glass-card hover:border-primary/50 transition-all">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <d.icon className="w-5 h-5 text-primary" />
                    </div>
                    <CardTitle className="text-base">{d.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{d.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Prova de valor ── */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <p className="text-sm font-semibold text-primary text-center mb-2 uppercase tracking-wider">Resultados</p>
          <h2 className="text-3xl font-bold text-center mb-12">
            O que muda quando você <span className="gradient-text">usa o Orbit</span>
          </h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {VALUE_PROOFS.map((v, i) => (
              <div key={i} className="text-center space-y-3">
                <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <v.icon className="w-7 h-7 text-primary" />
                </div>
                <h3 className="font-bold text-lg">{v.title}</h3>
                <p className="text-sm text-muted-foreground">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Para quem é ── */}
      <section className="py-20 px-4 bg-secondary/20">
        <div className="max-w-6xl mx-auto">
          <p className="text-sm font-semibold text-primary text-center mb-2 uppercase tracking-wider">Para quem é</p>
          <h2 className="text-3xl font-bold text-center mb-4">
            Ideal para quem <span className="gradient-text">vende ativamente</span>
          </h2>
          <p className="text-center text-muted-foreground mb-12 max-w-xl mx-auto">
            Se sua equipe usa WhatsApp e email para vender, o Orbit vai transformar sua operação.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {AUDIENCES.map((a, i) => (
              <Card key={i} className="glass-card hover:border-primary/40 transition-all">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <a.icon className="w-5 h-5 text-primary" />
                    </div>
                    <CardTitle className="text-base">{a.name}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{a.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Planos ── */}
      <section id="planos" className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <p className="text-sm font-semibold text-primary text-center mb-2 uppercase tracking-wider">Planos</p>
          <h2 className="text-3xl font-bold text-center mb-4">
            Escolha o plano ideal para <span className="gradient-text">sua operação</span>
          </h2>
          <p className="text-center text-muted-foreground mb-12 text-sm">
            Todos os planos incluem trial gratuito de 7 dias. Sem cartão de crédito.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {PLANS.map((plan) => (
              <Card
                key={plan.name}
                className={`glass-card flex flex-col relative ${plan.highlight ? "border-primary ring-1 ring-primary/30" : ""}`}
              >
                {plan.highlight && plan.badge && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px]">
                    <Star className="w-3 h-3 mr-1" /> {plan.badge}
                  </Badge>
                )}
                <CardHeader className="text-center">
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <div className="text-3xl font-extrabold mt-2">{plan.price}</div>
                  <CardDescription className="mt-1">{plan.ideal}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <ul className="space-y-2">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <CheckCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full"
                    variant={plan.ctaVariant}
                    onClick={() => navigate(plan.href)}
                  >
                    {plan.cta} <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Final ── */}
      <section className="py-24 px-4 bg-secondary/20">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <h2 className="text-3xl sm:text-4xl font-extrabold">
            Pronto para vender mais <span className="gradient-text">com menos esforço?</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            Comece agora e veja sua equipe vender mais em menos tempo — com IA de verdade.
          </p>
          <Button size="lg" onClick={() => navigate("/trial")} className="gap-2 text-base px-10 h-12">
            Começar agora — 7 dias grátis <ArrowRight className="w-5 h-5" />
          </Button>
          <p className="text-xs text-muted-foreground">Sem cartão de crédito. Cancele quando quiser.</p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="py-20 px-4">
        <div className="max-w-2xl mx-auto">
          <p className="text-sm font-semibold text-primary text-center mb-2 uppercase tracking-wider">Dúvidas</p>
          <h2 className="text-3xl font-bold text-center mb-10">
            Perguntas <span className="gradient-text">frequentes</span>
          </h2>
          <Accordion type="single" collapsible className="space-y-2">
            {FAQ_ITEMS.map((item, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="glass-card px-4 border rounded-xl">
                <AccordionTrigger className="text-left text-sm font-medium hover:no-underline">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ── Acesso rápido ── */}
      <section className="py-16 px-4 bg-secondary/20">
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
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border py-10 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <img src={orbitLogo} alt="Orbit" className="h-6" />
          <div className="flex gap-6">
            <span className="hover:text-foreground cursor-pointer">Termos</span>
            <span className="hover:text-foreground cursor-pointer">Privacidade</span>
            <span className="hover:text-foreground cursor-pointer">Suporte</span>
          </div>
          <span>© {new Date().getFullYear()} Fluxrow. Todos os direitos reservados.</span>
        </div>
      </footer>
    </div>
  );
}
