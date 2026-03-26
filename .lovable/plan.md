

# Rastreamento Estruturado de Envios por Lead

## O que já existe

O sistema já possui a base necessária:
- **`orbit_campaign_recipients`**: registra cada prospect por campanha com timestamps de engajamento (enviado_em, delivered_at, opened_at, clicked_at, bounced_at, complained_at)
- **`orbit_email_events`**: log granular de eventos de email com recipient_id, event_type, created_at
- **Prevenção de duplicidade no envio**: apenas recipients com `status = "pendente"` são processados
- **Tracking pixel + reescrita de links**: já implementados para email
- **Resend webhook**: já atualiza timestamps dos recipients

## O que falta implementar

### 1. Prevenção de duplicidade na criação de recipients
**Arquivo**: `src/components/orbit/CampaignWizard.tsx`
- Antes de inserir recipients, verificar se o prospect já tem registro `orbit_campaign_recipients` para a mesma campanha
- Na prática, o wizard já cria recipients únicos, mas falta constraint no banco

**Migration SQL**:
- Adicionar constraint UNIQUE em `orbit_campaign_recipients(campaign_id, prospect_id)` para garantir integridade

### 2. Unificar tracking para WhatsApp
**Migration SQL**:
- Adicionar coluna `canal` (text, default 'email') na tabela `orbit_email_events`
- Renomear conceptualmente para eventos de campanha (a tabela continua `orbit_email_events` para não quebrar código existente)

**Arquivo**: `supabase/functions/send-orbit-campaign/index.ts`
- Após envio WhatsApp bem-sucedido, inserir evento `sent` em `orbit_email_events` com `canal = 'whatsapp'`

### 3. Expandir Analytics para WhatsApp
**Arquivo**: `src/hooks/useOrbitEmailAnalytics.ts`
- Renomear para `useOrbitCampaignAnalytics` (manter export antigo como alias)
- Suportar campanhas de qualquer canal

**Arquivo**: `src/components/orbit/CampaignAnalyticsSection.tsx`
- Remover filtro `canal: "email"` para mostrar todas as campanhas
- Adaptar métricas conforme o canal (WhatsApp não tem open/click tracking)

### 4. Consultas de segmentação
**Arquivo**: `src/components/orbit/CampaignWizard.tsx`
- No passo de seleção de público, adicionar filtros:
  - "Excluir quem já recebeu campanha X"
  - "Apenas quem abriu campanha X"
  - "Apenas quem NÃO abriu campanha X"
- Consultar `orbit_campaign_recipients` para filtrar prospect_ids

## Resumo de alterações

| Arquivo | Ação |
|---------|------|
| Migration SQL | UNIQUE constraint + coluna `canal` em orbit_email_events |
| `supabase/functions/send-orbit-campaign/index.ts` | Registrar evento `sent` para WhatsApp |
| `src/hooks/useOrbitEmailAnalytics.ts` | Suportar ambos os canais |
| `src/components/orbit/CampaignAnalyticsSection.tsx` | Mostrar campanhas de todos os canais |
| `src/components/orbit/CampaignWizard.tsx` | Filtros de segmentação por histórico de campanha |

