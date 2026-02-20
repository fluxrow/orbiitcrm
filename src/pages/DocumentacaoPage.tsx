import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { FileDown, BookOpen, Database, Layers, Shield, Globe, Cpu, Route, Gauge } from "lucide-react";

const sections = [
  { id: "visao-geral", label: "1. Visão Geral", icon: BookOpen },
  { id: "modulos", label: "2. Módulos do Sistema", icon: Layers },
  { id: "banco-de-dados", label: "3. Banco de Dados", icon: Database },
  { id: "integracoes", label: "4. Integrações", icon: Globe },
  { id: "edge-functions", label: "5. Edge Functions", icon: Cpu },
  { id: "autenticacao", label: "6. Autenticação e Acesso", icon: Shield },
  { id: "rotas", label: "7. Rotas da Aplicação", icon: Route },
  { id: "indices", label: "8. Índices e Otimizações", icon: Gauge },
];

export default function DocumentacaoPage() {
  const [activeSection, setActiveSection] = useState("visao-geral");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0.1 }
    );
    sections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          .doc-header, .doc-toc, .no-print { display: none !important; }
          .doc-main { margin-left: 0 !important; padding: 0 !important; }
          .doc-section { page-break-inside: avoid; break-inside: avoid; margin-bottom: 1rem; }
          body, html { background: white !important; color: black !important; font-size: 11pt; }
          * { color: black !important; border-color: #ccc !important; background: white !important; }
          h1,h2,h3 { page-break-after: avoid; }
          table { font-size: 10pt; }
        }
      `}</style>

      {/* Fixed Header */}
      <header className="doc-header sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur px-6 py-4 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Documentação do Sistema ORBIT</h1>
          <Badge variant="secondary">v1.0</Badge>
        </div>
        <Button onClick={() => window.print()} className="no-print gap-2">
          <FileDown className="h-4 w-4" /> Exportar PDF
        </Button>
      </header>

      <div className="flex min-h-screen">
        {/* TOC Sidebar */}
        <aside className="doc-toc hidden lg:block w-64 shrink-0 border-r border-border sticky top-[65px] h-[calc(100vh-65px)] print:hidden">
          <ScrollArea className="h-full py-6 px-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-4 tracking-wider">Índice</p>
            <nav className="flex flex-col gap-1">
              {sections.map(({ id, label, icon: Icon }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }); }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                    activeSection === id
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </a>
              ))}
            </nav>
          </ScrollArea>
        </aside>

        {/* Main Content */}
        <main className="doc-main flex-1 max-w-4xl mx-auto px-6 py-10 space-y-12">

          {/* 1. Visão Geral */}
          <section id="visao-geral" className="doc-section space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" /> 1. Visão Geral</h2>
            <Separator />
            <Card><CardContent className="pt-6 space-y-4">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Descrição</h3>
                <p className="text-muted-foreground leading-relaxed">O ORBIT é uma plataforma multi-tenant e white-label de prospecção B2B e CRM. Combina dois módulos principais — <strong>Orbit CRM</strong> (gestão de prospects, conversas, funil de vendas, campanhas e IA) e <strong>Prospecting Engine (PE)</strong> (gestão de clientes, contatos, oportunidades e tarefas) — ambos isolados por tenant (empresa_id / organization_id).</p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Stack Tecnológico</h3>
                <div className="flex flex-wrap gap-2">
                  {["React 18", "Vite", "TypeScript", "Tailwind CSS", "shadcn/ui", "Lovable Cloud", "Edge Functions (Deno)", "TanStack Query"].map(t => (
                    <Badge key={t} variant="outline">{t}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Arquitetura</h3>
                <p className="text-muted-foreground leading-relaxed">Frontend SPA (Single Page Application) com backend serverless. Autenticação, banco de dados PostgreSQL, storage e edge functions gerenciados via Lovable Cloud. Toda comunicação frontend→backend é feita via SDK client-side e chamadas a Edge Functions.</p>
              </div>
            </CardContent></Card>
          </section>

          {/* 2. Módulos */}
          <section id="modulos" className="doc-section space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><Layers className="h-5 w-5 text-primary" /> 2. Módulos do Sistema</h2>
            <Separator />

            <Card><CardHeader><CardTitle className="text-lg">Orbit CRM</CardTitle></CardHeader><CardContent>
              <Table><TableHeader><TableRow><TableHead>Módulo</TableHead><TableHead>Descrição</TableHead></TableRow></TableHeader><TableBody>
                {[
                  ["Prospects", "Cadastro e gestão de prospects com campos de qualificação, tags e score"],
                  ["Conversas", "Chat multicanal (WhatsApp, Instagram, Email) com suporte a IA e human takeover"],
                  ["Funil de Vendas", "Pipeline visual (kanban) com etapas configuráveis e deals"],
                  ["Campanhas", "Disparos em massa por WhatsApp ou Email com aprovação obrigatória"],
                  ["Templates", "Modelos de mensagem por canal com variáveis dinâmicas"],
                  ["Lead Finder", "Busca de leads via Apollo.io com enriquecimento de dados"],
                  ["Analytics", "Dashboard com métricas de conversão, atividades e performance"],
                ].map(([m, d]) => <TableRow key={m}><TableCell className="font-medium">{m}</TableCell><TableCell className="text-muted-foreground">{d}</TableCell></TableRow>)}
              </TableBody></Table>
            </CardContent></Card>

            <Card><CardHeader><CardTitle className="text-lg">Prospecting Engine (PE)</CardTitle></CardHeader><CardContent>
              <Table><TableHeader><TableRow><TableHead>Módulo</TableHead><TableHead>Descrição</TableHead></TableRow></TableHeader><TableBody>
                {[
                  ["Organizations", "Gestão multi-tenant de organizações"],
                  ["Users & Roles", "Usuários com roles dinâmicos por organização via pe_roles"],
                  ["Clientes", "Empresas prospectadas com CNPJ, segmento, porte e domínio"],
                  ["Contatos", "Pessoas vinculadas a clientes com cargo, decisor e nível de influência"],
                  ["Segmentos", "Classificação de clientes por setor de atuação"],
                  ["Origens", "Rastreamento de origem dos clientes (lista, campanha, etc.)"],
                  ["Produtos", "Catálogo de produtos/serviços para cotações"],
                  ["Funil de Etapas", "Etapas configuráveis do processo de vendas"],
                  ["Oportunidades", "Negócios vinculados a clientes com valor, destino e probabilidade"],
                  ["Tarefas", "Follow-ups e atividades com prazo e prioridade"],
                  ["Interações", "Registro de contatos (reunião, ligação, email) com histórico"],
                ].map(([m, d]) => <TableRow key={m}><TableCell className="font-medium">{m}</TableCell><TableCell className="text-muted-foreground">{d}</TableCell></TableRow>)}
              </TableBody></Table>
            </CardContent></Card>

            <Card><CardHeader><CardTitle className="text-lg">Super Admin</CardTitle></CardHeader><CardContent>
              <p className="text-muted-foreground">Painel administrativo global para gestão de empresas (tenants), usuários globais e configurações do sistema. Acesso restrito ao role <Badge>super_admin</Badge>.</p>
            </CardContent></Card>
          </section>

          {/* 3. Banco de Dados */}
          <section id="banco-de-dados" className="doc-section space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><Database className="h-5 w-5 text-primary" /> 3. Estrutura do Banco de Dados</h2>
            <Separator />

            <Card><CardHeader><CardTitle className="text-lg">Tabelas PE (multi-tenant por organization_id)</CardTitle></CardHeader><CardContent>
              <Table><TableHeader><TableRow><TableHead>Tabela</TableHead><TableHead>Descrição</TableHead><TableHead>Tenant Key</TableHead><TableHead>RLS</TableHead></TableRow></TableHeader><TableBody>
                {[
                  ["organizations", "Organizações/tenants do PE", "id (self)", "✅"],
                  ["pe_users", "Usuários vinculados a organizações", "organization_id", "✅"],
                  ["pe_roles", "Roles dinâmicos por organização", "organization_id", "✅"],
                  ["pe_invitations", "Convites pendentes para usuários", "organization_id", "✅"],
                  ["pe_audit_log", "Log de auditoria do PE", "organization_id", "✅"],
                  ["clientes", "Empresas prospectadas", "organization_id", "✅"],
                  ["contatos", "Contatos vinculados a clientes", "organization_id", "✅"],
                  ["origens", "Fontes de origem de clientes", "organization_id", "✅"],
                  ["cliente_origem", "Relação N:N cliente↔origem", "organization_id", "✅"],
                  ["segmentos", "Segmentos de mercado", "organization_id", "✅"],
                  ["funil_etapas", "Etapas do funil de vendas", "organization_id", "✅"],
                  ["oportunidades", "Negócios/oportunidades", "organization_id", "✅"],
                  ["oportunidade_itens", "Itens/produtos de uma oportunidade", "organization_id", "✅"],
                  ["interacoes", "Registro de interações com clientes", "organization_id", "✅"],
                  ["tarefas", "Tarefas e follow-ups", "organization_id", "✅"],
                  ["produtos", "Catálogo de produtos/serviços", "organization_id", "✅"],
                ].map(([t, d, k, r]) => <TableRow key={t}><TableCell className="font-mono text-xs">{t}</TableCell><TableCell className="text-muted-foreground">{d}</TableCell><TableCell><Badge variant="outline">{k}</Badge></TableCell><TableCell>{r}</TableCell></TableRow>)}
              </TableBody></Table>
            </CardContent></Card>

            <Card><CardHeader><CardTitle className="text-lg">Tabelas Orbit (multi-tenant por empresa_id)</CardTitle></CardHeader><CardContent>
              <Table><TableHeader><TableRow><TableHead>Tabela</TableHead><TableHead>Descrição</TableHead><TableHead>RLS</TableHead></TableRow></TableHeader><TableBody>
                {[
                  ["orbit_empresas", "Empresas/tenants do Orbit CRM", "✅"],
                  ["profiles", "Perfis de usuários (auth-linked)", "✅"],
                  ["user_roles", "Roles legacy (super_admin, admin, vendedor)", "✅"],
                  ["orbit_prospects", "Prospects/leads do CRM", "✅"],
                  ["orbit_conversas", "Conversas multicanal", "✅"],
                  ["orbit_mensagens", "Mensagens individuais por conversa", "✅"],
                  ["orbit_deals", "Deals/negócios no funil", "✅"],
                  ["orbit_pipeline_stages", "Etapas do pipeline de vendas", "✅"],
                  ["orbit_activities", "Atividades (ligações, reuniões, etc.)", "✅"],
                  ["orbit_campaigns", "Campanhas de marketing", "✅"],
                  ["orbit_campaign_recipients", "Destinatários de campanhas", "✅"],
                  ["orbit_campaign_approvals", "Aprovações de campanhas", "✅"],
                  ["orbit_message_templates", "Templates de mensagem por canal", "✅"],
                  ["orbit_lead_sources", "Fontes de leads (Apollo, manual)", "✅"],
                  ["orbit_lead_searches", "Buscas salvas no Lead Finder", "✅"],
                  ["orbit_leads", "Leads encontrados nas buscas", "✅"],
                  ["orbit_icps", "Perfis de Cliente Ideal", "✅"],
                  ["orbit_enrichment_jobs", "Jobs de enriquecimento em lote", "✅"],
                  ["orbit_enrichment_queue", "Fila de enriquecimento por lead", "✅"],
                  ["orbit_enrichment_credits", "Créditos diários de enriquecimento", "✅"],
                  ["orbit_enrichment_policy", "Políticas de enriquecimento", "✅"],
                  ["orbit_ai_config", "Configuração do agente IA", "✅"],
                  ["orbit_zapi_config", "Configuração Z-API (WhatsApp)", "✅"],
                  ["orbit_meta_config", "Configuração Meta (Instagram/FB)", "✅"],
                  ["orbit_resend_config", "Configuração Resend (Email)", "✅"],
                  ["orbit_distribuicao_config", "Config de distribuição round-robin", "✅"],
                  ["orbit_integrations_config", "Configurações genéricas de integrações", "✅"],
                  ["orbit_transferencias", "Transferências de prospects entre vendedores", "✅"],
                  ["orbit_import_history", "Histórico de importações CSV", "✅"],
                  ["orbit_whatsapp_daily_limits", "Limites diários de envio WhatsApp", "✅"],
                  ["orbit_audit_log", "Log de auditoria do Orbit", "✅"],
                ].map(([t, d, r]) => <TableRow key={t}><TableCell className="font-mono text-xs">{t}</TableCell><TableCell className="text-muted-foreground">{d}</TableCell><TableCell>{r}</TableCell></TableRow>)}
              </TableBody></Table>
            </CardContent></Card>
          </section>

          {/* 4. Integrações */}
          <section id="integracoes" className="doc-section space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><Globe className="h-5 w-5 text-primary" /> 4. Integrações</h2>
            <Separator />
            {[
              { name: "WhatsApp (Z-API)", desc: "Envio e recebimento de mensagens via Z-API. Configuração por tenant em orbit_zapi_config. Webhooks recebidos via orbit-webhook. Suporte a templates, mídia e status de entrega.", tables: ["orbit_zapi_config", "orbit_conversas", "orbit_mensagens", "orbit_whatsapp_daily_limits"] },
              { name: "Email (Resend)", desc: "Envio de emails transacionais e campanhas via Resend. Configuração em orbit_resend_config. Edge function orbit-send-email para envio individual e send-orbit-campaign para disparos em massa.", tables: ["orbit_resend_config", "orbit_campaigns", "orbit_campaign_recipients"] },
              { name: "Meta (Instagram/Facebook)", desc: "Recebimento de mensagens do Instagram e Facebook via webhooks Meta. Configuração em orbit_meta_config. Mensagens processadas via orbit-meta-webhook e enviadas via send-orbit-meta-message.", tables: ["orbit_meta_config", "orbit_conversas", "orbit_mensagens"] },
              { name: "Lead Finder (Apollo.io)", desc: "Busca de leads por cargo, empresa, localização e setor via API Apollo.io. Resultados armazenados em orbit_leads com enriquecimento via fila assíncrona.", tables: ["orbit_lead_sources", "orbit_lead_searches", "orbit_leads", "orbit_enrichment_queue"] },
              { name: "IA (Lovable AI)", desc: "Agente de IA para atendimento automático via WhatsApp. Configuração de prompts, tom de conversa e horários em orbit_ai_config. Qualificação automática de leads e sugestões de resposta via orbit-ai-agent e orbit-ai-suggest.", tables: ["orbit_ai_config"] },
            ].map(i => (
              <Card key={i.name}><CardHeader><CardTitle className="text-lg">{i.name}</CardTitle></CardHeader><CardContent className="space-y-3">
                <p className="text-muted-foreground leading-relaxed">{i.desc}</p>
                <div className="flex flex-wrap gap-2">{i.tables.map(t => <Badge key={t} variant="outline" className="font-mono text-xs">{t}</Badge>)}</div>
              </CardContent></Card>
            ))}
          </section>

          {/* 5. Edge Functions */}
          <section id="edge-functions" className="doc-section space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><Cpu className="h-5 w-5 text-primary" /> 5. Edge Functions (Backend)</h2>
            <Separator />
            <Card><CardContent className="pt-6">
              <Table><TableHeader><TableRow><TableHead>Função</TableHead><TableHead>Descrição</TableHead><TableHead>Categoria</TableHead></TableRow></TableHeader><TableBody>
                {[
                  ["accept-invitation", "Aceita convite de organização PE e vincula o usuário", "Auth"],
                  ["add-empresa-user", "Adiciona usuário a uma empresa Orbit", "Auth"],
                  ["create-empresa", "Cria nova empresa/tenant no Orbit", "Admin"],
                  ["create-master-user", "Cria usuário master (super_admin)", "Admin"],
                  ["invite-org-user", "Envia convite para nova organização PE", "Auth"],
                  ["orbit-ai-agent", "Processa mensagens com agente IA e gera respostas", "IA"],
                  ["orbit-ai-suggest", "Sugere respostas baseadas no contexto da conversa", "IA"],
                  ["orbit-meta-webhook", "Recebe webhooks do Meta (Instagram/Facebook)", "Webhook"],
                  ["orbit-send-message", "Envia mensagem individual via WhatsApp (Z-API)", "Messaging"],
                  ["orbit-send-email", "Envia email individual via Resend", "Messaging"],
                  ["send-orbit-meta-message", "Envia mensagem via Meta (Instagram/Facebook)", "Messaging"],
                  ["orbit-search-leads", "Busca leads na API Apollo.io", "Lead Finder"],
                  ["orbit-webhook", "Recebe webhooks do Z-API (WhatsApp)", "Webhook"],
                  ["request-campaign-approval", "Solicita aprovação de campanha ao admin", "Campaigns"],
                  ["send-orbit-campaign", "Executa disparo de campanha aprovada", "Campaigns"],
                  ["send-vendedor-notification", "Notifica vendedor sobre nova atribuição", "Notifications"],
                ].map(([f, d, c]) => <TableRow key={f}><TableCell className="font-mono text-xs">{f}</TableCell><TableCell className="text-muted-foreground">{d}</TableCell><TableCell><Badge variant="secondary">{c}</Badge></TableCell></TableRow>)}
              </TableBody></Table>
            </CardContent></Card>
          </section>

          {/* 6. Autenticação */}
          <section id="autenticacao" className="doc-section space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><Shield className="h-5 w-5 text-primary" /> 6. Autenticação e Controle de Acesso</h2>
            <Separator />

            <Card><CardHeader><CardTitle className="text-lg">Modelo Dual de Roles</CardTitle></CardHeader><CardContent className="space-y-4">
              <div>
                <h4 className="font-semibold text-foreground mb-2">Orbit (Legacy)</h4>
                <p className="text-muted-foreground mb-2">Tabela <code className="text-xs bg-secondary px-1.5 py-0.5 rounded">user_roles</code> com roles fixos:</p>
                <div className="flex gap-2 flex-wrap">
                  {["super_admin", "admin", "vendedor", "visualizador"].map(r => <Badge key={r} variant="outline">{r}</Badge>)}
                </div>
              </div>
              <Separator />
              <div>
                <h4 className="font-semibold text-foreground mb-2">Prospecting Engine</h4>
                <p className="text-muted-foreground mb-2">Tabela <code className="text-xs bg-secondary px-1.5 py-0.5 rounded">pe_users</code> com roles dinâmicos via <code className="text-xs bg-secondary px-1.5 py-0.5 rounded">pe_roles</code>. Cada organização define seus próprios roles e permissões.</p>
              </div>
            </CardContent></Card>

            <Card><CardHeader><CardTitle className="text-lg">Funções Helper (Database)</CardTitle></CardHeader><CardContent>
              <Table><TableHeader><TableRow><TableHead>Função</TableHead><TableHead>Retorno</TableHead><TableHead>Uso</TableHead></TableRow></TableHeader><TableBody>
                {[
                  ["get_user_empresa_id()", "UUID", "Retorna empresa_id do usuário autenticado (Orbit)"],
                  ["has_role(role)", "BOOLEAN", "Verifica se o usuário possui um role específico (Orbit)"],
                  ["pe_get_user_org_id()", "UUID", "Retorna organization_id do usuário (PE)"],
                  ["pe_is_super_admin()", "BOOLEAN", "Verifica se o usuário é super_admin global"],
                  ["pe_user_can_write(org_id)", "BOOLEAN", "Verifica permissão de escrita na organização"],
                  ["pe_user_is_org_admin(org_id)", "BOOLEAN", "Verifica se é admin da organização"],
                ].map(([f, r, u]) => <TableRow key={f}><TableCell className="font-mono text-xs">{f}</TableCell><TableCell><Badge variant="outline">{r}</Badge></TableCell><TableCell className="text-muted-foreground">{u}</TableCell></TableRow>)}
              </TableBody></Table>
            </CardContent></Card>

            <Card><CardHeader><CardTitle className="text-lg">Row Level Security (RLS)</CardTitle></CardHeader><CardContent>
              <p className="text-muted-foreground leading-relaxed">Todas as tabelas possuem RLS habilitado. Policies garantem isolamento multi-tenant: usuários só acessam dados da sua empresa_id (Orbit) ou organization_id (PE). Funções helper são usadas nas policies para resolver o tenant do usuário autenticado.</p>
            </CardContent></Card>
          </section>

          {/* 7. Rotas */}
          <section id="rotas" className="doc-section space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><Route className="h-5 w-5 text-primary" /> 7. Rotas da Aplicação</h2>
            <Separator />
            <Card><CardContent className="pt-6">
              <Table><TableHeader><TableRow><TableHead>Rota</TableHead><TableHead>Descrição</TableHead><TableHead>Proteção</TableHead></TableRow></TableHeader><TableBody>
                {[
                  ["/auth", "Login e cadastro", "Pública"],
                  ["/setup", "Configuração inicial", "Pública"],
                  ["/invite/:token", "Aceitar convite", "Pública"],
                  ["/documentacao", "Documentação do sistema", "Pública"],
                  ["/orbit", "Dashboard do CRM", "Autenticado"],
                  ["/orbit/prospects", "Lista de prospects", "Autenticado"],
                  ["/orbit/conversas", "Chat multicanal", "Autenticado"],
                  ["/orbit/funil", "Pipeline de vendas", "Autenticado"],
                  ["/orbit/campanhas", "Gestão de campanhas", "Autenticado"],
                  ["/orbit/templates", "Templates de mensagem", "Autenticado"],
                  ["/orbit/lead-finder", "Busca de leads", "Autenticado"],
                  ["/orbit/analytics", "Relatórios e métricas", "Autenticado"],
                  ["/orbit/config", "Configurações", "Autenticado"],
                  ["/orbit/usuarios", "Gestão de usuários da empresa", "Autenticado"],
                  ["/pe-admin/*", "Admin do Prospecting Engine", "Super Admin"],
                  ["/super-admin/*", "Admin legado", "Super Admin"],
                ].map(([r, d, p]) => <TableRow key={r}><TableCell className="font-mono text-xs">{r}</TableCell><TableCell className="text-muted-foreground">{d}</TableCell><TableCell><Badge variant={p === "Pública" ? "outline" : p === "Super Admin" ? "destructive" : "secondary"}>{p}</Badge></TableCell></TableRow>)}
              </TableBody></Table>
            </CardContent></Card>
          </section>

          {/* 8. Índices */}
          <section id="indices" className="doc-section space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><Gauge className="h-5 w-5 text-primary" /> 8. Índices e Otimizações</h2>
            <Separator />
            <Card><CardContent className="pt-6 space-y-4">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Índices Compostos</h3>
                <Table><TableHeader><TableRow><TableHead>Índice</TableHead><TableHead>Tabela</TableHead><TableHead>Colunas</TableHead></TableRow></TableHeader><TableBody>
                  <TableRow>
                    <TableCell className="font-mono text-xs">idx_tarefas_org_status_due</TableCell>
                    <TableCell className="font-mono text-xs">tarefas</TableCell>
                    <TableCell className="text-muted-foreground">organization_id, status, due_date</TableCell>
                  </TableRow>
                </TableBody></Table>
              </div>
              <Separator />
              <div>
                <h3 className="font-semibold text-foreground mb-2">Otimizações Implementadas</h3>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li>Paginação server-side em interações (limite configurável)</li>
                  <li>Normalização de razão social para deduplicação de clientes</li>
                  <li>Normalização de email para deduplicação de contatos</li>
                  <li>Créditos de enriquecimento com controle diário</li>
                  <li>Limites diários de envio WhatsApp por empresa</li>
                  <li>Fila assíncrona para enriquecimento em lote</li>
                </ul>
              </div>
            </CardContent></Card>
          </section>

          {/* Footer */}
          <div className="text-center text-sm text-muted-foreground pt-8 pb-16 no-print">
            <Separator className="mb-8" />
            Documentação gerada automaticamente — ORBIT CRM v1.0
          </div>
        </main>
      </div>
    </>
  );
}
