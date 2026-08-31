# Arquitetura — lembretes da aula em grupo da Viver

Data: 2026-08-31  
Tenant inicial: Viver Semijoias (`36f26579-66ad-4ef1-9788-141e4c727232`)

## Problema

O aceite da aula era salvo apenas em `orbit_conversas.ai_contexto` e a entrega
do link dependia de encontrar um evento único no Google Calendar. Isso deixou
duas lacunas:

- o aceite explícito não criava uma entidade agendada no Orbit;
- sem um evento Google futuro às 19h30 com o Meet canônico, o participante não
  entrava no scheduler de lembretes.

O marcador `agent_runtime_version` também não aparece em produção quando o
repositório é publicado sem publicar a Edge Function `orbit-ai-agent`.

## Alternativas consideradas

### A. Evento coletivo + tabela de participantes

Modelar `orbit_class_events` e `orbit_class_participants` separadamente.

- Prós: semântica ideal e melhor UI futura.
- Contras: exige scheduler, executor, piloto e telas novos antes da aula.

### B. Uma participação como `orbit_meetings` por prospect (escolhida)

Quando o lead aceita a aula, criar uma reunião tenant-scoped com
`metadata.meeting_kind = viver_group_class` e uma chave da ocorrência.

- Prós: reutiliza o scheduler, as janelas de 24h/5min, a revalidação no worker,
  a idempotência e o fail-closed já homologados.
- Contras: a tabela de reuniões passa a representar também participação em aula.

### C. Campanha única para cada aula

- Prós: rápida para um único dia.
- Contras: não resolve o produto e exige operação manual toda semana.

## Decisão

Usar a alternativa B agora. Ela elimina o buraco entre aceite e lembrete sem
criar um segundo motor de envio. A alternativa A fica como evolução apenas se a
UI precisar administrar turmas, presença e lotação.

## Contrato

1. O aceite precisa ser uma mensagem inbound explícita na mesma conversa e no
   mesmo tenant.
2. A autoridade do acesso continua sendo o único Google Meet presente no
   template ativo `Aula Grupo - Envio Link`.
3. A ocorrência é sempre a próxima terça-feira às 19h30 em
   `America/Sao_Paulo`, com duração de 90 minutos.
4. A chave `class_occurrence_key` torna a criação idempotente por
   empresa + prospect + ocorrência.
5. O scheduler existente emite `meeting_reminder_24h` e
   `meeting_reminder_5m`; o worker revalida tenant, prospect, conversa,
   opt-out, handoff, estado e janela antes de enviar.
6. O Google Calendar é complementar. Falha ou ausência do evento não pode
   apagar o opt-in nem impedir o lembrete no WhatsApp.
7. O deploy da Edge Function é condição necessária para que novos aceites criem
   automaticamente a participação. Publicar apenas o site não conta como deploy
   do runtime.

## Segurança e rollback

- Índice parcial impede duplicidade por ocorrência.
- Backfill é restrito a evidências inbound conhecidas e verificadas.
- Nenhum telefone, mensagem integral ou link é gravado na auditoria.
- Para conter uma participação, mudar apenas aquela reunião para `cancelled`.
- Para conter a turma, cancelar somente reuniões com a mesma
  `class_occurrence_key`.

