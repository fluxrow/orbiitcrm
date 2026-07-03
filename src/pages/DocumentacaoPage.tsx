import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  FileDown, BookOpen, Building2, Plug, BrainCircuit, FlaskConical,
  GitBranch, Users2, Activity, Wrench, Cpu, Route, ListTree, Rocket, ShieldCheck,
} from "lucide-react";

const sections = [
  { id: "intro", label: "Introdução", icon: BookOpen },
  { id: "core-flow", label: "★ Orbit Core Flow", icon: ShieldCheck },
  { id: "setup-guide", label: "★ Guia de Configuração (5 min)", icon: Rocket },
  { id: "tenant", label: "1. Provisionamento do Tenant", icon: Building2 },
  { id: "integracoes", label: "2. Integrações Core", icon: Plug },
  { id: "ia", label: "3. Cérebro da IA", icon: BrainCircuit },
  { id: "sandbox", label: "4. Agent Sandbox", icon: FlaskConical },
  { id: "crm", label: "5. Máquina de CRM e Funil", icon: GitBranch },
  { id: "handoff", label: "6. Handoff e Conversas", icon: Users2 },
  { id: "observabilidade", label: "7. Observabilidade e Logs", icon: Activity },
  { id: "helpers", label: "8. Helpers Recentes", icon: Wrench },
  { id: "edge-functions", label: "A. Edge Functions", icon: Cpu },
  { id: "rotas", label: "B. Rotas Frontend", icon: Route },
  { id: "rpcs", label: "C. RPCs e Triggers", icon: ListTree },
];

type Row = (string | React.ReactNode)[];

