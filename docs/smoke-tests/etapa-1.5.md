# Smoke Test — Etapa 1.5 (Pipeline + Agente cria deal)

Cada tarefa tem um checklist manual + um teste automatizado em `scripts/smoke/etapa-1-5.sh`.
Rodar tudo: `bash scripts/smoke/etapa-1-5.sh`.

---

## T1 — Seed automático de etapas padrão

**Automatizado:**
- [x] Todas as `orbit_empresas` têm `>= 6` linhas em `orbit_pipeline_stages`.
- [x] Cada empresa tem exatamente **1** etapa com `is_default = true`.
- [x] Cada empresa tem `>= 1` etapa com `is_won = true` e `>= 1` com `is_lost = true`.
- [x] Inserir nova empresa de teste dispara o trigger e cria 6 etapas.

**Manual:**
- [ ] Abrir `/viver-semijoias/funil` → ver 6 colunas (Novo Lead → Perdido).
- [ ] Configurações → Pipeline mostra as etapas seedadas.

---

## T2 — `ensure_deal_for_prospect`

**Automatizado:**
- [x] Criar prospect → chamar função → retorna `deal_id`, cria 1 linha em `orbit_deals`
  com `origem='auto_agent'`, `etapa_id = is_default`, `status='open'`.
- [x] Chamar 2ª vez para o mesmo prospect → devolve o **mesmo** `deal_id`, sem duplicar.
- [x] Cleanup: remover prospect + deal de teste.

**Manual:** N/A (puro RPC).

---

## T3 — Agente IA registra lead no funil

**Automatizado (proxy):**
- [x] Simular o efeito do agente: atualizar `status_qualificacao='qualificado'` + chamar
  `ensure_deal_for_prospect` → card existe no funil + evento `deal_created_by_ai`
  em `prospect_events`.

**Manual (Z‑API ao vivo):**
- [ ] WhatsApp do tenant demo: mandar de um número novo "tenho interesse, quero comprar".
- [ ] Em < 10s: prospect criado, status `qualificado`, card visível na 1ª coluna do funil.
- [ ] Badge **IA** visível no card; `prospect_events` tem `deal_created_by_ai`.

---

## T4 — Webhook cria prospect

**Automatizado:** validar que existem prospects recentes com `origem_contato='PROSPECTS'`
e `whatsapp` preenchido (proxy de saúde — não simula o webhook).

**Manual:**
- [ ] Mandar mensagem de número desconhecido no Z‑API do tenant demo.
- [ ] Prospect aparece em `/orbit/prospects` em < 5s com `status_qualificacao='novo'`.

---

## T5 — UI: empty state + badge IA

**Manual (puramente visual):**
- [ ] Tenant sem deals → `/orbit/funil` mostra o estado vazio com texto explicativo.
- [ ] Após T3, card do funil mostra badge **IA** + badge de probabilidade.

---

## T6 — Promote idempotente (não executado nesta etapa).

---

## Ordem recomendada
1. `bash scripts/smoke/etapa-1-5.sh` (cobre T1, T2, T3‑auto, T4‑proxy).
2. Validar T3 e T4 manualmente no WhatsApp.
3. Validar T5 visualmente.
4. Só avançar para **Etapa 2 (Motor de Fluxos)** quando todos os checks passarem.
