# Manual Mestre de Implementação — Orbit CRM

> **Source of Truth** para configurar uma conta nova do zero até o pleno funcionamento.
> Cada etapa lista a **Ação de negócio** + as **Entidades técnicas** envolvidas (tabela, RPC, edge function, rota, componente).
> Ordem cronológica de onboarding — siga de cima para baixo.

---

## 1. Provisionamento do Tenant

### 1.1 Criar a empresa (tenant raiz)
- **Ação:** Provisionar nova empresa no Orbit, com slug único de acesso (`/{slug}/...`).
- **Entidades:**
  - Tabela `orbit_empresas` — `id, nome, slug, slug_created_at, ativo, plano, max_usuarios, data_expiracao, cnpj, email_contato, telefone`
  - RPC `normalize_slug(p text)` — normaliza string (lowercase, sem acentos, hífens)
  - RPC `generate_unique_slug(p_nome text)` — gera slug único contra `orbit_empresas.slug`
  - RPC `get_empresa_by_slug(p_slug text)` — resolução por slug nas rotas; bloqueia `demo`
  - Edge Function `create-empresa` — provisiona empresa + admin + email de boas-vindas

### 1.2 Vincular plano SaaS
- **Ação:** Associar empresa a um plano (Stripe) e definir limites/expiração.
- **Entidades:**
  - Tabela `saas_empresa` — `stripe_customer_id, stripe_subscription_id, stripe_status, plan_code, trial_ends_at`
  - Tabela `saas_plans` — catálogo `code, name, max_usuarios, features jsonb, stripe_price_id`
  - Tabela `saas_usage_monthly` — uso mensal por empresa
  - Edge Functions: `stripe-checkout`, `stripe-portal`, `stripe-change-plan`, `stripe-subscription-status`, `stripe-webhook`

### 1.3 Usuário Admin e papéis
- **Ação:** Criar usuário administrador da empresa, atribuir role e vínculo de membership.
- **Entidades:**
  - Tabela `profiles` — `id (FK auth.users), full_name, avatar_url, empresa_id`
  - Tabela `user_roles` (enum `app_role`) — `super_admin / admin / vendedor / viewer`
  - Tabela `user_empresa_memberships` — `user_id, empresa_id, role, ativo`
  - RPC `user_has_empresa_access(_empresa_id)` — helper RLS multi-tenant
  - Edge Functions: `add-empresa-user`, `create-empresa-invite`, `accept-empresa-invite`, `admin-set-password`, `validate-invite`, `create-master-user` (one-time)

### 1.4 Mapeamento PE (Plataforma)
- **Ação:** Vincular o tenant Orbit à organização PE (camada de plataforma).
- **Entidades:**
  - Tabelas `pe_tenant_map`, `pe_users`, `pe_roles`, `organizations`, `pe_invitations` (token só lido via service_role), `pe_audit_log`
  - Edge Functions: `add-org-user`, `invite-org-user`, `accept-invitation`

### 1.5 Trial e auto-aprovação
- **Ação:** Capturar solicitações de trial e provisionar automaticamente.
- **Entidades:**
  - Tabela `trial_requests` — `nome, empresa, email, telefone, plan_code, status`
  - Edge Function `auto-approve-trial` — cria empresa + admin sem revisão manual

### 1.6 Wizard público de onboarding do cliente
- **Ação:** Enviar link público para o cliente preencher dados do negócio (responsável, IA, integrações).
- **Entidades:**
  - Tabela `orbit_client_onboardings` — `public_token (SHA-256 hash), status, responses jsonb, implementation_checklist jsonb, empresa_id`
  - RPC `submit_onboarding(p_token, p_responses)` (SECURITY DEFINER)
  - Edge Functions: `orbit-onboarding-create`, `orbit-onboarding-submit`
  - Rota pública: `/onboarding-cliente/:token` → `src/pages/public/ClientOnboardingPage.tsx`
  - Painel super_admin: `/{slug}/onboarding` → `src/pages/orbit/OnboardingPage.tsx`
  - Seções: `src/lib/onboarding-sections.ts`

