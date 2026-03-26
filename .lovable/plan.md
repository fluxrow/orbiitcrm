

# Corrigir contagem de "Enviados" no relatório de campanhas

## Problema

O card "Enviados" na lista de campanhas usa `c.enviados` da tabela `orbit_campaigns`, que é um contador incremental atualizado ao final de cada execução. Este contador pode ficar desatualizado (ex: campanha pausada mostra 0 enviados mesmo com 141 recipients enviados).

O sistema já busca os dados reais dos recipients em `recipientCounts`, mas só usa `total` e `pendente`.

## Solução

### `src/pages/orbit/CampanhasPage.tsx`

1. **Expandir `recipientCounts`** para incluir contagem de `enviado`, `falhou`, `ignorado`:
   - No query existente (linha 53), adicionar contadores: `enviado`, `falhou`, `ignorado`
   - Contar recipients com `status === "enviado"` ou `status === "simulated"`

2. **Usar contagem real no card** (linha 271):
   - Trocar `c.enviados` por `counts?.enviado || 0`
   - Isso reflete os dados reais da tabela `orbit_campaign_recipients`

3. **Também corrigir aberturas/cliques** se estiverem usando campos da campanha:
   - Manter `c.aberturas` e `c.cliques` por enquanto (esses são atualizados pelo tracking pixel/webhook e são mais confiáveis)

### Migration SQL (opcional)

Sincronizar o campo `orbit_campaigns.enviados` com a contagem real para campanhas existentes:

```sql
UPDATE orbit_campaigns oc SET enviados = sub.cnt
FROM (
  SELECT campaign_id, count(*) as cnt 
  FROM orbit_campaign_recipients 
  WHERE status IN ('enviado', 'simulated') 
  GROUP BY campaign_id
) sub
WHERE oc.id = sub.campaign_id AND oc.enviados != sub.cnt;
```

| Arquivo | Ação |
|---------|------|
| `src/pages/orbit/CampanhasPage.tsx` | Usar contagem real de recipients enviados nos cards |
| Migration SQL | Sincronizar contadores existentes |
