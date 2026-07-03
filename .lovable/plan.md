# Dia de Otimização — Orbit Advisor

Plano em três fases sequenciais, cada uma entregável e testável isoladamente.

---

## Fase A — Limiares por tenant em `orbit_ai_config`

**Objetivo:** parar de hard-codar `>=3 erros`, `>=60s p95`, `>=15 leads`, `>=10 tarefas` etc. no scan e permitir calibração por cliente sem redeploy.

### Schema

Migration adicionando coluna JSONB `advisor_thresholds` em `orbit_ai_config` (nullable, default `'{}'::jsonb`). Nada de CHECK — validação é feita no código.

Formato esperado (todas as chaves opcionais; ausentes caem no default):

```json
{
  "flow_error_spike":       { "min_errors": 3, "error_ratio": 0.2, "hi_errors": 10 },
  "flow_latency_regression":{ "p95_warn_s": 60, "p95_high_s": 180 },
  "stage_stagnation":       { "min_ativos": 15, "window_days": 7 },
  "tasks_backlog":          { "warn": 10, "high": 50 },
  "handoff_queue":          { "warn": 5 },
  "conversas_overflow":     { "warn": 50 }
}
```

### Edge Function `orbit-advisor-scan/index.ts`

- Extrair defaults para uma constante `DEFAULT_THRESHOLDS` no topo.
- Novo helper `resolveThresholds(snapshot)` que faz `deepMerge(DEFAULT_THRESHOLDS, snapshot.ai_config?.advisor_thresholds ?? {})`.
- Passar o objeto resolvido a cada detector (`Detector.run(empresaId, snapshot, thresholds)`).
- Cada detector usa somente sua sub-chave (ex.: `thresholds.flow_error_spike.min_errors`).
- `get_advisor_snapshot_admin` já retorna `ai_config`; incluir explicitamente `advisor_thresholds` no bloco `ai_config` da RPC (migration de função).

### UI

Sem novo formulário nesta fase — edição via SQL admin ou pelo painel de config de IA existente (a criar depois). O status page continua exibindo apenas métricas.

### Verificação

1. Migration aplicada; scan roda inalterado (defaults idênticos aos atuais).
2. Update manual num tenant baixando `min_errors` para 1 → nova sugestão aparece no próximo scan; outros tenants inalterados.

---

## Fase B — Refino do `system_prompt` do Advisor

**Objetivo:** tom mais consultivo, específico e menos "robótico" no `orbit-advisor-chat`.

### Escopo

- Ler `supabase/functions/orbit-advisor-chat/index.ts` e localizar o bloco de system prompt.
- Reescrever em 3 seções: **Papel** (CS in-app do Orbit, tom consultor sênior, PT-BR direto), **Regras** (não inventar dados, sempre citar métrica do snapshot, respeitar `advisor_locked_paths`, nunca aplicar mudança sem confirmação), **Formato de resposta** (diagnóstico curto → hipótese → ação sugerida com custo/benefício → pergunta de confirmação).
- Adicionar 2 exemplos few-shot curtos cobrindo os padrões mais comuns já observados nos detectores (spike de erro em fluxo; estagnação de etapa).
- Manter injeção de contexto atual (snapshot + sugestões pending) intacta.

### Verificação

- Chamar o chat com uma pergunta de teste e comparar tom antes/depois via curl da função.

---

## Fase C — Botão Aplicar (execução segura com diff)

**Objetivo:** transformar uma `orbit_advisor_suggestions` pending em mudança efetiva, com preview de diff, confirmação explícita e trilha de auditoria.

### Ações suportadas nesta primeira versão (whitelist estrita)

Apenas ações de baixo risco que já temos infra para reverter:

1. `flow_pause` — setar `orbit_flows.enabled=false` no `target_id`.
2. `stage_add_followup_task` — inserir template de tarefa de follow-up na etapa alvo (via RPC dedicada).
3. `flow_variation_propose` — não aplica direto; cria rascunho em `orbit_flow_templates` com `status='draft'` para o usuário revisar.

Qualquer `action.kind` fora da whitelist retorna `not_applicable` e o botão fica desabilitado na UI.

### Backend

