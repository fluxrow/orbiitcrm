

# Não criar conversas para campanhas de email

## Problema
Quando uma campanha de email é enviada, o sistema cria registros em `orbit_conversas` e `orbit_mensagens`, fazendo os emails aparecerem na página de Conversas. Conversas só fazem sentido para WhatsApp (bidirecional).

## Solução

### Arquivo: `supabase/functions/send-orbit-campaign/index.ts`

Envolver o bloco "Registrar em Conversas" (linhas 564-633) com uma condição que só executa para campanhas WhatsApp:

```typescript
// ── Registrar em Conversas (apenas WhatsApp) ──
if (campaign.canal === "whatsapp") {
  // ... bloco existente de criação/atualização de conversas ...
}
```

Isso mantém o tracking de conversas para WhatsApp (onde respostas chegam pelo webhook) e elimina a criação desnecessária para email (onde o tracking é feito via `orbit_email_events`).

| Arquivo | Ação |
|---------|------|
| `supabase/functions/send-orbit-campaign/index.ts` | Condicionar criação de conversas apenas para canal WhatsApp |

