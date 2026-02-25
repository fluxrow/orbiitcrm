

# Plano: Exibir Status de Cadastros e Pré-Cadastros no PE Admin

## Contexto

O PE Admin atualmente **nao tem visibilidade** sobre:
- **Trial Requests** (pré-cadastros via `/trial`) - tabela `trial_requests` com status `pending`/`approved`
- **SaaS Empresas** (cadastros provisionados) - tabela `saas_empresa` com status `invited`/`onboarding`/`trial`/`active`/`suspended`/`canceled`

Dados atuais no banco:
- 3 registros em `trial_requests` (2 pending, 1 approved)
- 1 registro em `saas_empresa` (Promotrip Corporate, status: invited, plano Plus)

## O que sera implementado

### 1. Nova pagina: `/pe-admin/cadastros`

Uma pagina com **duas abas**:

**Aba "Pré-Cadastros" (Trial Requests)**
- Tabela listando todos os registros de `trial_requests`
- Colunas: Nome, Empresa, Email, Telefone, Plano, Status, Data
- Badge colorido por status: `pending` (amarelo), `approved` (verde), `rejected` (vermelho)
- Busca por nome/email/empresa

**Aba "Cadastros SaaS" (Empresas Provisionadas)**
- Tabela com join `saas_empresa` + `orbit_empresas` + `saas_plans`
- Colunas: Empresa, Responsavel, Email, Plano, Status SaaS, Trial Expira, Ativada em
- Badge colorido por status: `invited` (azul), `onboarding` (azul), `trial` (amarelo), `active` (verde), `suspended`/`canceled` (vermelho)

### 2. Novo hook: `useTrialRequests`

Query simples na tabela `trial_requests` ordenada por `created_at DESC`. Reutiliza o hook `useSaasEmpresas` existente para a aba de cadastros.

### 3. Atualizar sidebar do PE Admin

Adicionar novo item de navegacao "Cadastros" com icone `ClipboardList` apontando para `/pe-admin/cadastros`.

### 4. Rota no App.tsx

Adicionar `<Route path="cadastros" element={<CadastrosPage />} />` dentro do bloco PE Admin.

---

## Arquivos afetados

| Arquivo | Acao |
|---|---|
| `src/pages/pe-admin/CadastrosPage.tsx` | **Novo** - pagina com tabs |
| `src/hooks/useTrialRequests.ts` | **Novo** - hook para trial_requests |
| `src/pages/pe-admin/PeAdminLayout.tsx` | Editar - adicionar nav item |
| `src/App.tsx` | Editar - adicionar rota |

## Detalhes tecnicos

- Nenhuma alteracao de banco necessaria (RLS de `trial_requests` ja permite SELECT para super_admin)
- `saas_empresa` tambem ja tem RLS para super_admin
- Reutiliza `useSaasEmpresas` do hook existente `useSaasPlans.ts`
- Usa componentes UI existentes: Tabs, Table, Card, Badge, Input

