

# IA não responde + Erro ao assumir conversa

## Problemas identificados (3)

### 1. Z-API ainda com `ativo = false`
A correção de auto-ativação só funciona na **próxima vez** que o usuário salvar. O registro existente continua com `ativo = false`, então tanto o AI agent quanto o `orbit-send-message` não encontram config Z-API ativa. Precisa de um UPDATE direto no banco.

### 2. `orbit-send-message` não filtra por `empresa_id`
Linhas 87-91: a query de Z-API config não filtra por `empresa_id`, mesmo bug que já corrigimos no AI agent. Além disso, o `handleSend` na ConversasPage não passa o `telefone` da conversa, então a condição `&& telefone` (linha 93) falha mesmo quando a config é encontrada.

### 3. "Assumir conversa" passa `user_id: ""`
Na ConversasPage linha 59, o botão "Assumir" chama `assume.mutateAsync({ conversa_id: active.id, user_id: "" })` — string vazia em vez do ID real do usuário logado. Isso causa erro no update do banco.

## Correções

### Correção 1 — Dados: ativar Z-API config existente
```sql
UPDATE orbit_zapi_config SET ativo = true 
WHERE empresa_id = 'c4ea82e5-ec19-4d1a-b752-cfadec363fca';
```

### Correção 2 — `orbit-send-message`: filtrar Z-API por `empresa_id`
Adicionar filtro `.eq("empresa_id", profile.empresa_id)` na query de Z-API config (mesmo padrão do AI agent).

### Correção 3 — ConversasPage: passar `telefone` no envio + `user_id` correto no assumir
- `handleSend`: incluir `telefone: active.telefone_whatsapp` na chamada de `sendMessage`
- Botão "Assumir": importar `useAuth`, usar `user.id` em vez de string vazia

### Detalhes técnicos

**ConversasPage.tsx:**
```tsx
// Importar useAuth
import { useAuth } from "@/hooks/useAuth";
// No componente:
const { user } = useAuth();

// handleSend — passar telefone
sendMessage.mutateAsync({ conversa_id: activeId, mensagem: msg, telefone: active?.telefone_whatsapp })

// Assumir — passar user_id real
assume.mutateAsync({ conversa_id: active.id, user_id: user?.id || "" })
```

**orbit-send-message (linhas 87-91):**
```typescript
let zapiQuery = supabase.from("orbit_zapi_config").select("*").eq("ativo", true);
if (profile?.empresa_id) zapiQuery = zapiQuery.eq("empresa_id", profile.empresa_id);
const { data: zapiConfig } = await zapiQuery.maybeSingle();
```

