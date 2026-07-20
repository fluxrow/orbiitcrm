# Orbit WhatsApp Outbox — Fase 1+2 (Shadow/Queue Foundation)

> **Status:** Fundação entregue em modo **SHADOW**. Nenhum caminho de envio real foi trocado nesta fase.
> **Kill switch global (`envio_real_liberado`) permanece autoritativo.** O worker respeita.

## O que está pronto

### 1. Schema — `orbit_whatsapp_outbox`
- Colunas por `source_type` (`campaign|flow_initial|flow_followup|ai_reply|manual`).
- Índices críticos:
  - `(empresa_id, status, priority DESC, scheduled_for)` — claim rápido.
  - `(idempotency_key) UNIQUE` — dedupe forte.
  - `(empresa_id, prospect_id, source_type) WHERE status IN ('queued','processing','scheduled')` — cancelamento por resposta.
  - `(campaign_id, status)` parcial — reconcile eficiente.
- RLS habilitado. `service_role` full, `authenticated` só leitura do próprio tenant. `anon` sem acesso.

### 2. RPCs (SECURITY DEFINER, `search_path=public`)
- `outbox_claim_batch(_empresa_id, _batch, _worker_id, _lease_seconds)` — claim FIFO por prioridade com lock (`FOR UPDATE SKIP LOCKED`).
- `outbox_cancel_by_prospect(_empresa_id, _prospect_id, _reason, _source_types)` — usada para cancelar follow-ups quando o lead responde.
- `reconcile_campaign_counters(_campaign_id)` — recalcula contadores de campanha a partir dos destinatários. Aceita status em PT/EN. **Corrigido:** reconhece `enviado` (singular).

### 3. Helper compartilhado — `supabase/functions/_shared/orbit-whatsapp-outbox.ts`
- `checkEligibility({ empresa_id, prospect_id, conversa_id, source_type, event_created, campaign_id, ... })` — regra única:
  - `flow_initial`: exige `event_created=true` + nenhum OUT/IN real prévio.
  - Bloqueios universais: `human_handoff`, `lead_replied`, `meeting_scheduled`, `deal_terminal`, `opt_out`, `prospect_deleted`.
  - `ai_reply` e `manual` não são bloqueados por `lead_replied` (são a resposta em si).
- `enqueueOutbox(...)` — chama `checkEligibility` + insere respeitando `idempotency_key` derivado (dedupe forte).
- `cancelOutboxByProspect(...)` — cancela fila pendente do prospect.

### 4. Worker — `orbit-whatsapp-outbox-tick`
- Cron: `orbit-whatsapp-outbox-tick-1min` a cada 1 min.
- Respeita: `envio_real_liberado`, `daily_limit`, `max_per_minute`, `business_window`.
- Recheca elegibilidade **antes de enviar** (evita race condition: se o lead respondeu entre enqueue e claim, cancela).
- Metadata `simulate:true` → marca como `simulated`, sem chamada Z-API (usado por testes).
- Auditoria em `orbit_zapi_send_audit` + `orbit_mensagens` OUT.
- `verify_jwt = false` (chamada apenas pelo cron autenticado via token no header).

### 5. Reconciliação — Campanha `Leads novos` (Fábrica)
- Antes: `enviados=2, total=188`.
- Depois: `enviados=50, total=188, falhas=0`.
- **Sem tocar em:** `status`, `aprovacao_status`, `orbit_campaign_recipients`, ritmo, agendamento.

---

## O que **ainda NÃO** está roteado pelo outbox (por segurança)

| Caminho | Estado atual | Próxima fase |
| --- | --- | --- |
| Campanha (`send-orbit-campaign`) | Envia direto via Z-API (com kill switch + ritmo) | Ativar adapter quando `outbox_adapter_enabled=true` |
| Flow real (`orbit-flow-executor`, `dry_run=false`) | Envia direto | Trocar `sendZapi()` por `enqueueOutbox()` |
| AI reply (`orbit-ai-agent`) | Envia direto (4 pontos) | Enfileirar com prioridade 100 |
| Envio manual (`orbit-send-message`) | Envia direto | Enfileirar com prioridade 80 |

**Motivo:** garantir ambiente estável e observável antes de trocar caminhos live. A fundação já suporta os 4 casos — o roteamento é a Fase 3.

---

## Smoke tests (16 cenários)

`supabase/functions/orbit-whatsapp-outbox-tick/smoke_test.ts` cobre:

- **A.** `flow_initial` com `event_created=true` e sem histórico → enfileira.
- **B.** Mesmo `flow_run_id` chamado 2× → `duplicate` (dedupe).
- **C.** `event_created=false` (merge) → `lead_not_new`.
- **D.** OUT real prévio → `already_contacted`.
- **E.** IN prévio → `lead_replied`.
- **F.** Conversa em `human_talk=true` → `human_handoff`.
- **G.** Meeting futura scheduled → `meeting_scheduled`.
- **I.** `optout_whatsapp=true` → `opt_out`.
- **J.** Cancel por resposta cancela follow-ups pendentes.
- **L.** Prioridade `ai_reply > flow_followup > campaign` no claim.
- **O.** Dry-run flows não chegam ao outbox (guard semântico).
- **P.** Reconcile da campanha 314e6e23 preserva `status`, `aprovacao_status` e recipients.

Todos usam tenants **sintéticos** com prefixo `OUTBOX_SMOKE_*` e cleanup total. `metadata.simulate:true` garante zero Z-API real.

Rodar (local, com service role):
```bash
deno test --allow-net --allow-env supabase/functions/orbit-whatsapp-outbox-tick/smoke_test.ts
```

---

## Kill switch e trilha de auditoria

- `envio_real_liberado=false` na `orbit_zapi_config` **continua bloqueando** todos os caminhos, inclusive o worker do outbox.
- Cada tentativa (bloqueada ou não) gera linha em `orbit_zapi_send_audit`.
- Cancelamentos preenchem `canceled_reason` e `canceled_at` no `orbit_whatsapp_outbox`.

## Rollback

Se necessário, desativar apenas o worker:
```sql
UPDATE cron.job SET active=false WHERE jobname='orbit-whatsapp-outbox-tick-1min';
```
A tabela `orbit_whatsapp_outbox` continua recebendo itens (shadow) — nada é enviado até a próxima ativação.
