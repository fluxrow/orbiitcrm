
# Etapa 3H -- Harden Multi-Tenant Consistency (organization_id)

Adicionar 3 triggers BEFORE INSERT/UPDATE para garantir consistencia de `organization_id` entre tabelas filhas e pais, impedindo registros cross-tenant mesmo via SQL direto.

---

## Funcoes e Triggers

### 1. `validate_oportunidade_item_org()` -- trigger em `oportunidade_itens`

BEFORE INSERT OR UPDATE:
- Busca `organization_id` da `oportunidades` via `NEW.oportunidade_id`
- Se `NEW.organization_id IS NULL` --> auto-preenche com org do pai
- Se `NEW.organization_id != pai.organization_id` --> RAISE EXCEPTION `'org_mismatch: oportunidade_itens.organization_id must match oportunidades.organization_id'`

### 2. `validate_interacao_org()` -- trigger em `interacoes`

BEFORE INSERT OR UPDATE:
- Busca `organization_id` do `clientes` via `NEW.cliente_id`
- Se `NEW.organization_id IS NULL` --> auto-preenche com org do cliente
- Se `NEW.organization_id != clientes.organization_id` --> RAISE EXCEPTION `'org_mismatch: interacoes.organization_id must match clientes.organization_id'`
- Se `NEW.oportunidade_id IS NOT NULL`:
  - Busca `organization_id` e `cliente_id` da `oportunidades`
  - Se org da oportunidade != `NEW.organization_id` --> RAISE EXCEPTION
  - Se `oportunidade.cliente_id != NEW.cliente_id` --> RAISE EXCEPTION `'integrity_error: oportunidade.cliente_id must match interacao.cliente_id'`

### 3. `validate_tarefa_org()` -- trigger em `tarefas`

BEFORE INSERT OR UPDATE:
- Busca `organization_id` do `clientes` via `NEW.cliente_id`
- Se `NEW.organization_id IS NULL` --> auto-preenche com org do cliente
- Se `NEW.organization_id != clientes.organization_id` --> RAISE EXCEPTION `'org_mismatch: tarefas.organization_id must match clientes.organization_id'`
- Se `NEW.oportunidade_id IS NOT NULL`:
  - Busca `organization_id` e `cliente_id` da `oportunidades`
  - Se org da oportunidade != `NEW.organization_id` --> RAISE EXCEPTION
  - Se `oportunidade.cliente_id != NEW.cliente_id` --> RAISE EXCEPTION `'integrity_error: oportunidade.cliente_id must match tarefa.cliente_id'`

---

## Migration SQL (unica)

Uma migration contendo:
1. 3 funcoes PL/pgSQL (`SECURITY DEFINER, SET search_path TO 'public'`)
2. 3 triggers BEFORE INSERT OR UPDATE (um por tabela)

---

## Nao sera alterado

- Nenhum arquivo frontend
- Nenhuma tabela/coluna existente
- Nenhum trigger existente (recalc, validate_status, updated_at continuam intactos)

---

## Checklist de validacao pos-deploy

| Cenario | Resultado esperado |
|---|---|
| INSERT oportunidade_itens com org diferente da oportunidade | EXCEPTION org_mismatch |
| INSERT interacao com cliente de outra org | EXCEPTION org_mismatch |
| INSERT tarefa com oportunidade de outro cliente | EXCEPTION integrity_error |
| INSERT oportunidade_itens com org NULL | Auto-preenche com org do pai |
| INSERT interacao normal (mesma org) | Sucesso |
