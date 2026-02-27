

# Remover prospects duplicados por nome

## Problema
Existem 118 nomes de prospects repetidos, totalizando 213 registros que poderiam ser removidos (mantendo 1 de cada). A dedup atual só verifica email e telefone, mas esses registros duplicados têm nomes idênticos sem email/telefone preenchido ou com dados diferentes.

## Proposta

### 1. Limpeza dos duplicados existentes (migração SQL)
- Criar uma query que, para cada grupo de `nome_razao` + `empresa_id` duplicados, mantenha apenas o registro mais recente (ou o que tem mais dados preenchidos) e exclua os demais
- Isso remove os ~213 registros duplicados de uma vez

### 2. Melhorar dedup na importação (`src/hooks/useImportProspects.ts`)
- Adicionar `nome_razao` normalizado (lowercase, sem acentos) como terceiro critério de dedup, além de email e telefone
- Ao importar, se já existe um prospect com o mesmo nome normalizado na mesma empresa, marcar como duplicado

### Detalhes técnicos
- A limpeza usará `ROW_NUMBER() OVER (PARTITION BY empresa_id, lower(trim(nome_razao)) ORDER BY updated_at DESC)` para identificar duplicados, mantendo o mais recente
- Na importação, será adicionado um `Set<string>` de nomes normalizados, similar ao que já existe para emails e telefones

