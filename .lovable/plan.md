

# Integração Billing Stripe com Lógica de Planos do Orbit

## Análise do Estado Atual

A base já está sólida:
- **Webhook** (`stripe-webhook`) já sincroniza `plan_id` via `findPlanByPriceId`, atualiza `status`, `stripe_status`, períodos e erros de pagamento
- **RPCs server-side** (`saas_can_use`, `saas_increment_usage`, `saas_get_empresa_plan`) já validam features/limits com base no plano ativo da empresa
- **Edge Functions de envio** (WhatsApp, Email, Meta, Lead Search) já chamam `saas_can_use` antes de executar
- **MeuPlanoPage** já exibe plano, status, consumo e botões de checkout/portal

## Gaps Identificados

1. **Webhook não trata `trialing`** — Stripe envia `trialing` mas o webhook não mapeia para `status = 'trial'`
2. **Webhook não trata `incomplete`** — deveria marcar como `pending`
3. **MeuPlanoPage não oferece upgrade/downgrade para assinantes** — só mostra "Gerenciar Assinatura" (portal), sem comparação de planos
4. **Contagem real de usuários/prospects** não é exibida — UsageCard mostra `used: 0` hardcoded
5. **Sem suporte a proration** — checkout cria nova assinatura em vez de alterar a existente
6. **`saas_get_empresa_plan` não retorna `stripe_status`** — útil para UI mostrar estado real

## Plano de Implementação

### 1. Migração SQL — Melhorar `saas_get_empresa_plan`

Adicionar `stripe_status` ao retorno da RPC para que o frontend e enforcement tenham visibilidade completa.

```sql
CREATE OR REPLACE FUNCTION public.saas_get_empresa_plan(p_empresa_id uuid)
-- Adicionar stripe_status e billing_status ao jsonb retornado
```

### 2. Webhook — Tratar `trialing` e `incomplete`

No `customer.subscription.updated`:
- `trialing` → `status = 'trial'`
- `incomplete` → `status = 'pending'`

Manter mapeamentos existentes (`active`, `past_due`, `canceled`, `unpaid`).

### 3. Edge Function `stripe-change-plan` (nova)

Para upgrade/downgrade de assinantes existentes:
- Recebe `empresa_id` e `new_price_id`
- Valida admin + pertence à empresa
- Usa `stripe.subscriptions.update()` com `proration_behavior: 'create_prorations'`
- Atualiza o item da assinatura existente (não cria nova)
- O webhook `subscription.updated` cuida do resto (sincroniza `plan_id`)

### 4. Hook `useStripeSubscription` — Adicionar `changePlan`

Nova mutation `useStripeChangePlan` que invoca `stripe-change-plan`.

### 5. MeuPlanoPage — Upgrade/Downgrade + Dados Reais

**Para assinantes ativos:**
- Mostrar cards dos outros planos com botão "Fazer Upgrade" ou "Fazer Downgrade"
- Indicar plano atual com badge "Plano Atual"
- Exibir preço de cada plano (do JSONB `limits` ou nova coluna)

**Contagens reais:**
- Buscar contagem de usuários: `profiles` where `empresa_id`
- Buscar contagem de prospects: `orbit_prospects` where `empresa_id`

**Status mapping completo:**
- Exibir `trialing`, `incomplete`, `paused` corretamente

### 6. Fluxo Completo Resultante

```text
Checkout (novo assinante):
  stripe-checkout → Stripe Checkout → webhook checkout.session.completed
  → plan_id sincronizado → saas_can_use lê novo plano → recursos liberados

Upgrade/Downgrade (assinante existente):
  stripe-change-plan → stripe.subscriptions.update(proration)
  → webhook subscription.updated → plan_id atualizado → recursos atualizados

Cancelamento:
  Portal Stripe → subscription.updated (cancel_at_period_end=true)
  → subscription.deleted → status='canceled' → saas_can_use bloqueia

Falha pagamento:
  invoice.payment_failed → last_payment_error salvo → UI exibe alerta

Trial → Assinatura:
  stripe-checkout com trial ativo → webhook atualiza status para 'active'
```

## Arquivos

| Arquivo | Ação |
|---------|------|
| Migração SQL | Atualizar `saas_get_empresa_plan` com `stripe_status` |
| `supabase/functions/stripe-webhook/index.ts` | Adicionar mapping `trialing`→`trial`, `incomplete`→`pending` |
| `supabase/functions/stripe-change-plan/index.ts` | **Criar** — upgrade/downgrade via `subscriptions.update` |
| `src/hooks/useStripeSubscription.ts` | Adicionar `useStripeChangePlan` |
| `src/pages/orbit/MeuPlanoPage.tsx` | Cards upgrade/downgrade, contagens reais, status completo |

