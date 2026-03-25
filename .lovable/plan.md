

# Fix: Usar domínio verificado fluxrow.pro para emails do sistema

## Alteração

### Arquivo: `supabase/functions/_shared/system-email.ts`

Trocar as constantes:

```typescript
// DE:
const SYSTEM_FROM_NAME = "Orbit";
const SYSTEM_FROM_EMAIL = "onboarding@resend.dev";

// PARA:
const SYSTEM_FROM_NAME = "Orbit CRM";
const SYSTEM_FROM_EMAIL = "orbit@fluxrow.pro";
```

Isso resolve o erro 403 do Resend (sandbox só envia para o dono da conta) e faz todos os emails de sistema usarem o domínio verificado.

| Arquivo | Ação |
|---------|------|
| `supabase/functions/_shared/system-email.ts` | Editar constantes de remetente |