function EntityTable({ headers, rows }: { headers: string[]; rows: Row[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>{headers.map(h => <TableHead key={h}>{h}</TableHead>)}</TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i}>
            {r.map((c, j) => (
              <TableCell key={j} className={j === 0 ? "font-mono text-xs whitespace-nowrap" : "text-muted-foreground"}>
                {c}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Step({ title, action, children }: { title: string; action: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground leading-relaxed"><strong className="text-foreground">Ação:</strong> {action}</p>
        <div className="space-y-2">{children}</div>
      </CardContent>
    </Card>
  );
}

export default function DocumentacaoPage() {
  const [activeSection, setActiveSection] = useState("intro");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
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

      <header className="doc-header sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur px-6 py-4 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Manual Mestre de Implementação — Orbit CRM</h1>
          <Badge variant="secondary">Source of Truth</Badge>
        </div>
        <Button onClick={() => window.print()} className="no-print gap-2">
          <FileDown className="h-4 w-4" /> Exportar PDF
        </Button>
      </header>

      <div className="flex min-h-screen">
        <aside className="doc-toc hidden lg:block w-72 shrink-0 border-r border-border sticky top-[65px] h-[calc(100vh-65px)] print:hidden">
          <ScrollArea className="h-full py-6 px-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-4 tracking-wider">Índice cronológico</p>
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
                  <span>{label}</span>
                </a>
              ))}
            </nav>
          </ScrollArea>
        </aside>

        <main className="doc-main flex-1 max-w-5xl mx-auto px-6 py-10 space-y-14">

          {/* Introdução */}
          <section id="intro" className="doc-section space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" /> Introdução</h2>
            <Separator />
            <Card><CardContent className="pt-6 space-y-3 text-muted-foreground leading-relaxed">
              <p><strong className="text-foreground">Source of Truth</strong> para configurar uma conta nova do zero até o pleno funcionamento. Cada etapa lista a <strong className="text-foreground">Ação de negócio</strong> + as <strong className="text-foreground">Entidades técnicas</strong> envolvidas (tabela, RPC, edge function, rota, componente).</p>
              <p>Ordem cronológica de onboarding — siga de cima para baixo. Toda nova feature ou tabela deve ser incorporada às seções abaixo na ordem em que aparece no fluxo.</p>
            </CardContent></Card>
          </section>

          {/* 1. Tenant */}
          <section id="tenant" className="doc-section space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /> 1. Provisionamento do Tenant</h2>
            <Separator />

            <Step title="1.1 Criar a empresa (tenant raiz)" action="Provisionar nova empresa no Orbit, com slug único de acesso (/{slug}/...).">
              <EntityTable headers={["Entidade", "Detalhes"]} rows={[
                ["orbit_empresas", "Tabela — id, nome, slug, slug_created_at, ativo, plano, max_usuarios, data_expiracao, cnpj, email_contato, telefone"],
                ["normalize_slug(p)", "RPC — lowercase, sem acentos, hífens"],
                ["generate_unique_slug(p_nome)", "RPC — gera slug único contra orbit_empresas.slug"],
                ["get_empresa_by_slug(p_slug)", "RPC — resolução por slug nas rotas; bloqueia 'demo'"],
                ["create-empresa", "Edge Function — provisiona empresa + admin + email de boas-vindas"],
              ]} />
            </Step>

            <Step title="1.2 Vincular plano SaaS" action="Associar empresa a um plano (Stripe) e definir limites/expiração.">
              <EntityTable headers={["Entidade", "Detalhes"]} rows={[
                ["saas_empresa", "Tabela — stripe_customer_id, stripe_subscription_id, stripe_status, plan_code, trial_ends_at"],
                ["saas_plans", "Catálogo — code, name, max_usuarios, features jsonb, stripe_price_id"],
                ["saas_usage_monthly", "Uso mensal por empresa"],
                ["Edge Functions Stripe", "stripe-checkout, stripe-portal, stripe-change-plan, stripe-subscription-status, stripe-webhook"],
              ]} />
            </Step>

            <Step title="1.3 Usuário Admin e papéis" action="Criar usuário administrador da empresa, atribuir role e vínculo de membership.">
              <EntityTable headers={["Entidade", "Detalhes"]} rows={[
                ["profiles", "id (FK auth.users), full_name, avatar_url, empresa_id"],
                ["user_roles", "Enum app_role — super_admin / admin / vendedor / viewer"],
                ["user_empresa_memberships", "user_id, empresa_id, role, ativo"],
                ["user_has_empresa_access(_empresa_id)", "RPC — helper RLS multi-tenant"],
                ["Edge Functions", "add-empresa-user, create-empresa-invite, accept-empresa-invite, admin-set-password, validate-invite, create-master-user (one-time)"],
              ]} />
            </Step>

            <Step title="1.4 Mapeamento PE (Plataforma)" action="Vincular o tenant Orbit à organização PE (camada de plataforma).">
              <EntityTable headers={["Entidade", "Detalhes"]} rows={[
                ["pe_tenant_map, pe_users, pe_roles, organizations, pe_invitations, pe_audit_log", "Tabelas — token de pe_invitations só lido via service_role"],
                ["Edge Functions", "add-org-user, invite-org-user, accept-invitation"],
              ]} />
            </Step>

            <Step title="1.5 Trial e auto-aprovação" action="Capturar solicitações de trial e provisionar automaticamente.">
              <EntityTable headers={["Entidade", "Detalhes"]} rows={[
                ["trial_requests", "nome, empresa, email, telefone, plan_code, status"],
                ["auto-approve-trial", "Edge Function — cria empresa + admin sem revisão manual"],
              ]} />
            </Step>

            <Step title="1.6 Wizard público de onboarding do cliente" action="Enviar link público para o cliente preencher dados do negócio (responsável, IA, integrações).">
              <EntityTable headers={["Entidade", "Detalhes"]} rows={[
                ["orbit_client_onboardings", "public_token (SHA-256 hash), status, responses jsonb, implementation_checklist jsonb, empresa_id"],
                ["submit_onboarding(p_token, p_responses)", "RPC SECURITY DEFINER"],
                ["Edge Functions", "orbit-onboarding-create, orbit-onboarding-submit"],
                ["/onboarding-cliente/:token", "Rota pública → ClientOnboardingPage.tsx"],
                ["/{slug}/onboarding", "Painel super_admin → OnboardingPage.tsx"],
                ["src/lib/onboarding-sections.ts", "Definição das seções"],
              ]} />
            </Step>
          </section>

          {/* 2. Integrações Core */}
          <section id="integracoes" className="doc-section space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><Plug className="h-5 w-5 text-primary" /> 2. Integrações Core</h2>
            <Separator />

            <Step title="2.1 Z-API (WhatsApp)" action="Conectar a instância Z-API da empresa, configurar limites e ativar webhook.">
              <EntityTable headers={["Entidade", "Detalhes"]} rows={[
                ["orbit_zapi_config", "instance_id, token, client_token, nome_instancia, numero_origem, ativo, notificar_enviadas_por_mim — colunas sensíveis com REVOKE"],
                ["orbit_whatsapp_sending_config", "warm_up_enabled, warmup_day, daily_limit_override"],
                ["orbit_whatsapp_daily_limits / _daily_usage", "Limites diários"],
                ["orbit_zapi_connection_status(_empresa_id)", "RPC — status em tempo real"],
                ["Edge Functions", "orbit-send-message, orbit-webhook (entrada), orbit-validate-whatsapp, orbit-migrate-phones"],
                ["_shared/orbit-zapi.ts", "Helper getOrbitZapiRuntimeConfig"],
                ["ConfigPage → tab zapi", "Frontend"],
              ]} />
            </Step>

            <Step title="2.2 Resend (email transacional)" action="Configurar remetente, API key e ativar tracking.">
              <EntityTable headers={["Entidade", "Detalhes"]} rows={[
                ["orbit_resend_config", "api_key (REVOKE authenticated), from_email, from_name, ativo"],
                ["Edge Functions", "orbit-send-email, orbit-email-track (pixel 1×1), orbit-resend-webhook (bounce/open/click)"],
                ["_shared/system-email.ts", "Credenciais de sistema"],
                ["ConfigPage → tab email", "Frontend"],
              ]} />
            </Step>

            <Step title="2.3 Google Calendar" action="Conectar conta Google via OAuth2 para agendar reuniões.">
              <EntityTable headers={["Entidade", "Detalhes"]} rows={[
                ["orbit_google_tokens, orbit_google_oauth_states", "Tabelas"],
                ["Edge Functions", "orbit-google-auth, orbit-google-callback, orbit-google-status, orbit-google-disconnect, orbit-google-calendar, orbit-meeting-scheduler"],
                ["_shared/google-calendar.ts", "getTokenForEmpresa, ensureFreshAccessToken, checkAvailability, createCalendarEvent, listUpcomingEvents"],
                ["orbit_meetings", "Tabela de reuniões"],
                ["ConfigPage → tab agenda", "AgendaConfigTab"],
              ]} />
            </Step>

            <Step title="2.4 Meta WhatsApp Business" action="Configurar Meta Cloud API como canal alternativo.">
              <EntityTable headers={["Entidade", "Detalhes"]} rows={[
                ["orbit_meta_config", "phone_number_id, waba_id, access_token, ativo"],
                ["Edge Functions", "orbit-meta-webhook, send-orbit-meta-message"],
              ]} />
            </Step>

            <Step title="2.5 Integrações genéricas e consulta de CNPJ" action="Outras integrações e helpers de dados públicos.">
              <EntityTable headers={["Entidade", "Detalhes"]} rows={[
                ["orbit_integrations_config", "type, config jsonb, ativo — SELECT restrito a admins"],
                ["fetch-cnpj", "Edge Function — proxy BrasilAPI"],
              ]} />
            </Step>
          </section>

          {/* 3. IA */}
          <section id="ia" className="doc-section space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><BrainCircuit className="h-5 w-5 text-primary" /> 3. Cérebro da IA</h2>
            <Separator />

            <Step title="3.1 Configuração de prompts e regras" action="Definir identidade, roteiro, regras, campos de qualificação, horários e idioma do agente.">
              <EntityTable headers={["Entidade", "Detalhes"]} rows={[
                ["orbit_ai_config", "modo_automatico, tom_conversa, prompt_identidade, prompt_roteiro, prompt_regras, campos_qualificacao jsonb, knowledge_base_enabled, horario_inicio/fim, responder_fora_horario, mensagem_fora_horario, idioma, max_tokens, tempo_espera, tts_ativo, tts_api_key, tts_voice_id, tts_modo"],
                ["RLS", "SELECT restrito a admins da empresa"],
              ]} />
            </Step>

            <Step title="3.2 Base de conhecimento RAG (pgvector)" action="Ingerir documentos, URLs ou texto livre para o agente consultar contextualmente.">
              <EntityTable headers={["Entidade", "Detalhes"]} rows={[
                ["orbit_ai_knowledge", "tipo (documento/url/texto), titulo, conteudo_texto, embedding vector(3072), model_version (gemini-embedding-001), status, chunk_index"],
                ["match_orbit_knowledge(...)", "RPC — cosine similarity por empresa"],
                ["orbit-knowledge-ingest", "Edge Function — chunking (1200/150 overlap) + embeddings via Lovable AI Gateway"],
              ]} />
            </Step>

            <Step title="3.3 Agente em produção" action="Operar o agente em conversas reais com classificação de intenção, RAG e máquina de estados.">
              <EntityTable headers={["Entidade", "Detalhes"]} rows={[
                ["orbit-ai-agent", "Estados novo/aguardando_resposta/qualificando/qualificado/handoff/encerrado; classifica human_probable/auto_reply/uncertain; mapeia intenção → áudio (INTENCAO_TO_AUDIO_CONTEXTO)"],
                ["orbit-ai-suggest", "Sugestão de resposta para vendedor humano"],
                ["orbit-ai-generate-template", "Gera templates via IA"],
              ]} />
            </Step>

            <Step title="3.4 TTS e biblioteca de áudios" action="Gerenciar acervo de áudios prontos e configurações TTS.">
              <EntityTable headers={["Entidade", "Detalhes"]} rows={[
                ["orbit_audio_library", "nome, storage_path, contexto, duracao_seg, ativo"],
                ["ConfigPage → tab audios", "Frontend"],
              ]} />
            </Step>

            <Step title="3.5 Isolamento e validação" action="Regras de segurança aplicadas a toda a camada de IA.">
              <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                <li>RLS por <code className="font-mono text-xs">empresa_id</code> em todas as tabelas de IA</li>
                <li>Validação Zod nos payloads das edge functions</li>
                <li><code className="font-mono text-xs">REVOKE</code> de colunas sensíveis (<code className="font-mono text-xs">api_key</code>, <code className="font-mono text-xs">token</code>, <code className="font-mono text-xs">client_token</code>)</li>
              </ul>
            </Step>
          </section>

          {/* 4. Sandbox */}
          <section id="sandbox" className="doc-section space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><FlaskConical className="h-5 w-5 text-primary" /> 4. Testes Seguros — Agent Sandbox</h2>
            <Separator />
            <Step title="Simulador de Abordagem Seguro" action="Validar prompts e roteiro antes de conectar o WhatsApp oficial.">
              <EntityTable headers={["Entidade", "Detalhes"]} rows={[
                ["AgentSandbox", "Componente → src/components/orbit/AgentSandbox.tsx (Sheet lateral, histórico em memória)"],
                ["MOCK_LEAD", "Mock fixo (São Paulo / Tecnologia)"],
                ["Triggers", "inbound_webhook, manual"],
                ["orbit-ai-sandbox", "Edge Function stateless (sem DB); recebe aiConfig, mockLead, trigger, messages[]"],
                ["Testar Agente", "Botão na ConfigPage tab ai"],
              ]} />
            </Step>
          </section>

          {/* 5. CRM */}
          <section id="crm" className="doc-section space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><GitBranch className="h-5 w-5 text-primary" /> 5. Máquina de CRM e Funil</h2>
            <Separator />

            <Step title="5.1 Pipeline" action="Estrutura de etapas configuráveis e templates globais.">
              <EntityTable headers={["Entidade", "Detalhes"]} rows={[
                ["orbit_pipeline_stages", "entrada/qualificação/negociação/fechamento"],
                ["orbit_pipeline_templates", "is_global"],
                ["orbit_first_stage_id(p_empresa_id)", "RPC"],
                ["orbit_auto_create_deal_for_prospect()", "Trigger — cria deal ao qualificar prospect"],
                ["orbit_emit_deal_stage_changed()", "Trigger — emite orbit_flow_events"],
              ]} />
            </Step>

            <Step title="5.2 Prospects, deals, tarefas, atividades" action="Núcleo operacional do CRM.">
              <EntityTable headers={["Entidade", "Detalhes"]} rows={[
                ["orbit_prospects", "nome_razao, email_principal, whatsapp, telefone, cidade, segmento, tipo, origem, status, assignee_id, qualificado"],
                ["orbit_deals", "prospect_id, stage_id, valor, status, assignee_id, closed_at"],
                ["orbit_tasks, orbit_activities, prospect_events", "Atividades e eventos"],
                ["validate_documento(p_doc)", "RPC — CPF/CNPJ"],
                ["orbit_emit_prospect_qualified()", "Trigger"],
              ]} />
            </Step>

            <Step title="5.3 Fontes de lead (ingestão externa)" action="Receber leads de Typebot, Google Sheets, webhooks genéricos e forms públicos.">
              <EntityTable headers={["Entidade", "Detalhes"]} rows={[
                ["orbit_lead_sources", "tipo, nome, secret_token, field_mapping jsonb, config jsonb — SELECT restrito a admins"],
                ["orbit-lead-ingest", "Edge Function — webhook por secret_token"],
                ["orbit_import_history", "Histórico de importações"],
                ["ConfigPage → tab lead-sources", "LeadSourcesTab"],
              ]} />
            </Step>

            <Step title="5.4 Templates e campanhas (disparos globais)" action="Criar templates, campanhas e disparos em massa com warmup e aprovação.">
              <EntityTable headers={["Entidade", "Detalhes"]} rows={[
                ["orbit_message_templates", "nome, conteudo, tipo (whatsapp/email/sms), tags[], variaveis[]"],
                ["orbit_campaigns, _campaign_approvals, _campaign_recipients, _send_groups", "Tabelas de campanha"],
                ["send-orbit-campaign", "Warmup [50,80,120,200,300,500], cache de validação 7 dias, CTA buttons"],
                ["request-campaign-approval", "Notifica aprovadores"],
                ["_shared/whatsapp-cta.ts", "Helper CTA"],
                ["Frontend", "CampanhasPage, NovaCampanhaPage, TemplatesPage, EmailTemplateEditorPage"],
                ["campaign-images", "Storage bucket (RLS de delete por empresa)"],
              ]} />
            </Step>

            <Step title="5.5 Distribuição (round-robin)" action="Distribuir leads automaticamente entre vendedores.">
              <EntityTable headers={["Entidade", "Detalhes"]} rows={[
                ["orbit_distribuicao_config", "modo (round_robin/manual), vendedores_ids[], ultimo_index"],
              ]} />
            </Step>

            <Step title="5.6 Fluxos de automação (Flow Engine)" action="Automatizar reações a eventos (lead recebido, deal mudou de stage, etc.).">
              <EntityTable headers={["Entidade", "Detalhes"]} rows={[
                ["orbit_flows, _flow_actions, _flow_events, _flow_runs, _flow_run_steps, _flow_templates", "is_global, escrita só super_admin"],
                ["Triggers", "lead_recebido, deal_stage_changed, prospect_qualified, etc."],
                ["orbit-flow-dispatcher", "Cron 1 min — eventos pendentes → flow runs"],
                ["orbit-flow-executor", "Executa ações em ordem; suporta actionSendWhatsappTemplate + Calendar"],
                ["ConfigPage", "tabs fluxos (FluxosTab) e flow-templates"],
              ]} />
            </Step>

            <Step title="5.7 Chatbot visual" action="Construção visual de fluxos de chatbot.">
              <EntityTable headers={["Entidade", "Detalhes"]} rows={[
                ["orbit_chatbot_flows", "nodes jsonb, edges jsonb"],
                ["orbit_chatbot_flow_branches", "Ramificações"],
              ]} />
            </Step>
          </section>

          {/* 6. Handoff */}
          <section id="handoff" className="doc-section space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><Users2 className="h-5 w-5 text-primary" /> 6. Handoff e Conversas</h2>
            <Separator />

            <Step title="6.1 Conversas e mensagens (canal WhatsApp/Meta)" action="Receber e centralizar mensagens dos canais oficiais.">
              <EntityTable headers={["Entidade", "Detalhes"]} rows={[
                ["orbit_conversas", "instance_id, channel (whatsapp/meta), status (aberta/fechada/bot/human), assignee_id, last_message_at"],
                ["orbit_mensagens", "remote_id, direcao, tipo (text/image/audio/document/video), conteudo, midia_url, lida, enviada_por"],
                ["orbit-webhook", "Entry point — cria/atualiza conversa, mensagem, logs e dispara orbit-ai-agent"],
                ["ConversasPage", "Frontend"],
              ]} />
            </Step>

            <Step title="6.2 Regras de passagem de bastão" action="Transferir conversas/leads para humanos com notificação.">
              <EntityTable headers={["Entidade", "Detalhes"]} rows={[
                ["orbit_handoffs", "de_user_id, para_user_id, motivo, status"],
                ["orbit_transferencias", "de_vendedor_id, para_vendedor_id, motivo, criado_por"],
                ["send-vendedor-notification", "Edge Function — tipos atribuicao ou transferencia via Z-API"],
              ]} />
            </Step>
          </section>

          {/* 7. Observabilidade */}
          <section id="observabilidade" className="doc-section space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><Activity className="h-5 w-5 text-primary" /> 7. Observabilidade e Logs</h2>
            <Separator />
            <Card><CardContent className="pt-6">
              <EntityTable headers={["Camada", "Entidade"]} rows={[
                ["Auditoria de usuário", "orbit_audit_log (acao, tabela, registro_id, antes/depois jsonb, ip)"],
                ["Auditoria PE", "pe_audit_log"],
                ["Webhooks Z-API/Meta", "orbit_webhook_logs (instance_id, event_type, phone, status, error_message)"],
                ["Email", "orbit_email_events (open/click/bounce)"],
                ["Prospect", "prospect_events"],
                ["KPIs (super_admin)", "RPC get_system_health_kpis(p_hours) — webhooks (total/errors/4xx/5xx/success_rate), flow_events, flow_runs (success/failed/avg_latency_ms)"],
                ["Logs recentes (super_admin)", "RPC get_system_health_recent_logs(p_limit)"],
                ["Frontend saúde", "ConfigPage → tab health + SystemHealthTab"],
                ["Frontend analytics", "AnalyticsPage"],
              ]} />
            </CardContent></Card>
          </section>

          {/* 8. Helpers */}
          <section id="helpers" className="doc-section space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><Wrench className="h-5 w-5 text-primary" /> 8. Helpers Recentes</h2>
            <Separator />
            <Card><CardContent className="pt-6">
              <EntityTable headers={["Helper", "Propósito"]} rows={[
                ["user_has_empresa_access(_empresa_id)", "RLS multi-tenant"],
                ["orbit_first_stage_id(p_empresa_id)", "Primeiro stage do pipeline"],
                ["orbit_auto_create_deal_for_prospect()", "Trigger — auto-deal ao qualificar"],
                ["orbit_emit_deal_stage_changed()", "Trigger — evento de mudança de stage"],
                ["orbit_emit_prospect_qualified()", "Trigger — evento prospect_qualified/lead_recebido"],
                ["orbit_zapi_connection_status(_empresa_id)", "Status real-time Z-API"],
                ["validate_documento(p_doc)", "Valida CPF/CNPJ"],
                ["submit_onboarding(p_token, p_responses)", "SECURITY DEFINER — finaliza wizard público"],
                ["get_system_health_kpis / _recent_logs", "Painel saúde (super_admin)"],
                ["match_orbit_knowledge(...)", "Busca vetorial RAG por empresa"],
                ["update_updated_at_column()", "Trigger genérico"],
                ["REVOKE em api_key/token/client_token", "Credenciais nunca expostas a authenticated/anon"],
                ["Drop Apollo/LeadFinder", "Expurgo de orbit_enrichment_*, orbit_leads, orbit_icps"],
                ["orbit_flow_templates write", "Apenas super_admin (curadoria global)"],
              ]} />
            </CardContent></Card>
          </section>

          {/* Apêndice A — Edge Functions */}
          <section id="edge-functions" className="doc-section space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><Cpu className="h-5 w-5 text-primary" /> Apêndice A — Catálogo completo de Edge Functions</h2>
            <Separator />
            <Card><CardContent className="pt-6">
              <EntityTable headers={["Função", "Propósito"]} rows={[
                ["accept-empresa-invite", "Aceita convite de empresa, ativa usuário, envia welcome"],
                ["accept-invitation", "Aceita convite PE, cria/atualiza usuário com role"],
                ["add-empresa-user", "Adiciona usuário existente a uma empresa"],
                ["add-org-user", "Adiciona usuário a uma org PE"],
                ["admin-set-password", "Admin redefine senha de outro usuário"],
                ["auto-approve-trial", "Cria empresa + admin a partir de trial_requests"],
                ["create-empresa", "Provisiona empresa + admin + email"],
                ["create-empresa-invite", "Convite com token hasheado"],
                ["create-master-user", "Cria o primeiro super_admin (one-time)"],
                ["fetch-cnpj", "Proxy BrasilAPI"],
                ["invite-org-user", "Convite para org PE com role"],
                ["orbit-ai-agent", "Agente IA principal (estado, RAG, TTS)"],
                ["orbit-ai-generate-template", "Geração de templates via IA"],
                ["orbit-ai-sandbox", "Sandbox stateless de testes"],
                ["orbit-ai-suggest", "Sugestão contextual para vendedor"],
                ["orbit-email-track", "Pixel de tracking de email"],
                ["orbit-flow-dispatcher", "Cron — eventos pendentes → flow runs"],
                ["orbit-flow-executor", "Executa ações de um flow run"],
                ["orbit-google-auth", "Inicia OAuth2 Google"],
                ["orbit-google-calendar", "CRUD eventos Calendar"],
                ["orbit-google-callback", "Callback OAuth2"],
                ["orbit-google-disconnect", "Remove tokens Google"],
                ["orbit-google-status", "Valida token Google"],
                ["orbit-knowledge-ingest", "Chunking + embeddings RAG"],
                ["orbit-lead-ingest", "Webhook genérico de leads"],
                ["orbit-meeting-scheduler", "Agenda reunião checando disponibilidade"],
                ["orbit-meta-webhook", "Recebe eventos Meta WhatsApp"],
                ["orbit-migrate-phones", "Normaliza telefones em massa"],
                ["orbit-onboarding-create", "Cria onboarding + envia link"],
                ["orbit-onboarding-submit", "Processa submissão do wizard"],
                ["orbit-resend-webhook", "Eventos Resend (bounce/open/click)"],
                ["orbit-send-email", "Envia email via Resend"],
                ["orbit-send-message", "Envia WhatsApp via Z-API"],
                ["orbit-validate-whatsapp", "Valida lista de números com cache"],
                ["orbit-webhook", "Webhook Z-API inbound (principal)"],
                ["request-campaign-approval", "Notifica aprovadores"],
                ["send-orbit-campaign", "Disparo em massa com warmup"],
                ["send-orbit-meta-message", "Envia via Meta Graph API"],
                ["send-vendedor-notification", "Notifica vendedor em atribuição/transferência"],
                ["stripe-change-plan", "Upgrade/downgrade Stripe"],
                ["stripe-checkout", "Sessão de checkout"],
                ["stripe-portal", "Portal de gerenciamento"],
                ["stripe-subscription-status", "Status atual da subscription"],
                ["stripe-webhook", "Eventos Stripe → atualiza saas_empresa"],
                ["validate-invite", "Valida token sem consumir"],
              ]} />
            </CardContent></Card>
          </section>

          {/* Apêndice B — Rotas */}
          <section id="rotas" className="doc-section space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><Route className="h-5 w-5 text-primary" /> Apêndice B — Catálogo de rotas frontend</h2>
            <Separator />

            <Card><CardHeader><CardTitle className="text-lg">Tenant (/{`{slug}`}/...)</CardTitle></CardHeader><CardContent>
              <EntityTable headers={["Rota", "Componente"]} rows={[
                ["/{slug}/funil", "FunilPage"],
                ["/{slug}/prospects (+ /:id)", "ProspectsPage"],
                ["/{slug}/conversas", "ConversasPage"],
                ["/{slug}/campanhas", "CampanhasPage"],
                ["/{slug}/campanhas/nova", "NovaCampanhaPage"],
                ["/{slug}/campanhas/:id/editar", "NovaCampanhaPage"],
                ["/{slug}/templates", "TemplatesPage"],
                ["/{slug}/templates/email/new", "EmailTemplateEditorPage"],
                ["/{slug}/templates/email/:id/edit", "EmailTemplateEditorPage"],
                ["/{slug}/config", "ConfigPage"],
                ["/{slug}/analytics", "AnalyticsPage"],
                ["/{slug}/tarefas", "TarefasPage"],
                ["/{slug}/onboarding (super_admin)", "OnboardingPage"],
                ["/{slug}/meu-plano", "MeuPlanoPage"],
                ["/{slug}/usuarios", "UsuariosEmpresaPage"],
              ]} />
            </CardContent></Card>

            <Card><CardHeader><CardTitle className="text-lg">Públicas</CardTitle></CardHeader><CardContent>
              <EntityTable headers={["Rota", "Componente"]} rows={[
                ["/", "LandingPage"],
                ["/auth", "AuthPage"],
                ["/setup", "SetupPage"],
                ["/onboarding-cliente/:token", "ClientOnboardingPage"],
                ["/invite/:token", "AcceptInvitePage"],
                ["/accept-invite-pe/:token", "AcceptInvitePage"],
                ["/accept-invite", "AcceptInviteSaasPage"],
                ["/reset-password", "ResetPasswordPage"],
                ["/select-empresa", "SelectEmpresaPage"],
              ]} />
            </CardContent></Card>

            <Card><CardHeader><CardTitle className="text-lg">PE Admin (/pe-admin/...)</CardTitle></CardHeader><CardContent>
              <EntityTable headers={["Rota", "Componente"]} rows={[
                ["/pe-admin/cadastros", "CadastrosPage"],
                ["/pe-admin/organizations/:id/users", "PeOrgUsersPage"],
                ["/pe-admin/users", "PeGlobalUsersPage"],
                ["/pe-admin/planos", "PlanosPage"],
                ["/pe-admin/tenants", "TenantMapPage"],
                ["/pe-admin/audit", "PeAuditLogPage"],
                ["/pe-admin/documentacao", "PeAdminDocPage"],
              ]} />
            </CardContent></Card>
          </section>

          {/* Apêndice C */}
          <section id="rpcs" className="doc-section space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><ListTree className="h-5 w-5 text-primary" /> Apêndice C — RPCs e Triggers principais</h2>
            <Separator />
            <Card><CardHeader><CardTitle className="text-lg">RPCs</CardTitle></CardHeader><CardContent>
              <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1 font-mono">
                <li>normalize_slug, generate_unique_slug, get_empresa_by_slug</li>
                <li>user_has_empresa_access, has_role</li>
                <li>orbit_first_stage_id, orbit_zapi_connection_status, validate_documento</li>
                <li>submit_onboarding</li>
                <li>match_orbit_knowledge</li>
                <li>get_system_health_kpis, get_system_health_recent_logs</li>
              </ul>
            </CardContent></Card>
            <Card><CardHeader><CardTitle className="text-lg">Triggers</CardTitle></CardHeader><CardContent>
              <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1 font-mono">
                <li>update_updated_at_column (genérico)</li>
                <li>orbit_auto_create_deal_for_prospect</li>
                <li>orbit_emit_deal_stage_changed</li>
                <li>orbit_emit_prospect_qualified</li>
              </ul>
            </CardContent></Card>
            <p className="text-center text-muted-foreground italic pt-4">Fim do Manual — toda nova feature deve ser incorporada às seções acima na ordem cronológica do onboarding.</p>
          </section>

        </main>
      </div>
    </>
  );
}
