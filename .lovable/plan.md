# Construtor de Fluxos V2 — 4 melhorias

Objetivo: reduzir cliques e idas ao banco para configurar fluxos. Cada item é independente e pode ser mergeado sozinho na ordem abaixo (do menor risco ao maior).

---

## 1) Drag-and-drop para reordenar ações

**Hoje:** o `GripVertical` é decorativo; reordenar exige apagar/recriar.

**Entrega:**

- Adicionar `@dnd-kit/core` + `@dnd-kit/sortable` (padrão do ecossistema shadcn, sem dependência de HTML5 nativo).
- Em `FlowActionsEditor.tsx`, envolver a lista de ações com `DndContext` + `SortableContext`. Cada card vira `useSortable` e o `GripVertical` recebe `listeners`/`attributes` como handle.
- Ao soltar (`onDragEnd`), calcular nova ordem local (otimista) e persistir com um único update em lote: iterar `actions` reordenadas e chamar `upsertFlowAction` só nas linhas cuja `ordem` mudou. Se houver ≥ 5 mudanças, criar um helper `useReorderFlowActions` que faz update em massa via `.upsert()` com array (mesmo endpoint, uma request).
- Feedback visual: card ganha `opacity-70` durante o drag; cursor muda para `grab/grabbing`.
- Dentro do `FlowIfElseEditor` (listas Then/Else), aplicar o mesmo padrão — extrair `SortableActionList` como componente reutilizável para não duplicar código.

**Fora do escopo:** arrastar uma ação de fora do if/else para dentro (só reordena dentro do próprio container).

---

## 2) Grupos aninhados de condições (AND/OR encadeados)

**Hoje:** `ConditionGroup = { logic, rules[] }` — só um nível.

**Entrega:**

- Estender o tipo em `flowConditionFields.ts`:
  ```ts
  type ConditionNode = ConditionRule | ConditionGroup;
  type ConditionGroup = { logic: "AND" | "OR"; children: ConditionNode[] };
  ```
  Discriminador: presença de `children` = grupo; presença de `field` = regra.
- Migração transparente: `evaluateCondition` aceita ambos os formatos (`rules` legado vira `children`). Nenhum flow existente quebra.
- UI (`FlowIfElseEditor` + `FlowConditionsDialog`): grupo renderizado como card indentado com borda esquerda colorida. Botões no topo de cada grupo: `+ Regra`, `+ Grupo`, toggle `AND/OR`, botão remover grupo (exceto raiz).
- Limite: profundidade máxima 3 níveis (evita UI ilegível) — botão `+ Grupo` fica disabled no nível 3 com tooltip "Máx. 3 níveis".
- Backend (`orbit-flow-executor/index.ts`): reescrever `evaluateCondition` como recursivo — se nó tem `children`, avalia cada um e combina com `logic`; senão avalia como regra. Um único caminho para os dois formatos.

**Compat:** flows salvos com `rules[]` continuam válidos — helper `normalizeCondition()` converte on-read.

---

## 3) Edição inline de templates de mensagem

**Hoje:** ação `send_whatsapp_template` exige `template_slug` digitado; usuário sai do fluxo para `/orbit/templates`, cria, volta e cola o slug.

**Entrega:**

- Substituir o `Input` de `template_slug` em `FlowActionsEditor.tsx` por um `TemplateSelectField` (novo componente):
  - `Combobox` (shadcn `Command` + `Popover`) listando `useOrbitTemplates({ canal: 'whatsapp', ativo: true })`.
  - Cada item mostra `nome` + preview de 1 linha do `corpo` truncado.
  - Item fixo no topo: **"+ Criar novo template"** → abre `TemplateQuickCreateDialog` (novo).
  - Item fixo abaixo do selecionado: **"✎ Editar este template"** → abre o mesmo dialog em modo edição.
- `TemplateQuickCreateDialog`: formulário mínimo — `nome`, `canal` (default `whatsapp`, mas configurável), `categoria`, `corpo` (textarea com contador de caracteres e hint de variáveis `{{prospect.nome}}`, `{{deal.valor}}`). Ao salvar, usa `useCreateTemplate`/`useUpdateTemplate` (já existentes em `useOrbitTemplates.ts`), invalida a query e auto-seleciona o template recém-criado na ação.
- Preview inline abaixo do select: mostra o corpo do template com variáveis destacadas (badge `{{...}}`). Se o template tem mídia (áudio/imagem), badge indicando.
- Persistência do vínculo: continua salvando `template_slug` no `action_config` (não muda backend), mas também `template_id` como referência secundária (útil se o slug mudar).

