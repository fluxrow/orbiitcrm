# Auditoria read-only: handoff → devolução para IA e OUTs do celular

Zero mutações executadas. Apenas `SELECT` (psql read-only) e leitura de código. Nenhum deploy, nenhuma mensagem enviada, nenhuma configuração alterada.

## 1. Achados confirmados

### A. `handoff_sent_at` nunca é limpo e silencia a conversa para sempre (crítico, global)

Evidência de código:
- `src/hooks/useOrbitConversas.ts`: "Devolver para IA" grava apenas `human_talk=false, human_user_id=null, ai_processing=false`. Não limpa `handoff_sent_at` nem `ai_contexto.estado`.
- `supabase/functions/orbit-ai-agent/index.ts` (~L2396): aborta a `ai_reply` se `human_talk=true` **ou** `human_user_id` **ou** `handoff_sent_at` preenchido.
- `supabase/functions/orbit-ai-reply-debounce-tick/index.ts` (L143): mesma condição, cancela o job com `last_error='human_talk'`.

Ou seja: qualquer conversa que já passou por handoff fica permanentemente muda para a IA, mesmo depois de devolvida, e a UI mostra "Com a IA" (a lib de posse `src/lib/conversa-ownership.ts` não considera `handoff_sent_at`). Divergência UI × runtime confirmada.

Conversas hoje em `human_talk=false` + `human_user_id` nulo + `handoff_sent_at` preenchido (mudas, mas exibidas como "Com a IA"):

| Empresa | Conversas presas |
|---|---|
| Fabrica de Pesquisadores | 9 |
| Promotrip Corporate | 4 |
| Viver Semijoias | 1 |
| Fluxrow | 1 |

`ai_contexto.estado='handoff'` com `human_talk=false` (marcador residual): Fábrica 6, Promotrip 4, Viver 1, Fluxrow 1 (Bullink: 17 casos, todos ainda com `human_talk=true`).

Panorama por tenant (`orbit_conversas`, `handoff_sent_at` de 2026-03-20 a 2026-08-17):

| Empresa | Total | HT+dono | HT sem dono | Devolvida c/ marcador antigo | estado=handoff s/ HT | HT=false c/ dono |
|---|---|---|---|---|---|---|
| Fabrica de Pesquisadores | 659 | 13 | 4 | 9 | 6 | 0 |
| Bullink Negocios | 546 | 14 | 491 | 0 | 0 | 0 |
| Viver Semijoias | 244 | 0 | 1 | 1 | 1 | 0 |
| Promotrip Corporate | 123 | 4 | 0 | 4 | 4 | 0 |
| Fluxrow | 42 | 7 | 0 | 1 | 1 | 0 |

Os 491 casos "HT sem dono" da Bullink são o isolamento em massa de 17/08 (esperado, não é bug): aparecem como "Aguardando atendimento humano" e não recebem IA.

Filas: `orbit_ai_reply_debounce` hoje só tem `done` (145) e `canceled/nothing_to_answer` (31) — nenhum cancelamento ativo por handoff. No `orbit_whatsapp_outbox` há cancelamentos históricos por `human_handoff` (Fábrica 2, Bullink 4). Retenções atuais são de warmup (`WARMUP_DAILY_LIMIT`), não de handoff.

### B. Mensagens enviadas pelo celular: dois motivos distintos, ambos confirmados

1. **O callback `on-send` é inútil na prática.** Nos últimos 30 dias, 100% dos 3.523 eventos `on-send` têm `payload.type='DeliveryCallback'` (nenhum com `text`, `fromMe` ou `fromApi`) e são descartados em `orbit-webhook` (L373, `STATUS_ONLY_CALLBACKS`) antes de qualquer resolução de tenant. Consequência: o gate `notificar_enviadas_por_mim` (L515) e o motivo `own messages disabled` **nunca são alcançados** — 0 ocorrências em 30 dias. A Z-API entrega o conteúdo do celular pelo `on-receive` com `fromMe=true, fromApi=false`, não pelo `on-send`.

