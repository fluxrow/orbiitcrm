

# Correção do webhook inbound — busca por whatsapp OR telefone + logging

## Problema raiz

Os logs confirmam: o webhook busca prospect apenas por `whatsapp`, não encontra, tenta criar, falha com erro 23505 (`telefone` duplicado), e o fallback também busca só por `whatsapp` — resultando em 500.

## Mudanças

### 1. `supabase/functions/orbit-webhook/index.ts`

**Busca inicial de prospect (linha 123-129)** — usar `.or()`:
```typescript
let prospectQuery = supabase
  .from("orbit_prospects")
  .select("*")
  .or(`whatsapp.eq.${normalizedPhone},telefone.eq.${normalizedPhone}`);
if (empresaId) prospectQuery = prospectQuery.eq("empresa_id", empresaId);
```

**Fallback de duplicata (linha 177-181)** — buscar por whatsapp OR telefone:
```typescript
const { data: existingProspect } = await supabase
  .from("orbit_prospects")
  .select("*")
  .or(`whatsapp.eq.${normalizedPhone},telefone.eq.${normalizedPhone}`)
  .maybeSingle();
```

**Auto-preencher whatsapp** — após encontrar prospect (tanto na busca inicial quanto no fallback), se `whatsapp` estiver vazio:
```typescript
if (prospect && !prospect.whatsapp) {
  await supabase.from("orbit_prospects")
    .update({ whatsapp: normalizedPhone, whatsapp_status: "nao_verificado" })
    .eq("id", prospect.id);
  prospect.whatsapp = normalizedPhone;
}
```

**Fallback final sem exceção (linha 193-196)** — se mesmo com `.or()` não encontrar prospect após 23505, não lançar exceção. Retornar 200 com `ignored`:
```typescript
if (!existingProspect) {
  console.error("[orbit-webhook] Prospect duplicado mas não encontrado com OR:", normalizedPhone);
  return new Response(JSON.stringify({ ok: true, ignored: true, reason: "duplicate_unresolved" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

**Logging de webhook** — inserir log no `orbit_webhook_logs` no início do processamento de mensagem e atualizar status ao final.

### 2. Migration SQL — tabela `orbit_webhook_logs`

```sql
CREATE TABLE IF NOT EXISTS orbit_webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text,
  instance_id text,
  phone text,
  payload jsonb,
  status text DEFAULT 'received',
  error_message text,
  created_at timestamptz DEFAULT now()
);
```

Sem RLS (apenas service_role acessa no webhook).

## Arquivos alterados

| Arquivo | Ação |
|---|---|
| `supabase/functions/orbit-webhook/index.ts` | Busca por `whatsapp OR telefone`, auto-preencher whatsapp, fallback sem 500, logging |
| Migration SQL | Criar tabela `orbit_webhook_logs` |

