

# Fix: Email sender identity leaking tenant branding into system emails

## Root cause

The table `orbit_resend_config` has a global record (`empresa_id IS NULL`) that contains `from_name = "Promotrip Corporate"` — this is tenant data that leaked into the platform-level config. Three edge functions read this record for system emails:

| Function | Status | Problem |
|----------|--------|---------|
| `auto-approve-trial` | **Already fixed** | Hardcodes `from = "Orbit <onboarding@resend.dev>"` |
| `create-empresa-invite` | **Broken** | Line 37: uses `cfg.from_name` → "Promotrip Corporate" |
| `accept-empresa-invite` | **Broken** | Line 19: uses `data.from_email` but no name override → inherits global config |

## Solution

### 1. Create shared helper `supabase/functions/_shared/system-email.ts`

Centralize system email config resolution:

```typescript
// System-level identity — NEVER from tenant config
const SYSTEM_FROM_NAME = "Orbit";
const SYSTEM_FROM_FALLBACK = "onboarding@resend.dev";

export async function getSystemEmailConfig(supabase): Promise<{ apiKey: string | null; fromEmail: string }> {
  // Only read API key from global config, IGNORE from_name/from_email
  let apiKey = null;
  const { data: cfg } = await supabase
    .from("orbit_resend_config").select("api_key").is("empresa_id", null).maybeSingle();
  if (cfg?.api_key) apiKey = cfg.api_key;
  if (!apiKey) apiKey = Deno.env.get("RESEND_API_KEY") || null;
  return { apiKey, fromEmail: `${SYSTEM_FROM_NAME} <${SYSTEM_FROM_FALLBACK}>` };
}
```

### 2. Update `create-empresa-invite/index.ts`

- Replace `getResendApiKey()` with import from `_shared/system-email.ts`
- Line 124: use `getSystemEmailConfig()` instead
- This ensures admin-created invites always show "Orbit" as sender

### 3. Update `accept-empresa-invite/index.ts`

- Replace `getResendApiKey()` (lines 12-23) with import from `_shared/system-email.ts`
- Line 223: use `getSystemEmailConfig()` instead
- Welcome/activation emails always show "Orbit" as sender

### 4. Update `auto-approve-trial/index.ts`

- Replace `getResendApiKey()` (lines 33-45) with import from `_shared/system-email.ts`
- Remove the local `fromEmail` override on line 208 (now handled by shared helper)

### 5. Keep `orbit-send-email/index.ts` unchanged

This function handles **tenant-scoped** email sending (campaigns, individual emails). Its hierarchical config lookup (empresa_id → global fallback) is correct for that use case.

## Summary of resolution priority

```text
System emails (trial, invite, activation, welcome):
  → ALWAYS "Orbit <onboarding@resend.dev>"
  → API key from global config or env var
  → Never reads from_name/from_email from any config record

Tenant emails (campaigns, 1:1 sends via orbit-send-email):
  → empresa_id config first
  → Global config as fallback (from_name + from_email)
  → Env var RESEND_API_KEY as last resort
```

## Files

| File | Action |
|------|--------|
| `supabase/functions/_shared/system-email.ts` | **Create** — shared system email config helper |
| `supabase/functions/auto-approve-trial/index.ts` | **Edit** — use shared helper |
| `supabase/functions/create-empresa-invite/index.ts` | **Edit** — use shared helper |
| `supabase/functions/accept-empresa-invite/index.ts` | **Edit** — use shared helper |

