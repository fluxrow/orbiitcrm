

# Auditoria Funcional Completa — Modulo PE Admin

---

## 1. Rotas protegidas por is_super_admin

**Veredicto: OK**

Todas as rotas `/pe-admin/*` estao aninhadas sob `<PeAdminLayout>` (App.tsx L162-182). O layout verifica `usePeAuth()` e redireciona para `/auth` se nao autenticado e para `/orbit` se `!isSuperAdmin` (PeAdminLayout.tsx L40-41). A flag `is_super_admin` vem de `pe_users.is_super_admin` via `usePeAuth`. Nao ha rota PE Admin fora desse wrapper.

As rotas legacy `/super-admin/*` tambem sao protegidas por `SuperAdminRoute` que usa `useIsSuperAdmin()` via `user_roles`.

---

## 2. Policies RLS em tabelas com organization_id

**Veredicto: OK**

Todas as tabelas PE com `organization_id` possuem RLS habilitado com o padrao consistente:
- `pe_is_super_admin(auth.uid())` → ALL
- `pe_get_user_org_id(auth.uid()) = organization_id` → SELECT
- `pe_user_can_write(auth.uid(), organization_id)` → INSERT/UPDATE/DELETE

Tabelas verificadas: `clientes`, `contatos`, `funil_etapas`, `oportunidades`, `oportunidade_itens`, `tarefas`, `interacoes`, `produtos`, `segmentos`, `origens`, `cliente_origem`, `pe_users`, `pe_invitations`, `organizations`.

---

## 3. Isolamento de dados entre organizacoes

**Veredicto: OK**

O isolamento e garantido em duas camadas:
- **RLS (banco)**: Funcoes `pe_get_user_org_id` e `pe_is_super_admin` sao `SECURITY DEFINER` e consultam diretamente `pe_users`. Usuarios comuns so veem registros da propria `organization_id`.
- **Hooks (aplicacao)**: Todos os hooks de listagem (`useClientes`, `useContatos`, `useOportunidades`, etc.) aplicam `if (!isSuperAdmin && orgId) query = query.eq("organization_id", orgId)`. Mesmo que o filtro client-side falhasse, o RLS impede acesso cruzado.

---

## 4. Hooks conectados as tabelas correspondentes

**Veredicto: OK**

| Hook | Tabela | Status |
|---|---|---|
| `usePeAuth` | `pe_users` + `pe_roles` | OK |
| `useOrganizations` | `organizations` | OK |
| `useOrgUsers` | `pe_users` + `pe_roles` | OK |
| `useClientes` | `clientes` + `segmentos` | OK |
| `useContatos` | `contatos` + `clientes` | OK |
| `useSegmentos` | `segmentos` | OK |
| `useOrigens` | `origens` | OK |
| `useProdutos` | `produtos` | OK |
| `useFunilEtapas` | `funil_etapas` | OK |
| `useOportunidades` | `oportunidades` + JOINs | OK |
| `useOportunidadeItens` | `oportunidade_itens` + `produtos` | OK |
| `useTarefas` | `tarefas` + JOINs | OK |
| `useInteracoes` | `interacoes` + JOINs | OK |
| `useClienteOrigem` | `cliente_origem` + `origens` | OK |
| `useImportClientes` | `clientes` + `contatos` + `cliente_origem` | OK |
| `usePeAuditLog` | `pe_audit_log` + JOINs | OK |
| `useTenantMap` | `pe_tenant_map` (via RPCs) | OK |
| `usePeRoles` | `pe_roles` | OK |
| `useInviteUser` | Edge Function `invite-org-user` | OK |

---

## 5. Validacao de permissoes baseada em pe_roles.permissions

**Veredicto: Nao Implementado**

A tabela `pe_roles` possui apenas as colunas `id`, `code`, `name`, `created_at`. **Nao existe coluna `permissions`** (JSONB ou similar). O controle de acesso e baseado exclusivamente no `code` do role (ORG_ADMIN, ORG_MANAGER, ORG_SALES, ORG_SDR, ORG_VIEWER) hardcoded nas funcoes SQL (`pe_user_can_write` verifica `code IN ('ORG_ADMIN','ORG_MANAGER')`).

