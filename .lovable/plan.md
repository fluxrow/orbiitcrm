

# Fix: Admin "Ativar" blocked by duplicate check

## Root Cause

The `handleApprove` in `CadastrosPage.tsx` calls `auto-approve-trial` with the trial data. The function then:
1. Checks for existing `trial_requests` with same email + status pending/approved — **finds the current record itself**
2. Returns 409 error "Já existe uma solicitação para este e-mail"

The duplicate check correctly prevents public form re-submissions, but incorrectly blocks the admin approval flow.

## Solution

Pass the existing `trial_request.id` to the edge function. When an ID is provided, skip the duplicate check and update the existing record instead of inserting a new one.

### Changes

| File | Change |
|---|---|
| `src/pages/pe-admin/CadastrosPage.tsx` | Add `trial_id: trial.id` to the request body for both `handleApprove` and `handleResend` |
| `supabase/functions/auto-approve-trial/index.ts` | Accept optional `trial_id` param. When present, skip duplicate check on `trial_requests` and update the existing record to `approved` instead of inserting a new one |

### Edge Function Logic

```
if (body.trial_id) {
  // Admin approval flow: update existing record, skip trial_requests duplicate check
  UPDATE trial_requests SET status = 'approved' WHERE id = trial_id
} else {
  // Public form flow: check duplicates, then INSERT new record
  CHECK duplicates → INSERT trial_request
}
```

The `saas_invites` duplicate check remains for both flows (prevents sending duplicate invites).