---

## 2. Integrações Core

### 2.1 Z-API (WhatsApp)
- **Ação:** Conectar a instância Z-API da empresa, configurar limites e ativar webhook.
- **Entidades:**
  - Tabela `orbit_zapi_config` — `instance_id, token, client_token, nome_instancia, numero_origem, ativo, notificar_enviadas_por_mim`
    - **Segurança:** colunas `token`, `client_token`, `api_key` com `REVOKE` para `authenticated`/`anon`
  - Tabela `orbit_whatsapp_sending_config` — `warm_up_enabled, warmup_day, daily_limit_override`
  - Tabelas `orbit_whatsapp_daily_limits`, `orbit_whatsapp_daily_usage`
  - RPC `orbit_zapi_connection_status(_empresa_id)` — status em tempo real
  - Edge Functions: `orbit-send-message`, `orbit-webhook` (entrada), `orbit-validate-whatsapp`, `orbit-migrate-phones`
  - Helper compartilhado: `supabase/functions/_shared/orbit-zapi.ts` (`getOrbitZapiRuntimeConfig`)
  - Frontend: `ConfigPage` → tab **`zapi`**

### 2.2 Resend (email transacional)
- **Ação:** Configurar remetente, API key e ativar tracking.
- **Entidades:**
  - Tabela `orbit_resend_config` — `api_key (REVOKE authenticated), from_email, from_name, ativo`
  - Edge Functions: `orbit-send-email`, `orbit-email-track` (pixel 1×1), `orbit-resend-webhook` (bounce/open/click)
  - Helper: `_shared/system-email.ts` (credenciais de sistema)
  - Frontend: `ConfigPage` → tab **`email`**

### 2.3 Google Calendar
- **Ação:** Conectar conta Google via OAuth2 para agendar reuniões.
- **Entidades:**
  - Tabelas `orbit_google_tokens`, `orbit_google_oauth_states`
  - Edge Functions: `orbit-google-auth`, `orbit-google-callback`, `orbit-google-status`, `orbit-google-disconnect`, `orbit-google-calendar`, `orbit-meeting-scheduler`
  - Helper: `_shared/google-calendar.ts` (`getTokenForEmpresa`, `ensureFreshAccessToken`, `checkAvailability`, `createCalendarEvent`, `listUpcomingEvents`)
  - Tabela `orbit_meetings`
  - Frontend: `ConfigPage` → tab **`agenda`** + `AgendaConfigTab`

### 2.4 Meta WhatsApp Business
- **Ação:** Configurar Meta Cloud API como canal alternativo.
- **Entidades:**
  - Tabela `orbit_meta_config` — `phone_number_id, waba_id, access_token, ativo`
  - Edge Functions: `orbit-meta-webhook`, `send-orbit-meta-message`

### 2.5 Integrações genéricas e consulta de CNPJ
- **Entidades:**
  - Tabela `orbit_integrations_config` — `type, config jsonb, ativo` (SELECT restrito a admins)
  - Edge Function `fetch-cnpj` — proxy BrasilAPI

---

## 3. Cérebro da IA

### 3.1 Configuração de prompts e regras
- **Ação:** Definir identidade, roteiro, regras, campos de qualificação, horários e idioma do agente.
- **Entidades:**
  - Tabela `orbit_ai_config` — `modo_automatico, tom_conversa, prompt_identidade, prompt_roteiro, prompt_regras, campos_qualificacao jsonb, knowledge_base_enabled, horario_inicio/fim, responder_fora_horario, mensagem_fora_horario, idioma, max_tokens, tempo_espera, tts_ativo, tts_api_key, tts_voice_id, tts_modo`
  - **RLS:** SELECT restrito a admins da empresa

