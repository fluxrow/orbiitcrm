# Monitor de inbound sem resposta — V1

## Objetivo

Detectar a classe de incidente observada em Bullink e Viver: o inbound é salvo,
mas nenhum claim, debounce, geração ou item de outbox produz uma resposta.

## Comportamento

O scanner roda a cada cinco minutos e considera apenas a última mensagem inbound
de cada conversa nas últimas seis horas. A mensagem precisa ter pelo menos três
minutos, estar dentro da janela operacional do tenant e pertencer a uma conversa
sem atendimento humano, arquivamento ou quarentena.

São excluídos casos com resposta real posterior, claim ainda válido, debounce em
andamento ou `ai_reply` pendente/processando/enviado.

## Segurança da primeira onda

- não chama IA;
- não cria mensagens ou outbox;
- não reprocessa inbound;
- não envia e-mail ou WhatsApp;
- não persiste texto, telefone, nome ou conteúdo da conversa;
- registra somente IDs, tempos, estados técnicos e contagens;
- tabela e função são exclusivas do `service_role`.

## Classificação

- `missing_dispatch`: nenhum artefato de processamento foi criado;
- `execution_failed`: claim terminou em erro ou expirou;
- `delivery_failed`: geração chegou ao outbox, mas falhou;
- `stalled`: existem artefatos terminais, porém nenhuma resposta real.

Incidentes passam de `warning` para `critical` após quinze minutos. Uma resposta
real, atendimento humano, arquivamento ou quarentena resolve o incidente
automaticamente.

## Próxima onda

Somente após medir falsos positivos, o reconciliador poderá receber uma allowlist
tenant-scoped e reprocessar um inbound por vez com idempotência. Alertas externos
também permanecem desligados até a homologação do detector.
