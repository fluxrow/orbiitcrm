

## Mensagens Fantasmas — Causa Raiz

A conversa `554188667876` (próprio número da instância Z-API) tem **109 mensagens vazias** porque o webhook `orbit-webhook` está tratando **callbacks de status da instância** como mensagens recebidas.

### O que está acontecendo

Cada vez que a instância Z-API reconecta (queda de rede, bateria, etc.), a Z-API faz POST no webhook com:
```json
{ "type": "ConnectedCallback", "phone": "554188667876", "instanceId": "...", "connected": true }
```
ou `DisconnectedCallback`. Esses payloads **não têm texto, mídia, nem messageId**.

O `orbit-webhook/index.ts` decide o tipo do evento pela **query string** (`?event=on-receive`), **ignora o campo `type` do payload**, cai no `default` do switch e processa como mensagem normal — criando uma linha em `orbit_mensagens` com `mensagem=''`, `tipo_midia=null`, `provider_message_id=null`.

Histórico do número `554188667876`:

| `payload.type` | event_type | Contagem |
|---|---|---|
| **ConnectedCallback** | on-receive | **162** ← fantasmas |
| ReceivedCallback (real) | on-receive | 49 |
| DeliveryCallback | on-send | 47 |
| MessageStatusCallback | message-status | 47 |
| DisconnectedCallback | on-receive | 2 ← fantasmas |

A página `ConversasPage.tsx` ainda renderiza a bolha (só com horário) porque o JSX desenha o container mesmo sem texto/mídia.

### Correção (2 partes)

**1. `supabase/functions/orbit-webhook/index.ts` — filtrar callbacks de status**

Logo após ler `payload`, adicionar guarda explícita por `payload.type`:

```ts
const payloadType = payload.type as string | undefined;

// Z-API status callbacks que NÃO são mensagens
const STATUS_CALLBACKS = new Set([
  "ConnectedCallback",
  "DisconnectedCallback", 
  "PresenceChatCallback",
  "ReceivedCallback",      // só processar se tiver conteúdo (ver abaixo)
  "MessageStatusCallback", // já tratado em case message-status
  "DeliveryCallback",      // status, não conteúdo novo
]);
```

E na seção de processamento de mensagem, adicionar guarda dupla:
- Ignorar (`status: "ignored"`, retorna `{ ok:true, skipped:true }`) se `payloadType` for um dos callbacks de status SEM conteúdo, OU
- Se **não houver** `messageText` **nem** `tipoMidia` **nem** `messageId` → ignorar (defesa em profundidade).

Isso bloqueia novas mensagens fantasmas independente do tipo de callback futuro.

**2. Limpeza dos fantasmas existentes**

Migration SQL para remover as 109+ mensagens vazias e zerar contadores:

```sql
-- Apagar mensagens fantasmas (sem texto, sem mídia, sem provider_message_id)
DELETE FROM orbit_mensagens
WHERE (mensagem IS NULL OR mensagem = '')
  AND tipo_midia IS NULL
  AND url_midia IS NULL
  AND provider_message_id IS NULL;

-- Recalcular preview e contador da conversa afetada
UPDATE orbit_conversas c
SET 
  ultima_mensagem_preview = sub.preview,
  ultima_mensagem_at = sub.ts,
  mensagens_nao_lidas = 0
FROM (
  SELECT conversa_id, mensagem AS preview, timestamp AS ts
  FROM orbit_mensagens m
  WHERE m.id = (
    SELECT id FROM orbit_mensagens 
    WHERE conversa_id = c.id 
    ORDER BY timestamp DESC LIMIT 1
  )
) sub
WHERE c.id = sub.conversa_id
  AND c.id = '44944504-4472-45af-81e7-6f777e851f04';
```

A query de limpeza é **global** (não só essa conversa) para o caso de outras instâncias terem sofrido o mesmo problema.

### Defesa adicional (frontend, opcional)

`ConversasPage.tsx` — esconder bolhas totalmente vazias para evitar resíduos visuais caso algo escape no futuro:

```tsx
{mensagens?.filter(m => m.mensagem || m.tipo_midia).map(...)}
```

### Arquivos afetados

| Arquivo | Ação |
|---|---|
| `supabase/functions/orbit-webhook/index.ts` | Adicionar guarda por `payload.type` e por payload sem conteúdo |
| Migration SQL | DELETE mensagens fantasmas + recalcular preview/contador |
| `src/pages/orbit/ConversasPage.tsx` | (opcional) filtrar bolhas vazias no render |

