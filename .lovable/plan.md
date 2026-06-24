# Pipeline & Fluxos — Plano por Etapas

Objetivo: transformar pipeline em algo **configurável por cliente** (com templates), e tornar a aba **Fluxos** real — capaz de disparar automações e ligar/desligar o agente de IA conforme a etapa. Tudo aditivo: nada do que já roda (Funil, Deals, AI atual) será quebrado.

---

## Princípios

- **Aditivo**: novas colunas com defaults; código antigo continua funcionando.
- **Multi-tenant**: tudo escopado por `empresa_id` + RLS.
- **Reversível**: cada etapa pode ser feita, testada e revertida isoladamente.
- **AI compatível**: agente continua respondendo como hoje quando nenhum fluxo/regra estiver ativo.  
os agentes devem seguir as regras/fluxos especificas de cada uma, sem interferir nas demais. devem agir isoladamente entre ela seguindo uma logica criada na implementaçao e em conjunto com o cliente. 

---

## Etapa 1 — Pipeline configurável por cliente (sem mexer no agente)

Hoje `orbit_pipeline_stages` existe mas é simples (nome, ordem, cor, is_won/is_lost). Vamos enriquecer **sem quebrar** o Funil atual.

**Schema (aditivo):**

- `orbit_pipeline_stages`: + `descricao`, `slug`, `probabilidade_default`, `sla_dias`, `requer_motivo` (bool), `automacoes_config jsonb default '{}'`, `is_default` (bool).
- Nova `orbit_pipeline_templates` (globais + por empresa): `id, empresa_id nullable, nome, descricao, vertical, stages jsonb`. Empresa_id NULL = template do sistema (joalheria, imobiliária, SaaS, serviços, etc.).
- Nova `orbit_pipelines` opcional para suportar **múltiplos pipelines** por empresa (ex: Vendas, Pós-venda). Stages ganham `pipeline_id nullable` — default = pipeline principal da empresa (mantém compatibilidade).

**UI (Configurações → Pipeline):**

- Tela "Pipeline" com lista de etapas drag-and-drop (reordenar), criar/editar/arquivar.
- Botão "Aplicar template" com pré-visualização (não destrutivo: cria etapas novas, não apaga existentes salvo confirmação).
- Por etapa: cor, probabilidade, SLA em dias, motivo obrigatório (perda).  
os pipe lines devem permitir unir automaçoes pque ativem o agente de acordo com fluxos de captaçao e intergraçao com outras ferramentas, perminido uma maior autonimia do proprio agente.

**Compatibilidade:** Funil atual (`FunilPage`) continua lendo `orbit_pipeline_stages` normalmente.

---

## Etapa 2 — Motor de Fluxos (estrutura real)

Substitui a aba "Fluxos" vazia por um sistema real, sem mexer no `orbit_chatbot_flows` (que continua para chatbot WhatsApp).

**Schema:**

- `orbit_flows`: `id, empresa_id, nome, descricao, ativo, trigger_type, trigger_config jsonb, created_at, updated_at`.
  - `trigger_type`: `stage_enter`, `stage_exit`, `prospect_created`, `inactivity`, `tag_added`, `manual`, `schedule`.
- `orbit_flow_steps`: `id, flow_id, ordem, tipo, config jsonb, delay_minutos, condicao jsonb nullable`.
  - `tipo`: `send_whatsapp`, `send_email`, `create_task`, `notify_vendedor`, `move_stage`, `update_field`, `assign_owner`, `ai_enable`, `ai_disable`, `ai_set_prompt`, `webhook`, `wait`.
- `orbit_flow_runs`: `id, flow_id, prospect_id, deal_id, started_at, finished_at, status, current_step, log jsonb` — para auditoria e retomada.

**Execução:**

- Edge function `orbit-flow-engine` (cron a cada 1min + invocado por triggers).
- Triggers no banco: ao mover deal de etapa (`orbit_deals.etapa_id` change) → insere em `orbit_flow_runs` os fluxos ativos com `trigger_type='stage_enter'` matching.
- Engine processa steps em ordem, respeita `delay_minutos` e `condicao`, grava log.

