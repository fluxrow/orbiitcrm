

# Limpar dados do Augusto para novo teste

## Dados encontrados

| Registro | ID | Detalhe |
|---|---|---|
| Prospect duplicado | `be8631c7` | "Augusto Ross Viagens" — whatsapp `554187276129` (sem 9) |
| Prospect original | `7f2de85f` | "Promotrip Corporate" — whatsapp `5541987276129` (com 9) |
| Conversa | `1310cd7c` | 36 mensagens, status "aberta" |
| Handoffs | nenhum | — |

## Ações de limpeza (via insert tool)

1. **Deletar mensagens**: `DELETE FROM orbit_mensagens WHERE conversa_id = '1310cd7c-...'`
2. **Deletar conversa**: `DELETE FROM orbit_conversas WHERE id = '1310cd7c-...'`
3. **Deletar prospect duplicado**: `DELETE FROM orbit_prospects WHERE id = 'be8631c7-...'`

O prospect original "Promotrip Corporate" (`7f2de85f`) permanece intacto com o número correto `5541987276129`.

Isso permitirá testar novamente o fluxo completo: webhook recebe mensagem → normalização de telefone encontra o prospect existente → IA conversa → handoff.