**Escopo estendido opcional:** ação `send_rich_media` recebe o mesmo tratamento — Combobox de templates filtrado por `canal in ('whatsapp','email')` conforme o subtipo.

---

## 4) Switch/case — ramificações com N saídas

**Hoje:** só `if_else` (2 saídas). Cenários como "encaminhar por origem do lead" viram cadeia aninhada de if/else, ilegível.

**Entrega:**

- Novo `action_type = "switch"` em `useOrbitFlows.ts` (`OrbitFlowActionType`).
- Estrutura em `action_config` (JSONB, sem migration):
  ```json
  {
    "field": "prospect.origem",
    "cases": [
      { "id": "c1", "label": "Instagram", "match": { "op": "equals", "value": "instagram" }, "actions": [...] },
      { "id": "c2", "label": "Site (form)", "match": { "op": "in", "value": "site,form,landing" }, "actions": [...] }
    ],
    "default": { "actions": [...] }
  }
  ```
  Reusa os mesmos `ConditionOp` do if/else — cada `case` é uma regra única contra o `field` comum. Isso mantém a UI simples (sem duplicar catálogo de operadores).
- Editor (`FlowSwitchEditor.tsx`, novo): 
  - Topo: dropdown com o `field` avaliado (usa `FLOW_CONDITION_FIELDS`).
  - Lista vertical de casos, cada um em card colapsável: label editável, operador + valor, sublista de ações (reusa `SortableActionList` do item 1). Botão `+ Adicionar caso`, drag para reordenar prioridade.
  - Caso `default` fixo no fim (não removível).
- Avaliação backend (`orbit-flow-executor/index.ts`): case `switch` — avalia `cases` em ordem, executa o primeiro match; se nenhum, executa `default`. Retorna `{ case_id, steps }` no output do step.
- Picker: adicionar card "Roteamento (múltiplos caminhos)" no `ActionPickerDialog` com ícone `Split`.
- Resumo na lista: `Se {field}: {N} caminhos + padrão`.

---

## Detalhes técnicos

**Arquivos tocados:**


| Item        | Novos                                                      | Editados                                                                                                     |
| ----------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1 DnD       | `SortableActionList.tsx`, `useReorderFlowActions.ts`       | `FlowActionsEditor.tsx`, `FlowIfElseEditor.tsx`, `package.json` (`@dnd-kit/*`)                               |
| 2 Aninhado  | —                                                          | `flowConditionFields.ts`, `FlowIfElseEditor.tsx`, `FlowConditionsDialog.tsx`, `orbit-flow-executor/index.ts` |
| 3 Templates | `TemplateSelectField.tsx`, `TemplateQuickCreateDialog.tsx` | `FlowActionsEditor.tsx`                                                                                      |
| 4 Switch    | `FlowSwitchEditor.tsx`                                     | `FlowActionsEditor.tsx`, `useOrbitFlows.ts`, `orbit-flow-executor/index.ts`                                  |


**Sem migration de schema** em nenhum item — tudo cabe em `action_config` JSONB.

**Ordem de merge (baixo → alto risco):**

1. DnD (só front, ganho imediato)
2. Edição inline de templates (front + reuso de hooks existentes)
3. Grupos aninhados (front + 1 função no executor, com fallback compat)
4. Switch/case (novo action_type, front + executor)

Cada item é testável isoladamente com um fluxo real no `/orbit/config → Fluxos`.  
Lovable adicione um log de erro detalhado no `orbit-flow-executor`. Se uma condição falhar, você precisa saber *exatamente* qual regra não bateu, senão você vai ficar caçando erro no escuro.

---

## Fora do escopo

- Simulador visual do fluxo (grafo tipo n8n) — grande refactor, fica para V3.
- Versionamento/histórico de edições do fluxo.
- Templates de fluxo com placeholders parametrizados.
- Testes A/B nativos (rodar 50% em cada branch).