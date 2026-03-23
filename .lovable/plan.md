

# Detecção de Interação Humana em Campanhas WhatsApp

## Resumo
Adicionar uma etapa de classificação de mensagens recebidas (human_probable, auto_reply, uncertain) antes da IA responder. Quando detectar interação humana real, notificar o comercial via WhatsApp uma única vez. Expandir a máquina de estados com novos estados intermediários.

## Alterações

### 1. Novos campos no `ai_contexto` da conversa
Sem mudança de schema — `ai_contexto` já é JSONB. Novos campos armazenados:
- `human_detected` (boolean)
- `auto_reply_detected` (boolean)
- `commercial_notified` (boolean)
- `first_human_response_at` (timestamp)
- `message_classification` (string)

### 2. Estados expandidos
Atualizar `ConversationState` type e `computeNextState`:
```
novo → aguardando_resposta → auto_reply_detected (se auto_reply)
                           → human_detected (se human_probable)
human_detected → qualificando → qualificado → handoff
```

### 3. Classificação de mensagem via IA
Antes de chamar o agente principal, fazer uma chamada rápida ao Gemini Flash Lite (mais barato/rápido) para classificar a mensagem recebida:

```typescript
// Prompt de classificação
"Classifique esta mensagem de WhatsApp como:
- auto_reply: mensagem automática, institucional, menu, horário de atendimento
- human_probable: saudação real, pergunta contextual, resposta natural
- uncertain: muito vaga

Mensagem: '${mensagemAgregada}'
Responda APENAS com JSON: {\"classification\": \"...\", \"confidence\": 0.0-1.0}"
```

Usar `google/gemini-2.5-flash-lite` para esta classificação (~50 tokens, rápido e barato).

### 4. Lógica de ação pós-classificação
No `orbit-ai-agent/index.ts`, após agregar mensagens e antes de chamar IA principal:

- **auto_reply**: atualizar `ai_contexto.auto_reply_detected = true`, estado → `auto_reply_detected`. IA continua tentando alcançar pessoa real.
- **human_probable**: atualizar `ai_contexto.human_detected = true`, estado → `human_detected` / `qualificando`. Se `commercial_notified === false`, enviar notificação ao comercial e marcar `commercial_notified = true`.
- **uncertain**: não notificar, IA responde normalmente, reavalia na próxima.

### 5. Notificação ao comercial (primeiro sinal humano)
Reutilizar a lógica existente de `handleSellerHandoff` com template adaptado:

```
🟢 *Novo sinal de interação humana detectado*

👤 Prospect: {{personName}}
📱 Telefone: {{phone}}
🏢 Empresa: {{companyName}}
💬 Mensagem: "{{lastInboundMessage}}"
🏷️ Classificação: human_probable
📊 Status: possível interesse inicial

👉 Conversa: {{waLink}}
```

Notificar apenas UMA VEZ por conversa (checar `commercial_notified`).

### 6. Instrução adicional no prompt da IA
Informar a IA sobre a classificação da mensagem para que ela adapte o tom:
- Se `auto_reply`: tentar contornar a automação, perguntar pela pessoa responsável
- Se `human_probable`: seguir qualificação normal

## Arquivo modificado
- `supabase/functions/orbit-ai-agent/index.ts` — classificação, estados expandidos, notificação comercial

## Fluxo técnico

```text
Mensagem IN recebida
       │
       ▼
  Debounce 10s + agregar
       │
       ▼
  Classificar mensagem (Gemini Flash Lite)
       │
       ├─ auto_reply → estado=auto_reply_detected, sem notificação
       ├─ uncertain → sem ação especial
       └─ human_probable → estado=human_detected
              │
              ├─ commercial_notified=false → notificar comercial via WhatsApp
              └─ commercial_notified=true → pular
       │
       ▼
  Chamar IA principal (com classificação no contexto)
       │
       ▼
  Responder + atualizar estado
```

