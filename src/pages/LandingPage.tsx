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
  Shield, ChevronRight, Menu, X, Star, Instagram, Facebook
} from "lucide-react";
import orbitLogo from "@/assets/orbit-logo.png";

const NAV_ITEMS = [
  { label: "Produto", href: "#como-funciona" },
  { label: "Recursos", href: "#recursos" },
  { label: "Planos", href: "#planos" },
  { label: "FAQ", href: "#faq" },
];

const STEPS = [
  { icon: Target, title: "Capte leads", desc: "Prospects chegam via WhatsApp, formulários, importação ou busca ativa." },
  { icon: Zap, title: "IA qualifica", desc: "Atendimento automatizado classifica e encaminha para o vendedor certo." },
  { icon: Kanban, title: "Organize no funil", desc: "Pipeline visual Kanban com etapas personalizáveis e tarefas." },
  { icon: Rocket, title: "Campanhas e follow-up", desc: "Dispare campanhas por email e WhatsApp com templates prontos." },
];

const FEATURES = [
  { icon: Users, title: "CRM Completo", desc: "Clientes, contatos, segmentos e origens em um só lugar.", plus: false },
  { icon: Kanban, title: "Funil de Vendas", desc: "Pipeline Kanban com drag-and-drop e automação de status.", plus: false },
  { icon: ListChecks, title: "Tarefas", desc: "Priorização, vencimento e acompanhamento por oportunidade.", plus: false },
  { icon: Clock, title: "Interações", desc: "Timeline completa de cada negociação com histórico.", plus: false },
  { icon: Mail, title: "Email Marketing", desc: "Campanhas com templates, agendamento e métricas.", plus: false },
  { icon: MessageSquare, title: "WhatsApp + IA", desc: "Conversas em tempo real com atendimento inteligente por IA.", plus: false },
  { icon: Shield, title: "Distribuição de Leads", desc: "Round-robin automático entre vendedores da equipe.", plus: false },
  { icon: BarChart3, title: "Relatórios", desc: "Dashboards com métricas de vendas e performance.", plus: false },
  { icon: Instagram, title: "Instagram & Facebook", desc: "Mensagens do IG Direct e Messenger integrados.", plus: true },
  { icon: Search, title: "Busca de Leads", desc: "Prospecção ativa via APIs externas (ex: Apollo).", plus: true },
];

const PLANS = [
  {
    name: "Demo",
    price: "Grátis",
    ideal: "Conhecer a plataforma sem compromisso",
    features: ["Ambiente de demonstração", "Dados fictícios para teste", "IA via número de teste", "Sem envio real de mensagens"],
    cta: "Acessar Demo",
    ctaVariant: "outline" as const,
    href: "/demo",
    highlight: false,
  },
  {
    name: "Basic",
    price: "R$ XX/mês",
    ideal: "Pequenas equipes que usam email",
    features: ["CRM completo", "Funil Kanban", "Tarefas e interações", "Email marketing", "Distribuição de leads", "Relatórios básicos"],
    cta: "Começar Trial 7 dias",
    ctaVariant: "default" as const,
    href: "/trial?plan=basic",
    highlight: false,
  },
  {
    name: "Professional",
    price: "R$ XX/mês",
    ideal: "Equipes que atendem via WhatsApp",
    features: ["Tudo do Basic", "WhatsApp (envio + recebimento)", "IA para atendimento", "Campanhas WhatsApp", "Aprovação de campanhas"],
    cta: "Começar Trial 7 dias",
    ctaVariant: "default" as const,
    href: "/trial?plan=professional",
    highlight: true,
    badge: "Mais popular",
  },
  {
    name: "Plus",
    price: "R$ XX/mês",
    ideal: "Operações omnichannel completas",
    features: ["Tudo do Professional", "Instagram Direct", "Facebook Messenger", "Busca de leads (Apollo)", "Enriquecimento de dados", "Suporte prioritário"],
    cta: "Começar Trial 7 dias",
    ctaVariant: "default" as const,
    href: "/trial?plan=plus",
    highlight: false,
  },
];

