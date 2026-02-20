

# Etapa 4X.5 -- Demo Mode (Sandbox)

## Overview

Implement a demo mode that provides a full visual experience of Orbit CRM without incurring costs from external providers. Demo users can explore all screens but cannot configure real integrations or send real messages.

---

## 1. Hook: `useIsDemo`

**File:** `src/hooks/useIsDemo.ts` (new)

A hook that queries `saas_empresa` joined with `saas_plans` to determine if the current user's empresa is on the `demo` plan.

```text
export function useIsDemo() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['is-demo', user?.id],
    queryFn: async () => {
      // 1. Get empresa_id from profiles
      // 2. Query saas_empresa with join to saas_plans
      // 3. Return { isDemo: plan.code === 'demo', planCode, planName }
    },
    enabled: !!user?.id,
  });
}
```

This hook is the single source of truth for demo detection -- no new DB roles or columns needed. The `saas_plans` table already has the `demo` plan.

---

## 2. RLS Policy for `saas_empresa` (read access)

**Migration:** Add SELECT policy so users can read their own empresa's plan info.

```text
CREATE POLICY "Users can view own saas_empresa"
  ON saas_empresa FOR SELECT
  USING (empresa_id = get_user_empresa_id(auth.uid()));
```

Currently only super_admin has access. Without this, the `useIsDemo` hook cannot query the plan.

---

## 3. Edge Function: `orbit-send-message` -- Demo Guard

**File:** `supabase/functions/orbit-send-message/index.ts`

Add a check after authentication:

1. Get user's `empresa_id` from profiles
2. Query `saas_empresa` joined with `saas_plans` for that empresa
3. If `plan.code === 'demo'`:
   - Do NOT call Z-API
   - Insert message into `orbit_mensagens` with `status = 'simulated'`
   - Return `{ ok: true, status: 'simulated', simulated: true }`

This means demo users see messages appear in the UI exactly like normal, but no external API call is made.

---

## 4. Edge Function: `orbit-send-email` -- Demo Guard

**File:** `supabase/functions/orbit-send-email/index.ts`

Same pattern: check if empresa plan is `demo`. If so, return success without calling Resend. Log as simulated.

---

## 5. Edge Function: `send-orbit-campaign` -- Demo Guard

**File:** `supabase/functions/send-orbit-campaign/index.ts`

When processing campaign recipients, if empresa plan is `demo`:
- Mark all recipients as `status = 'simulated'` instead of calling providers
- Update campaign counters normally
- No external API calls

---

## 6. ConfigPage UI -- Demo Restrictions

**File:** `src/pages/orbit/ConfigPage.tsx`

Import `useIsDemo` and conditionally:

### 6a. Integration Tabs (Z-API, Email)
- Show a banner at top of each tab: "Modo Demo -- Integrações externas desabilitadas"
- Disable all form inputs and save buttons (set `disabled={isDemo}`)
- Show tooltip on disabled buttons: "Disponível apenas em planos pagos"

### 6b. Visual treatment
- Add a yellow/amber banner component reusable across demo-restricted sections
- Use existing `AlertCircle` icon from lucide

---

## 7. OrbitLayout -- Demo Banner

**File:** `src/components/orbit/OrbitLayout.tsx`

Add a persistent top banner when `isDemo === true`:

```text
<div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-center text-sm text-amber-700">
  Modo Demo -- Envio real indisponível. Mensagens serão simuladas.
</div>
```

This appears above the main content area so it is always visible.

---

## 8. ConversasPage -- Simulated Badge

**File:** `src/pages/orbit/ConversasPage.tsx`

When rendering messages, if `m.status === 'simulated'`, show a small badge/chip next to the message: "Simulado" in amber color. This makes it clear to the demo user.

---

## 9. OrbitSidebar -- Demo Badge

**File:** `src/components/orbit/OrbitSidebar.tsx`

Add "DEMO" badge next to the Orbit logo when `isDemo === true`:

```text
<span className="text-xs bg-amber-500 text-white px-1.5 py-0.5 rounded">DEMO</span>
```

---

## Summary of files

| File | Action |
|---|---|
| Migration SQL | Add SELECT RLS policy on `saas_empresa` for users |
| `src/hooks/useIsDemo.ts` | New hook |
| `supabase/functions/orbit-send-message/index.ts` | Add demo guard |
| `supabase/functions/orbit-send-email/index.ts` | Add demo guard |
| `supabase/functions/send-orbit-campaign/index.ts` | Add demo guard |
| `src/pages/orbit/ConfigPage.tsx` | Disable integration forms + banner |
| `src/components/orbit/OrbitLayout.tsx` | Persistent demo banner |
| `src/pages/orbit/ConversasPage.tsx` | Simulated message badge |
| `src/components/orbit/OrbitSidebar.tsx` | Demo badge on logo |

---

## Technical details

- **No new role needed.** Demo mode is determined by the empresa's plan (`saas_plans.code = 'demo'`), not by a user role. This avoids polluting the RBAC system.
- **Server-side enforcement.** The edge functions check the plan server-side, so even if a user bypasses the UI restrictions, no real messages are sent.
- **Client-side UX.** The `useIsDemo` hook caches the plan check and provides a simple boolean for conditional rendering across all Orbit pages.
- **Inbound messages still work.** The webhook (`orbit-webhook`) processes incoming messages normally. If a demo user has a test Z-API instance configured by the super admin, inbound messages flow as usual and the AI can respond (though responses are also simulated on the outbound side).
- **`simulated` status.** Using a new status value `'simulated'` on `orbit_mensagens` differentiates demo messages from real failed/sent messages. This does not require a DB migration since the `status` column is a text field without constraints.

