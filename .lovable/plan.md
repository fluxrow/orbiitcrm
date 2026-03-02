

# Migrar permissões Orbit para usar papéis PE nativos

## Situação atual

As políticas RLS das tabelas Orbit usam dois mecanismos diferentes:

| Tabela | Escrita | Verificação de papel |
|--------|---------|---------------------|
| `orbit_message_templates` | `has_role('admin') OR has_role('vendedor')` | Via `user_roles` (legado) |
| `orbit_campaigns` | Qualquer usuário da empresa | Sem verificação de papel |
| `orbit_prospects` | Qualquer usuário da empresa | Sem verificação de papel |

O `has_role()` consulta a tabela `user_roles`, que depende do trigger de sincronização com `pe_users`. A proposta é eliminar essa dependência e usar diretamente os papéis do PE.

## Plano

### 1. Criar funções helper PE para contexto Orbit
Duas novas funções `SECURITY DEFINER` que consultam diretamente `pe_users` + `pe_roles`:

- **`pe_user_is_orbit_admin(user_id)`** -- retorna `true` se o usuário tem role `ORG_ADMIN` ou `ORG_MANAGER` no PE
- **`pe_user_is_orbit_member(user_id)`** -- retorna `true` se o usuário tem qualquer role PE (ADMIN, MANAGER, SALES, SDR) - exclui VIEWER

### 2. Atualizar políticas RLS

**`orbit_message_templates`:**
- DROP a policy "Admins can manage own empresa templates"
- CREATE nova policy usando `pe_user_is_orbit_admin(auth.uid()) OR pe_user_is_orbit_member(auth.uid())` + `empresa_id = get_user_empresa_id(auth.uid())`

**`orbit_campaigns`:**
- DROP "Users can manage own empresa campaigns"
- CREATE nova policy restrita a admins: `pe_user_is_orbit_admin(auth.uid()) AND empresa_id = get_user_empresa_id(auth.uid())`
- CREATE policy para vendedores com acesso de leitura + inserção (SDR/SALES)

**`orbit_prospects`:**
- DROP as 3 policies de INSERT/UPDATE/DELETE
- CREATE novas policies usando `pe_user_is_orbit_member(auth.uid())` + `empresa_id = get_user_empresa_id(auth.uid())`

As policies de SELECT e super_admin permanecem inalteradas.

### 3. Sem alterações no frontend
O código frontend não verifica papéis diretamente para essas operações - as permissões são aplicadas pelo banco via RLS.

### Detalhes técnicos

As novas funções consultam `pe_users JOIN pe_roles` diretamente, eliminando a dependência da tabela `user_roles` e do trigger de sincronização para estas tabelas. A função `pe_is_super_admin()` já existente continua sendo usada para as policies de super admin.

