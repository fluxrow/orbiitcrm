
# Prioridade 1: Dropdown de Etapas + Ramificação If/Else

Foco 100% no construtor de fluxos (`/orbit/config → Fluxos`). Duas entregas independentes que resolvem os travamentos operacionais atuais.

---

## Parte A — Dropdown de Etapas do Pipeline

**Problema hoje:** em "Mover no funil" o usuário precisa colar UUID ou digitar slug manualmente.

**O que muda:**
- Na edição da ação `change_deal_stage` / `move_deal_stage` (arquivo `FlowActionsEditor.tsx`), substituir os dois `Input` de UUID/slug por um único `<Select>` que lista as etapas ativas do pipeline da empresa atual.
- Cada item mostra: cor (bolinha) + `nome` + badge se for `is_won`/`is_lost`, ordenado por `ordem`.
- Ao selecionar, salvamos **os dois campos** no `action_config`:
  - `to_stage_id` = `stage.id`
  - `to_stage_slug` = `stage.slug` (fallback do executor)
- Um link "Gerenciar etapas" abaixo do dropdown abre `/orbit/config` na aba Pipeline em nova aba.
- Se o pipeline ainda não tiver etapas, mostrar mensagem "Nenhuma etapa cadastrada — crie no Pipeline primeiro."

**Onde os dados vêm:** hook já existente `usePipelineStages()` de `useOrbitPipelineConfig.ts` (retorna `PipelineStage[]` filtrado por `empresa_id` e não arquivadas).

**Compatibilidade:** flows já criados com `to_stage_id` UUID continuam funcionando — o dropdown pré-seleciona pelo id salvo. Executor (`orbit-flow-executor`) já suporta ambos os campos, então **não precisa mexer no backend**.

**Resumo do card na lista de ações:** trocar `"→ slug"` por `"→ Nome da Etapa"` (lookup pelo id).

---

## Parte B — Ação If/Else (Ramificação Condicional)

**Problema hoje:** a sequência de ações é linear. Não dá para dizer "se lead tem CNPJ, envia template A; senão, template B".

**Abordagem escolhida — "Ação condicional inline":** adicionar um novo `action_type = "if_else"` que agrupa dois blocos de ações filhas (then/else). Isso mantém a estrutura tabular atual (`orbit_flow_actions` com `ordem`) sem exigir refactor de grafo.

### Modelo de dados

Reusar `orbit_flow_actions.action_config` (JSONB) sem migration nova:

```json
{
  "condition": {
    "logic": "AND",
    "rules": [
      { "field": "prospect.documento_tipo", "op": "equals", "value": "CNPJ" },
      { "field": "deal.valor", "op": "gte", "value": 5000 }
    ]
  },
  "then": [
    { "action_type": "send_whatsapp_template", "action_config": {...}, "delay_seconds": 0 },
    { "action_type": "notify_vendedor", "action_config": {...}, "delay_seconds": 0 }
  ],
  "else": [
    { "action_type": "create_task", "action_config": {...}, "delay_seconds": 0 }
  ]
}
```

**Campos disponíveis para condição** (populados pelo executor a partir de `run.context` + lookups já existentes):
- `prospect.*` — `nome`, `email`, `telefone`, `documento`, `documento_tipo`, `origem`, `tags`, qualquer coluna de `orbit_prospects`
- `deal.*` — `valor`, `etapa_id`, `etapa_slug`, `moved_at`, qualquer coluna de `orbit_deals`
- `payload.*` — payload cru do trigger (útil para `lead_recebido` via webhook, ex.: `payload.utm_source`)

**Operadores:** `equals`, `not_equals`, `contains`, `not_contains`, `gt`, `gte`, `lt`, `lte`, `is_empty`, `is_not_empty`, `in` (valor separado por vírgula).

**Lógica de agrupamento:** `AND` ou `OR` entre as regras (v1 sem grupos aninhados — mantém UI simples).

### UI no construtor