Nao ha sistema granular de permissoes por feature/acao. Qualquer mudanca nos privilegios de um role exige alteracao nas funcoes SQL do banco.

---

## 6. Audit log com before/after JSON

**Veredicto: Parcial**

A tabela `pe_audit_log` registra: `action`, `entity_type`, `entity_id`, `metadata` (JSONB), `actor_user_id`, `organization_id`, `created_at`.

**O que funciona:**
- CREATE: Registrado em todos os hooks (CLIENTE_CREATED, OPORTUNIDADE_CREATED, TAREFA_CREATED, INTERACAO_CREATED, ITEM_CREATED, SEGMENTO_CREATED, ORIGEM_CREATED, PRODUTO_CREATED, FUNIL_ETAPA_CREATED, ORG_CREATED, etc.)
- Acoes especificas: OPORTUNIDADE_MOVED, TAREFA_DONE, TENANT_MAP_UPSERT, PROSPECT_PROMOTED, IMPORT_BATCH_COMPLETED, ROLE_CHANGED, USER_STATUS_CHANGED

**O que falta:**
- **UPDATE generico**: `useUpdateCliente`, `useUpdateOportunidade`, `useUpdateProduto`, `useUpdateSegmento`, `useUpdateOrigem`, `useUpdateFunilEtapa`, `useUpdateTarefa` — nenhum desses registra audit log. Apenas o `useUpdateOrganization` e `useUpdateOrgUser` registram.
- **DELETE**: `useDeleteProduto`, `useDeleteSegmento`, `useDeleteOrigem`, `useDeleteFunilEtapa`, `useDeleteOportunidadeItem` — nenhum registra audit log.
- **before/after JSON**: Nenhuma operacao captura o estado anterior (`before`) do registro. O `metadata` so contem dados parciais do `after` em alguns casos.

---

## 7. Auto-provisionamento do tenant map

**Veredicto: OK**

A RPC `pe_provision_tenant` implementa corretamente:
1. Verifica se ja existe mapeamento (idempotente)
2. Cria `organizations` → insere `pe_tenant_map` → seed de 7 produtos + 6 etapas de funil
3. Registra audit log `TENANT_PROVISIONED`
4. Usa `ON CONFLICT DO NOTHING` nos seeds

O hook `useProvisionTenant` no frontend chama essa RPC corretamente. A criacao de empresa via `create-empresa` Edge Function tambem chama essa RPC automaticamente.

---

## 8. Exclusoes fisicas ou logicas

**Veredicto: Risco Arquitetural**

| Entidade | Tipo de exclusao | Soft-delete disponivel? |
|---|---|---|
| `produtos` | **FISICA** (`DELETE`) | Tem `is_active` mas `useDeleteProduto` faz DELETE real |
| `segmentos` | **FISICA** | Tem `is_active` mas `useDeleteSegmento` faz DELETE real |
| `origens` | **FISICA** | Tem `is_active` mas `useDeleteOrigem` faz DELETE real |
| `funil_etapas` | **FISICA** | Tem `is_active` mas `useDeleteFunilEtapa` faz DELETE real |
| `oportunidade_itens` | **FISICA** | Sem campo de soft-delete |
| `cliente_origem` | **FISICA** | Sem campo de soft-delete |
| `pe_tenant_map` | **FISICA** (via RPC) | Sem campo de soft-delete |
| `clientes` | Sem delete implementado | N/A |
| `oportunidades` | Sem delete implementado | N/A |
| `tarefas` | Sem delete implementado | N/A |

**Risco**: Tabelas como `produtos` e `funil_etapas` possuem campo `is_active` mas os hooks executam `DELETE` fisico. Se um produto excluido estiver referenciado em `oportunidade_itens`, a FK pode falhar ou causar orfaos. O mesmo ocorre com `funil_etapas` referenciado em `oportunidades.etapa_id`.

---

## 9. Inconsistencia historica ao alterar funil_etapas ou produtos

**Veredicto: Risco Arquitetural**

