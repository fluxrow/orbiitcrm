

# Separação de Responsabilidades: Orbit (CRM) vs PE Admin (Admin SaaS)

## Contexto

O PE Admin atualmente mistura módulos de CRM (clientes, contatos, segmentos, origens, produtos, funil, oportunidades, tarefas, importação) com módulos administrativos SaaS. A regra de produto exige que o PE Admin seja exclusivamente um painel de gestão SaaS.

## FASE 1 — Remover módulos CRM do PE Admin

### 1.1 Limpar sidebar (`PeAdminLayout.tsx`)

Remover do array `navItems`:
- `/pe-admin/clientes` (Assinantes)
- `/pe-admin/contatos`
- `/pe-admin/segmentos`
- `/pe-admin/origens`
- `/pe-admin/produtos`
- `/pe-admin/funil`
- `/pe-admin/oportunidades`
- `/pe-admin/tarefas`
- `/pe-admin/importacao`

**Manter:**
- Organizações
- Usuários Globais
- Cadastros (trials + SaaS)
- Tenant Map
- Auditoria
- Documentação

### 1.2 Remover rotas CRM do `App.tsx`

Substituir as 11 rotas CRM dentro de `<Route path="/pe-admin">` por uma rota catch-all que redireciona para `/pe-admin/cadastros`:

```text
Rotas removidas:
  /pe-admin/clientes
  /pe-admin/clientes/:id
  /pe-admin/contatos
  /pe-admin/segmentos
  /pe-admin/origens
  /pe-admin/importacao
  /pe-admin/produtos
  /pe-admin/funil
  /pe-admin/oportunidades
  /pe-admin/oportunidades/kanban
  /pe-admin/oportunidades/:id
  /pe-admin/tarefas

Rotas mantidas:
  /pe-admin → redirect /pe-admin/cadastros (novo index)
  /pe-admin/organizations
  /pe-admin/organizations/:id/users
  /pe-admin/users
  /pe-admin/cadastros
  /pe-admin/tenants
  /pe-admin/audit
  /pe-admin/documentacao
  /pe-admin/* → redirect /pe-admin/cadastros (catch-all)
```

### 1.3 Remover imports não utilizados do `App.tsx`

Remover imports das páginas CRM: `ClientesPage`, `ClienteDetailPage`, `ContatosPage`, `SegmentosPage`, `OrigensPage`, `ImportacaoPage`, `ProdutosPage`, `FunilEtapasPage`, `OportunidadesPage`, `OportunidadesKanbanPage`, `OportunidadeDetailPage`, `TarefasPage`.

Os arquivos fonte dessas páginas **não serão deletados** (podem ser reutilizados futuramente no Orbit ou em outro contexto), apenas desconectados das rotas.

## FASE 2 — Ajustar PE Admin como "Admin do SaaS"

### 2.1 Empresas (já existe parcialmente em `CadastrosPage`)

A página `/pe-admin/cadastros` já cobre:
- Lista de empresas SaaS com status, plano, datas
- Gerenciamento via `SaasManageDialog` (trocar plano, status, trial)
- Aprovação de trials

Nenhuma alteração de código necessária nesta fase, a funcionalidade já está implementada.

### 2.2 Planos/Pacotes

A gestão de planos (`saas_plans`) não tem CRUD dedicado no PE Admin. Será necessário **criar uma nova página** `/pe-admin/planos`:
- Listar planos (code, name, features, limits)
- Criar/editar plano
- Usar hook `useSaasPlans` existente (precisa adicionar mutations de create/update)

| Arquivo | Alteração |
|---|---|
| `src/pages/pe-admin/PlanosPage.tsx` | **Novo** — CRUD de `saas_plans` |
| `src/hooks/useSaasPlans.ts` | Adicionar mutations `useCreateSaasPlan` e `useUpdateSaasPlan` |
| `src/pages/pe-admin/PeAdminLayout.tsx` | Adicionar item de menu "Planos" |
| `src/App.tsx` | Adicionar rota `/pe-admin/planos` |

### 2.3 Acessos (usuários por empresa)

A página de Usuários Globais (`/pe-admin/users`) já lista todos os `pe_users`. Para ver usuários por empresa, já existe `/pe-admin/organizations/:id/users`. A funcionalidade de bloquear/desbloquear pode ser adicionada como toggle de `is_active` na lista existente.

| Arquivo | Alteração |
|---|---|
| `src/pages/pe-admin/GlobalUsersPage.tsx` | Adicionar coluna "Ativo" com toggle para `is_active` |

### 2.4 Auditoria Admin

A página `/pe-admin/audit` já existe com `pe_audit_log`. Nenhuma alteração necessária.

## FASE 3 — Confirmar que Orbit mantém CRM

### 3.1 Rotas Orbit (sem alteração)

Todas as rotas CRM permanecem em `/demo/*` (e `/:slug/*`):
- prospects, conversas, funil, campanhas, templates, lead-finder, analytics, config, meu-plano, usuarios

### 3.2 "Promover para Funil (PE)"

O botão de promoção em `ProspectDialog.tsx` será **removido**, pois referencia o módulo PE (CRM) que está sendo desconectado do PE Admin. A promoção de prospects deve futuramente ser um fluxo interno do Orbit (criar deal no funil do Orbit).

| Arquivo | Alteração |
|---|---|
| `src/components/orbit/ProspectDialog.tsx` | Remover seção "Promover para Funil (PE)" e estados associados |

## Detalhes Técnicos

### Tabelas utilizadas por módulo PE Admin (pós-refactor)

| Módulo | Tabela(s) |
|---|---|
| Cadastros (trials) | `trial_requests` |
| Cadastros (SaaS) | `saas_empresa`, `saas_plans`, `orbit_empresas` |
| Organizações | `organizations` |
| Usuários Globais | `pe_users`, `pe_roles` |
| Planos (novo) | `saas_plans` |
| Tenant Map | `pe_tenant_map` |
| Auditoria | `pe_audit_log` |

### Novo menu `/pe-admin`

```text
┌─────────────────────┐
│  PE Admin            │
│  Super Admin         │
├─────────────────────┤
│  Cadastros           │  ← novo index
│  Organizações        │
│  Usuários Globais    │
│  Planos              │  ← novo
│  Tenant Map          │
│  Auditoria           │
│  Documentação        │
├─────────────────────┤
│  Sair                │
└─────────────────────┘
```

### Checklist

| Item | Status |
|---|---|
| Remover 9 módulos CRM do menu PE Admin | A fazer |
| Remover 12 rotas CRM de App.tsx | A fazer |
| Redirect catch-all para /pe-admin/cadastros | A fazer |
| Criar página Planos (CRUD saas_plans) | A fazer |
| Adicionar toggle ativo/inativo em Usuários Globais | A fazer |
| Remover "Promover para Funil (PE)" do ProspectDialog | A fazer |
| Build sem quebras | A verificar |

### Arquivos alterados

| Arquivo | Tipo |
|---|---|
| `src/App.tsx` | Edição (remover rotas + imports CRM, adicionar rota planos + catch-all) |
| `src/pages/pe-admin/PeAdminLayout.tsx` | Edição (limpar navItems, adicionar Planos) |
| `src/pages/pe-admin/PlanosPage.tsx` | **Novo** |
| `src/hooks/useSaasPlans.ts` | Edição (adicionar mutations create/update) |
| `src/pages/pe-admin/GlobalUsersPage.tsx` | Edição (toggle is_active) |
| `src/components/orbit/ProspectDialog.tsx` | Edição (remover seção promoção PE) |

