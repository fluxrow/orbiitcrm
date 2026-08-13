# Verificação read-only pós-commit 7a258bb

Nada foi alterado: sem edições de código, banco, dados, secrets ou configuração, e sem nenhum envio de WhatsApp.

## 1) Deploy das 4 funções — PENDENTE

Sondagem HTTP direta (sem credenciais válidas, apenas leitura do status):

| Função | Resposta agora | Leitura |
|---|---|---|
| orbit-zapi-heartbeat | `404 NOT_FOUND` | **NÃO está deployada** |
| orbit-webhook | `200` | responde, mas versão não comprovada |
| orbit-whatsapp-outbox-tick | `401 unauthorized` | responde, mas versão não comprovada |
| orbit-send-message | `401 UNAUTHORIZED` | responde, mas versão não comprovada |

- O heartbeat está comprovadamente ausente: além do 404 na sondagem, a execução do cron às 12:00Z gravou resposta `404 {"code":"NOT_FOUND"}`.
- Para as outras três, a tentativa de deploy manual falhou por não encontrar os módulos novos (`_shared/zapi-connection.ts`, `_shared/zapi-send.ts`), ou seja a versão em execução é, muito provavelmente, a anterior ao commit. Não existe marcador de versão observável que prove o contrário, então o status é **PENDENTE** para as quatro.
- Indício adicional: no tick de 12:00Z a Fábrica teve `claimed:1, failed:1` (GATE 0 fail-closed não retirou o item da fila — à época a flag offline ainda não estava marcada, portanto o teste é inconclusivo, não uma prova de ausência).

## 2) Cron orbit-zapi-heartbeat-15min — ativo, mas sem execução útil

- `cron.job` jobid 10, schedule `*/15 * * * *`, `active = true`.
- Última execução: 12:00Z, `status = succeeded` — porém isso mede apenas o disparo do `net.http_post`.
- A resposta HTTP correspondente (id 39452) é **404**. Portanto: **PENDENTE** — nenhuma execução bem-sucedida da função após o commit.

## 3) Canal de alerta operacional — configurado, com ressalva (não disparado)

- Destino fixo no código: `5541992361868`.
- Seleção do remetente exige `ativo = true`, `envio_real_liberado = true`, `instance_offline = false`, sem bloqueio temporal.
- Estado atual das instâncias:
  - Fluxrow (master, slug `fluxrow`): `ativo = false`, sem `instance_id` → **não é candidata**.
  - Bullink Negócios: ativa, envio real liberado, online → **único candidato saudável**.
  - Promotrip: ativa, mas envio real não liberado → não candidata.
  - Fábrica: offline → não candidata.
- Conclusão: existe canal saudável, mas o alerta sairia pela instância de um cliente real (Bullink), não pelo tenant master. Não foi disparado nenhum alerta nesta verificação. Enquanto o heartbeat não estiver deployado, o alerta automático de heartbeat não ocorre.

## 4) Estado fail-closed da Fábrica e itens preservados

- `orbit_zapi_config` (instância `3F14C72D…`): `ativo = true`, `envio_real_liberado = true`, `instance_offline = true`, motivo registrado, `send_block_until` nulo.
- Fila: **385 pendentes preservados**, próxima tentativa em 12:16:15Z; **141 failed** acumulados (histórico, inclui 1 falha às 12:00Z).
- Saída real: `0` mensagens OUT nas últimas 3 horas e `0` itens enviados nas últimas 2 horas.
- Ressalva importante: o fail-closed depende do GATE 0 no worker, cuja versão em execução é **PENDENTE** (item 1). Hoje a fila está inerte porque as tentativas foram empurradas para 12:16Z, não porque o gate esteja comprovadamente ativo.

## 5) Testes de MIME — PENDENTE

`supabase/functions/_shared/zapi_connection_test.ts` tem 21 casos (A–U) cobrindo classificação de erro, gates de bloqueio, anti-tempestade de alerta, e roteamento de mídia por tipo lógico (`image`, `document` com extensão, `audio` nativo e degradação para documento) além da regressão de texto (`O: texto usa send-text`, `P: mídia sem url NÃO cai para texto`).

Não há nenhum caso escrito em termos dos MIME pedidos: busca por `image/jpeg`, `video/mp4`, `audio/mpeg`, `application/pdf`, `docx`, `xlsx`, `zip` no arquivo de teste retorna **zero ocorrências**. Cobertura por MIME específico: **PENDENTE**. A regressão de texto está coberta.

## Resumo

| Item | Status |
|---|---|
| Deploy das 4 funções no commit | PENDENTE (heartbeat comprovadamente ausente) |
| Cron ativo | Confirmado |
| Execução bem-sucedida do heartbeat | PENDENTE (404) |
| Canal de alerta saudável | Confirmado, com ressalva (usa Bullink, não o master) |
| Fábrica fail-closed / itens preservados | 385 pendentes, 0 envios; gate no worker PENDENTE |
| Testes por MIME | PENDENTE |
