

# Email Tracking Completo para Campanhas Orbit

## Visão geral

Implementar rastreamento de eventos de email (abertura, clique, bounce, spam) usando Resend webhooks + tracking pixel + link rewriting. O sistema atual apenas conta envios sem visibilidade real de engajamento.

## Arquitetura

```text
Email enviado (Resend)
  │
  ├─► Resend Webhook ──► orbit-resend-webhook ──► orbit_email_events
  │    (delivered, bounced, complained, opened, clicked)
  │
  ├─► Tracking Pixel (1x1 gif) ──► orbit-email-track ──► orbit_email_events
  │    (open event com user-agent)
  │
  └─► Link Rewriting ──► orbit-email-track ──► orbit_email_events + redirect
       (click event com URL original)
```

## 1. Banco de dados

### Tabela nova: `orbit_email_events`
Log granular de todos os eventos por envio.

```sql
CREATE TABLE orbit_email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid REFERENCES orbit_campaign_recipients(id) ON DELETE CASCADE,
  empresa_id uuid REFERENCES orbit_empresas(id),
  resend_email_id text,
  event_type text NOT NULL, -- sent, delivered, opened, clicked, bounced, complained
  url text,                 -- URL clicada (para clicks)
  user_agent text,
  ip_address text,
  raw_payload jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_email_events_recipient ON orbit_email_events(recipient_id);
CREATE INDEX idx_email_events_campaign ON orbit_email_events(empresa_id, event_type);
```

### Colunas novas em `orbit_campaign_recipients`
```sql
ALTER TABLE orbit_campaign_recipients ADD COLUMN IF NOT EXISTS resend_email_id text;
ALTER TABLE orbit_campaign_recipients ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE orbit_campaign_recipients ADD COLUMN IF NOT EXISTS opened_at timestamptz;
ALTER TABLE orbit_campaign_recipients ADD COLUMN IF NOT EXISTS clicked_at timestamptz;
ALTER TABLE orbit_campaign_recipients ADD COLUMN IF NOT EXISTS bounced_at timestamptz;
ALTER TABLE orbit_campaign_recipients ADD COLUMN IF NOT EXISTS complained_at timestamptz;
ALTER TABLE orbit_campaign_recipients ADD COLUMN IF NOT EXISTS engagement_status text DEFAULT 'pending';
```

`engagement_status` valores: `pending`, `delivered`, `engaged`, `bounced`, `complained`, `no_interaction`

### RLS
- `orbit_email_events`: SELECT para authenticated onde empresa_id match
- INSERT sem RLS (service role via edge functions)

## 2. Edge Functions

### `orbit-email-track/index.ts` (nova)
Endpoint duplo para pixel de abertura e redirecionamento de cliques.

- **GET `?type=open&rid=<recipient_id>`**: Retorna 1x1 GIF transparente + registra evento `opened`
- **GET `?type=click&rid=<recipient_id>&url=<encoded_url>`**: Registra evento `clicked` + redireciona (HTTP 302)
- Atualiza `opened_at` / `clicked_at` em `orbit_campaign_recipients` (primeiro evento apenas)
- Incrementa contadores `aberturas` / `cliques` em `orbit_campaigns`

### `orbit-resend-webhook/index.ts` (nova)
Recebe webhooks do Resend para eventos: `email.delivered`, `email.bounced`, `email.complained`, `email.opened`, `email.clicked`.

- Busca `recipient_id` pelo `resend_email_id`
- Insere em `orbit_email_events`
- Atualiza timestamps correspondentes em `orbit_campaign_recipients`
- Incrementa contadores em `orbit_campaigns`
- Requer secret `RESEND_WEBHOOK_SECRET` para validação de assinatura

### Modificações em `send-orbit-campaign/index.ts`
No bloco de envio de email (linha ~374):
1. Gerar tracking pixel URL e inserir no HTML antes do `</body>` ou no final
2. Reescrever todos os `<a href="...">` para passar pelo endpoint de tracking
3. Capturar `resend_email_id` do response do Resend e salvar no recipient
4. Registrar evento `sent` em `orbit_email_events`

### Modificações em `orbit-send-email/index.ts`
Mesma lógica de tracking pixel + link rewriting para emails 1:1 (opcional, pode ser fase 2).

## 3. Tracking Pixel

Formato do pixel:
```html
<img src="https://<supabase_url>/functions/v1/orbit-email-track?type=open&rid=<recipient_id>" width="1" height="1" style="display:none" alt="" />
```

## 4. Link Rewriting

Todos os links `<a href="https://...">` no HTML são reescritos para:
```
https://<supabase_url>/functions/v1/orbit-email-track?type=click&rid=<recipient_id>&url=<encodeURIComponent(original_url)>
```

Exceto: links de unsubscribe, mailto:, e links internos do tracking.

## 5. Status inteligente (`engagement_status`)

Função SQL ou lógica no webhook:
- `pending` → enviado, aguardando delivery
- `delivered` → entregue, sem interação ainda
- `engaged` → abriu ou clicou
- `bounced` → bounce recebido
- `complained` → marcado como spam
- `no_interaction` → entregue há mais de 72h sem abertura/clique (atualizado por cron ou consulta dinâmica)

## 6. Frontend: Relatório de performance

### Novo componente: `CampaignAnalyticsDialog`
Acessível via botão na lista de campanhas (campanhas concluídas/enviando).

Exibe:
- **Cards**: Taxa de abertura, taxa de clique, taxa de resposta, bounces, complaints
- **Tabela**: Lista de recipients com status individual (enviado, entregue, aberto, clicado, bounce, spam)
- **Timeline**: Gráfico de eventos ao longo do tempo
- **Aviso**: "Taxas de abertura podem ser imprecisas — alguns clientes de email bloqueiam imagens de tracking"
- **Indicador**: "Possível problema de entrega" quando delivered > 0, opened = 0 após 72h (sem afirmar spam)

### Hook: `useOrbitEmailAnalytics(campaignId)`
Agrega dados de `orbit_email_events` e `orbit_campaign_recipients` para o relatório.

## 7. Secret necessário

- `RESEND_WEBHOOK_SECRET`: Para validar assinatura dos webhooks do Resend

## Limitações documentadas

- Abertura rastreada via pixel — bloqueada por alguns clientes (Apple Mail Privacy, Outlook)
- Clique rastreado via redirect — preciso, mas não captura copy/paste de URLs
- Status "no_interaction" ≠ spam (pode ser filtro, aba promoções, pixel bloqueado)
- O sistema **não afirma** que email caiu em spam — apenas indica "sem interação detectada"

## Arquivos

| Arquivo | Ação |
|---------|------|
| Migration SQL | Criar `orbit_email_events` + alterar `orbit_campaign_recipients` |
| `supabase/functions/orbit-email-track/index.ts` | Criar — pixel + click tracking |
| `supabase/functions/orbit-resend-webhook/index.ts` | Criar — webhook do Resend |
| `supabase/functions/send-orbit-campaign/index.ts` | Editar — injetar pixel, reescrever links, salvar resend_email_id |
| `src/components/orbit/CampaignAnalyticsDialog.tsx` | Criar — relatório visual |
| `src/hooks/useOrbitEmailAnalytics.ts` | Criar — hook de dados |
| `src/pages/orbit/CampanhasPage.tsx` | Editar — botão analytics |
| Secret `RESEND_WEBHOOK_SECRET` | Solicitar |

