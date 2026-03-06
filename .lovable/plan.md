

# Bug: Campanha WhatsApp mostra 0 destinatários

## Problema raiz

Dois problemas combinados:

1. **`total_destinatarios` salvo como 0 no banco**: Em `handleCreate` (linha 386), o campo `total_destinatarios` usa `estimatedRecipients`, que é um `useState(0)` atualizado apenas ao clicar "Próximo" no passo 3. Se o estado não foi atualizado corretamente (ex: navegação rápida, ou bug de timing), o valor fica 0. Porém os recipients **são inseridos corretamente** na tabela `orbit_campaign_recipients` via `calculateAllRecipientIds()`.

2. **Contagem na listagem depende de `total_destinatarios` como fallback**: Na `CampanhasPage` (linha 250), `totalRecipients = counts?.total || c.total_destinatarios || 0`. Se a query de `orbit_campaign_recipients` não retornar dados (ex: campanha cancelada com recipients deletados, ou timing de query), e `total_destinatarios` é 0, mostra 0.

## Correção

### `src/components/orbit/CampaignWizard.tsx`

Na função `handleCreate`, calcular `total_destinatarios` diretamente em vez de usar o estado `estimatedRecipients`:

```typescript
// Linha 386 — substituir estimatedRecipients por cálculo direto
const recipientIds = calculateAllRecipientIds();
const recipientProspects = prospects.filter(p => recipientIds.includes(p.id));

const campaign = await createCampaign.mutateAsync({
  ...
  total_destinatarios: recipientIds.length,  // era: estimatedRecipients
  ...
});
```

Mover o cálculo de `recipientIds` para antes da criação da campanha, e reutilizar nos dois lugares (campanha + insert de recipients).

### `src/pages/orbit/CampanhasPage.tsx`

Nenhuma mudança necessária — a query de `orbit_campaign_recipients` já funciona como fonte primária. Com `total_destinatarios` correto no banco, o fallback também funcionará.

## Resumo

| Arquivo | Mudança |
|---|---|
| `CampaignWizard.tsx` | Usar `calculateAllRecipientIds().length` diretamente em `handleCreate` em vez do estado `estimatedRecipients` |