1. Novo card no `ActionPickerDialog`: **"Condição (Se / Senão)"** com ícone `GitBranch`.
2. Ao adicionar, abre editor dedicado com 3 seções:
   - **Se:** botão "Adicionar regra" gera linha `[campo] [operador] [valor]`. `campo` é um `<Select>` agrupado (Prospect / Deal / Payload) — os campos vêm de uma constante `FLOW_CONDITION_FIELDS` alimentada pelas colunas conhecidas + `payload.*` livre. Toggle AND/OR no topo.
   - **Então (verdadeiro):** lista visual de sub-ações usando os mesmos componentes do editor principal (mesmo picker, mesma edição). Reordenáveis por ordem.
   - **Senão (falso):** idêntico ao "Então". Opcional — pode ficar vazio.
3. Na lista principal do fluxo, o card if/else mostra: `Se {N} regra(s) · Então {X} ação(ões) · Senão {Y} ação(ões)`.

### Execução no backend

Adicionar em `supabase/functions/orbit-flow-executor/index.ts`:
- Novo case `if_else` no `runAction`:
  1. Carrega prospect/deal (se ainda não estiverem em `run.context`) — cache local por run.
  2. Avalia `condition` com um `evaluateCondition(ctx, condition)` puro (função nova).
  3. Executa recursivamente o array `then` ou `else` chamando `runAction` para cada item, respeitando `delay_seconds` de cada sub-ação (com o mesmo cap de 30s por delay que já existe).
  4. Retorna `{ ok, output: { branch: "then"|"else", steps: N } }`; se qualquer sub-ação falhar, retorna erro e para o fluxo (mesmo comportamento do loop principal).
- Sub-ações **não** criam linhas em `orbit_flow_run_steps` na v1 — o passo pai já registra o branch escolhido no `output`. (Pode virar melhoria futura.)

### Compatibilidade

- Flows existentes: nenhum impacto — `if_else` é um tipo novo.
- Tipagem: adicionar `"if_else"` em `OrbitFlowActionType` (`useOrbitFlows.ts`).
- Sem migration de schema (`action_config` já é JSONB livre).

---

## Detalhes técnicos

**Arquivos tocados:**
- `src/components/orbit/FlowActionsEditor.tsx` — dropdown de etapas + entrada do novo tipo no picker + card resumo do if/else.
- `src/components/orbit/FlowIfElseEditor.tsx` **(novo)** — editor completo do if/else, reutilizando `ActionPickerDialog` e `ActionEditDialog` para as sub-ações.
- `src/lib/flowConditionFields.ts` **(novo)** — catálogo de campos + operadores + labels PT-BR + helper `evaluateCondition` compartilhável (só usado no cliente para preview; backend tem cópia própria em Deno).
- `src/hooks/useOrbitFlows.ts` — adicionar `"if_else"` no union `OrbitFlowActionType`.
- `supabase/functions/orbit-flow-executor/index.ts` — case `if_else` + `evaluateCondition` + carregamento de contexto (prospect/deal).

**Não altera:** tabela `orbit_flow_actions` (schema), condições do gatilho (`FlowConditionsDialog`), templates, dispatcher.

**Ordem de implementação sugerida** (uma feature por vez, testável isoladamente):
1. Dropdown de etapas (baixo risco, ganho imediato).
2. Tipagem + picker + editor do if/else no front (salva no banco, ainda não executa).
3. Executor: `evaluateCondition` + recursão de sub-ações.
4. Ajuste no `FlowHelpPanel` já existente com nova seção "Ramificações condicionais".

---

## Fora do escopo desta rodada

- Drag-and-drop para reordenar ações (o `GripVertical` continua decorativo).
- Grupos aninhados de condições (só AND/OR plano na v1).
- Edição inline de templates de mensagem.
- Ramificações com mais de 2 saídas (switch/case).

Se quiser, na próxima rodada atacamos drag-and-drop + editor de templates.
