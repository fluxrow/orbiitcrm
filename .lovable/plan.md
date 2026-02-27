

# Corrigir limite de 1000 na importação de prospects

## Problema
A query de verificação de duplicados em `src/hooks/useImportProspects.ts` (linha 223) usa o limite padrão de 1000 linhas do banco de dados, impedindo a checagem completa de duplicados quando há mais de 1000 prospects existentes.

## Alterações

### 1. `src/hooks/useImportProspects.ts`
- Adicionar paginação na query de duplicados para buscar **todos** os prospects existentes (não apenas os primeiros 1000)
- Implementar loop que faz `select` com `.range(offset, offset+999)` até não haver mais registros
- Otimizar inserção: usar batch insert (lotes de 100) em vez de inserção individual, melhorando performance para CSVs grandes

### Detalhes técnicos
- A query de duplicados será paginada com `range()` para buscar todos os registros
- As inserções serão agrupadas em batches de ~100 registros para reduzir chamadas ao banco
- O restante da lógica (histórico, validação, dedup intra-import) permanece igual

