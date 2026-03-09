

# Fix: Check constraint violation on `orbit_campaigns.status`

## Root Cause

The database has a CHECK constraint on `orbit_campaigns.status` that only allows these values:
`rascunho, agendada, enviando, concluida, pausada, cancelada, pendente_aprovacao, aprovada, reprovada`

The frontend code tries to set two invalid status values:
- `"em_revisao"` (line 70) -- when opening review dialog
- `"aprovada_para_envio"` (line 80) -- when approving for send

Additionally, the `send-orbit-campaign` edge function sets `"pausada_por_limite"` which is also not in the constraint.

## Solution

Update the CHECK constraint to include the missing status values. This is a schema change requiring a migration.

### Migration SQL

```sql
ALTER TABLE orbit_campaigns DROP CONSTRAINT orbit_campaigns_status_check;
ALTER TABLE orbit_campaigns ADD CONSTRAINT orbit_campaigns_status_check 
  CHECK (status = ANY (ARRAY[
    'rascunho', 'agendada', 'enviando', 'concluida', 'pausada', 'cancelada',
    'pendente_aprovacao', 'aprovada', 'reprovada',
    'em_revisao', 'aprovada_para_envio', 'pausada_por_limite'
  ]));
```

No frontend changes needed.

| Arquivo | Acao |
|---|---|
| Nova migration SQL | Atualizar CHECK constraint de status |

