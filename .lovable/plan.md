

# Ajuste: Debounce de 10 segundos

Alterar o tempo de espera (debounce) no plano aprovado de 4 segundos para **10 segundos** antes do AI agent processar as mensagens agregadas.

A única mudança em relação ao plano já aprovado:

```typescript
// Antes
await new Promise(r => setTimeout(r, 4000));

// Depois
await new Promise(r => setTimeout(r, 10000));
```

Isso dá mais tempo para o prospect terminar de enviar mensagens quebradas antes da IA gerar uma única resposta consolidada.

## Arquivos alterados

| Arquivo | Alteração |
|---|---|
| `supabase/functions/orbit-webhook/index.ts` | Checar `ai_processing` antes de chamar AI (sem mudança) |
| `supabase/functions/orbit-ai-agent/index.ts` | Lock + debounce **10s** + agregar msgs IN pendentes |
| Migration SQL | Adicionar coluna `ai_processing` em `orbit_conversas` |

