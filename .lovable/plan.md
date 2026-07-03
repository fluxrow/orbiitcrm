
# Orbit Advisor — Arquitetura

Consultor de CS in-app, tenant-aware, que **observa → sugere → aplica** com confirmação humana. Reutiliza toda a espinha dorsal já existente ([CORE] Orbit Core Flow, `orbit-flow-template-variation`, `patchFlowDefinition`, `has_role`, RLS por `empresa_id`).

---

## 1. Onde vive na UI

Um único ponto de entrada, presente em toda rota `/{slug}/*`:

- **Painel lateral flutuante `AdvisorDock`** (FAB no canto inferior direito → abre `Sheet` de 480px à direita).
  - Aba **Insights** (feed proativo de sugestões — badge com contagem de não-lidos).
  - Aba **Chat** (perguntas livres do usuário ao advisor).
  - Aba **Histórico** (mudanças aplicadas + rollback).
- Cada sugestão vira também um **toast discreto** no dashboard/funil quando gerada em background, com CTA "Ver no Advisor".
- **NÃO** substitui nenhuma tela existente. É camada consultiva sobre o CRM.

Isolado do Master Tenant: no `fluxrow` o Advisor mostra métricas cross-tenant; nos demais, apenas o próprio `empresa_id`.

---

## 2. Contexto do LLM — RAG em 3 camadas

Nunca despejar tabelas cruas. Montagem em camadas com orçamento fixo de tokens (~8k input máx.):

### Camada A — Snapshot estruturado (sempre incluído, ~1.5k tokens)
Uma nova função Postgres `get_advisor_snapshot(empresa_id)` (SECURITY DEFINER) que retorna JSON compacto:
```json
{
  "empresa": { "nome", "plano", "seats_usados" },
  "ai_config": { "identidade_resumo", "regras_invioláveis[] " },
  "pipeline": [{ "stage", "leads_ativos", "conversao_7d", "conversao_30d", "delta_vs_media" }],
  "flows": [{ "id", "nome", "runs_24h", "erros_24h", "latencia_p95_ms", "ultimo_erro" }],
  "kpis": <get_system_health_kpis>
}
```
Já pré-agrega — o LLM recebe números prontos, não linhas.

### Camada B — Trechos relevantes sob demanda (via tools, ~2k tokens)
O LLM chama tools quando precisa aprofundar:
- `get_flow_definition(flow_id)` → estrutura do fluxo (para propor patch)
- `get_recent_flow_errors(flow_id, limit)` → traces de `orbit_flow_run_steps` com erro
- `get_stage_drop_sample(stage_id, limit)` → sample de `prospect_events` que "morreram" na etapa
- `get_template_content(template_id)` → texto do `[CORE]` template
Cada tool retorna já resumido (max 500 tokens por call).

### Camada C — Memória de conversa (últimas 6 turns, ~1k tokens)
Persistida em `orbit_advisor_threads` / `orbit_advisor_messages`. Turns antigas são sumarizadas por um second-pass antes de reentrar no contexto.

**Orçamento total:** ~5k input + espaço p/ tool traffic. Modelo padrão `google/gemini-3-flash-preview`; escalonamos para `google/gemini-2.5-pro` só quando o usuário pede "análise profunda".

---

## 3. Motor de proatividade

Edge function `orbit-advisor-scan` roda **por tenant**, disparada por:
- Cron 1x/hora (via `pg_cron` já disponível).
- Hook após eventos-chave: novo erro em `orbit_flow_runs`, queda >20% em stage conversion, prospect parado >SLA.

Fluxo:
1. Carrega o snapshot da Camada A.
2. Compara com snapshot anterior (guardado em `orbit_advisor_snapshots`, série temporal leve).
3. Rodadetectors determinísticos (baratos, sem LLM):
   - `stage_drop_detector`, `flow_error_spike`, `latency_regression`, `template_low_ctr`, `sla_breach`.
4. Cada detector positivo vira um **draft de sugestão** e chama o LLM **só nessa hora** para redigir a mensagem + propor a ação estruturada.
5. Insere em `orbit_advisor_suggestions` (status = `pending`), triggando realtime → badge acende.

Isso mantém o custo de tokens proporcional a **problemas reais**, não ao volume de dados.

---

## 4. Ciclo de execução (sugestão → diff → apply)

Cada sugestão do LLM é **estruturada**, nunca texto solto:
```json
{
  "id": "sug_...",
  "titulo": "Reduzir delay do follow-up de 3h para 2h",
  "racional": "P95 de resposta caiu para 47min...",
  "risco": "baixo",
  "action": {
    "kind": "flow_template_variation" | "flow_patch" | "template_edit" | "ai_config_tweak",
    "target_id": "...",
    "diff": [ { "path": "actions[3].action_config.wait_value", "from": 3, "to": 2 } ]
  },
  "requires_confirmation": true
}
```

Frontend renderiza:
- Descrição + racional
- **Diff visual** (react-diff-viewer com o JSON antes/depois — nunca aplicar sem mostrar)
- Botões: **Aplicar**, **Editar antes de aplicar**, **Descartar**

