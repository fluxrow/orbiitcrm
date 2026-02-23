
# Etapa SAAS-7 -- Error Envelope Standardization

## Current State

Every edge function uses its own ad-hoc error format. Some return `{ error: "message" }`, others `{ error: reason, code: reason }`, others `{ success: true, ... }`, and some `{ ok: true, ... }`. The frontend handles errors with scattered `if/else` and `try/catch` blocks in each hook and page, making it fragile and inconsistent.

| Pattern | Functions using it |
|---|---|
| `{ error: "msg" }` | validate-invite, accept-empresa-invite, create-empresa, add-empresa-user, fetch-cnpj, send-vendedor-notification, request-campaign-approval, orbit-ai-suggest |
| `{ error: reason, code: reason }` | orbit-send-message, orbit-send-email, send-orbit-campaign, send-orbit-meta-message, orbit-search-leads (plan enforcement only) |
| `{ ok: true, data... }` | orbit-send-message |
| `{ success: true, ... }` | create-empresa, accept-empresa-invite, send-orbit-campaign, request-campaign-approval, send-vendedor-notification |

## Implementation Plan

### Part 1: Shared Helper Module for Edge Functions

**New file:** `supabase/functions/_shared/responses.ts`

```typescript
// Generates a UUID v4 correlation ID
function makeCorrelationId(): string

// Success envelope
function ok(data: unknown, meta?: Record<string, unknown>): Response
// Returns: { ok: true, data: {...}, meta: { correlation_id, ...meta } }

// Error envelope
function fail(
  code: string,
  message: string,
  status?: number,
  details?: Record<string, unknown>
): Response
// Returns: { ok: false, error: { code, message, details, correlation_id } }

// Map saas_can_use result to appropriate response
function fromPlanCheck(
  canUseResult: any,
  sandbox?: boolean
): Response | null
// If allowed: returns null (continue processing)
// If denied + sandbox: returns ok() with meta.simulated = true
// If denied: returns fail() with appropriate code

// Map provider errors to standard codes
function mapProviderError(err: any, provider: string): Response
```

Error codes enum (constants, not actual TypeScript enum):

```text
-- SaaS / Plans --
PLAN_FEATURE_DISABLED
PLAN_LIMIT_REACHED
PLAN_STATUS_BLOCKED
TRIAL_EXPIRED
NO_PLAN

-- Demo --
DEMO_RATE_LIMIT
DEMO_ACTION_BLOCKED

-- Invites --
INVITE_INVALID
INVITE_EXPIRED
INVITE_USED

-- CNPJ --
CNPJ_INVALID
CNPJ_ALREADY_EXISTS
CNPJ_LOOKUP_FAILED

-- Integrations --
PROVIDER_NOT_CONFIGURED
PROVIDER_AUTH_FAILED
PROVIDER_RATE_LIMIT
PROVIDER_SEND_FAILED

-- Auth --
UNAUTHORIZED
FORBIDDEN

-- Validation --
VALIDATION_ERROR
NOT_FOUND
INTERNAL_ERROR
```

### Part 2: Migrate All Edge Functions to Standard Envelope

Each function will import from `_shared/responses.ts` and replace ad-hoc responses.

**Functions to update (20 total):**

| Function | Key changes |
|---|---|
| `orbit-send-message` | Replace `{ ok: true, mensagem, status, simulated }` with `ok(mensagem, { simulated })`. Replace `{ error, code }` with `fail(code, message)`. |
| `orbit-send-email` | Replace `{ id, simulated }` with `ok({ id }, { simulated })`. Replace error returns with `fail()`. |
| `send-orbit-campaign` | Replace `{ success, enviados, falhas }` with `ok({ enviados, falhas })`. Plan errors via `fromPlanCheck()`. |
| `send-orbit-meta-message` | Replace `{ success, message_id }` with `ok({ message_id })`. `{ error: "Meta nao configurado" }` becomes `fail("PROVIDER_NOT_CONFIGURED", ...)`. |
| `orbit-search-leads` | Replace `{ success, total_found, imported }` with `ok(...)`. Apollo errors become `fail("PROVIDER_SEND_FAILED", ...)`. |
| `orbit-ai-suggest` | Replace `{ sugestoes }` with `ok({ sugestoes })`. Rate limit becomes `fail("PROVIDER_RATE_LIMIT", ...)`. |
| `orbit-ai-agent` | Internal function (webhook-triggered), lower priority. Standardize error logging only. |
| `validate-invite` | Replace `{ valid, ... }` with `ok(data)`. Errors become `fail("INVITE_INVALID"/"INVITE_EXPIRED"/"INVITE_USED", ...)`. |
| `accept-empresa-invite` | Replace `{ success, ... }` with `ok(data)`. CNPJ errors become `fail("CNPJ_INVALID"/"CNPJ_ALREADY_EXISTS", ...)`. Invite errors become `fail("INVITE_*", ...)`. |
| `create-empresa-invite` | Replace `{ empresa_id, invite_id }` with `ok(data)`. Auth errors become `fail("UNAUTHORIZED"/"FORBIDDEN", ...)`. |
| `create-empresa` | Replace `{ success, empresa, user }` with `ok(data)`. |
| `add-empresa-user` | Replace `{ success, user }` with `ok(data)`. |
| `fetch-cnpj` | Replace `{ error, manual }` with `fail("CNPJ_LOOKUP_FAILED", ..., { manual: true })`. |
| `request-campaign-approval` | Replace `{ success, message }` with `ok({ message })`. |
| `send-vendedor-notification` | Replace `{ success, message }` with `ok({ message })`. Provider errors become `fail("PROVIDER_SEND_FAILED", ...)`. |
| `orbit-webhook` | Internal (no client response), skip standardization. |
| `orbit-meta-webhook` | Internal, skip. |
| `create-master-user` | One-time setup function, lower priority but standardize. |
| `accept-invitation` | Legacy, standardize. |
| `invite-org-user` | Standardize. |

