# Roadmap Atualizado — Pós Etapa 2

> **Etapa 2 (Motor de Fluxos) — entregue.** Schema, triggers no CRM, dispatcher + executor com `pg_cron`, 5 handlers de ação, UI em /orbit/config e hook do `orbit-ai-agent` emitindo `prospect_qualified` ao vivo.

## Diretrizes globais (aprovadas)

- **Zero seeds globais para regras de negócio**. Tudo que envolve valores específicos da operação (highlight rules, gatilhos, condições) é **100% tenant-scoped** com RLS estrita por `empresa_id`. O sistema pode sugerir categorias; o usuário define gatilhos e valores.
- **Identidade visual premium**. Cor de marca `#f9b217` (token `--brand` em `index.css`, classe Tailwind `brand`) para tags de destaque, toggle IA ativo e CTAs de ação. Evitar verde/azul genéricos de sistema nesses pontos. Estética editorial.
- **Paralelizar quando não houver dependência**. Backend de F1 roda em paralelo com componentes visuais de F2/F3.

---

## Etapa 2.5 — Mapa de Fluxos + Raio-X do Lead

### F1 — Mapa "Eventos → Fluxos" em /orbit/config ✅ ENTREGUE

- `useFlowEventMap()` agrupa fluxos por `trigger_type` a partir do catálogo (`TRIGGER_CATALOG`).
- `FlowEventMap.tsx` renderiza painel acima da lista, com badge "N ativo(s)" em cor de marca ou "Nenhum fluxo escutando".
- Botão **Testar** por evento → `useTriggerTestEvent` insere evento sintético em `orbit_flow_events` (`payload.is_test=true`) e invoca o dispatcher.
- Integrado em `FluxosTab`.

### F2 — Raio-X da Qualificação (frontend pronto) ✅ ENTREGUE

- `ProspectRaioX.tsx` com parser tolerante (`dados_adicionais` aceito como array `{pergunta, resposta}`, objeto plano, string JSON).
- Seção colapsável, ordem estável, truncamento com "ver mais" em respostas longas.
- Borda/header em cor de marca `--brand`.
- **Pendente**: plugar em `ProspectActionCard` e/ou drawer de detalhes do prospect (próximo commit pequeno).

### F3 — Tags de Destaque Automáticas (frontend pronto) ✅ FRONTEND ENTREGUE

- **Sem seeds globais** — confirmado.
- `useLeadHighlightRules()` lê de `orbit_lead_highlight_rules` filtrado por `empresa_id` (degrada para `[]` enquanto a tabela não existir).
- Avaliador (`evaluateHighlights`) suporta operadores `equals | not_equals | contains | gte | lte | regex | exists`.
- `LeadHighlightTags.tsx` renderiza badges em `--brand` (15% bg, 40% border, 100% texto).
- **Pendente (backend)**: migration `orbit_lead_highlight_rules` (id, empresa_id, campo, operador, valor, label, emoji, ativo) com RLS por tenant + GRANT a `authenticated`/`service_role` + UI de gestão em /orbit/config aba "Tags Automáticas".

### F4 — Barra de Ações Rápidas no Card (próximo)

Adicionar ao `ProspectActionCard` e ao header do drawer:
1. **Toggle IA on/off** — patch em `orbit_conversas.human_talk` da conversa ativa. Cor `--brand` quando IA ativa (ao invés de verde sistema).
2. **Mover etapa** — dropdown com etapas do funil; `update orbit_deals.etapa_id` (cria deal via `ensure_deal_for_prospect` se necessário).
3. **Forçar fluxo** — popover lista fluxos ativos da empresa; insere evento `manual_trigger` em `orbit_flow_events` com `payload.flow_id` forçado; dispatcher trata como override.

Smoke: toggle IA alterna `human_talk` · mover etapa emite `deal_stage_changed` e fluxos rodam · forçar fluxo cria 1 run.

---

## Etapa 3 — Entrada de Dados e Retenção

Usa o motor já pronto. Adiciona portas de entrada e despertadores.

### F1 — Webhook Receiver Nativo
- Edge function `orbit-webhook-receiver` em `/{empresa_id}/{source}`.
- Token único por empresa em `orbit_webhook_tokens` (rotacionável via UI).
- Payload livre → mapeia campos conhecidos para `orbit_prospects`; resto cai em `dados_adicionais` (JSONB).
- Cria prospect + emite `webhook_received` (e opcionalmente `prospect_qualified`).
- UI aba **Webhooks** em /orbit/config: URLs, copy, regerar token, histórico das últimas 50 chamadas.

### F2 — Importador Inteligente de CSV
- Wizard 3 passos: upload → mapeamento "De → Para" → preview + confirmação.
- Não mapeado vira `dados_adicionais`.
- Bulk insert em lotes de 500 com progresso.
- Deduplicação por telefone/email/CNPJ (regras existentes).
- Pós-import opcional: enfileirar N eventos `manual_trigger` para fluxo específico.

### F3 — Anti No-Show (Gatilhos por Data/Hora)
- Tabela `orbit_meetings` (1 deal → N reuniões) com `data_hora_reuniao`.
- `orbit-meeting-scheduler` via `pg_cron` cada 10min.
- Emite `meeting_reminder_24h` e `meeting_reminder_1h` com dedupe por `(meeting_id, kind)`.
- Novos `trigger_type` no catálogo do wizard.
- Templates seed da empresa (não globais com valores fixos): estrutura sim, valores não.

### F4 — Observabilidade e Smoke Tests
- `scripts/smoke/etapa-3.sh`: webhook synthetic → prospect criado → fluxo rodou; CSV upload; meeting → evento emitido.
- Painel "Saúde do Motor" em /orbit/config: eventos por tipo nas últimas 24h, taxa de sucesso, p95 dispatcher→executor.

---

## Ordem revisada (paralelização)

```text
Etapa 2.5
  [DONE] F1 Mapa Eventos→Fluxos          (backend + UI)
  [DONE] F2 Raio-X (componente)          (paralelo)
  [DONE] F3 Tags (avaliador + tags UI)   (paralelo, sem seeds globais)
  ...    F3 backend: migration tenant + UI de regras
  ...    F2/F3 integração no ProspectActionCard
  ...    F4 Ações Rápidas (Toggle IA / Mover / Forçar)

Etapa 3
  F1 Webhook Receiver
  F2 Importador CSV
  F3 Anti No-Show
  F4 Smoke + Observabilidade
```

## Fora deste escopo (Etapa 4+)

- Editor visual drag-and-drop (n8n-like).
- Branching condicional (if/else dentro do fluxo).
- Webhook outbound (motor chama URL externa como ação).
- A/B testing de fluxos.
