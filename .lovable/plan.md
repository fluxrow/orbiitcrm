

# Fix: Usuário cadastrado no trial não é vinculado como admin da organização

## Problema

Quando um usuário se cadastra pelo fluxo de trial (accept-empresa-invite), o sistema:
1. Cria o auth user → trigger `handle_new_user_pe` cria `pe_users` com `organization_id = NULL` e `role_id = NULL`
2. Chama `pe_provision_tenant` → cria a organização e o mapeamento `pe_tenant_map`
3. **Nunca atualiza `pe_users`** para vincular o usuário à organização com role `ORG_ADMIN`

Resultado: o usuário fica "órfão" no PE — sem organização e sem papel. Não consegue acessar dados via RLS que dependem de `pe_get_user_org_id()`.

## Solução

Atualizar a função `pe_provision_tenant` para também vincular o usuário criador como `ORG_ADMIN` da organização recém-criada.

### Arquivo: Migration SQL (nova)

Alterar a função `pe_provision_tenant` para adicionar ao final:

```sql
-- Vincular o usuário criador como ORG_ADMIN da organização
UPDATE public.pe_users
SET organization_id = v_org_id,
    role_id = (SELECT id FROM public.pe_roles WHERE code = 'ORG_ADMIN'),
    is_active = true
WHERE id = p_created_by_user_id
  AND organization_id IS NULL;
```

Isso garante que:
- O usuário que ativa a conta é automaticamente admin da organização
- Funciona tanto no fluxo `accept-empresa-invite` quanto no `create-empresa` (super admin)
- Não afeta usuários que já têm organização (condição `AND organization_id IS NULL`)
- Nenhuma alteração necessária nas edge functions — a correção é centralizada no banco

### Arquivo afetado

| Arquivo | Ação |
|---------|------|
| Nova migration SQL | Recriar `pe_provision_tenant` com `UPDATE pe_users` |

