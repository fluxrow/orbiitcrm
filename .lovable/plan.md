

# Etapa 2 -- Tabelas Comerciais do Orbit Prospecting Engine

## Contexto e Bug Pendente

O erro "Database error creating new user" persiste porque existe uma segunda constraint (`chk_super_admin_role`) que exige `role_id IS NOT NULL` para usuarios nao-super-admin. O trigger `handle_new_user_pe` cria o usuario com `role_id = NULL`, violando essa regra. Esse fix sera incluido neste plano.

---

## Fase 1 -- Correcao do Bug (Constraint `chk_super_admin_role`)

Relaxar a constraint para permitir `role_id = NULL` em usuarios comuns (estado "nao-atribuido" temporario, antes do accept-invitation atribuir o role).

```sql
ALTER TABLE public.pe_users DROP CONSTRAINT IF EXISTS chk_super_admin_role;
ALTER TABLE public.pe_users ADD CONSTRAINT chk_super_admin_role
  CHECK (
    (is_super_admin = true AND role_id IS NULL)
    OR
    (is_super_admin = false)
  );
```

---

## Fase 2 -- Criacao das 5 Tabelas Comerciais (Migration SQL)

Todas as tabelas seguem o padrao PE: `organization_id NOT NULL`, FK para `organizations`, RLS com `pe_get_user_org_id` e `pe_is_super_admin`.

### Tabelas

1. **segmentos** -- macro/micro segmentos, unique(org, macro, micro)
2. **origens** -- fontes de leads, unique(org, nome)
3. **clientes** -- empresas prospectadas, com campos de normalizacao (`razao_social_normalizada`, `dominio_principal`), unique parcial por CNPJ e indice composto para dedupe por nome
4. **contatos** -- pessoas vinculadas a clientes, unique parcial por email normalizado
5. **cliente_origem** -- vinculo N:N entre cliente e origem, unique(org, cliente, origem)

### RLS (mesmo padrao para todas as 5 tabelas)

- `pe_is_super_admin(auth.uid())` -> ALL
- `pe_get_user_org_id(auth.uid()) = organization_id` -> SELECT (todos os roles)
- `pe_get_user_org_id(auth.uid()) = organization_id` AND role in (ORG_ADMIN, ORG_MANAGER) -> INSERT, UPDATE, DELETE

### Indices

Conforme especificado no pedido (organization_id, FKs, campos de busca/dedupe).

---

## Fase 3 -- Hooks React (6 arquivos)

Seguindo o padrao existente de `useOrganizations.ts`:

| Arquivo | Responsabilidade |
|---|---|
| `src/hooks/useSegmentos.ts` | CRUD segmentos, filtro por org |
| `src/hooks/useOrigens.ts` | CRUD origens, filtro por org |
| `src/hooks/useClientes.ts` | Lista com filtros (segmento, cidade/uf, status, busca), detail, create, update |
| `src/hooks/useContatos.ts` | Lista com filtros (decisor, cliente, busca), create, update |
| `src/hooks/useClienteOrigem.ts` | Vincular/desvincular cliente-origem |
| `src/hooks/useImportClientes.ts` | Logica de importacao CSV com dedupe (CNPJ -> dominio -> razao normalizada) |

---

## Fase 4 -- Telas (8 arquivos novos/editados)

### Novas paginas

| Rota | Arquivo | Descricao |
|---|---|---|
| `/pe-admin/clientes` | `src/pages/pe-admin/ClientesPage.tsx` | Lista com filtros, dialog de criacao/edicao |
| `/pe-admin/clientes/:id` | `src/pages/pe-admin/ClienteDetailPage.tsx` | Detalhes + abas Contatos e Origens |
| `/pe-admin/contatos` | `src/pages/pe-admin/ContatosPage.tsx` | Lista com filtros por decisor, cliente, busca |
| `/pe-admin/segmentos` | `src/pages/pe-admin/SegmentosPage.tsx` | CRUD simples em tabela |
| `/pe-admin/origens` | `src/pages/pe-admin/OrigensPage.tsx` | CRUD simples em tabela |
| `/pe-admin/importacao` | `src/pages/pe-admin/ImportacaoPage.tsx` | Upload CSV, mapeamento, preview, relatorio |

### Arquivos editados

- `src/pages/pe-admin/PeAdminLayout.tsx` -- adicionar itens de nav (Clientes, Contatos, Segmentos, Origens, Importacao)
- `src/App.tsx` -- registrar as 6 novas rotas sob `/pe-admin`

---

## Fase 5 -- Logica de Importacao (Dedupe)

Implementada em `useImportClientes.ts`:

1. Parse CSV (reutilizando `parseCSVLine`/`detectSeparator` do `useImportProspects.ts`)
2. Para cada linha:
   - Normalizar razao social (lowercase, sem acento, sem pontuacao)
   - Extrair dominio do email
   - Aplicar regras de dedupe: CNPJ -> dominio -> razao+cidade+uf
   - Criar ou atualizar cliente
   - Criar contato se email nao duplicado
3. Registrar em `pe_audit_log` (CLIENTE_CREATED, CONTATO_CREATED, IMPORT_BATCH_COMPLETED)
4. Retornar relatorio (criados, atualizados, duplicados evitados)

---

## Detalhes Tecnicos

### Permissoes por Role

| Acao | SUPER_ADMIN | ORG_ADMIN | ORG_MANAGER | ORG_SALES/SDR | ORG_VIEWER |
|---|---|---|---|---|---|
| Leitura | Todas orgs | Propria org | Propria org | Propria org | Propria org |
| Escrita | Sim | Sim | Sim | Nao | Nao |
| Importacao | Sim | Sim | Sim | Nao | Nao |

### Funcao auxiliar para RLS de escrita

Sera criada uma funcao SQL `pe_user_can_write(p_user_id uuid, p_org_id uuid)` que retorna true se o usuario for super_admin OU tiver role ORG_ADMIN/ORG_MANAGER na organizacao, para simplificar as policies de INSERT/UPDATE/DELETE.

### Ordem de implementacao

1. Fix constraint (fase 1)
2. Migration com tabelas + RLS + indices (fase 2)
3. Hooks (fase 3)
4. Telas + rotas (fase 4)
5. Importacao (fase 5)

