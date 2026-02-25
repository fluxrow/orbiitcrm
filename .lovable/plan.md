

# Permitir que Super Admins criem senhas e ativem convites manualmente

## Contexto

O sistema ja possui:
1. `SetPasswordDialog` + Edge Function `admin-set-password` — funciona para a area legacy (super-admin/EmpresaUsersPage). Precisa ser adicionado tambem nas paginas do PE Admin.
2. Convites PE (`pe_invitations`) que so podem ser aceitos via link/token. Nao ha forma do Super Admin ativar manualmente um convite pendente.

## Alteracoes

### 1. Pagina Usuarios Globais (`GlobalUsersPage.tsx`) — Adicionar acoes

Atualmente a tabela e somente leitura. Adicionar:
- Dropdown de acoes por usuario com opcao **"Definir Senha"** (reutiliza `SetPasswordDialog`)
- Coluna de acoes na tabela

### 2. Pagina Usuarios da Org (`PeOrgUsersPage.tsx`) — Adicionar "Definir Senha"

No dropdown de acoes de cada usuario, adicionar item **"Definir Senha"** que abre o `SetPasswordDialog`.

### 3. Ativacao manual de convites PE — Nova funcionalidade

Adicionar na secao de "Convites Pendentes" do `PeOrgUsersPage.tsx` um botao **"Ativar Manualmente"** que:
- Chama a Edge Function `accept-invitation` com o token do convite + uma senha definida pelo admin
- Cria o usuario e vincula a organizacao sem que o convidado precise clicar no link

Para isso:
- Criar um dialog `ActivateInviteDialog` que pede a senha para o novo usuario
- Chamar `accept-invitation` passando `token`, `password` e opcionalmente `full_name`

**Problema:** o token armazenado em `pe_invitations` e texto puro (nao e hash como `saas_invites`), entao o Super Admin pode le-lo diretamente do banco.

### 4. Edge Function `admin-set-password` — Ajustar autorizacao

Atualmente verifica `user_roles.role = 'super_admin'` (sistema legacy). Precisa tambem verificar `pe_users.is_super_admin = true` para funcionar no contexto PE.

## Detalhes tecnicos

| Arquivo | Alteracao |
|---|---|
| `src/pages/pe-admin/GlobalUsersPage.tsx` | Adicionar coluna de acoes com dropdown contendo "Definir Senha"; importar e usar `SetPasswordDialog` |
| `src/pages/pe-admin/PeOrgUsersPage.tsx` | Adicionar "Definir Senha" no dropdown de usuarios; adicionar botao "Ativar Manual" nos convites pendentes; criar dialog inline para ativacao |
| `src/components/pe-admin/ActivateInviteDialog.tsx` | Novo componente: dialog que recebe invitation data, pede senha, chama `accept-invitation` com token + password |
| `supabase/functions/admin-set-password/index.ts` | Adicionar verificacao alternativa via `pe_users.is_super_admin` alem do `user_roles` |

### Fluxo de ativacao manual de convite

```text
Super Admin clica "Ativar Manual" no convite pendente
  → Abre dialog pedindo senha para o novo usuario
  → Chama accept-invitation com { token, password, full_name }
  → Edge Function cria auth user + vincula pe_users
  → Convite marcado como accepted
  → Lista atualizada
```

### Edge Function admin-set-password — Nova verificacao

```typescript
// Verificar super_admin no sistema PE tambem
const { data: peUser } = await supabaseAdmin
  .from("pe_users")
  .select("is_super_admin")
  .eq("id", requesterId)
  .single();

const isSuperAdmin = requesterRoles?.some(r => r.role === "super_admin") 
  || peUser?.is_super_admin === true;
```