- Nova edge function `orbit-advisor-apply` (`verify_jwt=false`, valida JWT em código).
- Fluxo:
  1. Recebe `{ suggestion_id, confirm: true }` do usuário autenticado.
  2. Carrega sugestão, valida ownership por `empresa_id` do usuário e status `pending`.
  3. Rechecha `advisor_locked_paths` no `orbit_ai_config` atual (não confia no snapshot antigo).
  4. Monta `diff` (estado atual vs. estado proposto) — objeto JSON `{ before, after, target_table, target_id }`.
  5. Se `confirm=false`, retorna só o diff (preview).
  6. Se `confirm=true`, aplica dentro de transação via RPC dedicada por tipo de ação (`apply_flow_pause`, `apply_stage_followup`, `apply_flow_variation_draft`), tudo `SECURITY DEFINER` com checagem de `empresa_id`.
  7. Insere linha em `orbit_advisor_applied_changes` (tabela já existe) com `diff`, `applied_by`, `suggestion_id`, `reverted=false`.
  8. Atualiza `orbit_advisor_suggestions.status='applied'`.

### RPCs (migration)

- `apply_flow_pause(p_empresa uuid, p_flow uuid) returns jsonb`
- `apply_stage_followup(p_empresa uuid, p_stage uuid, p_template jsonb) returns jsonb`
- `apply_flow_variation_draft(p_empresa uuid, p_flow uuid) returns jsonb`
- Todas retornam `{ ok, before, after }`, revogar `EXECUTE` de `anon`; conceder para `authenticated` e `service_role`.

### UI

- No `AdvisorDock` (ou onde as sugestões pending são listadas hoje), botão "Aplicar" por card:
  1. Clique 1 → chama apply com `confirm=false`, abre `Dialog` mostrando diff formatado (`before` / `after` lado a lado usando componentes shadcn já existentes).
  2. Botões no dialog: **Cancelar** / **Confirmar aplicação**.
  3. Confirmar → chama apply com `confirm=true`, toast de sucesso, invalida query de sugestões.
- Sugestões com `action.kind` fora da whitelist mostram botão desabilitado com tooltip "Requer revisão manual".

### Auditoria / rollback

- Cada linha em `orbit_advisor_applied_changes` carrega `diff.before` suficiente para reverter.
- Botão "Reverter" opcional nesta fase (fica como Fase C+): se sim, chama RPC inversa; se não, apenas exibe histórico read-only no status page.

### Verificação

1. Preview: clicar Aplicar em uma sugestão `flow_error_spike` mostra diff `enabled: true → false` sem alterar nada.
2. Confirmar: fluxo pausa, linha aparece em `orbit_advisor_applied_changes`, sugestão vai a `applied`.
3. Guardrail: adicionar `flow_error_spike` em `advisor_locked_paths` → tentativa de aplicar retorna 403 mesmo se a sugestão foi criada antes do lock.
4. Ownership: JWT de outro tenant → 403.

---

## Ordem de execução

1. **A** (migration + scan refatorado) — merge, deixa rodando 1 ciclo do cron para confirmar telemetria intacta.
2. **B** (prompt) — deploy do chat, teste rápido via curl.
3. **C** (aplicar) — migration + edge function + UI, com verificação manual dos 4 cenários acima antes de considerar pronto.

## Detalhes técnicos

- Todos os novos arquivos seguem o padrão do projeto: envelope `{ ok, data, error }`, CORS dinâmico, logs `slog` estruturados com `run_id` também no `orbit-advisor-apply`.
- Zero mudança em `src/integrations/supabase/client.ts`, `types.ts` e `.env` — `types.ts` será regenerado pelo pipeline após a migration.
- `date-fns` permanece `3.6.0`.
- Nenhum acesso a schemas protegidos (`auth`, `storage`, etc.).  
  
Quando ele for implementar o `flow_variation_propose` (o item 3 da whitelist da Fase C), peça para ele garantir que o rascunho criado tenha um sufixo `(Draft Advisor)` e não sobrescreva o fluxo original de forma alguma. Assim, todos os tennants podem abrir o fluxo, ver a sugestão do Advisor, revisar e só então publicar. É o equilíbrio perfeito entre IA proativa e controle humano.