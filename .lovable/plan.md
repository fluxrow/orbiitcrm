
# Manual Mestre de Implementação — Source of Truth

## Entregável

Criar **um único arquivo**: `docs/MANUAL_IMPLEMENTACAO.md`

É um documento estático de referência (não código executável). Serve como guia ponta-a-ponta para a equipe técnica e de suporte configurar uma conta nova do zero até o pleno funcionamento.

## Estrutura do documento

O manual segue ordem cronológica de implementação. Cada etapa lista a **Ação de negócio** + **Entidades técnicas** (tabela, RPC, edge function, rota, componente).

```text
1. Provisionamento do Tenant
   1.1  Criação da empresa (orbit_empresas + slug)
   1.2  Plano SaaS (saas_empresa, saas_plans)
   1.3  Usuário Admin + roles (profiles, user_roles, user_empresa_memberships)
   1.4  Mapeamento PE (pe_tenant_map, pe_users, pe_roles)
   1.5  Trial e auto-aprovação (trial_requests, auto-approve-trial)
   1.6  Wizard público de onboarding (orbit_client_onboardings, submit_onboarding,
        rota /onboarding-cliente/:token)

2. Integrações Core
   2.1  Z-API / WhatsApp (orbit_zapi_config, orbit-webhook, orbit-send-message,
        orbit-validate-whatsapp, orbit_whatsapp_sending_config, daily_limits/usage)
   2.2  Resend / Email (orbit_resend_config, orbit-send-email, orbit-email-track,
        orbit-resend-webhook)
   2.3  Google Calendar (orbit_google_tokens, oauth_states, orbit-google-auth/callback/
        status/disconnect/calendar, orbit-meeting-scheduler)
   2.4  Meta WhatsApp Business (orbit_meta_config, orbit-meta-webhook,
        send-orbit-meta-message)
   2.5  Integrações genéricas e CNPJ (orbit_integrations_config, fetch-cnpj)

3. Cérebro da IA
   3.1  Configuração de prompts e regras (orbit_ai_config: identidade/roteiro/regras,
        campos_qualificacao, horários, idioma, max_tokens)
   3.2  Base de conhecimento RAG (orbit_ai_knowledge, match_orbit_knowledge,
        orbit-knowledge-ingest, pgvector + gemini-embedding-001)
   3.3  Agente em produção (orbit-ai-agent, orbit-ai-suggest,
        orbit-ai-generate-template)
   3.4  TTS e biblioteca de áudios (orbit_audio_library, tts_* em orbit_ai_config)
   3.5  Isolamento e validação (RLS por empresa_id, Zod, REVOKE de credenciais)

4. Testes Seguros — Agent Sandbox
   4.1  Componente AgentSandbox (src/components/orbit/AgentSandbox.tsx)
   4.2  Edge function stateless orbit-ai-sandbox (sem DB)
   4.3  MOCK_LEAD fixo, histórico memory-only, trigger inbound_webhook/manual
   4.4  Botão "Testar Agente" na ConfigPage tab "ai"

5. Máquina de CRM e Funil
   5.1  Pipeline (orbit_pipeline_stages, orbit_pipeline_templates,
        orbit_first_stage_id, orbit_auto_create_deal_for_prospect)
   5.2  Prospects, deals, tarefas, atividades (orbit_prospects, orbit_deals,
        orbit_tasks, orbit_activities, prospect_events)
   5.3  Fontes de lead (orbit_lead_sources, orbit-lead-ingest, secret_token)
   5.4  Templates e campanhas (orbit_message_templates, orbit_campaigns,
        orbit_campaign_recipients, orbit_campaign_approvals, orbit_send_groups,
        send-orbit-campaign, request-campaign-approval)
   5.5  Distribuição round-robin (orbit_distribuicao_config)
   5.6  Fluxos de automação (orbit_flows, orbit_flow_actions, orbit_flow_events,
        orbit_flow_runs, orbit_flow_templates, orbit-flow-dispatcher,
        orbit-flow-executor, triggers orbit_emit_*)
   5.7  Chatbot visual (orbit_chatbot_flows, branches)

6. Handoff e Conversas
   6.1  Conversas e mensagens (orbit_conversas, orbit_mensagens)
   6.2  Handoff humano (orbit_handoffs, orbit_transferencias,
        send-vendedor-notification)
   6.3  Painel de conversa (ConversasPage)

7. Observabilidade e Logs
   7.1  Auditoria (orbit_audit_log, pe_audit_log)
   7.2  Webhook logs (orbit_webhook_logs)
   7.3  Email events (orbit_email_events)
   7.4  KPIs de saúde (get_system_health_kpis, get_system_health_recent_logs,
        SystemHealthTab — super_admin)
   7.5  Analytics (AnalyticsPage)

8. Helpers Recentes (referência cronológica)
   - user_has_empresa_access, orbit_zapi_connection_status, validate_documento,
     submit_onboarding, REVOKE de credenciais sensíveis, expurgo Apollo/LeadFinder

9. Apêndices
   A. Catálogo completo de Edge Functions (uma linha cada)
   B. Catálogo de rotas frontend (/[slug]/*, públicas, /pe-admin/*)
   C. RPCs e triggers do banco
```

## Como o conteúdo será montado

Toda a base já está mapeada (varredura completa do agente sub-task): 11 seções, todas as tabelas, RPCs, triggers, edge functions, rotas, componentes e migrations recentes estão catalogados com referência ao arquivo/migração de origem. O arquivo será escrito em uma única passagem.

## Fora de escopo

- Não altera código.
- Não cria componentes nem migrations.
- Não modifica RLS, edge functions ou frontend.
- Apenas escreve a documentação consolidada.
