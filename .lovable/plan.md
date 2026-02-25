

# Permitir que Admins de Organização Adicionem Usuários Diretamente

## Problema atual

Hoje, administradores de organização (ORG_ADMIN) só podem **convidar** usuários via email. O novo usuário precisa receber o email, clicar no link e criar sua senha. Isso é limitante quando o admin quer cadastrar alguém diretamente com nome, email e senha prontos.

## Solução

Criar um fluxo de **adição direta** de usuários, similar ao que já existe para Super Admins (`add-empresa-user`), mas adaptado para o contexto de organizações PE.

### Alterações

| Arquivo | Alteração |
|---|---|
| `supabase/functions/add-org-user/index.ts` | **Novo** -- Edge Function que cria um usuário diretamente (auth + pe_users + profiles) com permissão para ORG_ADMIN e Super Admin |
| `supabase/config.toml` | Adicionar entrada `[functions.add-org-user]` com `verify_jwt = false` |
| `src/hooks/useOrgUsers.ts` | Adicionar hook `useAddOrgUser` que chama a nova Edge Function |
| `src/pages/org/OrgUsersPage.tsx` | Adicionar dialog "Adicionar Usuário" com campos nome, email, senha e papel, além do botão existente de convite |

### Detalhes técnicos

**Edge Function `add-org-user`**:

1. Validar autenticação via header Authorization
2. Verificar que o chamador é ORG_ADMIN da mesma organização ou Super Admin
3. Verificar limite de usuários da empresa (via `pe_tenant_map` → `orbit_empresas.max_usuarios`)
4. Criar usuário no auth com `admin.createUser` (email_confirm: true)
5. Aguardar trigger `handle_new_user_pe` criar o registro em `pe_users`
6. Atualizar `pe_users` com `organization_id`, `role_id`, `full_name`
7. Atualizar `profiles.empresa_id` via `pe_tenant_map`
8. Registrar no `pe_audit_log`

```text
Fluxo:
  ORG_ADMIN clica "Adicionar" → Preenche nome/email/senha/papel
  → POST add-org-user → Cria auth user → Atualiza pe_users + profiles
  → Retorna sucesso → Lista atualizada
```

**UI - OrgUsersPage**:

- Substituir o botão único "Convidar" por dois botões: "Adicionar" e "Convidar"
- Dialog "Adicionar Usuário" com campos: Nome, Email, Senha (min 6 chars), Papel (select dos pe_roles)
- Manter dialog de convite existente como alternativa

