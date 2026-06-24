
# Por que o funil da Viver Semijoias está vazio

Investiguei no banco e na tela `/orbit/funil`:

- `orbit_empresas` da Viver tem **0 etapas de pipeline**, **0 prospects**, **0 deals**, **0 conversas**.
- O `useOrbitDealsGrouped` filtra por `empresa_id` e por `is null deleted_at` → como não existe nada cadastrado, a tela renderiza sem colunas e sem cards.
- O `orbit-ai-agent` hoje **classifica** a mensagem (`auto_reply`, `qualificado`, etc.) e atualiza `status_qualificacao = 'qualificado'` no prospect quando confirma interesse — mas **não cria** prospect novo, **não cria deal** e **não joga no funil**. Quem cria prospect é o webhook do WhatsApp (Z‑API/Meta) ao receber a primeira mensagem; quem cria deal hoje é só humano via "Nova Oportunidade".

Ou seja: faltam três pontos de costura para o fluxo "lead chega → agente classifica → vira deal no funil → vendedor acompanha" funcionar de ponta a ponta. Vou inserir isso como **Etapa 1.5** (entre a Etapa 1 já entregue e a Etapa 2 de Fluxos), porque é pré‑requisito para qualquer fluxo fazer sentido.

---

# Plano complementar — Etapa 1.5: Onboarding do pipeline + agente cria deal automaticamente

Princípios mantidos: aditivo, por empresa, reversível, nada quebra para tenants que já têm dados.

## Tarefas, por prioridade

### T1 — Seed automático de etapas padrão por empresa  *(prioridade alta, bloqueia tudo)*
- Migration: função `public.orbit_seed_default_pipeline(_empresa_id uuid)` que insere 6 etapas padrão (`Novo Lead`, `Qualificação`, `Proposta`, `Negociação`, `Ganho`, `Perdido`) com cor, `is_won/is_lost`, `probabilidade_default`, `ordem`, marcando `is_default=true` na primeira.
- Trigger `AFTER INSERT ON orbit_empresas` chama a função (idempotente: só insere se a empresa estiver sem stages).
- Backfill único: chamar a função para empresas existentes com `count(stages)=0` (incluindo Viver Semijoias).
- **Smoke test:** abrir `/viver-semijoias/funil` e ver as 6 colunas vazias; rodar `select count(*) from orbit_pipeline_stages where empresa_id=...` = 6.

### T2 — Helper `ensure_deal_for_prospect(prospect_id)`  *(prioridade alta)*
- Função SQL `security definer` que: pega o prospect, descobre `empresa_id`, busca a etapa default (`is_default=true` ou menor `ordem` que não é won/lost) e cria um `orbit_deals` com `prospect_id`, `etapa_id`, `titulo = prospect.nome_razao`, `valor_estimado = null`, `origem = 'auto_agent'` — **somente se** já não existir deal ativo desse prospect.
- Retorna o `deal_id` (novo ou existente).
- **Smoke test:** chamar via `select` em prospect existente, verificar que cria 1 deal; chamar de novo, verificar que devolve o mesmo `id` (idempotente).

### T3 — Agente IA registra o lead no funil quando classifica como qualificado  *(prioridade alta)*
- No `orbit-ai-agent` (`supabase/functions/orbit-ai-agent/index.ts`): no bloco onde hoje seta `status_qualificacao='qualificado'`, chamar `ensure_deal_for_prospect(prospect.id)` via `rpc`.
- Logar evento em `prospect_events`: `event_type='deal_created_by_ai'`, `titulo='Lead movido para o funil pela IA'`, `descricao = etapa.nome`.
- Sem mudança quando classificação ≠ qualificado (mantém comportamento atual).
- **Smoke test:** abrir conversa de teste no WhatsApp do tenant demo → mandar mensagem "tenho interesse, quero comprar" → ver prospect aparecer com status qualificado e card aparecer na primeira coluna do funil; checar `prospect_events` com o registro.

### T4 — Webhook garante prospect ao receber primeira mensagem  *(prioridade média — auditar, não reescrever)*
- Auditar `orbit-webhook` e `orbit-meta-webhook`: confirmar que, ao chegar mensagem de número novo, eles fazem `upsert` em `orbit_prospects` com `empresa_id`, `telefone`, `whatsapp`, `nome_razao` (a partir do push name), `status_qualificacao='novo'`, `origem='whatsapp_inbound'`.
- Se já fazem, só documentar. Se faltar campo, completar — sem mexer em payload de resposta.
- **Smoke test:** disparar uma mensagem de número desconhecido no tenant demo, ver o prospect surgir em `/orbit/prospects` em < 5s.

### T5 — UI do funil: estado vazio útil + badge da IA no card  *(prioridade média)*
- Em `FunilPage.tsx`: quando `dealsGrouped` tem stages mas nenhum deal, mostrar empty state explicando "Os leads aparecem aqui automaticamente quando o agente os qualifica, ou clique em **Nova Oportunidade**".
- Em `DealCard.tsx`: se `origem='auto_agent'`, mostrar um badge pequeno "IA" para o vendedor saber que foi o agente que classificou.
- Sem mudança de schema; apenas leitura.
- **Smoke test:** com 0 deals ver a mensagem; após T3 disparar, ver o badge "IA" no card.

### T6 — Reaproveitamento na promoção de prospects existentes  *(prioridade baixa)*
- O hook `usePromoteProspect` (já existe) passa a chamar `ensure_deal_for_prospect` em vez de inserir deal direto — uma única fonte de verdade.
- **Smoke test:** promover um prospect manualmente, conferir que aparece na mesma coluna inicial e não duplica se promovido duas vezes.

---

## Ordem de execução e validação

1. **T1** (migration + backfill) → smoke test ① abrir funil da Viver e ver as colunas.
2. **T2** (RPC `ensure_deal_for_prospect`) → smoke test ② criar deal manualmente via SQL para um prospect.
3. **T3** (agente chama RPC) → smoke test ③ mensagem de interesse cria o card no funil.
4. **T4** (auditoria do webhook) → smoke test ④ número novo vira prospect.
5. **T5** (UI: empty state + badge IA) → smoke test ⑤ visual.
6. **T6** (refatorar promote) → smoke test ⑥ promote manual sem duplicar.

Cada tarefa é um commit isolado, reversível, e nenhuma altera os hooks `useOrbitDeals*`, `FunilPage` (T5 é só JSX adicional) nem a estrutura atual de prospects/deals.

---

## Encaixe no planejamento maior

Ordem revisada:

1. ~~Etapa 1 — Pipeline configurável + templates~~ ✅ entregue.
2. **Etapa 1.5 — Onboarding do pipeline + agente cria deal (este plano)**.
3. Etapa 2 — Motor de Fluxos (passa a ter dados reais para disparar triggers `stage_enter`).
4. Etapa 3 — IA por etapa/fluxo.
5. Etapa 4 — Observabilidade + seeds.

Vou atualizar `.lovable/plan.md` adicionando esta Etapa 1.5 com as tasks T1‑T6 quando passar para build mode.

Confirma para eu seguir começando por **T1** (seed + backfill das etapas da Viver Semijoias)?
