

# Etapa 4X.4 -- Enhancements to `accept-empresa-invite` (NOT a new function)

## Analysis

The existing `accept-empresa-invite` edge function already implements the full finalization workflow described for `finalize-empresa-onboarding`. Creating a separate function would be pure code duplication.

Instead, this plan enhances the existing function with the missing pieces from the 4X.4 spec.

---

## 1. Enhancements to `accept-empresa-invite`

**File:** `supabase/functions/accept-empresa-invite/index.ts`

### 1a. Accept `dados_receita` in the request body

Add optional field to the input interface:

```text
interface AcceptRequest {
  token: string;
  password: string;
  full_name: string;
  cnpj?: string;
  dados_receita?: {
    razao_social?: string;
    nome_fantasia?: string;
    logradouro?: string;
    numero?: string;
    bairro?: string;
    municipio?: string;
    uf?: string;
    cnae_fiscal_descricao?: string;
  }
}
```

### 1b. Save `dados_receita` to `orbit_empresas`

When updating `orbit_empresas` (step 7), also save the company data fetched from BrasilAPI:

- `nome` = dados_receita.razao_social (if provided, otherwise keep empresa_nome)
- Add other fields if columns exist, or store in a metadata/JSON column

Since `orbit_empresas` already has `nome` and `cnpj`, we update `nome` with razao_social if provided, keeping it simple.

### 1c. Calculate `trial_ends_at`

After setting `saas_empresa.status = 'active'`, also compute trial period based on plan:

- demo: no trial_ends_at
- basic: trial_ends_at = now + 14 days
- professional: trial_ends_at = now + 14 days
- plus: trial_ends_at = now + 30 days

This uses the existing `trial_ends_at` column in `saas_empresa`.

### 1d. Return `organization_id` in response

After PE provisioning, capture the returned `organization_id` and include it in the response:

```text
{
  success: true,
  empresa_id: "...",
  user_id: "...",
  organization_id: "..." | null,
  plan_code: "...",
  status: "active"
}
```

---

## 2. Frontend: Pass `dados_receita` from CNPJ step

**File:** `src/pages/AcceptInviteSaasPage.tsx`

In `handleFinalize()`, include the BrasilAPI data already captured in state (`cnpjData`) in the payload sent to `accept-empresa-invite`.

---

## 3. No new edge function needed

The `finalize-empresa-onboarding` function described in the spec is NOT created as a separate file. All logic lives in `accept-empresa-invite`, which already handles:

- Token validation (hash, expiry, used_at)
- Auth user creation
- Profile + role assignment
- CNPJ validation + uniqueness
- PE tenant provisioning (non-demo)
- Pipeline stages + AI config seeding
- Invite marking + status updates
- Audit logging

---

## 4. Summary of file changes

| File | Action |
|---|---|
| `supabase/functions/accept-empresa-invite/index.ts` | Add dados_receita handling, trial_ends_at, organization_id in response |
| `src/pages/AcceptInviteSaasPage.tsx` | Pass cnpjData as dados_receita in finalize payload |

---

## Technical details

- The `trial_ends_at` values (14/30 days) can be adjusted later when plan configuration becomes more sophisticated. For now, hardcoded per plan_code.
- `dados_receita` fields are optional -- if the BrasilAPI call failed on the frontend, the function proceeds without them.
- The `pe_provision_tenant` RPC already returns `organization_id` in its JSONB response, so we capture it from the return value.
- No database migration needed -- `trial_ends_at` column already exists on `saas_empresa`.

