

# Integração Stripe para Assinaturas Recorrentes no Orbit

## Resumo

Adicionar cobrança recorrente via Stripe ao Orbit, conectando-se às tabelas `saas_plans` e `saas_empresa` já existentes. Nenhuma arquitetura paralela será criada.

## 1. Habilitar Stripe

Usar a ferramenta `stripe--enable_stripe` para configurar a secret key e desbloquear as ferramentas de criação de produtos/preços.

## 2. Migração: adicionar colunas Stripe

### Tabela `saas_plans` — vincular ao Stripe

```sql
ALTER TABLE saas_plans
  ADD COLUMN stripe_product_id text,
  ADD COLUMN stripe_price_id_monthly text,
  ADD COLUMN stripe_price_id_yearly text,
  ADD COLUMN stripe_active boolean DEFAULT true;
```

### Tabela `saas_empresa` — dados da assinatura

```sql
ALTER TABLE saas_empresa
  ADD COLUMN stripe_customer_id text,
  ADD COLUMN stripe_subscription_id text,
  ADD COLUMN stripe_status text,
  ADD COLUMN current_period_start timestamptz,
  ADD COLUMN current_period_end timestamptz,
  ADD COLUMN cancel_at_period_end boolean DEFAULT false,
  ADD COLUMN trial_end timestamptz,
  ADD COLUMN last_invoice_status text,
  ADD COLUMN last_payment_error text;
```

## 3. Edge Functions (4 funções)

### `stripe-checkout` — criar checkout session
- Recebe `empresa_id` e `price_id` (ou `plan_code` + `interval`)
- Busca/cria `stripe_customer_id` na `saas_empresa`
- Cria `Stripe.checkout.sessions.create()` com `mode: 'subscription'`
- Retorna `session.url`

### `stripe-portal` — portal do cliente
- Recebe `empresa_id`
- Busca `stripe_customer_id`
- Cria `Stripe.billingPortal.sessions.create()`
- Retorna `session.url`

### `stripe-subscription-status` — consultar status
- Recebe `empresa_id`
- Busca `stripe_subscription_id`
- Retorna dados atuais da assinatura do Stripe

### `stripe-webhook` — webhook seguro
- Valida assinatura com `Stripe.webhooks.constructEvent()`
- Eventos tratados:
  - `checkout.session.completed` → vincula `subscription_id` e `customer_id`, atualiza `saas_empresa.status` para `active`
  - `customer.subscription.updated` → atualiza `stripe_status`, `current_period_start/end`, `cancel_at_period_end`, `trial_end`; sincroniza `plan_id` se o preço mudou
  - `customer.subscription.deleted` → marca `stripe_status = 'canceled'`, atualiza `saas_empresa.status = 'canceled'`
  - `invoice.paid` → atualiza `last_invoice_status = 'paid'`, `billing_status = 'paid'`
  - `invoice.payment_failed` → atualiza `last_invoice_status = 'failed'`, `last_payment_error`

### Segurança
- Webhook usa secret `STRIPE_WEBHOOK_SECRET` para validação
- Demais funções validam JWT via `auth.getUser()`
- Verificação de que o usuário pertence à empresa (admin only)

## 4. Secrets necessários

- `STRIPE_SECRET_KEY` — será coletado pelo `stripe--enable_stripe`
- `STRIPE_WEBHOOK_SECRET` — será solicitado via `add_secret` após criar o endpoint

## 5. Frontend — hooks e página Meu Plano

### Hook `useStripeSubscription`
- Funções: `createCheckout(planCode, interval)`, `openPortal()`, `getStatus()`
- Invoca edge functions via `supabase.functions.invoke()`

### Atualização de `MeuPlanoPage.tsx`
- Substituir os botões estáticos de "Solicitar Upgrade" e "Falar com Suporte"
- Adicionar:
  - **Dados da assinatura**: próxima cobrança (`current_period_end`), periodicidade, status Stripe
  - **Botão "Assinar"**: visível quando `stripe_subscription_id` é null e plano não é demo
  - **Botão "Trocar Plano"**: abre checkout com outro `price_id`
  - **Botão "Gerenciar Assinatura"**: abre Stripe Portal (alterar cartão, cancelar, reativar)
  - **Badge de status**: mapeia `stripe_status` (active, past_due, canceled, trialing)
  - **Alerta de falha**: exibe `last_payment_error` quando aplicável

### Atualização de `useSaasPlans.ts`
- Estender interface `SaasPlan` com campos `stripe_*`
- Estender interface `SaasEmpresa` com campos Stripe

## 6. Fluxo completo da assinatura

```text
Tenant Admin clica "Assinar"
  → Frontend chama stripe-checkout (edge function)
    → Cria/busca Stripe Customer
    → Cria Checkout Session
    → Retorna URL → redirect
  → Usuário paga no Stripe Checkout
  → Stripe envia webhook checkout.session.completed
    → stripe-webhook atualiza saas_empresa:
      - stripe_customer_id
      - stripe_subscription_id
      - stripe_status = 'active'
      - status = 'active'
      - current_period_start/end
  → Página Meu Plano reflete status atualizado

Renovação mensal:
  → Stripe cobra automaticamente
  → invoice.paid → atualiza last_invoice_status
  → subscription.updated → atualiza period_start/end

Falha de pagamento:
  → invoice.payment_failed → salva erro, marca billing_status

Cancelamento:
  → Usuário clica "Gerenciar" → Stripe Portal → cancela
  → subscription.updated → cancel_at_period_end = true
  → subscription.deleted → status = 'canceled'
```

## 7. O que NÃO será alterado
- Fluxo de trial existente (continua funcionando independente)
- Onboarding e demo
- Lógica de `saas_can_use` / `saas_increment_usage` (já funciona com `status`)
- Multi-tenancy e RLS

## Arquivos criados/modificados

| Arquivo | Ação |
|---------|------|
| Migração SQL | Adicionar colunas Stripe em `saas_plans` e `saas_empresa` |
| `supabase/functions/stripe-checkout/index.ts` | Criar |
| `supabase/functions/stripe-portal/index.ts` | Criar |
| `supabase/functions/stripe-subscription-status/index.ts` | Criar |
| `supabase/functions/stripe-webhook/index.ts` | Criar |
| `supabase/config.toml` | Adicionar `[functions.stripe-webhook] verify_jwt = false` |
| `src/hooks/useStripeSubscription.ts` | Criar |
| `src/hooks/useSaasPlans.ts` | Estender interfaces |
| `src/pages/orbit/MeuPlanoPage.tsx` | Conectar ao Stripe |

