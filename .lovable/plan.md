

# Implementar Exportacao PDF da Documentacao PE Admin

## Contexto
Ja existe uma pagina de documentacao geral em `/documentacao` (`DocumentacaoPage.tsx`) que usa `window.print()` para exportar PDF via navegador, com estilos `@media print` dedicados. O objetivo e criar uma pagina similar, focada exclusivamente no modulo PE Admin, acessivel dentro do layout `/pe-admin`.

## Solucao

Criar uma nova pagina `PeAdminDocPage.tsx` seguindo o mesmo padrao da `DocumentacaoPage.tsx` existente:

- Conteudo focado no PE Admin: arquitetura multi-tenant, tabelas PE, hooks, roles, RLS, fluxos de convite, auditoria, tenant map
- Header com botao "Exportar PDF" que chama `window.print()`
- Sidebar com indice (Table of Contents) navegavel
- Estilos `@media print` para formatacao limpa em PDF
- Rota `/pe-admin/documentacao` dentro do `PeAdminLayout`

### Secoes do documento

1. **Visao Geral do PE** — descricao, arquitetura multi-tenant, stack
2. **Controle de Acesso** — super admin vs usuario comum, `pe_users`, `pe_roles`, fluxo de convite
3. **Banco de Dados** — todas as 16 tabelas PE com descricao, tenant key e RLS
4. **Modulos** — Organizations, Users, Clientes, Contatos, Funil, Oportunidades, Tarefas, Importacao, Tenant Map, Auditoria
5. **Hooks e Integracao** — lista dos hooks (`usePeAuth`, `useOrganizations`, `useOportunidades`, etc.)
6. **RLS e Seguranca** — funcoes `pe_is_super_admin`, `pe_get_user_org_id`, padrao de policies
7. **Rotas** — mapa completo de rotas `/pe-admin/*`
8. **Ponte Orbit↔PE** — `pe_tenant_map`, RPC `pe_provision_tenant`

### Arquivos

| Acao | Arquivo | Descricao |
|---|---|---|
| Criar | `src/pages/pe-admin/PeAdminDocPage.tsx` | Pagina de documentacao com export PDF |
| Editar | `src/pages/pe-admin/PeAdminLayout.tsx` | Adicionar item "Documentacao" no nav + icone `BookOpen` |
| Editar | `src/App.tsx` | Adicionar rota `/pe-admin/documentacao` |

### Detalhes tecnicos

- Reutiliza o padrao exato de `DocumentacaoPage.tsx`: `window.print()` + `@media print` CSS
- Nao requer dependencia externa (html2pdf, jspdf, etc.)
- Componentes shadcn/ui existentes: `Card`, `Table`, `Badge`, `Separator`, `ScrollArea`, `Button`
- `IntersectionObserver` para highlight do indice ativo (mesmo padrao da doc existente)

