

## Orbit Prospecting Engine - Camada Base Completa (do zero)

### Estado Atual vs. Solicitado

O sistema atual usa `orbit_empresas` + `profiles` + `user_roles` (com enum `app_role`). **Nenhuma** das 5 tabelas solicitadas existe. A arquitetura pedida e fundamentalmente diferente:

- Atual: 1 usuario = 1 empresa (via `profiles.empresa_id`), roles via enum
- Solicitado: 1 usuario = 1 organization (via `users.organization_id`), SUPER_ADMIN global sem org, roles via tabela `roles` com codes novos (ORG_ADMIN, ORG_MANAGER, etc.), sistema de convites com token

As tabelas existentes (`orbit_*`) serao mantidas intactas (coexistencia).

---

### Fase 1: Migration SQL

Criar todas as 5 tabelas, indices, funcoes auxiliares, RLS, triggers e seed.

**1.1 Tabela `organizations`**
- id, name, legal_name, cnpj (unique parcial WHERE cnpj IS NOT NULL), status (default 'active'), created_at, updated_at
- Index em status
- Trigger updated_at

**1.2 Tabela `pe_roles`**
- id, code (unique), name, created_at
- Seed: ORG_ADMIN, ORG_MANAGER, ORG_SALES, ORG_SDR, ORG_VIEWER

**1.3 Tabela `pe_users`** (nao usar `users` para evitar conflito com `auth.users`)
- id (uuid, FK auth.users.id -- para vincular ao auth)
- organization_id (uuid, FK organizations.id, nullable)
- role_id (uuid, FK pe_roles.id, nullable)
- full_name, email (unique lower), phone, is_active (default true), is_super_admin (default false)
- created_at, updated_at
- CHECK: (is_super_admin = true AND organization_id IS NULL) OR (is_super_admin = false AND organization_id IS NOT NULL)
- CHECK: (is_super_admin = true AND role_id IS NULL) OR (is_super_admin = false AND role_id IS NOT NULL)
- Indices: unique lower(email), index(organization_id), index(role_id), index(is_super_admin), index(is_active)
- Trigger updated_at
- Trigger on auth.users insert para auto-criar entrada em pe_users

**1.4 Tabela `pe_invitations`**
- id, organization_id (FK), email, role_id (FK), token (unique), status (default 'pending'), expires_at, invited_by_user_id (FK pe_users.id), created_at, updated_at
- Indices: organization_id, email, status, unique(token)

**1.5 Tabela `pe_audit_log`**
- id, organization_id (nullable), actor_user_id (nullable), action, entity_type, entity_id, metadata (jsonb), created_at
- Indices: organization_id, created_at

**1.6 Funcoes auxiliares (security definer)**
- `pe_is_super_admin(user_id uuid) returns boolean`
- `pe_get_user_org_id(user_id uuid) returns uuid`
- `pe_get_user_role_code(user_id uuid) returns text`
- `pe_user_is_org_admin(user_id uuid, org_id uuid) returns boolean`

**1.7 RLS Policies**
- `organizations`: SELECT para membros (pe_users.organization_id = id); ALL para super_admin
- `pe_users`: SELECT para membros da mesma org; UPDATE para ORG_ADMIN da mesma org; ALL para super_admin
- `pe_roles`: SELECT para todos autenticados
- `pe_invitations`: SELECT/INSERT/UPDATE para ORG_ADMIN da mesma org; ALL para super_admin
- `pe_audit_log`: SELECT para ORG_ADMIN da mesma org; INSERT para membros; ALL para super_admin

**1.8 Seed do SUPER_ADMIN inicial**
- Buscar o usuario existente com role `super_admin` no `user_roles` (VAGNER TERRES STEMPNIAK)
- Criar entrada em `pe_users` com `is_super_admin = true`, `organization_id = NULL`, `role_id = NULL`

---

### Fase 2: Edge Function `invite-org-user`

**Arquivo:** `supabase/functions/invite-org-user/index.ts`

