

# Analytics Completo para Campanhas de WhatsApp

## Resumo

Adaptar o sistema de analytics para campanhas de WhatsApp, adicionando colunas de rastreamento específicas (`read_at`, `replied_at`), uma RPC de summary dedicada, e condicionando o componente `CampaignAnalyticsSection` para renderizar métricas, funil, gráfico e tabela com terminologia e lógica do canal WhatsApp.

## Estado Atual

- `orbit_campaign_recipients` tem `status` com valores WhatsApp (`entregue`, `lido`, `respondeu`), mas **não tem** colunas de timestamp `read_at` / `replied_at`
- As colunas de email (`opened_at`, `clicked_at`, `bounced_at`, `complained_at`) não se aplicam a WhatsApp
- A RPC `get_campaign_analytics_summary` conta apenas colunas de email
- O componente mostra terminologia de email (Aberturas, Cliques, Bounce, Spam)
- `orbit_campaigns` já tem campo `canal` (`email` / `whatsapp`)

## Alterações

### 1. Migration SQL — Adicionar colunas WhatsApp + RPC

**Novas colunas em `orbit_campaign_recipients`:**
```sql
ALTER TABLE orbit_campaign_recipients ADD COLUMN IF NOT EXISTS read_at timestamptz;
ALTER TABLE orbit_campaign_recipients ADD COLUMN IF NOT EXISTS replied_at timestamptz;
```

**Nova RPC `get_whatsapp_campaign_summary`:**
- Retorna: `total_recipients`, `total_sent`, `delivered`, `read`, `replied`, `failed`, `pending`
- Conta baseado em `status` (`enviado`, `entregue`, `lido`, `respondeu`, `falhou`) + timestamps `delivered_at`, `read_at`, `replied_at`

**Atualizar RPC `get_campaign_events_timeline`:**
- Adicionar colunas `leituras` e `respostas` ao retorno, usando `read_at` e `replied_at`

### 2. Hook `src/hooks/useOrbitEmailAnalytics.ts`

- Adicionar interface `WhatsAppCampaignSummary` com campos: `totalRecipients`, `total`, `delivered`, `read`, `replied`, `failed`, `pending`, `readRate`, `replyRate`
- Adicionar `useWhatsAppCampaignSummary(campaignId)` chamando a nova RPC
- Adicionar tipo `WhatsAppEngagementFilter` com valores: `todos`, `enviado`, `entregue`, `lido`, `respondeu`, `falhou`, `sem_resposta`
- Adicionar `useWhatsAppCampaignRecipients(campaignId, page, pageSize, filter)` com:
  - Select incluindo `telefone`, `read_at`, `replied_at`, `erro`
  - Prospect join com `nome_razao`, `nome_fantasia`
  - Filtros server-side baseados nos novos campos

### 3. Componente `CampaignAnalyticsSection.tsx`

Condicionar toda a renderização com base no `canal` da campanha selecionada:

**Quando `canal === "whatsapp"`:**

**A. Metric Cards:**
- Destinatários, Enviados, Entregues, Lidos (+ taxa), Respondidos (+ taxa), Falhas, Pendentes

**B. Funil:**
- Destinatários → Enviados → Entregues → Lidos → Responderam

**C. Gráfico temporal:**
- Linhas: Envios, Entregas, Leituras, Respostas (no lugar de Aberturas/Cliques)

**D. Tabela:**
- Colunas: Nome, Telefone, Status (badge), Enviado em, Entregue em, Lido em, Respondeu em, Erro
- Filtros: Todos, Enviado, Entregue, Lido, Respondeu, Falhou, Sem Resposta

**E. Insights adaptados:**
- "Taxa de leitura X% — acima/abaixo da média"
- "X leads sem resposta — considere follow-up"
- "X falhas — verifique números/WhatsApp"

**F. Tracking note:**
- Nota específica para WhatsApp (sem menção a imagens de tracking)

**Quando `canal === "email"`:** comportamento atual mantido intacto.

### 4. Buscar canal da campanha

No componente, ao selecionar campanha, identificar `canal` da lista `campaigns` e usar para decidir qual branch de UI renderizar.

## Arquivos afetados

| Arquivo | Ação |
|---------|------|
| Migration SQL | Colunas `read_at`, `replied_at` + RPC `get_whatsapp_campaign_summary` + atualizar timeline |
| `src/hooks/useOrbitEmailAnalytics.ts` | Hooks WhatsApp: summary, recipients, timeline |
| `src/components/orbit/CampaignAnalyticsSection.tsx` | Renderização condicional por canal |

