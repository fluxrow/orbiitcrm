

# Corrigir contagem de prospects limitada a 1000

## Problema
O dashboard calcula `totalProspects = prospects?.length` usando dados retornados por `useOrbitProspects()`, que faz um `select("*")` sem paginação. O Supabase limita queries a 1000 linhas por padrão, então o valor sempre para em 1000.

## Correção

### 1. Criar hook dedicado para contagem — `useOrbitProspectsCount`
- Usar `supabase.from('orbit_prospects').select('*', { count: 'exact', head: true })` que retorna apenas a contagem total sem transferir dados
- Retornar o `count` do response header em vez de carregar todos os registros na memória

### 2. `src/pages/orbit/OrbitDashboard.tsx`
- Usar o novo `useOrbitProspectsCount()` para exibir o "Total de Leads" correto
- Manter `useOrbitProspects()` apenas para listar os 3 prospects recentes (já com `.slice(0,3)`)

### 3. `src/hooks/useOrbitProspects.ts`
- Adicionar a função `useOrbitProspectsCount` exportada
- Adicionar `.limit()` na query principal de `useOrbitProspects` para evitar carregar milhares de registros quando só precisamos dos recentes no dashboard

### Detalhes técnicos
```typescript
// Novo hook — consulta leve que retorna apenas a contagem
export function useOrbitProspectsCount() {
  return useQuery({
    queryKey: ["orbit_prospects_count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("orbit_prospects")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
}
```