Ao clicar **Aplicar**, o frontend chama `orbit-advisor-apply` (edge function) com o `suggestion_id`. Essa função:
1. Recarrega a sugestão do banco (nunca confia no payload do client).
2. Valida `empresa_id` == usuário logado.
3. Checa **regras invioláveis** de `orbit_ai_config` (whitelist do que o advisor pode tocar por tenant).
4. Roteia para a RPC/edge function correta:
   - `flow_template_variation` → chama `orbit-flow-template-variation`
   - `flow_patch` → aplica `patchFlowDefinition` (com o mesmo trigger de proteção já vigente para templates oficiais — o Advisor **não** pode editar `[CORE]`, só criar variação).
   - `template_edit` / `ai_config_tweak` → updates diretos com RLS.
5. Grava em `orbit_advisor_applied_changes` com snapshot pré/pós → habilita **rollback 1-clique**.
6. Emite `prospect_events`-like em `orbit_activities` para auditoria.

---

## 5. Guardrails de segurança

| Camada | Proteção |
|---|---|
| **DB / RLS** | Todas as novas tabelas com `empresa_id` + policies via `has_role`. Nenhum SELECT anon. |
| **Templates `[CORE]`** | Trigger `prevent_official_flow_template_edit` já existente continua bloqueando edição direta. Advisor só propõe *variações* (via `orbit-flow-template-variation`). |
| **Regras invioláveis** | Novo campo `orbit_ai_config.advisor_locked_paths[]` (JSONB). Sugestões que tocam path bloqueado são geradas mas marcadas `blocked=true` e não podem ser aplicadas — mostradas ao usuário como "sugerido, mas travado pelas suas regras". |
| **Confirmação humana obrigatória** | `orbit-advisor-apply` rejeita qualquer sugestão sem flag `user_confirmed_at`. Sem exceção — mesmo para mudanças "seguras". |
| **Rate limit** | Advisor não pode aplicar mais que N mudanças/hora por tenant (config em `saas_plans`). |
| **Auditoria completa** | Toda ação em `orbit_audit_log` (`ator=advisor`, `user_confirmed_by=<uid>`). |
| **Prompt safety** | System prompt cita as regras invioláveis do tenant + lista whitelist de tools. Zero `execute_sql`, zero acesso a `service_role`. |

---

## 6. Schema novo (resumo)

Migração adiciona:
- `orbit_advisor_threads` (empresa_id, user_id, titulo, updated_at)
- `orbit_advisor_messages` (thread_id, role, content, tool_calls JSONB, tokens_in/out)
- `orbit_advisor_suggestions` (empresa_id, tipo, action JSONB, status, criada_por='scan'|'chat', gerada_em)
- `orbit_advisor_applied_changes` (suggestion_id, snapshot_before, snapshot_after, applied_by, rollback_of)
- `orbit_advisor_snapshots` (empresa_id, taken_at, snapshot JSONB) — série leve p/ deltas
- Coluna `orbit_ai_config.advisor_locked_paths JSONB DEFAULT '[]'`
- Function `get_advisor_snapshot(uuid)` (SECURITY DEFINER, retorna JSON compacto)

Todas com GRANT para `authenticated` + `service_role`, RLS por `has_role`+`empresa_id`.

---

## 7. Edge functions novas

- `orbit-advisor-chat` — endpoint streaming (AI SDK `streamText` + tools listadas na Camada B). Auth: JWT do usuário, valida `empresa_id`.
- `orbit-advisor-scan` — batch por tenant, roda os detectors + LLM para redigir. Cron + trigger.
- `orbit-advisor-apply` — aplica sugestão validada, faz rollback se qualquer step falhar (transação lógica).

Tudo com envelope `{ ok, data, error }` e CORS dinâmico (padrão do projeto).

---

## 8. Roll-out sugerido (fases)

1. **Fase 1 — Só leitura**: snapshot + chat livre + detectors gerando sugestões. Botão "Aplicar" desabilitado (apenas "Copiar como tarefa"). Valida qualidade dos insights sem risco.
2. **Fase 2 — Apply guardrailed**: liga execução para `flow_template_variation` e `template_edit`, com rollback.
3. **Fase 3 — Advisor cross-tenant** no Master Tenant `fluxrow` (Orbit vendo tendências agregadas).
4. **Fase 4 — Advisor autônomo opt-in**: tenant pode marcar tipos de sugestão como "auto-aplicar" (ex: rebalancear delay de follow-up dentro de faixa) — ainda auditado, ainda reversível.

---

## Detalhes técnicos rápidos

- **UI**: `Sheet` do shadcn, `react-markdown` + `react-diff-viewer-continued` para diffs, `@tanstack/react-query` com `useSubscribe` do Supabase Realtime para o feed de sugestões.
- **LLM**: `google/gemini-3-flash-preview` default; `structuredOutputs` do AI SDK para as sugestões (schema Zod pequeno, sem `.min`/`.max`, limites no prompt + clamp no server).
- **Tokens**: snapshot pré-agregado no Postgres = 90% da economia. Tools sob demanda para deep-dive.
- **Testes**: fixture de snapshot + Vitest do decision engine dos detectors (determinístico, sem LLM). E2E manual só do flow apply→rollback.

---

Se aprovar a arquitetura, sugiro começarmos pela **Fase 1 completa** (snapshot function + tabelas + `AdvisorDock` + `orbit-advisor-chat` streaming + detectors read-only). Isso já entrega valor visível sem tocar em nenhuma escrita crítica, e valida a qualidade das sugestões antes de habilitar o apply.