**funil_etapas:**
- Alterar o `tipo` de uma etapa (ex: de `open` para `won`) nao retroage nas oportunidades ja vinculadas. O trigger `auto_oportunidade_status` so dispara em INSERT/UPDATE de `oportunidades`, nao de `funil_etapas`.
- Deletar uma etapa com oportunidades vinculadas causara erro de FK ou orfaos dependendo das constraints.
- Renomear/reordenar etapas altera a visao do Kanban sem registro historico.

**produtos:**
- Deletar um produto referenciado em `oportunidade_itens` causara erro de FK.
- Alterar `nome` ou `categoria` de um produto altera retroativamente a visualizacao de itens historicos.

**Mitigacao ausente**: Nao ha snapshot do estado do produto/etapa no momento da criacao do item/oportunidade. Os JOINs sempre trazem o estado atual.

---

## 10. Indices para queries multi-tenant

**Veredicto: OK**

Indices verificados e presentes:

| Tabela | Indice `organization_id` | Indices compostos |
|---|---|---|
| `clientes` | `idx_clientes_org` | `idx_clientes_dedupe (org+nome+cidade+uf)`, `idx_clientes_org_cnpj (org+cnpj UNIQUE)` |
| `contatos` | `idx_contatos_org` | `idx_contatos_org_email (org+email UNIQUE)`, `idx_contatos_cliente` |
| `oportunidades` | `idx_oportunidades_org` | `idx_oportunidades_etapa`, `idx_oportunidades_cliente`, `idx_oportunidades_owner`, `idx_oportunidades_status` |
| `oportunidade_itens` | `idx_oportunidade_itens_org` | `idx_oportunidade_itens_oport`, `idx_oportunidade_itens_produto` |
| `tarefas` | `idx_tarefas_org` | `idx_tarefas_assigned`, `idx_tarefas_cliente`, `idx_tarefas_oport` |
| `interacoes` | `idx_interacoes_org` | `idx_interacoes_cliente`, `idx_interacoes_oport`, `idx_interacoes_data` |
| `funil_etapas` | `idx_funil_etapas_org` | UNIQUE `(org+nome)`, UNIQUE `(org+ordem)` |
| `pe_audit_log` | `idx_pe_audit_log_org` | `idx_pe_audit_log_created_at` |

Cobertura de indices adequada para queries multi-tenant.

---

## Resumo Executivo

| # | Item | Status |
|---|---|---|
| 1 | Rotas protegidas por is_super_admin | **OK** |
| 2 | RLS em tabelas com organization_id | **OK** |
| 3 | Isolamento de dados entre organizacoes | **OK** |
| 4 | Hooks conectados as tabelas | **OK** |
| 5 | Permissoes granulares via pe_roles.permissions | **Nao Implementado** |
| 6 | Audit log com before/after JSON | **Parcial** — falta UPDATE/DELETE na maioria dos hooks e nao ha captura de estado anterior |
| 7 | Auto-provisionamento tenant map | **OK** |
| 8 | Exclusoes fisicas vs logicas | **Risco Arquitetural** — DELETE fisico em entidades com `is_active` e FKs |
| 9 | Inconsistencia historica funil/produtos | **Risco Arquitetural** — sem snapshot historico, alteracoes retroagem |
| 10 | Indices multi-tenant | **OK** |

### Acoes recomendadas por prioridade

1. **(Critico)** Converter DELETEs fisicos para soft-delete (`is_active = false`) em `produtos`, `segmentos`, `origens`, `funil_etapas` — os campos ja existem
2. **(Alto)** Adicionar audit log em todas as operacoes de UPDATE e DELETE nos hooks que ainda nao registram
3. **(Alto)** Capturar `before` state nos audit logs de UPDATE (fetch antes do update e gravar no metadata)
4. **(Medio)** Adicionar coluna `permissions` JSONB na tabela `pe_roles` e refatorar funcoes RLS para consultar permissoes granulares
5. **(Medio)** Criar snapshot de `produto_nome` e `etapa_nome` nas tabelas `oportunidade_itens` e `oportunidades` para preservar historico

