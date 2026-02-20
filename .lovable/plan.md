

# Etapa SAAS-4 -- Gap Analysis and Implementation Plan

## Current State

| Function | Status | Gap |
|---|---|---|
| `validate-invite` | EXISTS, complete | None -- fully matches spec |
| `fetch-cnpj` | MISSING | Frontend calls BrasilAPI directly; no server-side function |
| `finalize-empresa-onboarding` | COVERED by `accept-empresa-invite` | Name differs, but all logic is implemented |

## What Needs to Be Done

### 1. Create `fetch-cnpj` Edge Function

New file: `supabase/functions/fetch-cnpj/index.ts`

- Accepts `{ cnpj: string }`
- Normalizes (strip non-digits), validates length (14 digits)
- Calls BrasilAPI: `https://brasilapi.com.br/api/cnpj/v1/{digits}`
- Returns essential fields: `razao_social`, `nome_fantasia`, `logradouro`, `numero`, `bairro`, `municipio`, `uf`, `cnae_fiscal_descricao`
- On API failure: returns `{ error: "...", manual: true }` so frontend can allow manual entry
- No JWT required (public endpoint, CNPJ lookup is non-sensitive)

### 2. Register in config.toml

Add `[functions.fetch-cnpj]` with `verify_jwt = false`.

### 3. Update Frontend to Use Edge Function (Optional)

Update `AcceptInviteSaasPage.tsx` to call `supabase.functions.invoke("fetch-cnpj")` instead of calling BrasilAPI directly from the browser. This avoids CORS issues and centralizes the external API call.

### 4. No Changes Needed For

- **validate-invite**: Already complete
- **finalize-empresa-onboarding**: The `accept-empresa-invite` function already implements all required logic. Creating a separate function with a different name would be redundant. The frontend already calls it correctly.

## Technical Details

### fetch-cnpj Edge Function

```text
Input:  { cnpj: "12.345.678/0001-90" }
Output: { razao_social, nome_fantasia, logradouro, numero, bairro, municipio, uf, cnae_fiscal_descricao }
Error:  { error: "message", manual: true }
```

### Frontend Change (AcceptInviteSaasPage.tsx)

Replace the direct `fetch("https://brasilapi.com.br/...")` call with `supabase.functions.invoke("fetch-cnpj", { body: { cnpj: digits } })`.

## Summary

| Change | Type | Files |
|---|---|---|
| Create `fetch-cnpj` Edge Function | New file | `supabase/functions/fetch-cnpj/index.ts` |
| Register in config.toml | Config | `supabase/config.toml` |
| Update frontend CNPJ lookup | Edit | `src/pages/AcceptInviteSaasPage.tsx` |
| Deploy function | Deployment | `fetch-cnpj` |

