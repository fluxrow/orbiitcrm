

# Corrigir Validação de Convite na Página de Aceite

## Problema

A página `AcceptInvitePage.tsx` faz duas chamadas ao carregar:
1. Chama a edge function `accept-invitation` com `preview: true` (linhas 42-49)
2. **Ignora o resultado** e faz uma query direta ao banco via Supabase client (linhas 52-56)

A query direta falha porque as políticas RLS de `pe_invitations` só permitem leitura por **org admins** e **super admins**. Um usuário não autenticado (que é o caso típico de quem clica no link do convite) não tem permissão, então a query retorna erro e o convite aparece como "inválido".

## Solução

Refatorar `AcceptInvitePage.tsx` para usar **apenas a edge function** `accept-invitation` para buscar os dados do convite. A edge function já usa `SUPABASE_SERVICE_ROLE_KEY`, portanto ignora RLS.

No entanto, a edge function `accept-invitation` atualmente não suporta um modo "preview" — ela sempre tenta aceitar o convite. Precisamos adicionar suporte a um parâmetro `preview: true` que retorna os dados do convite sem aceitá-lo.

## Alterações

| Arquivo | Alteração |
|---|---|
| `supabase/functions/accept-invitation/index.ts` | Adicionar tratamento do parâmetro `preview: true` — quando presente, retorna os dados do convite (email, org name, role name, status, expires_at) sem executar a aceitação |
| `src/pages/AcceptInvitePage.tsx` | Remover a query direta ao banco (linhas 52-56). Usar apenas o resultado da edge function para preencher os dados do convite |

### Detalhes técnicos

**Edge function — modo preview:**
```
POST /accept-invitation
Body: { token: "xxx", preview: true }
Response: { data: { email, organization_name, role_name, role_code, status, expires_at } }
```

Quando `preview: true`:
- Busca o convite pelo token
- Valida status e expiração
- Retorna dados para exibição (sem criar usuário nem alterar status)

**Página AcceptInvitePage:**
- `fetchInvitation()` passa a usar apenas a resposta da edge function
- Remove a query `.from("pe_invitations")` que é bloqueada por RLS
- Mapeia os campos retornados para o estado local `invitation`