### 3.2 Base de conhecimento RAG (pgvector)
- **Ação:** Ingerir documentos, URLs ou texto livre para o agente consultar contextualmente.
- **Entidades:**
  - Tabela `orbit_ai_knowledge` — `tipo (documento/url/texto), titulo, conteudo_texto, embedding vector(3072), model_version (gemini-embedding-001), status, chunk_index`
  - RPC `match_orbit_knowledge(query_embedding, match_threshold, match_count, p_empresa_id)` — cosine similarity por empresa
  - Edge Function `orbit-knowledge-ingest` — chunking (1200/150 overlap) + embeddings via Lovable AI Gateway

### 3.3 Agente em produção
- **Ação:** Operar o agente em conversas reais com classificação de intenção, RAG e máquina de estados.
- **Entidades:**
  - Edge Function `orbit-ai-agent` — estados `novo/aguardando_resposta/qualificando/qualificado/handoff/encerrado`; classifica `human_probable/auto_reply/uncertain`; mapeia intenção → áudio (`INTENCAO_TO_AUDIO_CONTEXTO`)
  - Edge Function `orbit-ai-suggest` — sugestão de resposta para vendedor humano
  - Edge Function `orbit-ai-generate-template` — gera templates via IA

### 3.4 TTS e biblioteca de áudios
- **Entidades:**
  - Tabela `orbit_audio_library` — `nome, storage_path, contexto, duracao_seg, ativo`
  - Frontend: `ConfigPage` → tab **`audios`**

### 3.5 Isolamento e validação
- **Regras:**
  - RLS por `empresa_id` em todas as tabelas de IA
  - Validação Zod nos payloads das edge functions
  - `REVOKE` de colunas sensíveis (`api_key`, `token`, `client_token`)

---

## 4. Testes Seguros — Agent Sandbox

- **Ação:** Validar prompts e roteiro antes de conectar o WhatsApp oficial.
- **Entidades:**
  - Componente `AgentSandbox` → `src/components/orbit/AgentSandbox.tsx` (Sheet lateral, histórico em memória)
  - Mock fixo `MOCK_LEAD` (São Paulo / Tecnologia)
  - Triggers suportados: `inbound_webhook`, `manual`
  - Edge Function `orbit-ai-sandbox` — **stateless** (sem DB); recebe `aiConfig`, `mockLead`, `trigger`, `messages[]`
  - Integração: botão **"Testar Agente"** na `ConfigPage` tab **`ai`**

---

## 5. Máquina de CRM e Funil

### 5.1 Pipeline
- **Entidades:**
  - Tabelas `orbit_pipeline_stages` (entrada/qualificação/negociação/fechamento), `orbit_pipeline_templates` (`is_global`)
  - RPC `orbit_first_stage_id(p_empresa_id)`
  - Trigger `orbit_auto_create_deal_for_prospect()` — cria deal ao qualificar prospect
  - Trigger `orbit_emit_deal_stage_changed()` — emite `orbit_flow_events`

### 5.2 Prospects, deals, tarefas, atividades
- **Entidades:**
  - `orbit_prospects` (`nome_razao, email_principal, whatsapp, telefone, cidade, segmento, tipo, origem, status, assignee_id, qualificado`)
  - `orbit_deals` (`prospect_id, stage_id, valor, status, assignee_id, closed_at`)
  - `orbit_tasks`, `orbit_activities`, `prospect_events`
  - RPC `validate_documento(p_doc)` — CPF/CNPJ
  - Trigger `orbit_emit_prospect_qualified()`

### 5.3 Fontes de lead (ingestão externa)
- **Entidades:**
  - Tabela `orbit_lead_sources` — `tipo (typebot/google_sheets/webhook_generico/form_publico), nome, secret_token, field_mapping jsonb, config jsonb` (SELECT restrito a admins)
  - Edge Function `orbit-lead-ingest` — webhook por `secret_token`
  - Tabela `orbit_import_history`
  - Frontend: `ConfigPage` → tab **`lead-sources`** + `LeadSourcesTab`

