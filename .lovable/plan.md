

# Relatório de Campanhas na página de Analytics

## Objetivo
Adicionar uma seção de analytics de campanhas de email na página Analytics, com seletor de campanha e métricas de engajamento (aberturas, cliques, bounces, spam).

## Alterações

### 1. `src/pages/orbit/AnalyticsPage.tsx`
- Importar `useOrbitCampaigns` e `useOrbitEmailAnalytics`
- Adicionar um `Select` para escolher a campanha (filtrar apenas campanhas de email com status enviando/concluída/pausada)
- Renderizar seção com:
  - Cards de métricas (enviados, aberturas, cliques, bounces, spam, sem interação) com taxas percentuais
  - Tabela de destinatários com status de engajamento (reaproveitando a mesma estrutura do `CampaignAnalyticsDialog`)
  - Aviso sobre imprecisão de tracking de abertura
- Posicionar esta seção após os gráficos existentes

### 2. Sem alterações em outros arquivos
O hook `useOrbitEmailAnalytics` e os componentes já existem — apenas reutilizamos na nova página.

| Arquivo | Ação |
|---------|------|
| `src/pages/orbit/AnalyticsPage.tsx` | Adicionar seção de analytics de campanhas com seletor e métricas |

