

# Etapa SAAS-6 -- Demo Sandbox Implementation Plan

## Current State Analysis

| Requirement | Status | Gap |
|---|---|---|
| Demo plan marking | Partial | `sandbox` flag missing from `saas_plans.features`; plan exists with `code=demo` |
| Fake send (simulation) | Done | `orbit-send-message`, `orbit-send-email`, `send-orbit-campaign` already simulate with `status='simulated'` |
| UI config blocking | Partial | Banner shown + save button disabled on Z-API tab, but all fields remain editable; Email tab has no demo blocking |
| AI agent demo mode | Missing | `orbit-ai-agent` always tries to send via Z-API -- no demo check in `sendWhatsAppMessage` |
| Inbound real for demo | Partial | Webhook processes inbound, but prospects created without `empresa_id` -- no demo isolation |
| Rate limiting demo | Missing | No rate limit on demo message sends |
| Prospect/campaign limits | Missing | `max_prospects` and `max_campaigns` not enforced |

## Implementation Plan

### Part 1: Database Changes (Migration)

**1.1** Update demo plan features to add `sandbox: true`:
```sql
UPDATE saas_plans
SET features = features || '{"sandbox": true}'::jsonb
WHERE code = 'demo';
```

**1.2** No new role needed. The plan `code = 'demo'` combined with `sandbox` feature flag is sufficient. Adding a `DEMO_USER` role would add complexity without benefit since the plan already determines behavior.

### Part 2: AI Agent Demo Mode (Edge Function)

**File:** `supabase/functions/orbit-ai-agent/index.ts`

The `sendWhatsAppMessage` helper function currently always calls Z-API. For demo companies, it should:

1. Look up the prospect's `empresa_id` to determine if demo
2. If demo: save the AI response as `orbit_mensagens` with `status='simulated'` instead of calling Z-API
3. AI still generates the response normally -- only the delivery is simulated

This is the key fix: the AI brain works, but outbound delivery is faked.

### Part 3: Webhook Inbound Isolation for Demo

**File:** `supabase/functions/orbit-webhook/index.ts`

Current problem: prospects created by webhook have no `empresa_id`, so they are invisible to demo users (RLS blocks them).

Simplest approach for now:
- When a message arrives, the webhook looks up `orbit_zapi_config` to find which `empresa_id` owns that Z-API instance (already has `empresa_id` column)
- Set `empresa_id` on created prospects and conversations
- This already enables demo isolation because each empresa has its own Z-API config and data is RLS-filtered

Changes needed:
1. Query `orbit_zapi_config` by matching `instance_id` or `numero_origem` to determine `empresa_id`
2. Pass `empresa_id` when inserting prospects and conversations
3. Also filter `orbit_ai_config` by `empresa_id` (currently uses `.maybeSingle()` without filter)

### Part 4: UI Config Blocking for Demo

**File:** `src/pages/orbit/ConfigPage.tsx`

Currently only Z-API save button is disabled for demo. Need to:

1. **Z-API tab**: Disable ALL input fields (not just save button) with `disabled={isDemo}`
2. **Email tab**: Add same demo banner + disable all input fields
3. **AI tab**: Allow editing of non-sensitive fields (prompt, tone, language) but show info that outbound is simulated
4. Add tooltip "Disponivel em planos pagos" on disabled fields

### Part 5: Rate Limiting for Demo (Edge Function)

**File:** `supabase/functions/orbit-send-message/index.ts`

Add a simple rate limit check for demo users:
1. Query `orbit_mensagens` count where `empresa_id = X` and `timestamp > now() - 1 hour` and `direcao = 'OUT'`
2. If count >= 30, return error with code `DEMO_RATE_LIMIT`
3. Add `DEMO_RATE_LIMIT` to `PlanLimitDialog` reason config

### Part 6: Prospect Limit Enforcement

**File:** `supabase/functions/orbit-send-message/index.ts` and import hooks

For demo plan with `max_prospects: 50`:
1. In the webhook (prospect creation): check current prospect count for the empresa before creating new ones
2. In import flow: check count before allowing bulk import
3. Return clear error when limit reached

### Part 7: Frontend PlanLimitDialog Update

**File:** `src/components/orbit/PlanLimitDialog.tsx`

Add new reason: `DEMO_RATE_LIMIT` with message "Limite de mensagens por hora atingido no modo demo."

**File:** `src/lib/plan-errors.ts`

Add `DEMO_RATE_LIMIT` to the error codes array.

## Summary of Changes

| Change | Type | Files |
|---|---|---|
| Add `sandbox:true` to demo plan features | Migration | New migration file |
| AI agent demo mode (skip Z-API send) | Edit | `supabase/functions/orbit-ai-agent/index.ts` |
| Webhook: set empresa_id on prospects/conversas | Edit | `supabase/functions/orbit-webhook/index.ts` |
| UI: disable config fields for demo | Edit | `src/pages/orbit/ConfigPage.tsx` |
| Rate limit demo sends (30/hr) | Edit | `supabase/functions/orbit-send-message/index.ts` |
| Prospect limit enforcement in webhook | Edit | `supabase/functions/orbit-webhook/index.ts` |
| Add DEMO_RATE_LIMIT to dialog/errors | Edit | `src/components/orbit/PlanLimitDialog.tsx`, `src/lib/plan-errors.ts` |
| Deploy updated functions | Deploy | `orbit-ai-agent`, `orbit-webhook`, `orbit-send-message` |

## What We Are NOT Doing (and Why)

- **New `demo` role in user_roles**: Unnecessary -- `plan.code === 'demo'` via `saas_plans` already identifies demo users without adding role complexity
- **Dedicated sandbox phone number**: Too complex for now. The webhook already ties to empresa via `orbit_zapi_config.empresa_id`, providing natural isolation
- **Campaign size limits**: Can be added later; current demo limits (100 msgs/month) already constrain campaign scale

