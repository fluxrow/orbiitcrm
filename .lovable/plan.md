

# Fix: "Cannot access 'aiContexto' before initialization"

## Problema
No `orbit-ai-agent/index.ts`, as linhas 143-144 usam `aiContexto` antes da declaração na linha 147. Isso causa o erro `Cannot access 'aiContexto' before initialization` porque `const` não permite hoisting.

## Solução
Mover a declaração de `aiContexto` (linha 147) para antes do seu primeiro uso (linha 143).

## Alteração

**`supabase/functions/orbit-ai-agent/index.ts`**

Reordenar linhas 141-147:

```typescript
const mensagensIN = mensagens?.filter((m) => m.direcao === "IN").length || 0;
const mensagensOUT = mensagens?.filter((m) => m.direcao === "OUT").length || 0;

const aiContexto = conversa?.ai_contexto || {};
const introAlreadySent = aiContexto.intro_already_sent === true;
const isFromCampaign = aiContexto.origin === "outbound_campaign";
const primeiraInteracao = !introAlreadySent && (mensagensOUT === 0 || mensagensIN <= 1);

const emColetaOrcamento = aiContexto.em_coleta_orcamento || false;
// ... rest unchanged
```

Um único arquivo, uma reordenação de 4 linhas.

