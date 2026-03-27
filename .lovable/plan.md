

# Métricas Reais no Analytics Dashboard

## Problema
Todos os valores na página de Analytics são hardcoded (1,234 leads, 89 conversas, etc.). Precisamos buscar dados reais do banco.

## Abordagem

### 1. Migration SQL — Criar RPC `get_orbit_analytics_summary`

Uma única RPC que retorna todas as métricas agregadas para uma empresa:

```sql
CREATE FUNCTION get_orbit_analytics_summary(p_empresa_id uuid)
RETURNS jsonb
```

Retorna:
- **total_prospects**: `count(*)` de `orbit_prospects`
- **prospects_mes_atual** e **prospects_mes_anterior**: para calcular variação %
- **conversas_ativas**: `count(*)` de `orbit_conversas` com `status = 'aberta'`
- **conversas_ontem**: conversas abertas criadas ontem (para "+X desde ontem")
- **pipeline_total**: `sum(valor_estimado)` de `orbit_deals` com `status = 'open'`
- **pipeline_mes_anterior**: para variação %
- **deals_total / deals_won**: para taxa de conversão
- **deals_won_anterior**: para variação da taxa
- **origem_contato_distribution**: agrupamento por `origem_contato` dos prospects (para gráfico de pizza)
- **prospects_por_mes**: últimos 6 meses, agrupados por `created_at` (para gráfico de funil)
- **deals_por_mes**: últimos 6 meses com status open/won
- **performance_equipe**: prospects + deals won agrupados por `responsavel_id` com nome do perfil

### 2. Hook `src/hooks/useOrbitAnalytics.ts`

Novo hook `useOrbitAnalyticsSummary(empresaId)` que chama a RPC e transforma os dados para os formatos esperados pelos charts.

### 3. Atualizar `src/pages/orbit/AnalyticsPage.tsx`

- Remover dados hardcoded (`conversionData`, `channelData`, `performanceData`)
- Importar `useTenant` para obter `empresaId`
- Chamar o novo hook
- Preencher StatsCards com valores reais e variações calculadas
- Alimentar gráficos com dados reais
- Mostrar loading state enquanto carrega
- Formatar valores (R$ com abreviação, percentuais)

## Detalhes técnicos

| Arquivo | Ação |
|---------|------|
| Migration SQL | Criar `get_orbit_analytics_summary` |
| `src/hooks/useOrbitAnalytics.ts` | Novo hook consumindo a RPC |
| `src/pages/orbit/AnalyticsPage.tsx` | Substituir dados mock por dados reais |

