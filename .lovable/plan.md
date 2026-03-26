

# Corrigir contagem truncada de destinatários nas campanhas

## Problema

A query em `CampanhasPage.tsx` (linha 48-51) busca **todos os recipients de todas as campanhas** em uma única query:
```typescript
.from("orbit_campaign_recipients")
.select("campaign_id, status")
.in("campaign_id", campaignIds)
```

O banco tem limite padrão de 1000 linhas por query. Com múltiplas campanhas (ex: uma com 141 + outra com 41 + outras), o resultado é truncado e as contagens ficam erradas. O analytics funciona porque busca uma campanha por vez.

## Solução

### `src/pages/orbit/CampanhasPage.tsx`

Substituir a query única por uma **database function (RPC)** que faz `GROUP BY` e `COUNT` no servidor, ou paginar a query para buscar todos os registros.

**Abordagem mais simples — paginar a query:**
- Usar `.range()` ou buscar em lotes por campanha
- Ou melhor: criar uma view/RPC que retorna contagens agregadas

**Abordagem recomendada — RPC no banco:**

### Migration SQL

Criar função que retorna contagens agrupadas:

```sql
CREATE OR REPLACE FUNCTION get_campaign_recipient_counts(p_campaign_ids uuid[])
RETURNS TABLE(campaign_id uuid, total bigint, pendente bigint, enviado bigint, falhou bigint, ignorado bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    cr.campaign_id,
    count(*) as total,
    count(*) FILTER (WHERE cr.status = 'pendente') as pendente,
    count(*) FILTER (WHERE cr.status IN ('enviado', 'simulated')) as enviado,
    count(*) FILTER (WHERE cr.status = 'falhou') as falhou,
    count(*) FILTER (WHERE cr.status = 'ignorado') as ignorado
  FROM orbit_campaign_recipients cr
  WHERE cr.campaign_id = ANY(p_campaign_ids)
  GROUP BY cr.campaign_id;
$$;
```

### `src/pages/orbit/CampanhasPage.tsx`

Trocar a query direta pela chamada RPC:

```typescript
const { data } = await supabase.rpc("get_campaign_recipient_counts", {
  p_campaign_ids: campaignIds
});
```

Isso elimina o limite de 1000 linhas porque a agregação acontece no servidor.

| Arquivo | Ação |
|---------|------|
| Migration SQL | Criar função `get_campaign_recipient_counts` |
| `src/pages/orbit/CampanhasPage.tsx` | Usar RPC ao invés de query direta |

