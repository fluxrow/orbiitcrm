

# Bloqueio Automático por Plano e Status de Cobrança

## Diagnóstico

**O que já existe:**
- `saas_can_use` RPC valida features/limits server-side (email, whatsapp, ig, fb, lead_search)
- `get_empresa_by_slug` bloqueia acesso total se status NOT IN ('trial', 'active')
- `TenantBlocked` exibe tela de bloqueio para trial_expired, suspended, unauthorized
- `PlanLimitDialog` mostra modal para erros de plano (PLAN_LIMIT_REACHED, FEATURE_DISABLED, etc.)
- `fromPlanCheck` no backend mapeia resultado do `saas_can_use` para respostas padronizadas
- Edge Functions de envio já chamam `saas_can_use` antes de executar

**Gaps:**
1. `saas_can_use` não valida `past_due` — trata como SUSPENDED mesmo que devesse permitir leitura
2. `get_empresa_by_slug` não distingue `past_due` de `canceled` — bloqueia ambos igualmente
3. Sem guards frontend por feature — sidebar mostra Lead Finder/Campanhas mesmo se plano não inclui
4. Sem validação de `max_users` ao adicionar usuários
5. Sem validação de `max_prospects` ao criar prospects
6. `TenantBlocked` não tem botão de portal Stripe para regularizar pagamento
7. Nenhuma banner de aviso para `past_due` (pagamento pendente sem bloqueio total)

## Plano

### 1. SQL Migration — Refinar `saas_can_use` e `get_empresa_by_slug`

**`saas_can_use`:** Adicionar status `past_due` como permitido (degraded access), mas manter `canceled`/`unpaid`/`suspended` como bloqueado.

**`get_empresa_by_slug`:** Tratar `past_due` como não-bloqueado (permitir acesso com aviso). Adicionar `stripe_status` ao retorno para UI exibir alertas.

**Novos feature_codes em `saas_can_use`:** `max_users` e `max_prospects` — validação direta contra contagem real em vez de `saas_usage_monthly`.

```text
Status Matrix:
─────────────────────────────────────────────────────────
Status         │ Login │ Dashboard │ Envios │ Cadastro │ Ação
─────────────────────────────────────────────────────────
demo           │  ✓    │  ✓        │ sim*   │  ✓       │ sandbox
trialing/trial │  ✓    │  ✓        │  ✓     │  ✓       │ normal
active         │  ✓    │  ✓        │  ✓     │  ✓       │ normal
past_due       │  ✓    │  ✓        │  ✗     │  ✗       │ banner + portal
unpaid         │  ✓    │  ✓ (ro)   │  ✗     │  ✗       │ bloqueio parcial
canceled       │  ✓    │  bloqueio │  ✗     │  ✗       │ tela bloqueio
suspended      │  ✓    │  bloqueio │  ✗     │  ✗       │ tela bloqueio
expired        │  ✓    │  bloqueio │  ✗     │  ✗       │ tela bloqueio
─────────────────────────────────────────────────────────
* sandbox = simulado
```

### 2. Hook `usePlanGuard` — Guard centralizado no frontend

Novo hook que expõe:
- `canUseFeature(key)` — verifica features JSONB
- `isWithinLimit(key, current)` — verifica limits JSONB
- `statusLevel` — 'full' | 'degraded' | 'readonly' | 'blocked'
- `showPaymentWarning` — boolean para banner past_due
- `stripeStatus` — status real do Stripe

Fonte de dados: `useSaasEmpresa` + `useTenant` (já carregados).

### 3. TenantContext — Adicionar `stripeStatus` ao state

Incluir `stripe_status` no retorno de `get_empresa_by_slug` e no TenantState. Permitir que `TenantContent` distinga `past_due` (banner) de `canceled` (bloqueio total).

### 4. TenantBlocked — Melhorar tela de bloqueio

- Adicionar status `past_due`, `unpaid`, `canceled` com mensagens específicas
- Botão "Regularizar Pagamento" que abre `stripe-portal`
- Botão "Trocar de Plano" para upgrade
- Mostrar nome do plano e data de expiração quando relevante

### 5. PaymentWarningBanner — Componente novo

Banner fixo no topo do OrbitLayout para `past_due`:
- "Há uma pendência de pagamento. Atualize seu método de pagamento."
- Botão "Resolver agora" → portal Stripe

### 6. OrbitSidebar — Ocultar itens por feature

Filtrar itens de navegação com base nas features do plano:
- Lead Finder → `features.lead_finder`
- Campanhas → `features.whatsapp || features.email`
- Analytics → sempre visível
- Itens ocultos mostram tooltip "Disponível no plano X" se clicados

### 7. Backend — Validação de `max_users` e `max_prospects`

**`saas_can_use` expandido:** Adicionar cases para `user_add` e `prospect_add` que contam registros reais em `profiles` e `orbit_prospects` em vez de usar `saas_usage_monthly`.

**Pontos de enforcement:**
- Hook `useOrbitProspects` → antes de insert, chamar `saas_can_use('prospect_add')`
- Edge function ou RPC para adicionar usuários → chamar `saas_can_use('user_add')`

### 8. Frontend — Mensagens contextuais

Nos hooks de criação (prospects, campanhas, usuários), interceptar erros de plano com `extractPlanLimitReason` e abrir `PlanLimitDialog` com mensagem específica. Atualizar `PlanLimitDialog` para incluir botão que navega para "Meu Plano".

## Arquivos

| Arquivo | Ação |
|---------|------|
| Migração SQL | Atualizar `saas_can_use`, `get_empresa_by_slug` |
| `src/hooks/usePlanGuard.ts` | **Criar** — guard centralizado |
| `src/contexts/TenantContext.tsx` | Adicionar `stripeStatus` |
| `src/pages/tenant/TenantBlocked.tsx` | Melhorar com portal Stripe + mensagens |
| `src/components/orbit/PaymentWarningBanner.tsx` | **Criar** |
| `src/components/orbit/OrbitLayout.tsx` | Incluir PaymentWarningBanner |
| `src/components/orbit/OrbitSidebar.tsx` | Filtrar nav por features |
| `src/components/orbit/PlanLimitDialog.tsx` | Botão "Ver Meu Plano" |
| `src/hooks/useOrbitProspects.ts` | Guard de max_prospects |

