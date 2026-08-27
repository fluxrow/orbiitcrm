# Homologação — Viver: lembretes e convite da aula (Wave 1)

Data da revisão: 2026-08-27  
Tenant: `viver-semijoias`  
Status atual: **BLOQUEADA PARA ATIVAÇÃO**

## Evidências aprovadas

- Google Calendar conectado no tenant, com timezone `America/Sao_Paulo`.
- Template canônico ativo `Aula Grupo - Envio Link` com um único Google Meet.
- Reuniões antigas confirmadas pelo Super Admin foram encerradas como
  `completed`; a reunião individual futura permaneceu intacta.
- Guardas de lembrete bloqueiam reunião cross-tenant, tipo desconhecido,
  execução adiantada, atrasada, iniciada ou encerrada.
- Convite Google preserva participantes existentes, usa `etag`, é idempotente e
  só aceita um evento futuro único que coincida com terça-feira às 19h30 e com o
  Meet canônico.
- Sandbox não chama o Google real nem envia WhatsApp.
- Novos fluxos de 24h e 5min são criados inativos.

## Evidências pendentes e bloqueadoras

- O evento oficial da aula aparece apenas no Google Calendar; ele não está
  persistido como reunião autoritativa do Orbit. A próxima instância precisa ser
  resolvida pelo backend e validada contra horário e Meet canônico após deploy.
- O build Vite local não inicia porque arquivos/dependências locais ficam
  bloqueados durante leitura; `tsc` e os checks Deno passam, mas isso não
  substitui um build concluído.
- Migration e Edge Functions ainda não foram publicadas juntas.
- Os fluxos ainda não passaram por dry-run no ambiente publicado.

## Condições para aprovação

1. Build concluído em ambiente limpo/CI.
2. PR sem conflitos e checks verdes.
3. Publicação conjunta da migration, `orbit-ai-agent`,
   `orbit-meeting-scheduler` e dependências compartilhadas.
4. Resolução read-only da próxima aula oficial com correspondência única.
5. Dry-run dos lembretes de 24h e 5min sem criar outbox real.
6. Auditoria de backlog igual a zero antes da ativação.
7. Ativação canário separada e inspeção pós-deploy.
