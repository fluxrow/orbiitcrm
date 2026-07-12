# RBAC — `pe_users`, `pe_roles` e o guard de colunas privilegiadas

> Última atualização: 2026-07-12
> Aplicação: `supabase/migrations/20260711113000_harden_pe_roles_and_org_admin_role_updates.sql`

Este documento descreve **como as permissões de roles do Orbit funcionam hoje** e o que deve ser respeitado ao alterar policies, triggers ou fluxos que envolvam `pe_users`, `pe_roles` e escalação de privilégios. Leia antes de mexer em qualquer código que atribua roles, promova usuários, ou exponha metadados de organização.

---

## 1. Modelo de dados relevante

| Tabela | Papel |
|---|---|
| `pe_users` | Vínculo usuário ⇄ organização. Contém `role_id`, `organization_id`, `is_super_admin`, `is_active`, além de campos operacionais (`cargo`, `phone`, etc.). |
| `pe_roles` | Catálogo global de roles (`ORG_ADMIN`, `ORG_MEMBER`, ...). Não é multi-tenant — é dicionário. |
| `pe_tenant_map` | Mapeia usuários a tenants Orbit (usado por `has_orbit_role` etc.). |

Colunas de `pe_users` classificadas como **privilegiadas** (nunca podem ser alteradas por não-super-admins):

- `role_id`
- `organization_id`
- `is_super_admin`

Todas as demais colunas (`cargo`, `phone`, `is_active`, metadados operacionais) são **não privilegiadas** e podem ser atualizadas normalmente por um `ORG_ADMIN` da própria organização.

---

## 2. Policies em `pe_roles`

`pe_roles` é catálogo, mas expõe nomes internos de roles. Por isso o `SELECT` é restringido:

```sql
-- Permitido ler pe_roles se:
pe_is_super_admin(auth.uid())
OR EXISTS (
  SELECT 1 FROM pe_users
  WHERE user_id = auth.uid() AND is_active = true
)
```

Consequências práticas:

- `anon` **não** tem `GRANT SELECT` — nunca liste roles em telas públicas.
- Um usuário com `pe_users.is_active = false` **não** consegue ler `pe_roles` (mesmo autenticado).
- Um JWT sem correspondência em `pe_users` **não** lê `pe_roles`.
- Edge functions com `service_role` continuam com acesso total.

**Não** adicione policies que abram `pe_roles` para `authenticated` sem passar por `pe_users` — isso reabre o finding de exposição do catálogo.

---

## 3. Guard `guard_pe_users_privileged_columns`

Trigger `BEFORE UPDATE` em `pe_users`. Regra em uma linha:

> Se o usuário atual **não é super admin** e **não é `service_role`**, qualquer tentativa de mudar `role_id`, `organization_id` ou `is_super_admin` levanta `42501` (`insufficient_privilege`).

Pseudo-código do que a função faz:

```text
if session_user = 'service_role' → ALLOW
if pe_is_super_admin(auth.uid())  → ALLOW
if NEW.role_id         IS DISTINCT FROM OLD.role_id         → RAISE 42501
if NEW.organization_id IS DISTINCT FROM OLD.organization_id → RAISE 42501
if NEW.is_super_admin  IS DISTINCT FROM OLD.is_super_admin  → RAISE 42501
ALLOW
```

Casos cobertos (smoke aprovado em 2026-07-12):

| Ator | Ação | Resultado |
|---|---|---|
| `ORG_ADMIN` comum | muda o próprio `role_id` | ❌ 42501 |
| `ORG_ADMIN` comum | promove outro a `ORG_ADMIN` | ❌ 42501 |
| `ORG_ADMIN` comum | seta próprio `is_super_admin=true` | ❌ 42501 |
| `ORG_ADMIN` comum | muda `organization_id` de alguém | ❌ 42501 |
| `ORG_ADMIN` comum | atualiza `cargo` / `phone` / `is_active` na própria org | ✅ |
| Super admin | qualquer mudança em colunas privilegiadas | ✅ |
| Edge function (`service_role`) | qualquer mudança | ✅ |

---

## 4. Regras para novas mudanças

Ao alterar qualquer coisa nessa área, respeite este checklist:

1. **Nunca** deixe `pe_users.role_id`, `organization_id` ou `is_super_admin` como colunas de update genérico em RPCs/edge functions expostas ao cliente. Se for necessário, restrinja por `pe_is_super_admin(auth.uid())`.
2. **Nunca** remova o guard sem substituir por outra camada equivalente (RLS + trigger). Uma policy `USING` sozinha **não** bloqueia update de coluna específica — só o trigger consegue.
3. **Não** abra `pe_roles` para `anon`. Se precisar exibir nomes de role no público, faça mapeamento estático no frontend.
4. **Toda nova coluna privilegiada** (ex.: futura `is_billing_admin`) deve ser adicionada explicitamente ao guard.
5. **Edge functions que precisam promover roles** devem rodar com `service_role`. Nunca tente contornar o guard via SQL direto do cliente.
6. **RPCs `SECURITY DEFINER`** que tocam `pe_users` devem:
   - validar `pe_is_super_admin(auth.uid())` explicitamente antes de escrever colunas privilegiadas, **ou**
   - deixar o guard atuar como última linha de defesa (preferível — defense-in-depth).
7. **Ao criar novas policies em `pe_users`**, lembre-se que RLS + trigger são camadas independentes. Um policy `WITH CHECK` permissivo não anula o guard — o guard vai barrar mesmo assim, e o erro será `42501`, não RLS.

---

## 5. Como validar após mudança

Rodar o smoke resumido (via `psql` na sandbox ou script local):

1. Usuário ativo com `pe_users` → lê `pe_roles`.
2. Usuário com `is_active=false` → **não** lê `pe_roles`.
3. `ORG_ADMIN` altera **próprio** `role_id` → `42501`.
4. `ORG_ADMIN` promove outro a `ORG_ADMIN` → `42501`.
5. `ORG_ADMIN` altera `cargo`/`phone`/`is_active` de user da própria org → OK.
6. Super admin muda `role_id`/`organization_id`/`is_super_admin` → OK.
7. `service_role` (edge function) → OK.
8. `Advisor scan` — nenhum finding referenciando `pe_roles` visível a `authenticated` genérico ou escalação via `pe_users.role_id`.

Se qualquer um dos itens 1–7 mudar de comportamento, **é regressão** — não faça deploy.

---

## 6. Referências

- Migration: `supabase/migrations/20260711113000_harden_pe_roles_and_org_admin_role_updates.sql`
- Memória: `mem://architecture/multi-tenancy`, `mem://features/security`
- Helper SQL: `pe_is_super_admin(uuid)` — canonical check de super admin.