**UI (Configurações → Fluxos):**

- Lista de fluxos (ativo/inativo, último run, contagem).
- Builder simples (não node-graph): formulário linear "Quando X acontece → faça A, depois B, depois C". Cada step é um card editável.
- Templates: "Boas-vindas novo lead", "Follow-up 3 dias sem resposta", "Notificar vendedor ao entrar em Proposta", "Cobrar documentos em Negociação".  
alem disso devemos ter mais configraçao para ativar triggers que acionem o agente correto de cada fluxo, sendo permitido adicionar aos fluxos, audios gravados, documentos, links e outras opçoes que façam sentido para o processo do agente 

---

## Etapa 3 — Integração Agente IA ↔ Pipeline/Fluxos

Hoje `orbit_ai_config.modo_automatico` é global por empresa. Vamos permitir **override por etapa e por fluxo**, sem quebrar o default.

**Schema:**

- `orbit_pipeline_stages.ai_config jsonb` — opcional: `{ "modo": "auto|manual|off", "prompt_override": "...", "handoff_humano": true }`.
- Reuso de `orbit_handoffs` que já existe para registrar transferência humano↔IA.

**Lógica no `orbit-ai-agent`:**

1. Ao receber mensagem, descobrir deal/prospect → etapa atual.
2. Se etapa tem `ai_config.modo = 'off'` → não responde (cria handoff).
3. Se `ai_config.prompt_override` → mescla com prompt global.
4. Fluxos podem chamar steps `ai_enable`/`ai_disable`/`ai_set_prompt` que escrevem em `orbit_handoffs` ou em campo `prospect.ai_state`.

**UI:**

- Na edição de etapa: seção "Agente IA nesta etapa" (auto/manual/off + prompt extra).
- Na edição de fluxo: steps "Ativar IA" / "Pausar IA" / "Trocar prompt da IA".

**Compatibilidade:** se `ai_config` for null em todas as etapas, comportamento atual preservado 100%.

---

## Etapa 4 — Observabilidade & Templates de Pipeline prontos

- Seed de 4-5 templates de pipeline + 6-8 templates de fluxos no banco (empresa_id NULL).
- Página "Automações → Histórico" lendo `orbit_flow_runs` (filtro por fluxo, status, prospect).
- Métricas no dashboard: fluxos disparados, taxa de sucesso, tempo médio por etapa (usa `orbit_deals.moved_at`).

---

## Ordem de execução recomendada

1. **Etapa 1** (pipeline configurável + templates) — rollout isolado, valida com Viver Semijoias.
2. **Etapa 2** (motor de fluxos) — fluxos manuais primeiro, depois triggers de stage.
3. **Etapa 3** (AI por etapa/fluxo) — só depois que 1+2 estiverem estáveis.
4. **Etapa 4** (templates seed + observabilidade).

Cada etapa termina com: migration aprovada → UI → smoke test em tenant real → seguir.

---

## Detalhes técnicos (resumo)

- Migrations aditivas, RLS por `empresa_id` via `has_empresa_access(empresa_id)`.
- Engine de fluxos = edge function com cron (`supabase/functions/orbit-flow-engine`) + trigger SQL que enfileira runs.
- Builder UI usa shadcn (sem libs novas de node-graph nesta versão).
- Nenhuma alteração em `useOrbitDeals`, `FunilPage`, `orbit-ai-agent` na Etapa 1 — só leituras novas opcionais.

---

## Pergunta antes de partir

Confirma que quero começar pela **Etapa 1 (Pipeline configurável + templates)** ou prefere que eu já entregue Etapas 1+2 juntas no primeiro ciclo? pode começar pela 1 primeiro seguindo sua ordem de validaçao. Leve em consideraçao os ajustes que fiz nesse plano e se necessario mande um plano ajkustado de acordo com o que eu solitei., 