### 5.4 Templates e campanhas (disparos globais)
- **Entidades:**
  - Tabela `orbit_message_templates` — `nome, conteudo, tipo (whatsapp/email/sms), tags[], variaveis[]`
  - Tabelas `orbit_campaigns`, `orbit_campaign_approvals`, `orbit_campaign_recipients`, `orbit_send_groups`
  - Edge Functions: `send-orbit-campaign` (warmup `[50,80,120,200,300,500]`, cache de validação 7 dias, CTA buttons), `request-campaign-approval`
  - Helper: `_shared/whatsapp-cta.ts`
  - Frontend: `CampanhasPage`, `NovaCampanhaPage`, `TemplatesPage`, `EmailTemplateEditorPage`
  - Storage bucket `campaign-images` (RLS de delete por empresa)

### 5.5 Distribuição (round-robin)
- **Entidades:**
  - Tabela `orbit_distribuicao_config` — `modo (round_robin/manual), vendedores_ids[], ultimo_index`

### 5.6 Fluxos de automação (Flow Engine)
- **Entidades:**
  - Tabelas `orbit_flows`, `orbit_flow_actions`, `orbit_flow_events`, `orbit_flow_runs`, `orbit_flow_run_steps`, `orbit_flow_templates` (`is_global`, escrita só super_admin)
  - Triggers de tipo: `lead_recebido`, `deal_stage_changed`, `prospect_qualified`, etc.
  - Edge Functions: `orbit-flow-dispatcher` (cron 1 min), `orbit-flow-executor` (executa ações em ordem; suporta `actionSendWhatsappTemplate` + Calendar)
  - Frontend: `ConfigPage` → tabs **`fluxos`** (`FluxosTab`) e **`flow-templates`**

### 5.7 Chatbot visual
- **Entidades:**
  - Tabelas `orbit_chatbot_flows` (`nodes jsonb, edges jsonb`), `orbit_chatbot_flow_branches`

---

## 6. Handoff e Conversas

### 6.1 Conversas e mensagens (canal WhatsApp/Meta)
- **Entidades:**
  - Tabela `orbit_conversas` — `instance_id, channel (whatsapp/meta), status (aberta/fechada/bot/human), assignee_id, last_message_at`
  - Tabela `orbit_mensagens` — `remote_id, direcao, tipo (text/image/audio/document/video), conteudo, midia_url, lida, enviada_por`
  - Entry point: Edge Function `orbit-webhook` → cria/atualiza conversa, mensagem, logs e dispara `orbit-ai-agent`
  - Frontend: `ConversasPage`

### 6.2 Regras de passagem de bastão
- **Entidades:**
  - Tabela `orbit_handoffs` — `de_user_id, para_user_id, motivo, status`
  - Tabela `orbit_transferencias` — `de_vendedor_id, para_vendedor_id, motivo, criado_por`
  - Edge Function `send-vendedor-notification` — tipos `atribuicao` ou `transferencia` via Z-API

---

## 7. Observabilidade e Logs

| Camada | Entidade |
|---|---|
| Auditoria de usuário | `orbit_audit_log` (`acao, tabela, registro_id, antes/depois jsonb, ip`) |
| Auditoria PE | `pe_audit_log` |
| Webhooks Z-API/Meta | `orbit_webhook_logs` (`instance_id, event_type, phone, status, error_message`) |
| Email | `orbit_email_events` (open/click/bounce) |
| Prospect | `prospect_events` |
| KPIs (super_admin) | RPC `get_system_health_kpis(p_hours)` — webhooks (total/errors/4xx/5xx/success_rate), flow_events (total/processed/pending), flow_runs (success/failed/avg_latency_ms) |
| Logs recentes (super_admin) | RPC `get_system_health_recent_logs(p_limit)` |
| Frontend saúde | `ConfigPage` → tab **`health`** + `SystemHealthTab` |
| Frontend analytics | `AnalyticsPage` |

