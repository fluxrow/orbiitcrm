

# Paginação Server-Side na Tabela de Destinatários do Analytics

## Problema

O hook `useOrbitCampaignAnalytics` busca todos os recipients sem `.range()`, batendo no limite de 1000 linhas do banco. Além disso, renderiza todos na tabela de uma vez.

## Solução

### 1. Criar RPC para métricas agregadas (Migration SQL)

Separar métricas (contagens) dos dados da tabela. Criar função que retorna apenas os totais agregados para uma campanha, sem limite de linhas:

```sql
CREATE OR REPLACE FUNCTION get_campaign_analytics_summary(p_campaign_id uuid)
RETURNS TABLE(total_recipients bigint, total_sent bigint, delivered bigint, opened bigint, clicked bigint, bounced bigint, complained bigint, no_interaction bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT 
    count(*),
    count(*) FILTER (WHERE status != 'pendente'),
    count(*) FILTER (WHERE delivered_at IS NOT NULL),
    count(*) FILTER (WHERE opened_at IS NOT NULL),
    count(*) FILTER (WHERE clicked_at IS NOT NULL),
    count(*) FILTER (WHERE bounced_at IS NOT NULL),
    count(*) FILTER (WHERE complained_at IS NOT NULL),
    count(*) FILTER (WHERE delivered_at IS NOT NULL AND opened_at IS NULL AND clicked_at IS NULL AND bounced_at IS NULL AND complained_at IS NULL)
  FROM orbit_campaign_recipients
  WHERE campaign_id = p_campaign_id;
$$;
```

### 2. Refatorar `src/hooks/useOrbitEmailAnalytics.ts`

- **Novo hook `useOrbitCampaignSummary(campaignId)`**: chama a RPC para métricas agregadas (sem limite de linhas)
- **Novo hook `useOrbitCampaignRecipients(campaignId, page, pageSize)`**: busca recipients com `.range(from, to)` paginado, 50 por página, + `.select("*", { count: "exact" })` para obter total real

### 3. Atualizar `src/components/orbit/CampaignAnalyticsSection.tsx`

- Usar `useOrbitCampaignSummary` para os cards de métricas (dados precisos)
- Usar `useOrbitCampaignRecipients` com state `page` para a tabela
- Adicionar controles de paginação abaixo da tabela:
  - "Mostrando 1–50 de 532"
  - Botões Anterior / Próxima
  - Números de página
- Remover `ScrollArea` (não precisa mais com paginação)

### 4. Atualizar `src/components/orbit/CampaignAnalyticsDialog.tsx`

Aplicar a mesma paginação para manter consistência.

| Arquivo | Ação |
|---------|------|
| Migration SQL | Criar `get_campaign_analytics_summary` |
| `src/hooks/useOrbitEmailAnalytics.ts` | Dois hooks: summary (RPC) + recipients paginados |
| `src/components/orbit/CampaignAnalyticsSection.tsx` | Paginação server-side com controles |
| `src/components/orbit/CampaignAnalyticsDialog.tsx` | Mesma paginação |