2. **`on-receive` recebe as mensagens do celular, mas descarta por telefone em formato LID.** Nos últimos 7 dias, 315 eventos foram ignorados com `no_phone`; em todos eles `payload.phone` termina em `@lid` (17–19 caracteres, não numérico) e `participantPhone` é nulo. `extractInboundPhone` normaliza só dígitos → devolve vazio → descarte. Afeta 296 OUTs do celular **e ~19 INBOUNDs de leads** (perda de lead, não só de histórico).

Distribuição `on-receive` (30 dias, por instância mascarada):
- `3E12***` (Bullink): 300 `no_phone` com `fromMe=true/fromApi=false`; 1.197 `duplicate_message` com `fromApi=true` (correto: já gravado pelo Orbit); 41 processados.
- `3F14***` (Fábrica): 14 `no_phone`; 270 `duplicate_message`; 4 OUTs externas processadas.
- `3EBC***` (Viver): 1 processada.
- `no phone or skipped fromMe` (2.117) só ocorre até 2026-08-11 — comportamento antigo já corrigido.

Tendência: `no_phone` está em alta — 333 em 30 dias, 315 em 7 dias, 29 nas últimas 24h. É regressão recente do provedor (migração do WhatsApp para LID), não histórico.

Origem das OUTs (30 dias): Bullink 1.717 OUT, 508 sem correspondência no outbox; Viver 1.529 OUT / 306 sem match; Fábrica 1.242 / 132. As OUTs capturadas via webhook atualizam `orbit_mensagens` e `ultima_mensagem_at` normalmente (caminho L896-902) — o problema é exclusivamente de extração de telefone, não de gravação.

### C. `orbit_zapi_config` global

| Empresa | ativo | notificar_enviadas_por_mim | instance_id | offline | envio_real |
|---|---|---|---|---|---|
| Bullink Negocios | sim | false | 3E12***73F | não | true |
| **Fabrica de Pesquisadores** | sim | **true** | 3F14***B0B | não | true |
| Promotrip Corporate | sim | false | 3EF4***421 | sim | false |
| Viver Semijoias | não | false | 3EBC***597 | não | false |
| Fluxrow | não | false | — | não | false |

Tenants ativos: 1 com `true`, 2 com `false`, 0 nulos. A Fábrica é a única com a flag ligada — e mesmo assim não captura OUTs do celular, porque o descarte acontece antes do gate. Nenhum token, client_token ou telefone foi lido.

### D. Contexto do agente pós-handoff

Conversas com handoff que têm OUT no histórico depois do handoff: Bullink 18/20, Fábrica 9/9, Promotrip 4/4, Viver 1/1, Fluxrow 1/1 — o histórico humano existe. Porém conversas com mais de 20 mensagens desde o último handoff (a janela de 20 do agente corta parte do período humano): Bullink 3, Fábrica 1, Promotrip 1, Viver 1. Risco real, porém secundário.

### E. Fábrica de Pesquisadores (fa0ac793…)

- 659 conversas; 13 HT com dono, 4 HT sem dono, **9 devolvidas com marcador antigo (mudas)**, 6 com `ai_contexto.estado='handoff'`.
- Últimos `on-send`: todos em 18/08 entre 12h e 13h UTC, `ignored / status_callback:DeliveryCallback`.
- OUTs externas (celular) em 30 dias: **4 capturadas vs 79 ignoradas**.
- `no_phone` mais recente: 18/08 20:19 UTC. Fila com 11 itens `pending` retidos por `WARMUP_DAILY_LIMIT`.

## 2. Hipóteses não confirmadas

- Não há evidência de `instance_unresolved`/`ambiguous` (0 em 30 dias) nem de perda por tenant errado; `instance_id_missing` só 2 casos em 13/08.
- Não há evidência de tentativa de resposta da IA bloqueada por handoff nas últimas 24h — as conversas presas simplesmente não recebem inbound novo, então o silêncio é latente e explode no próximo inbound.
- Se a Z-API oferece um endpoint de resolução LID → telefone, não foi validado (exigiria chamada externa; fora do escopo read-only).

## 3. Causa raiz priorizada

