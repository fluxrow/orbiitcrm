

# Plano: Ajuste de Navegacao e Nomenclatura PE vs Orbit

---

## Analise da Situacao Atual

O OrbitSidebar (`/demo/*` e `/:slug/*`) **ja nao exibe** modulos do PE (Segmentos, Origens, Produtos, Funil de Etapas, Oportunidades, Tarefas, Importacao). Esses modulos existem exclusivamente em `/pe-admin/*`, protegido por `is_super_admin` no `PeAdminLayout`. O item 1 da solicitacao ja esta atendido.

RLS permanece inalterado -- todas as tabelas PE usam `pe_get_user_org_id()` e `pe_is_super_admin()`, o que garante isolamento independente das mudancas de UI.

---

## Mudancas Planejadas

### 1. Renomear labels no PE Admin sidebar

**Arquivo:** `src/pages/pe-admin/PeAdminLayout.tsx`

| Label atual | Novo label |
|---|---|
| Clientes | Assinantes |
| Oportunidades | Assinaturas |
| Funil | Funil de Assinaturas |

Apenas labels visuais. Rotas (`/pe-admin/clientes`, `/pe-admin/oportunidades`, `/pe-admin/funil`) permanecem iguais para nao quebrar bookmarks ou links internos.

### 2. Renomear titulos nas paginas PE correspondentes

**Arquivos:**
- `src/pages/pe-admin/ClientesPage.tsx` -- titulo "Clientes" -> "Assinantes"
- `src/pages/pe-admin/OportunidadesPage.tsx` -- titulo "Oportunidades" -> "Assinaturas"
- `src/pages/pe-admin/OportunidadesKanbanPage.tsx` -- titulo atualizado
- `src/pages/pe-admin/FunilEtapasPage.tsx` -- titulo "Funil" -> "Funil de Assinaturas"

### 3. Criar pagina "Meu Plano" no Orbit CRM (somente leitura)

**Novo arquivo:** `src/pages/orbit/MeuPlanoPage.tsx`

Pagina simples que usa `useTenant()` para obter `empresaId`, `planCode`, `saasStatus`, `trialEndsAt` e exibe:
- Nome do plano ativo (via `useSaasEmpresa`)
- Status (ativo/trial/expirado)
- Data de expiracao do trial (se aplicavel)
- Badge visual com cor por status

Sem formularios, sem edicao. Somente leitura.

### 4. Adicionar rota e link no sidebar

**Arquivo:** `src/App.tsx` -- adicionar rota `meu-plano` dentro de `OrbitRoutes`

**Arquivo:** `src/components/orbit/OrbitSidebar.tsx` -- adicionar item "Meu Plano" com icone `CreditCard` antes de "Configuracoes"

### 5. Verificacao de isolamento

- Nenhuma rota PE esta exposta em `OrbitRoutes` -- confirmado
- `PeAdminLayout` redireciona nao-superadmins para `/orbit` -- confirmado
- RLS nao e afetado por mudancas de label -- confirmado
- `saas_empresa` e `saas_plans` possuem RLS que permite SELECT para usuarios da propria empresa -- confirmado

---

## Arquivos Modificados

| Arquivo | Tipo de mudanca |
|---|---|
| `src/pages/pe-admin/PeAdminLayout.tsx` | Renomear 3 labels no nav |
| `src/pages/pe-admin/ClientesPage.tsx` | Renomear titulo da pagina |
| `src/pages/pe-admin/OportunidadesPage.tsx` | Renomear titulo |
| `src/pages/pe-admin/OportunidadesKanbanPage.tsx` | Renomear titulo |
| `src/pages/pe-admin/FunilEtapasPage.tsx` | Renomear titulo |
| `src/pages/orbit/MeuPlanoPage.tsx` | **Novo** -- pagina read-only |
| `src/App.tsx` | Adicionar rota `meu-plano` |
| `src/components/orbit/OrbitSidebar.tsx` | Adicionar item "Meu Plano" |

Nenhuma mudanca de banco de dados necessaria. Nenhuma alteracao de RLS.