```text
1. Validar JWT
2. Verificar permissao: SUPER_ADMIN ou ORG_ADMIN da org do convite
3. Receber: organization_id, full_name, email, phone, role_code
4. Buscar role_id pelo role_code em pe_roles
5. Gerar token unico (crypto.randomUUID)
6. Criar entrada em pe_invitations (status=pending, expires_at=now+7dias)
7. Registrar pe_audit_log (INVITE_SENT)
8. Retornar token e dados do convite
```

**Arquivo:** `supabase/functions/accept-invitation/index.ts`

```text
1. Receber: token, password (para novos usuarios), full_name (opcional)
2. Buscar convite pelo token
3. Validar: status=pending, expires_at > now
4. Verificar se email ja existe em auth.users
5. Se nao existe: criar auth user via admin.createUser() + pe_users
6. Se ja existe:
   - Buscar pe_users pelo auth user id
   - Se is_super_admin: rejeitar
   - Se organization_id != null E != convite.organization_id: rejeitar (usuario ja pertence a outra org)
   - Se organization_id == convite.organization_id: atualizar role_id
   - Se organization_id IS NULL (caso raro): vincular a org
7. Marcar convite como accepted
8. Registrar pe_audit_log (INVITE_ACCEPTED)
```

---

### Fase 3: Hooks Frontend

**3.1 `src/hooks/usePeAuth.ts`**
- Hook que busca pe_users do usuario logado
- Retorna: isSuperAdmin, orgId, roleCode, peUser

**3.2 `src/hooks/useOrganizations.ts`**
- useOrganizations() -- super_admin ve todas; org_admin ve so a sua
- useCreateOrganization() -- cria org + audit_log (somente super_admin)
- useUpdateOrganization() -- edita org
- useToggleOrgStatus() -- ativa/inativa + audit_log

**3.3 `src/hooks/useOrgUsers.ts`**
- useOrgUsers(orgId) -- lista pe_users da org com role
- useUpdateOrgUser() -- alterar role_id, is_active, etc
- useInviteUser() -- chama edge function invite-org-user

**3.4 `src/hooks/usePeInvitations.ts`**
- useOrgInvitations(orgId) -- listar convites
- useCancelInvitation() -- cancelar convite

**3.5 `src/hooks/usePeAuditLog.ts`**
- useAuditLog(orgId, filters) -- listar com filtros de periodo

---

### Fase 4: Telas de UI

**4.1 Login** -- `src/pages/AuthPage.tsx` (modificar)
- Manter fluxo atual
- Apos login: verificar pe_users.is_super_admin
  - Se super_admin: redirecionar para /pe-admin
  - Se usuario comum: redirecionar para /org (futuro dashboard da org)

**4.2 Aceite de Convite** -- `src/pages/AcceptInvitePage.tsx` (criar)
- Rota: /invite/:token
- Mostra dados do convite (org, role)
- Se usuario nao existe: formulario com nome, email (pre-preenchido), senha
- Se usuario existe e logado: botao para aceitar
- Chama edge function accept-invitation

**4.3 Painel SUPER_ADMIN** -- Layout e paginas

**Layout:** `src/pages/pe-admin/PeAdminLayout.tsx`
- Sidebar: Organizacoes, Usuarios Globais, Auditoria
- Header com nome do super admin + logout

**Organizacoes:** `src/pages/pe-admin/OrganizationsPage.tsx`
- Tabela: nome, CNPJ, status, qtd usuarios, data criacao
- Filtro por status (active/inactive)
- Busca por nome
- Botao "Nova Organizacao" abre dialog (name, legal_name, cnpj)
- Dropdown por org: editar, ativar/inativar, ver usuarios
- Link "Ver Usuarios" navega para /pe-admin/organizations/:id/users

**Usuarios por Org:** `src/pages/pe-admin/OrgUsersPage.tsx`
- Header com nome da org + botao voltar
- Tabela: nome, email, telefone, papel, status, data
- Botao "Convidar Usuario" abre dialog
- Dropdown: alterar papel, ativar/inativar
- Lista de convites pendentes

**Usuarios Globais:** `src/pages/pe-admin/GlobalUsersPage.tsx`
- Lista todos pe_users do sistema
- Editar nome/telefone/status

**Auditoria:** `src/pages/pe-admin/AuditLogPage.tsx`
- Filtro global (todas as orgs ou selecionar org)
- Filtro por periodo
- Tabela: data, usuario, acao, entidade, detalhes

