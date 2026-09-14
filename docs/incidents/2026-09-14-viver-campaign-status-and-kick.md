# Incidente 2026-09-14 — Viver Semijoias (`36f26579…`)

Escopo: apenas o tenant Viver. Nenhuma alteração de dados, envio, retry, backfill,
público, cópia, áudio, datas ou volume. Travas preservadas
(`viver_campaign_slot_try_acquire`, recusa de campanha Viver em execução dirigida,
cota 15 CAMPAIGN/dia, gap 30 min, followups fora da contagem, operational_date).

## 1. Mapa produtor → enqueue → worker

```text
CAMPANHA
  orbit-campaign-scheduler-tick (cron 1/min)
    ├─ claim: status=agendada + aprovada + agendada_para<=now → aprovada_para_envio
    │      └─ POST send-orbit-campaign
    └─ auto-resume: status=enviando + recipients pendentes + sem envio <90s
           └─ POST send-orbit-campaign
  send-orbit-campaign
    1. gate de autorização de disparo
    2. plano / demo
    3. status := enviando
    4. carrega recipients pendentes
    5. gate kill-switch (envio_real_liberado) ─┐ abort
    6. pré-check de conexão Z-API ─────────────┘ abort
    7. loop: elegibilidade → enqueue no outbox (orbit_whatsapp_outbox)
  orbit-whatsapp-outbox-tick (cron 1/min + modo dirigido)
    → reserva de vaga Viver, quota 15/dia, gap 30 min, warm-up, prioridade → Z-API

AI REPLY
  orbit-webhook → debounce (10s) → orbit-ai-agent
    → enqueue ai_reply no outbox
    → kickOutboxDispatch (flag immediate_outbox_dispatch, timeout 8s, fail-safe)
        → orbit-whatsapp-outbox-tick { outbox_id, empresa_id } (modo dirigido)
  fallback: cron do worker no minuto seguinte
```

## 2. Incidente 1 — campanhas `0b8e3a9a…` (09:30 SP) e `6a5a3c4e…` (10:04 SP)

Causa comprovada (não é falta de kick, nem enqueue skipped):

1. A instância Z-API do tenant está desconectada: `orbit_zapi_config.instance_offline=true`,
   `offline_reason="You are not connected."`, `offline_since=2026-09-14 12:25:17Z`,
   `last_online_at=12:15:15Z`. Logs de runtime: `[zapi-status] http=200 body={"connected":false…}`
   e `[send-campaign] Z-API instance not connected — aborting campaign …`.
   O abort ocorre no passo 6, **antes** do enqueue → zero outbox/provider/OUT
   (comportamento correto do gate).
2. Bug real: no abort o código grava `status='falha'`, mas
   `orbit_campaigns_status_check` **não permite** `'falha'`
   (permitidos: rascunho, agendada, enviando, concluida, pausada, cancelada,
   pendente_aprovacao, aprovada, reprovada, em_revisao, aprovada_para_envio,
   pausada_por_limite). O erro do UPDATE era ignorado, então a campanha ficava
   presa em `enviando` com `motivo_reprovacao` nulo; o auto-resume a reinvocava a
   cada minuto (HTTP 400, `errors:2` por tick) — daí `updated_at` mudando sempre.

Mesmo defeito em outros três pontos do arquivo (`ZAPI_REAL_SEND_BLOCKED`,
final "tudo falhou", caso sem recipients).

## 3. Incidente 2 — `ai_reply 677bd76d…` (51,36 s)

Limitação factual: a retenção de logs de runtime do projeto é de ~9 minutos
(consulta de fontes confirma o log mais antigo em 13:08 de hoje). Os logs de kick
de 12:14 SP-3 já não existem e **não serão inventados**.

Evidência durável disponível: item criado 12:14:16.687Z, `sent_at` 12:15:08.047Z,
`attempts=1`, provider presente. Os ticks do worker rodam ~:04–:05 de cada minuto
com duração 3,3–4,3 s, ou seja 12:15:08 é exatamente o cron seguinte — o item foi
enviado pelo fallback, não pelo kick. Respostas irmãs (12:16:40→45, 12:18:00→06,
12:19:05→11, 12:20:24→30) mostram o kick funcionando em 5–8 s.

Por que o kick pode não entregar sem deixar rastro: a execução dirigida devolve
`ok:true` com `deferred`/`skipped` (recusa de campanha Viver, `higher_priority_pending`,
item já não `pending`) e o helper só olha `resp.ok`. Assim um deferimento
legítimo era indistinguível de um envio imediato nos logs.

Correção mínima (sem re-arquitetura, sem caminho alternativo de envio): o helper
passa a ler o corpo da resposta e reportar `outcome`/`reason`/`deferred`, e o
agente registra isso. Nenhuma mudança de gate, prioridade ou trava.

## 4. Plano mínimo

1. `_shared/campaign-status.ts`: statuses válidos + mapeamento de abort e update
   com erro verificado.
2. `send-orbit-campaign`: usar o mapeamento nos 4 pontos.
   - `ZAPI_DISCONNECTED` → `agendada` + motivo (retomável pelo claim normal quando
     a instância voltar, dentro do mesmo dia operacional).
   - `ZAPI_REAL_SEND_BLOCKED` → `pausada` + motivo (fail-closed, sem auto-resume).
   - "tudo falhou" → `pausada` + motivo.
3. `_shared/immediate-outbox-dispatch.ts`: `KickResult` com `outcome`/`reason`/`deferred`.
4. Testes com stubs (sem mensagem real) e deploy só das funções afetadas.
