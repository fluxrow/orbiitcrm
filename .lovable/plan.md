

# Etapa SAAS-1 -- Gap Analysis and Completion

## Current State

The core SaaS infrastructure was already created in Etapa 4X.3. Here is what exists vs what the spec requires:

| Item | Status | Gap |
|---|---|---|
| `saas_plans` table + seed (4 plans) | EXISTS | None |
| `saas_empresa` table | EXISTS | Missing indexes on `status` and `responsible_email` |
| `saas_invites` table | EXISTS | Missing indexes on `empresa_id`, `email`, `expires_at`. Missing `metadata jsonb` column |
| `orbit_empresas.cnpj` + `cnpj_normalized` | EXISTS | None |
| `trg_normalize_cnpj` trigger function | EXISTS | None |
| `uq_orbit_empresas_cnpj_norm` partial unique index | EXISTS | None |
| `saas_usage_monthly` table + unique constraint | EXISTS | None |
| RLS: `saas_plans` read all + super_admin write | EXISTS | None |
| RLS: `saas_empresa` super_admin + user read | EXISTS | Duplicate policy ("Users can view own empresa" and "Users can view own saas_empresa") -- cosmetic, harmless |
| RLS: `saas_invites` super_admin | EXISTS | None |
| RLS: `saas_usage_monthly` super_admin + user read | EXISTS | None |
| `saas_empresa.status` default | `'invited'` | Spec says `'pending'` -- minor discrepancy, current value works fine with the invitation flow |

## Plan: Add Missing Indexes + Column

A single database migration to fill the gaps:

### 1. Indexes on `saas_empresa`
```text
CREATE INDEX idx_saas_empresa_status ON saas_empresa(status);
CREATE INDEX idx_saas_empresa_email ON saas_empresa(responsible_email);
```

### 2. Indexes on `saas_invites`
```text
CREATE INDEX idx_saas_invites_empresa ON saas_invites(empresa_id);
CREATE INDEX idx_saas_invites_email ON saas_invites(email);
CREATE INDEX idx_saas_invites_expires ON saas_invites(expires_at);
```

### 3. `metadata` column on `saas_invites`
```text
ALTER TABLE saas_invites ADD COLUMN metadata jsonb NULL;
```

### 4. Drop duplicate RLS policy (optional cleanup)
The policy "Users can view own empresa saas_empresa" and "Users can view own saas_empresa" on `saas_empresa` are identical. Drop one to keep things clean:
```text
DROP POLICY IF EXISTS "Users can view own empresa saas_empresa" ON saas_empresa;
```

---

## No frontend or edge function changes needed

This is purely a database structure completion step. All application code already uses these tables correctly.

## Summary

| Change | Type |
|---|---|
| 5 new indexes (performance) | Migration |
| 1 new column `metadata` on `saas_invites` | Migration |
| 1 duplicate policy cleanup | Migration |

