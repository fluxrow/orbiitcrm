

## Reestruturacao de Gestao de Usuarios e Super Admin

### Resumo

Implementar funcionalidade completa para que admins de empresa adicionem usuarios a sua empresa e para que o Super Admin gerencie usuarios de todas as empresas, incluindo contagens reais no dashboard.

---

### Fase 1: Edge Function `add-empresa-user`

Nova funcao backend que cria usuarios e os vincula a uma empresa.

**Fluxo:**

```text
1. Receber: empresa_id, nome, email, senha, cargo, role
2. Validar JWT do requisitante
3. Verificar permissao:
   - super_admin pode adicionar a qualquer empresa
   - admin so pode adicionar a sua propria empresa (profiles.empresa_id == empresa_id)
4. Verificar se empresa existe e esta ativa
5. Contar usuarios atuais vs max_usuarios da empresa
6. Criar usuario via admin.createUser() com email_confirm: true
7. Atualizar profile: empresa_id, nome, cargo
8. Inserir user_roles com o papel escolhido (admin/vendedor/visualizador)
9. Retornar dados do usuario criado
```

**Arquivo:** `supabase/functions/add-empresa-user/index.ts`

**Config:** Adicionar em `supabase/config.toml`:
```text
[functions.add-empresa-user]
verify_jwt = false
```

---

### Fase 2: Hooks de Dados

**Modificar `src/hooks/useSuperAdmin.ts`:**
- Adicionar `useAddEmpresaUser(empresaId)` -- chama edge function add-empresa-user
- Adicionar `useEmpresaUsersCount()` -- retorna total de usuarios do sistema
- Melhorar `useEmpresaUsers(empresaId)` -- ja existe, adicionar roles no select
- Adicionar `useToggleUserAtivo()` -- ativa/desativa usuario (profiles.ativo)
- Adicionar `useChangeUserRole()` -- altera role em user_roles

---

### Fase 3: Componentes e Paginas

**3.1 Dialog reutilizavel: `src/components/super-admin/AddUserDialog.tsx`**
- Campos: nome, email, senha, cargo, papel (select: admin/vendedor/visualizador)
- Validacao com zod
- Chama useAddEmpresaUser
- Mostra feedback de sucesso/erro

**3.2 Pagina Super Admin - Usuarios por Empresa: `src/pages/super-admin/EmpresaUsersPage.tsx`**
- Rota: `/super-admin/empresas/:id/usuarios`
- Header com nome da empresa + botao voltar
- Tabela: nome, email, cargo, papel, status, data criacao
- Botao "Adicionar Usuario" abre AddUserDialog
- Dropdown por usuario: alterar papel, ativar/inativar

**3.3 Pagina Orbit - Usuarios da Empresa: `src/pages/orbit/UsuariosEmpresaPage.tsx`**
- Rota: `/orbit/usuarios`
- Mesma estrutura que EmpresaUsersPage porem filtrada pela empresa_id do usuario logado
- Visivel apenas para admin (role admin ou super_admin)
- Tabela + Adicionar + Alterar papel + Ativar/Inativar

---

### Fase 4: Modificacoes em Arquivos Existentes

**4.1 `src/App.tsx`** -- Adicionar rotas:
- `/super-admin/empresas/:id/usuarios` com SuperAdminRoute
- `/orbit/usuarios` com ProtectedRoute

**4.2 `src/pages/super-admin/EmpresasPage.tsx`:**
- Botao "Ver Usuarios" no dropdown agora navega para `/super-admin/empresas/{id}/usuarios`
- Coluna "Usuarios" mostra contagem real (count de profiles com empresa_id) em vez de "0/5"

**4.3 `src/pages/super-admin/SuperAdminDashboard.tsx`:**
- Card "Usuarios Total" mostra contagem real via query em profiles
- Adicionar cards: "Usuarios Ativos" e "Usuarios Inativos"

**4.4 `src/components/orbit/OrbitSidebar.tsx`:**
- Adicionar link "Usuarios" (icone Users) entre "Analytics" e "Configuracoes"
- Visivel apenas quando usuario tem role admin ou super_admin (usar useIsAdmin hook)

**4.5 `src/pages/super-admin/SuperAdminLayout.tsx`:**
- Manter nav item existente; a rota de usuarios por empresa sera acessada via EmpresasPage

---

### Fase 5: Permissoes

| Funcionalidade | super_admin | admin | vendedor | visualizador |
|---|---|---|---|---|
| Ver todas empresas | Sim | Nao | Nao | Nao |
| Adicionar usuario a qualquer empresa | Sim | Nao | Nao | Nao |
| Adicionar usuario a propria empresa | Sim | Sim | Nao | Nao |
| Ver usuarios da propria empresa | Sim | Sim | Sim | Sim |
| Alterar papel de usuario | Sim | Sim | Nao | Nao |
| Ativar/inativar usuario | Sim | Sim | Nao | Nao |

---

### Arquivos Totais

| Arquivo | Acao |
|---|---|
| `supabase/functions/add-empresa-user/index.ts` | Criar |
| `src/components/super-admin/AddUserDialog.tsx` | Criar |
| `src/pages/super-admin/EmpresaUsersPage.tsx` | Criar |
| `src/pages/orbit/UsuariosEmpresaPage.tsx` | Criar |
| `src/hooks/useSuperAdmin.ts` | Modificar (novos hooks) |
| `src/App.tsx` | Modificar (novas rotas) |
| `src/pages/super-admin/EmpresasPage.tsx` | Modificar (link usuarios funcional + contagem) |
| `src/pages/super-admin/SuperAdminDashboard.tsx` | Modificar (contagens reais) |
| `src/components/orbit/OrbitSidebar.tsx` | Modificar (link usuarios) |
| `supabase/config.toml` | Modificar (nova function) |

