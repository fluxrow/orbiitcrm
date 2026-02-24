

# Plan: Update ORBIT System Documentation

The documentation at `/documentacao` needs to reflect the recent PE Admin audit fixes: soft-delete policy, enhanced audit logging with before/after JSON, and historical snapshot triggers. Several sections are outdated or incomplete.

---

## Changes Required

### 1. Add new section "9. Integridade de Dados (PE)" to the TOC and content

A new section covering:
- **Soft-delete policy**: `produtos`, `segmentos`, `origens`, `funil_etapas` use `is_active = false` instead of physical DELETE. All listing queries filter `is_active = true` by default.
- **Audit log coverage table**: Complete table showing all actions logged (`CLIENTE_CREATED`, `PRODUTO_UPDATED`, `PRODUTO_DEACTIVATED`, `CONTATO_UPDATED`, `CLIENTE_ORIGEM_LINKED`, `CLIENTE_ORIGEM_UNLINKED`, etc.) with columns: Action Code, Entity, Operation, Before/After captured.
- **Historical snapshots**: `produto_nome_snapshot` in `oportunidade_itens` and `etapa_nome_snapshot` in `oportunidades`, populated by database triggers on INSERT/UPDATE.

### 2. Update Section 3 (Banco de Dados) — PE tables

Add the new snapshot columns to the table descriptions:
- `oportunidade_itens` → add note about `produto_nome_snapshot`
- `oportunidades` → add note about `etapa_nome_snapshot`

### 3. Update Section 5 (Edge Functions)

Add missing edge functions:
- `fetch-cnpj` — Consulta dados de CNPJ via API externa (Admin)
- `create-empresa-invite` — Cria convite para nova empresa SaaS (Admin)
- `accept-empresa-invite` — Aceita convite de empresa SaaS (Auth)
- `validate-invite` — Valida token de convite (Auth)

### 4. Update Section 6 (Autenticação)

Add `pe_user_is_sales_or_sdr()` to the helper functions table — it was implemented but not documented.

### 5. Update Section 8 (Índices)

The current section only shows 1 index. Update to show the full set of verified indices from the audit (all `idx_*_org` indices, composite indices, unique constraints).

### 6. Add new TOC icon import

Import a new icon (e.g., `ShieldCheck` or `History`) for the new data integrity section.

### 7. Bump version badge

Change `v1.0` to `v1.1` to reflect the audit updates.

---

## Files Modified

- `src/pages/DocumentacaoPage.tsx` — all changes in this single file

## Technical Details

- New section added to the `sections` array at the top of the file
- New section content rendered between section 8 and the footer
- Edge functions array expanded with 4 new entries
- Helper functions table expanded with 1 new entry
- Indices section rewritten with complete index coverage
- No backend changes needed — this is purely a documentation UI update

