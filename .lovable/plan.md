

# Fix: Etapas do funil não aparecem

## Causa raiz

As 7 etapas inseridas na migration têm `empresa_id = NULL`. A política RLS exige `empresa_id = get_user_empresa_id(auth.uid())`, bloqueando todas as etapas.

## Solução

Duas ações:

### 1. Migration SQL

Atualizar as 7 etapas existentes para pertencerem à empresa correta, e ajustar a RLS para também permitir visualização de etapas com `empresa_id IS NULL` (etapas globais/default):

```sql
-- Associar etapas à empresa existente
UPDATE orbit_pipeline_stages
SET empresa_id = 'c4ea82e5-ec19-4d1a-b752-cfadec363fca'
WHERE empresa_id IS NULL;

-- Atualizar RLS para permitir ver etapas da empresa OU globais
DROP POLICY IF EXISTS "Users can view own empresa stages" ON orbit_pipeline_stages;
CREATE POLICY "Users can view own empresa stages"
  ON orbit_pipeline_stages FOR SELECT TO authenticated
  USING (
    empresa_id IS NULL
    OR empresa_id = get_user_empresa_id(auth.uid())
  );
```

### 2. Nenhuma mudança de frontend necessária

O hook `useOrbitPipelineStages` e `useOrbitDealsGrouped` já fazem `select("*")` — o problema é puramente RLS.

## Arquivo alterado

| Arquivo | Ação |
|---|---|
| Nova migration SQL | UPDATE empresa_id + ajustar RLS |

