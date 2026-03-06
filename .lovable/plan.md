

# Gestão de Usuários e Vendedores no Orbit

## Resumo

Adicionar campos comerciais (WhatsApp, cargo) ao `pe_users`, criar UI de edição de usuários com múltiplos papéis, seletor de responsável comercial em prospects, e exibir vendedor no funil.

## Banco de Dados

### 1. Adicionar colunas ao `pe_users`

```sql
ALTER TABLE pe_users
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS cargo text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS email_signature text;
```

Estas colunas armazenam dados comerciais do vendedor. O campo `phone` já existe.

### 2. Sem mudança no modelo de papéis

O sistema PE já usa `pe_roles` com papéis como ORG_ADMIN, ORG_SALES, etc. A tabela `pe_users` tem um `role_id` que referencia um único papel. Para permitir múltiplos papéis (ex: admin + vendedor), será necessário criar uma tabela ponte `pe_user_roles` **OU** tratar isso no frontend — um ORG_ADMIN já tem todas as permissões de vendedor via RLS helpers existentes.

**Decisão pragmática**: Não criar tabela de múltiplos papéis. Em vez disso, ajustar a lógica para que ORG_ADMIN e ORG_MANAGER sejam automaticamente elegíveis como "vendedores" ao listar responsáveis. Isso já reflete o comportamento desejado sem mudança de schema.

## Frontend

### 1. `src/components/orbit/ConfigUsersTab.tsx` — Reescrever

Adicionar diálogo de **edição** de usuário com campos:
- Nome, Email, Telefone, WhatsApp, Cargo, Papel (dropdown de pe_roles), Ativo/Inativo

Atualmente só tem ações no dropdown (alterar papel, ativar/inativar). Adicionar botão "Editar" que abre diálogo completo.

### 2. `src/hooks/useOrgUsers.ts` — Atualizar mutation

O `useUpdateOrgUser` já aceita `full_name` e `phone`. Expandir para aceitar `whatsapp`, `cargo`.

### 3. Hook `useEmpresaVendedores` — Novo

Criar hook para listar usuários da empresa elegíveis como vendedores (papéis ORG_ADMIN, ORG_MANAGER, ORG_SALES, ORG_SDR):
```typescript
// Busca pe_users com roles que podem ser responsáveis
```

### 4. `src/components/orbit/ProspectDialog.tsx` — Adicionar seletor de responsável

Adicionar campo "Responsável Comercial" com dropdown dos vendedores da empresa. Salvar no `responsavel_id` do prospect (que já existe na tabela).

### 5. `src/components/orbit/DealCard.tsx` — Já mostra responsável

O card já exibe `responsavel.nome`. Garantir que avatar/iniciais apareçam.

### 6. Perfil do usuário — Novo componente

Criar `src/components/orbit/UserProfileDialog.tsx` onde o próprio usuário edita: nome, telefone, WhatsApp, cargo, avatar_url, email_signature.

### 7. `src/pages/orbit/ProspectsPage.tsx` — Filtro por responsável

Já existe `responsavel_id` nos filtros do hook. Adicionar dropdown de filtro na UI.

## Arquivos alterados

| Arquivo | Ação |
|---|---|
| `pe_users` (schema) | Adicionar whatsapp, cargo, avatar_url, email_signature |
| `src/hooks/useOrgUsers.ts` | Expandir update com novos campos |
| `src/hooks/useEmpresaVendedores.ts` | Novo hook para listar vendedores |
| `src/components/orbit/ConfigUsersTab.tsx` | Adicionar diálogo de edição completo |
| `src/components/orbit/ProspectDialog.tsx` | Adicionar seletor de responsável |
| `src/components/orbit/UserProfileDialog.tsx` | Novo: edição do próprio perfil |
| `src/components/orbit/DealCard.tsx` | Adicionar iniciais/avatar do responsável |
| `src/pages/orbit/ProspectsPage.tsx` | Filtro por responsável |

