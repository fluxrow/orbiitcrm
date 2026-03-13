

# Fix: Campanha de email não encontra configuração do Resend

## Problema

Na linha 220 de `send-orbit-campaign/index.ts`, a busca da configuração do Resend filtra apenas por `empresa_id`:

```typescript
const { data } = await supabase.from("orbit_resend_config").select("*").eq("empresa_id", campaign.empresa_id).maybeSingle();
```

A configuração existente no banco tem `empresa_id = null` (global), então a query não encontra nada. Resultado: `resendConfig` fica `null` e todos os emails falham com *"Email não configurado ou prospect sem email"*.

A edge function `orbit-send-email` já implementa esse fallback corretamente (busca por empresa, depois por `empresa_id IS NULL`), mas `send-orbit-campaign` não.

## Solução

Adicionar fallback na busca do Resend config (linhas 219-221), seguindo o mesmo padrão de `orbit-send-email`:

```typescript
if (campaign.canal === "email") {
  // Try empresa-specific config first
  const { data } = await supabase
    .from("orbit_resend_config")
    .select("*")
    .eq("empresa_id", campaign.empresa_id)
    .maybeSingle();
  resendConfig = data;

  // Fallback to global config
  if (!resendConfig) {
    const { data: globalConfig } = await supabase
      .from("orbit_resend_config")
      .select("*")
      .is("empresa_id", null)
      .maybeSingle();
    resendConfig = globalConfig;
  }
}
```

## Arquivo alterado

| Arquivo | Ação |
|---|---|
| `supabase/functions/send-orbit-campaign/index.ts` | Adicionar fallback para config global do Resend |