---

## 8. Helpers Recentes (referência cronológica)

| Helper | Propósito |
|---|---|
| `user_has_empresa_access(_empresa_id)` | RLS multi-tenant |
| `orbit_first_stage_id(p_empresa_id)` | Primeiro stage do pipeline |
| `orbit_auto_create_deal_for_prospect()` | Trigger — auto-deal ao qualificar |
| `orbit_emit_deal_stage_changed()` | Trigger — evento de mudança de stage |
| `orbit_emit_prospect_qualified()` | Trigger — evento `prospect_qualified`/`lead_recebido` |
| `orbit_zapi_connection_status(_empresa_id)` | Status real-time Z-API |
| `validate_documento(p_doc)` | Valida CPF/CNPJ |
| `submit_onboarding(p_token, p_responses)` | SECURITY DEFINER — finaliza wizard público |
| `get_system_health_kpis` / `get_system_health_recent_logs` | Painel saúde (super_admin) |
| `match_orbit_knowledge(...)` | Busca vetorial RAG por empresa |
| `update_updated_at_column()` | Trigger genérico |
| Column-level `REVOKE` em `api_key`, `token`, `client_token` | Credenciais nunca expostas a `authenticated`/`anon` |
| Drop Apollo/LeadFinder (`orbit_enrichment_*`, `orbit_leads`, `orbit_icps`) | Expurgo arquitetural |
| `orbit_flow_templates` write = super_admin only | Curadoria de templates globais |

---

## Apêndice A — Catálogo completo de Edge Functions

| Função | Propósito |
|---|---|
| `accept-empresa-invite` | Aceita convite de empresa, ativa usuário, envia welcome |
| `accept-invitation` | Aceita convite PE, cria/atualiza usuário com role |
| `add-empresa-user` | Adiciona usuário existente a uma empresa |
| `add-org-user` | Adiciona usuário a uma org PE |
| `admin-set-password` | Admin redefine senha de outro usuário |
| `auto-approve-trial` | Cria empresa + admin a partir de `trial_requests` |
| `create-empresa` | Provisiona empresa + admin + email |
| `create-empresa-invite` | Convite com token hasheado |
| `create-master-user` | Cria o primeiro super_admin (one-time) |
| `fetch-cnpj` | Proxy BrasilAPI |
| `invite-org-user` | Convite para org PE com role |
| `orbit-ai-agent` | Agente IA principal (estado, RAG, TTS) |
| `orbit-ai-generate-template` | Geração de templates via IA |
| `orbit-ai-sandbox` | Sandbox stateless de testes |
| `orbit-ai-suggest` | Sugestão contextual para vendedor |
| `orbit-email-track` | Pixel de tracking de email |
| `orbit-flow-dispatcher` | Cron — eventos pendentes → flow runs |
| `orbit-flow-executor` | Executa ações de um flow run |
| `orbit-google-auth` | Inicia OAuth2 Google |
| `orbit-google-calendar` | CRUD eventos Calendar |
| `orbit-google-callback` | Callback OAuth2 |
| `orbit-google-disconnect` | Remove tokens Google |
| `orbit-google-status` | Valida token Google |
| `orbit-knowledge-ingest` | Chunking + embeddings RAG |
| `orbit-lead-ingest` | Webhook genérico de leads |
| `orbit-meeting-scheduler` | Agenda reunião checando disponibilidade |
| `orbit-meta-webhook` | Recebe eventos Meta WhatsApp |
| `orbit-migrate-phones` | Normaliza telefones em massa |
| `orbit-onboarding-create` | Cria onboarding + envia link |
| `orbit-onboarding-submit` | Processa submissão do wizard |
| `orbit-resend-webhook` | Eventos Resend (bounce/open/click) |
| `orbit-send-email` | Envia email via Resend |
| `orbit-send-message` | Envia WhatsApp via Z-API |
| `orbit-validate-whatsapp` | Valida lista de números com cache |
| `orbit-webhook` | Webhook Z-API inbound (principal) |
| `request-campaign-approval` | Notifica aprovadores |
| `send-orbit-campaign` | Disparo em massa com warmup |
| `send-orbit-meta-message` | Envia via Meta Graph API |
| `send-vendedor-notification` | Notifica vendedor em atribuição/transferência |
| `stripe-change-plan` | Upgrade/downgrade Stripe |
| `stripe-checkout` | Sessão de checkout |
| `stripe-portal` | Portal de gerenciamento |
| `stripe-subscription-status` | Status atual da subscription |
| `stripe-webhook` | Eventos Stripe → atualiza `saas_empresa` |
| `validate-invite` | Valida token sem consumir |