const FAQ_ITEMS = [
  { q: "O que é o Orbit?", a: "O Orbit é um CRM com automação omnichannel e inteligência artificial. Ele centraliza leads, conversas (WhatsApp, email, redes sociais), funil de vendas, tarefas e campanhas em uma única plataforma." },
  { q: "Preciso instalar algo?", a: "Não. O Orbit é 100% web (SaaS). Basta acessar pelo navegador em qualquer dispositivo. Não precisa de instalação nem download." },
  { q: "Posso usar meu número de WhatsApp?", a: "Sim! Nos planos Professional e Plus você conecta seu número via API oficial. No plano Demo, a IA responde por um número de teste." },
  { q: "O trial dura quanto tempo?", a: "O período de teste gratuito dura 7 dias corridos, com acesso completo a todas as funcionalidades do plano escolhido." },
  { q: "Consigo migrar meus contatos?", a: "Sim. Você pode importar contatos via planilha (CSV/Excel) diretamente pelo painel. A plataforma faz deduplicação automática." },
  { q: "A IA responde sozinha?", a: "Sim, quando ativado o modo automático. A IA qualifica leads, responde perguntas frequentes e encaminha para um humano quando necessário. Você controla o tom, horário e regras." },
  { q: "Quais integrações existem hoje?", a: "WhatsApp (via Z-API), email (SMTP), e busca de leads (Apollo). Instagram e Facebook Messenger estão disponíveis no plano Plus. Novas integrações são adicionadas regularmente." },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [slug, setSlug] = useState("");
  const [slugError, setSlugError] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const scrollTo = (id: string) => {
    setMobileMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

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
      {/* ── Header ── */}
      <header className="fixed top-0 inset-x-0 z-50 glass-card border-t-0 rounded-none border-x-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 h-16">
          <img src={orbitLogo} alt="Orbit" className="h-8" />

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.href}
                onClick={() => scrollTo(item.href.slice(1))}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/demo")}>
              Acessar Demo
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/auth")}>
              Entrar
            </Button>
            <Button size="sm" onClick={() => navigate("/trial")}>
              Começar Trial
            </Button>
          </div>

          {/* Mobile hamburger */}
          <button className="md:hidden text-foreground" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden glass-card border-t border-border px-4 pb-4 space-y-3">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.href}
                onClick={() => scrollTo(item.href.slice(1))}
                className="block w-full text-left text-sm text-muted-foreground py-2"
              >
                {item.label}
              </button>
            ))}
            <div className="flex flex-col gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => navigate("/demo")}>Acessar Demo</Button>
              <Button variant="outline" size="sm" onClick={() => navigate("/auth")}>Entrar</Button>
              <Button size="sm" onClick={() => navigate("/trial")}>Começar Trial</Button>
            </div>
          </div>
        )}
      </header>

      {/* ── Hero ── */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <img src={orbitLogo} alt="Orbit" className="h-28 mx-auto" />
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight">
            <span className="gradient-text">CRM + Automação Omnichannel</span>
            <br />
            com IA que trabalha por você
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Capte leads, converse via WhatsApp e email, qualifique com inteligência artificial, organize no funil e distribua para seus vendedores — tudo em uma plataforma.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-2"><Kanban className="w-4 h-4 text-primary" /> Funil e tarefas (vendas)</span>
            <span className="flex items-center gap-2"><Mail className="w-4 h-4 text-primary" /> Campanhas e automações</span>
            <span className="flex items-center gap-2"><MessageSquare className="w-4 h-4 text-primary" /> Atendimento IA (WhatsApp+)</span>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
            <Button size="lg" onClick={() => navigate("/trial")} className="gap-2">
              Começar Trial 7 dias <ArrowRight className="w-4 h-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("/demo")}>
              Acessar Demo
            </Button>
          </div>
        </div>
      </section>

      {/* ── Como funciona ── */}
      <section id="como-funciona" className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            Como <span className="gradient-text">funciona</span>
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {STEPS.map((step, i) => (
              <Card key={i} className="glass-card text-center group hover:border-primary/50 transition-all">
                <CardHeader>
                  <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2 group-hover:bg-primary/20 transition-colors">
                    <step.icon className="w-6 h-6 text-primary" />
                  </div>
                  <span className="text-xs text-muted-foreground">Passo {i + 1}</span>
                  <CardTitle className="text-lg">{step.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{step.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Recursos ── */}
      <section id="recursos" className="py-20 px-4 bg-secondary/20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">
            Tudo que você precisa, <span className="gradient-text">em um só lugar</span>
          </h2>
          <p className="text-center text-muted-foreground mb-12 max-w-xl mx-auto">
            Do primeiro contato ao fechamento, o Orbit cobre cada etapa do seu processo comercial.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {FEATURES.map((f, i) => (
              <Card key={i} className="glass-card hover:border-primary/40 transition-all">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <f.icon className="w-5 h-5 text-primary" />
                    </div>
                    <CardTitle className="text-base">{f.title}</CardTitle>
                    {f.plus && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Plus</Badge>}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Planos ── */}
      <section id="planos" className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">
            Planos e <span className="gradient-text">preços</span>
          </h2>
          <p className="text-center text-muted-foreground mb-12 text-sm">
            Valores podem variar conforme volume de envios e integrações.
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

      {/* ── FAQ ── */}
      <section id="faq" className="py-20 px-4">
        <div className="max-w-2xl mx-auto">
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