1. **P0 — `handoff_sent_at` tratado como bloqueio permanente sem contrapartida na devolução.** Corrigir na devolução (limpar marcador) e no gate (avaliar posse, não histórico). 15 conversas mudas hoje, em 4 tenants.
2. **P0 — telefone em formato LID não resolvido no `on-receive`.** Perde OUTs do celular e leads inbound; em crescimento.
3. **P1 — `on-send` inativo por design do provedor.** A captura de "enviadas por mim" precisa vir do `on-receive` (`fromMe=true, fromApi=false`), com `notificar_enviadas_por_mim` avaliado nesse caminho.
4. **P2 — janela de 20 mensagens do agente** pode omitir o período humano em conversas longas.
5. **P2 — UI de posse não reflete `handoff_sent_at`**, escondendo o estado real do runtime.

## 4. Plano de correção em etapas (não executado)

**Etapa 1 — desbloqueio do handoff (código + dados)**
- Na devolução para IA (`useOrbitConversas`), limpar `handoff_sent_at=null` e `ai_contexto.estado` além de `human_talk/human_user_id`.
- Nos gates (`orbit-ai-agent`, `orbit-ai-reply-debounce-tick`), trocar `handoff_sent_at` por posse real (`human_talk` / `human_user_id`); manter `handoff_sent_at` apenas como histórico/auditoria.
- Backfill tenant-scoped, com snapshot em `orbit_quarantine_backups`, das 15 conversas `human_talk=false + handoff_sent_at not null`. Sem reprocessar inbound antigo.

**Etapa 2 — resolução de LID no webhook**
- `extractInboundPhone`: aceitar `participantPhone`, `connectedPhone`/`chatId` e, quando só houver `@lid`, resolver por LID persistido no prospect/conversa; se irresolúvel, registrar `phone_lid_unresolved` (motivo distinto de `no_phone`) para métrica.
- Persistir o LID por conversa na primeira correlação bem-sucedida, para casar eventos futuros.
- Testes unitários com payloads LID reais (sem PII) nos dois sentidos (`fromMe` e inbound).

**Etapa 3 — captura correta das mensagens do celular**
- Tratar `on-receive` com `fromMe=true, fromApi=false` como OUT externa, sujeita a `notificar_enviadas_por_mim`; manter `fromApi=true` como `duplicate_message`.
- Manter `on-send` apenas como status callback; ajustar observabilidade para não parecer perda.

**Etapa 4 — contexto e UI**
- Ampliar/adaptar a janela de histórico do agente para cobrir tudo desde o último handoff.
- Exibir em `conversa-ownership` o marcador residual de handoff enquanto ele existir.

**Etapa 5 — validação**
- Smoke dry-run por tenant (sem envio real), verificação read-only de `no_phone`/`phone_lid_unresolved` em 24h e conferência de que nenhuma conversa fica muda.

## 5. Queries realizadas (resumo)

- `information_schema.columns` das tabelas envolvidas.
- `orbit_conversas` agregada por empresa: combinações de `human_talk`, `human_user_id`, `handoff_sent_at`, `ai_contexto->>'estado'`, min/max de `handoff_sent_at`.
- `orbit_ai_reply_debounce` por status/`last_error`.
- `orbit_whatsapp_outbox` por status/motivo/`source_type`.
- `orbit_zapi_config` com `instance_id` mascarado; contagem de `notificar_enviadas_por_mim` entre ativos.
- `orbit_webhook_logs` (30d/7d/24h) por `event_type`, `status`, `error_message`, instância mascarada, `payload.type`, `fromMe`, `fromApi`; chaves e formato de `phone`/`participantPhone` nos casos `no_phone`.
- OUTs em `orbit_mensagens` × `orbit_whatsapp_outbox.provider_message_id`; mensagens e OUTs após `handoff_sent_at`; contagem >20 mensagens pós-handoff.
- Recortes específicos da Fábrica de Pesquisadores.

## 6. Confirmação

Zero mutações no banco, no código, em configurações, knowledge, conversas ou webhooks. Zero deploys. Zero mensagens enviadas. Nenhum token, client_token, telefone completo ou conteúdo de mensagem foi exposto.
