

# Corrigir salvamento do treinamento do agente IA

## Causa raiz
A linha existente na tabela `orbit_ai_config` tem `empresa_id = NULL`. A política RLS de UPDATE exige `empresa_id = get_user_empresa_id(auth.uid())`, então NULL nunca passa na comparação e o update é silenciosamente ignorado pelo banco.

## Correção

### 1. Corrigir o registro existente (SQL data fix)
- Atualizar o registro existente para associar ao `empresa_id` correto (buscar da tabela `profiles` do usuário que o criou, ou da empresa existente)

### 2. `src/pages/orbit/ConfigPage.tsx` — incluir `empresa_id` no save
- Na função `saveAI`, passar `empresa_id` do perfil do usuário logado para garantir que tanto updates quanto inserts incluam o campo
- Usar o `empresa_id` já disponível via `usePeAuth()` ou buscando do `profiles`

### 3. `src/hooks/useOrbitConfig.ts` — filtrar por empresa
- Na query `useOrbitAIConfig`, adicionar `.eq("empresa_id", empresa_id)` para garantir multi-tenancy correto
- Na mutation `useUpdateAIConfig`, incluir `empresa_id` no insert quando criando novo registro

### Detalhes técnicos
O problema é que `NULL = 'uuid-value'` retorna `FALSE` em SQL, então o RLS bloqueia silenciosamente. A correção precisa:
1. Fix do dado existente via UPDATE direto
2. Garantir que `empresa_id` seja sempre enviado nas operações de save

