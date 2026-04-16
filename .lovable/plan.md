

# Transferir Todos os Prospects para Flavia Furlan

## Resumo

Atualizar o campo `responsavel_id` de todos os 1.212 prospects da tabela `orbit_prospects` para o ID da usuária Flavia Furlan.

## Alteração

### Migration SQL

```sql
UPDATE orbit_prospects
SET responsavel_id = '6bfd92d3-1751-458c-ba83-b67341625834';
```

- **Flavia Furlan**: `6bfd92d3-1751-458c-ba83-b67341625834` / `flavia@promotripcorporate.com`
- **Total afetado**: 1.212 prospects

## Arquivos

| Arquivo | Ação |
|---------|------|
| Migration SQL | UPDATE em massa do `responsavel_id` |

