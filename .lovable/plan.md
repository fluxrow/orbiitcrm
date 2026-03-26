

# Mostrar todos os destinatários no Analytics

## Problema
O hook `useOrbitEmailAnalytics` filtra destinatários com `.neq("status", "pendente")`, excluindo quem ainda não foi processado. A campanha pode ter mais destinatários do que os 141 mostrados como "Enviados".

## Solução

### `src/hooks/useOrbitEmailAnalytics.ts`
- Remover o filtro `.neq("status", "pendente")` da query para trazer TODOS os destinatários da campanha
- Ajustar as métricas para contar "Enviados" apenas entre os que têm `status != 'pendente'`
- Adicionar campo `total_recipients` (total geral) separado de `total` (enviados)

### `src/components/orbit/CampaignAnalyticsSection.tsx`
- Adicionar card "Total Destinatários" mostrando o número completo
- Manter "Enviados" como contagem dos efetivamente enviados
- Calcular taxas sobre os enviados (não sobre total)

| Arquivo | Ação |
|---------|------|
| `src/hooks/useOrbitEmailAnalytics.ts` | Remover filtro pendente, adicionar campo total_recipients |
| `src/components/orbit/CampaignAnalyticsSection.tsx` | Exibir total de destinatários + enviados separadamente |