**4.4 Painel ORG_ADMIN** -- Tela de usuarios da org

**Usuarios:** `src/pages/org/OrgUsersPage.tsx`
- Rota: /org/users
- Lista usuarios da propria org
- Convidar usuario
- Alterar papel
- Ativar/inativar
- Convites pendentes

---

### Fase 5: Rotas e Protecao

Novas rotas no `src/App.tsx`:

```text
/auth                              -- Login
/invite/:token                     -- Aceite de convite (publico)
/pe-admin                          -- Dashboard super admin
/pe-admin/organizations            -- Gestao de organizacoes
/pe-admin/organizations/:id/users  -- Usuarios de uma org
/pe-admin/users                    -- Usuarios globais
/pe-admin/audit                    -- Auditoria
/org/users                         -- Usuarios da org (ORG_ADMIN)
```

Wrappers de rota:
- `PeAdminRoute`: verifica pe_users.is_super_admin = true
- `OrgAdminRoute`: verifica pe_get_user_role_code = 'ORG_ADMIN'

---

### Fase 6: Comportamentos Automaticos

| Acao | Comportamento |
|------|---------------|
| Criar organizacao (super_admin) | Inserir organizations + pe_audit_log (ORG_CREATED) |
| Editar organizacao | Update + pe_audit_log (ORG_UPDATED) |
| Ativar/inativar org | Update status + pe_audit_log (ORG_STATUS_CHANGED) |
| Convidar usuario | Criar pe_invitations + pe_audit_log (INVITE_SENT) |
| Aceitar convite (email novo) | Criar auth user + pe_users + pe_audit_log (INVITE_ACCEPTED) |
| Aceitar convite (email existente, mesma org) | Atualizar role + pe_audit_log (INVITE_ACCEPTED) |
| Aceitar convite (email existente, outra org) | Rejeitar (usuario nao pode trocar de org) |
| Alterar papel | Update role_id + pe_audit_log (ROLE_CHANGED) |
| Ativar/inativar usuario | Update is_active + pe_audit_log (USER_STATUS_CHANGED) |

---

### Arquivos a Criar

| Arquivo | Funcao |
|---------|--------|
| Migration SQL | 5 tabelas, indices, RLS, funcoes, seed, triggers |
| `supabase/functions/invite-org-user/index.ts` | Edge function convite |
| `supabase/functions/accept-invitation/index.ts` | Edge function aceite |
| `src/hooks/usePeAuth.ts` | Auth context com pe_users |
| `src/hooks/useOrganizations.ts` | CRUD organizacoes |
| `src/hooks/useOrgUsers.ts` | CRUD usuarios da org |
| `src/hooks/usePeInvitations.ts` | Gestao de convites |
| `src/hooks/usePeAuditLog.ts` | Leitura audit log |
| `src/pages/AcceptInvitePage.tsx` | Aceite de convite |
| `src/pages/pe-admin/PeAdminLayout.tsx` | Layout super admin |
| `src/pages/pe-admin/OrganizationsPage.tsx` | Tela organizacoes |
| `src/pages/pe-admin/OrgUsersPage.tsx` | Usuarios por org (super admin) |
| `src/pages/pe-admin/GlobalUsersPage.tsx` | Usuarios globais |
| `src/pages/pe-admin/AuditLogPage.tsx` | Auditoria |
| `src/pages/org/OrgUsersPage.tsx` | Usuarios da org (admin da org) |
| `src/components/pe-admin/OrgDialog.tsx` | Dialog criar/editar org |
| `src/components/pe-admin/InviteUserDialog.tsx` | Dialog convidar usuario |

### Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `src/App.tsx` | Novas rotas /pe-admin/*, /org/*, /invite/:token |
| `supabase/config.toml` | Registrar invite-org-user e accept-invitation |

### Coexistencia

Todas as tabelas existentes (`orbit_*`, `profiles`, `user_roles`) permanecem intactas. As novas tabelas (`organizations`, `pe_roles`, `pe_users`, `pe_invitations`, `pe_audit_log`) operam em paralelo. No futuro, as tabelas `orbit_*` podem ser migradas para usar `organizations` como tenant.

