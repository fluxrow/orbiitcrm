

# Analytics Avançado de Campanhas — Estilo Meta Ads / HubSpot

## Resumo

Refatorar completamente o `CampaignAnalyticsSection` para um dashboard avançado com gráfico temporal, funil de conversão visual, tabela com filtros, insights automáticos e ações rápidas. Tudo usando dados reais do banco.

## Alterações

### 1. RPC para dados temporais (Migration SQL)

Criar função `get_campaign_events_timeline(p_campaign_id, p_interval)` que retorna contagens agrupadas por hora/dia:

```sql
CREATE OR REPLACE FUNCTION get_campaign_events_timeline(
  p_campaign_id uuid, p_interval text DEFAULT '1 day'
)
RETURNS TABLE(bucket timestamptz, enviados bigint, entregues bigint, aberturas bigint, cliques bigint)
```

Agrupa `orbit_campaign_recipients` por `date_trunc` nos campos `enviado_em`, `delivered_at`, `opened_at`, `clicked_at`.

### 2. Hook `useOrbitCampaignTimeline` em `src/hooks/useOrbitEmailAnalytics.ts`

Novo hook que chama a RPC com parâmetro de intervalo (1h, 1 day, 7 days). Retorna array de pontos para o gráfico.

### 3. Refatorar `src/components/orbit/CampaignAnalyticsSection.tsx`

Substituir o componente atual por um dashboard completo com seções:

**A. Metric Cards (topo)** — 7 cards existentes + comparação textual:
- Enviados, Entregues, Aberturas (%), Cliques (%), Respostas, Bounces (%), Spam
- Sub-texto com comparação (calculada client-side vs média das outras campanhas)

**B. Gráfico Temporal (recharts LineChart)**
- Linhas: Envios, Aberturas, Cliques
- Filtro de período: Select com 1h / 24h / 7d / 30d
- Usa dados da nova RPC

**C. Funil de Conversão Visual**
- Barras horizontais decrescentes (CSS puro, sem componente externo)
- Etapas: Enviados -> Entregues -> Abertos -> Clicados -> Responderam
- Taxa de conversão entre cada etapa (ex: "92%", "34%", "12%")
- Dados do summary RPC existente

**D. Tabela Avançada de Leads**
- Adicionar filtro Select no topo: Todos / Abriu / Não Abriu / Clicou / Não Clicou / Respondeu / Falhou
- O filtro é aplicado client-side sobre os recipients da página (já paginados)
- OU melhor: adicionar parâmetro de filtro na query de recipients para filtrar server-side
- Colunas: Nome, Email, Status (badge colorido), Último Evento, Horário
- Manter paginação existente

**E. Insights Automáticos**
- Seção com cards de texto gerados client-side a partir do summary:
  - "Taxa de abertura X% acima/abaixo da média" (comparar com outras campanhas)
  - "Melhor horário de engajamento: XX:00" (calcular do timeline)
  - "X leads sem interação — considere reenviar"

**F. Ações Rápidas**
- Botões: "Reenviar para não abertos" (futuro, disabled com tooltip)
- "Exportar engajados" (futuro, disabled)
- Estes ficam como placeholders visuais por agora

### 4. Filtro server-side na tabela — atualizar hook `useOrbitCampaignRecipients`

Adicionar parâmetro opcional `engagementFilter` ao hook. Aplicar `.eq("engagement_status", filter)` ou condições compostas (ex: "opened" = `opened_at IS NOT NULL`). Usar filtros do Supabase:
- "abriu": `.not("opened_at", "is", null)`
- "nao_abriu": `.is("opened_at", null).not("status", "eq", "pendente")`
- "clicou": `.not("clicked_at", "is", null)`
- "falhou": `.in("engagement_status", ["bounced", "complained"])`

### 5. Atualizar `CampaignAnalyticsDialog.tsx`

Manter versão simplificada (modal) mas usar os mesmos metric cards melhorados.

## Arquivos afetados

| Arquivo | Acao |
|---------|------|
| Migration SQL | Criar `get_campaign_events_timeline` |
| `src/hooks/useOrbitEmailAnalytics.ts` | Adicionar `useOrbitCampaignTimeline` + filtro no recipients |
| `src/components/orbit/CampaignAnalyticsSection.tsx` | Reescrever com dashboard completo |
| `src/components/orbit/CampaignAnalyticsDialog.tsx` | Metric cards atualizados |