---

## Apêndice B — Catálogo de rotas frontend

### Tenant (`/{slug}/...`)
| Rota | Componente |
|---|---|
| `/{slug}/funil` | `FunilPage` |
| `/{slug}/prospects` (+ `/:id`) | `ProspectsPage` |
| `/{slug}/conversas` | `ConversasPage` |
| `/{slug}/campanhas` | `CampanhasPage` |
| `/{slug}/campanhas/nova` | `NovaCampanhaPage` |
| `/{slug}/campanhas/:id/editar` | `NovaCampanhaPage` |
| `/{slug}/templates` | `TemplatesPage` |
| `/{slug}/templates/email/new` | `EmailTemplateEditorPage` |
| `/{slug}/templates/email/:id/edit` | `EmailTemplateEditorPage` |
| `/{slug}/config` | `ConfigPage` |
| `/{slug}/analytics` | `AnalyticsPage` |
| `/{slug}/tarefas` | `TarefasPage` |
| `/{slug}/onboarding` *(super_admin)* | `OnboardingPage` |
| `/{slug}/meu-plano` | `MeuPlanoPage` |
| `/{slug}/usuarios` | `UsuariosEmpresaPage` |

### Públicas
| Rota | Componente |
|---|---|
| `/` | `LandingPage` |
| `/auth` | `AuthPage` |
| `/setup` | `SetupPage` |
| `/onboarding-cliente/:token` | `ClientOnboardingPage` |
| `/invite/:token` | `AcceptInvitePage` |
| `/accept-invite-pe/:token` | `AcceptInvitePage` |
| `/accept-invite` | `AcceptInviteSaasPage` |
| `/reset-password` | `ResetPasswordPage` |
| `/select-empresa` | `SelectEmpresaPage` |

### PE Admin (`/pe-admin/...`)
| Rota | Componente |
|---|---|
| `/pe-admin/cadastros` | `CadastrosPage` |
| `/pe-admin/organizations/:id/users` | `PeOrgUsersPage` |
| `/pe-admin/users` | `PeGlobalUsersPage` |
| `/pe-admin/planos` | `PlanosPage` |
| `/pe-admin/tenants` | `TenantMapPage` |
| `/pe-admin/audit` | `PeAuditLogPage` |
| `/pe-admin/documentacao` | `PeAdminDocPage` |

---

## Apêndice C — RPCs e Triggers principais

**RPCs**
- `normalize_slug`, `generate_unique_slug`, `get_empresa_by_slug`
- `user_has_empresa_access`, `has_role`
- `orbit_first_stage_id`, `orbit_zapi_connection_status`, `validate_documento`
- `submit_onboarding`
- `match_orbit_knowledge`
- `get_system_health_kpis`, `get_system_health_recent_logs`

**Triggers**
- `update_updated_at_column` (genérico)
- `orbit_auto_create_deal_for_prospect`
- `orbit_emit_deal_stage_changed`
- `orbit_emit_prospect_qualified`

---

**Fim do Manual.** Toda nova feature ou tabela deve ser incorporada às seções acima na ordem cronológica em que aparece no fluxo de onboarding.