### Part 3: Frontend -- Unified Error Handler

**New file:** `src/lib/api-envelope.ts`

```typescript
interface ApiSuccess<T = any> {
  ok: true;
  data: T;
  meta?: { simulated?: boolean; correlation_id?: string };
}

interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
    correlation_id?: string;
  };
}

type ApiResponse<T = any> = ApiSuccess<T> | ApiError;

// Parse edge function response into typed envelope
function parseResponse<T>(response: { data: any; error: any }): ApiResponse<T>

// Handle the response: show toast for simulated, throw for errors
function handleApiResponse<T>(
  response: { data: any; error: any },
  options?: {
    onSimulated?: () => void;
    onPlanLimit?: (reason: string) => void;
    onProviderMissing?: (code: string) => void;
    silentSimulated?: boolean;
  }
): T
```

The handler will:
1. Parse the response envelope
2. If `ok: true` and `meta.simulated`: show "Envio simulado (Demo)" toast (unless silent)
3. If `ok: false`: check error code and either show PlanLimitDialog, provider config modal, or generic toast with `correlation_id`
4. Return the `data` for success cases

**Updated file:** `src/lib/plan-errors.ts`

Expand `PlanLimitReason` type and `PLAN_ERROR_CODES` array to include all new codes. Deprecate `extractPlanLimitReason` in favor of envelope-based detection.

**Updated file:** `src/components/orbit/PlanLimitDialog.tsx`

Add new reason configs for `PLAN_STATUS_BLOCKED`, `DEMO_ACTION_BLOCKED`, `NO_PLAN`.

### Part 4: Update Frontend Consumers

Each hook/page that calls `supabase.functions.invoke()` will use the new `handleApiResponse()` helper. This replaces the current pattern of:

```typescript
// BEFORE (scattered in each hook)
const response = await supabase.functions.invoke("orbit-send-message", { body });
if (response.error) throw response.error;
return response.data;
```

With:

```typescript
// AFTER (unified)
const response = await supabase.functions.invoke("orbit-send-message", { body });
return handleApiResponse(response);
```

Files to update:
- `src/hooks/useOrbitMensagens.ts` (useSendMensagem, useGetAISuggestions)
- `src/pages/orbit/CampanhasPage.tsx` (handleRequestApproval, handleSend)
- `src/hooks/useSuperAdmin.ts` (useCreateEmpresaUser, useCreateEmpresa)
- `src/hooks/useLeadFinder.ts` (useExecuteSearch)
- `src/hooks/useOrgUsers.ts` (useInviteOrgUser)
- `src/pages/AcceptInviteSaasPage.tsx` (validateToken, fetchCnpjData, handleFinalize)
- `src/pages/SetupPage.tsx` (create-master-user call)

### Part 5: Observability (Optional Enhancement)

Log errors server-side using the existing `pe_audit_log` table with `action = 'EDGE_ERROR'` and `metadata` containing `correlation_id`, `function_name`, `code`, and `message`. This avoids creating a new table while providing traceability.

Add a `logError()` helper in `_shared/responses.ts` that optionally writes to audit log for non-trivial errors (skip validation errors).

## Execution Order

1. Create `supabase/functions/_shared/responses.ts` (shared helpers)
2. Update all 18 edge functions to use standard envelope (batch by priority)
3. Create `src/lib/api-envelope.ts` (frontend handler)
4. Update `PlanLimitDialog.tsx` with new codes
5. Update all frontend consumers to use `handleApiResponse()`
6. Deploy all updated edge functions
7. Test end-to-end

## Summary of Changes

| Change | Type | Files |
|---|---|---|
| Shared response helpers | New | `supabase/functions/_shared/responses.ts` |
| Standardize 18 edge functions | Edit | All functions in `supabase/functions/` (except webhooks) |
| Frontend API envelope handler | New | `src/lib/api-envelope.ts` |
| Expand PlanLimitDialog codes | Edit | `src/components/orbit/PlanLimitDialog.tsx` |
| Expand plan-errors codes | Edit | `src/lib/plan-errors.ts` |
| Update 7 frontend consumers | Edit | Hooks and pages listed above |
| Deploy functions | Deploy | All modified functions |
