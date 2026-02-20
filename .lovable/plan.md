
# Etapa SAAS-5 -- Plan Enforcement + Usage Limits

## Overview

Create three database RPCs for plan/feature/limit checks, integrate them into all send-related Edge Functions, and add a frontend error modal for blocked actions.

## Part 1: Database RPCs (Migration)

### 1.1 `saas_get_empresa_plan(p_empresa_id uuid) RETURNS jsonb`

Returns `{ plan_code, features, limits, status, trial_ends_at }` by joining `saas_empresa` + `saas_plans`. Returns `null` if not found.

### 1.2 `saas_can_use(p_empresa_id uuid, p_feature_code text, p_amount int DEFAULT 1) RETURNS jsonb`

Logic:
1. Call `saas_get_empresa_plan` to get plan data
2. If `status` not in (`active`, `trial`) => deny with reason `SUSPENDED`
3. If `status = trial` and `trial_ends_at < now()` => deny with reason `TRIAL_EXPIRED`
4. Map `feature_code` to feature flag key (e.g. `email_send` -> `email`, `whatsapp_send` -> `whatsapp`, `ig_send` -> `instagram`, `fb_send` -> `facebook`, `lead_search` -> `lead_finder`)
5. If `features[flag] != true` => deny with reason `FEATURE_DISABLED`
6. Map `feature_code` to limit key (e.g. `email_send` -> `email_monthly`, `whatsapp_send` -> `whatsapp_monthly`, etc.)
7. Get current period `to_char(now(), 'YYYY-MM')`
8. Upsert into `saas_usage_monthly` to ensure row exists
9. Read current usage column value
10. If `current + amount > limit` => deny with reason `PLAN_LIMIT`
11. Return `{ allowed: true, remaining: limit - current, plan_code }`

### 1.3 `saas_increment_usage(p_empresa_id uuid, p_feature_code text, p_amount int DEFAULT 1) RETURNS void`

- `SECURITY DEFINER` (only service role / edge functions should call it)
- Upserts into `saas_usage_monthly` for the current period
- Increments the appropriate column by `p_amount`

## Part 2: Edge Function Updates

### Mapping of feature_code to usage column

```text
email_send      -> email_sent
whatsapp_send   -> whatsapp_sent
ig_send         -> ig_sent
fb_send         -> fb_sent
lead_search     -> lead_search_calls
```

### 2.1 `orbit-send-message/index.ts` (WhatsApp individual)

- After getting `empresa_id`, call `saas_can_use(empresa_id, 'whatsapp_send', 1)` via `supabase.rpc()`
- If `allowed = false`, return 403 with `{ error: reason, code: "PLAN_LIMIT" | "FEATURE_DISABLED" | ... }`
- After successful send, call `saas_increment_usage(empresa_id, 'whatsapp_send', 1)`
- Keep existing demo mode logic (demo skips real send but still checks/increments)

### 2.2 `orbit-send-email/index.ts` (Email individual)

- Same pattern: `saas_can_use(empresa_id, 'email_send', 1)` before send
- `saas_increment_usage` after success

### 2.3 `send-orbit-campaign/index.ts` (Campaign batch)

- Before processing recipients: `saas_can_use(empresa_id, '<canal>_send', recipients.length)`
- After each successful send: `saas_increment_usage(empresa_id, '<canal>_send', 1)`
- Map campaign.canal to feature_code: `whatsapp` -> `whatsapp_send`, `email` -> `email_send`

### 2.4 `send-orbit-meta-message/index.ts` (IG/FB)

- Determine feature code from `conversa.canal`: `instagram` -> `ig_send`, `facebook` -> `fb_send`
- `saas_can_use` before send, `saas_increment_usage` after success

### 2.5 `orbit-search-leads/index.ts` (Lead finder)

- `saas_can_use(empresa_id, 'lead_search', 1)` before calling Apollo
- `saas_increment_usage` after successful search

## Part 3: Frontend - Plan Limit Modal

### 3.1 New component: `src/components/orbit/PlanLimitDialog.tsx`

A reusable dialog that shows:
- Title: "Limite do plano atingido" or "Funcionalidade nao disponivel"
- Description based on error reason
- CTA button: "Solicitar upgrade" (for now just closes the dialog; billing comes later)

### 3.2 Error handling in hooks/pages

Update the hooks that invoke these edge functions (`useOrbitMensagens`, `useOrbitCampaigns`, etc.) to detect `PLAN_LIMIT` / `FEATURE_DISABLED` / `TRIAL_EXPIRED` / `SUSPENDED` error codes and show the `PlanLimitDialog`.

## Summary of Changes

| Change | Type | Files |
|---|---|---|
| 3 RPCs: `saas_get_empresa_plan`, `saas_can_use`, `saas_increment_usage` | Migration | New migration file |
| Enforce in `orbit-send-message` | Edit | `supabase/functions/orbit-send-message/index.ts` |
| Enforce in `orbit-send-email` | Edit | `supabase/functions/orbit-send-email/index.ts` |
| Enforce in `send-orbit-campaign` | Edit | `supabase/functions/send-orbit-campaign/index.ts` |
| Enforce in `send-orbit-meta-message` | Edit | `supabase/functions/send-orbit-meta-message/index.ts` |
| Enforce in `orbit-search-leads` | Edit | `supabase/functions/orbit-search-leads/index.ts` |
| Plan limit dialog component | New | `src/components/orbit/PlanLimitDialog.tsx` |
| Error handling in send hooks | Edit | Relevant hooks files |
