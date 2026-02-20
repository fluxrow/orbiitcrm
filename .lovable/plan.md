

# Pagina de Documentacao do Sistema (/documentacao)

Criar uma pagina publica (sem autenticacao) em `/documentacao` que apresente a documentacao completa do Orbit CRM / Prospecting Engine de forma estruturada, com opcao de exportar em PDF via `window.print()`.

---

## Estrutura da pagina

A pagina tera um layout limpo, sem sidebar, com:

1. **Header fixo** com titulo "Documentacao do Sistema ORBIT" e botao "Exportar PDF"
2. **Indice lateral** (Table of Contents) fixo a esquerda para navegacao rapida entre secoes
3. **Conteudo principal** dividido em secoes com ancoras

---

## Secoes do documento

### 1. Visao Geral
- Descricao do sistema (multi-tenant, white-label, B2B prospecting)
- Stack tecnologico (React, Vite, Tailwind, TypeScript, Lovable Cloud)
- Arquitetura geral (frontend SPA + backend serverless)

### 2. Modulos do Sistema
- **Orbit CRM**: Prospects, Conversas, Funil, Campanhas, Templates, Lead Finder, Analytics
- **Prospecting Engine (PE)**: Organizations, Users, Clientes, Contatos, Segmentos, Origens, Produtos, Funil de Etapas, Oportunidades, Tarefas, Interacoes
- **Super Admin**: Empresas, Usuarios Globais

### 3. Estrutura do Banco de Dados
Lista completa das 35+ tabelas organizadas por modulo:

**Tabelas PE (multi-tenant por organization_id):**
- `organizations`, `pe_users`, `pe_roles`, `pe_invitations`, `pe_audit_log`
- `clientes`, `contatos`, `origens`, `cliente_origem`, `segmentos`
- `funil_etapas`, `oportunidades`, `oportunidade_itens`
- `interacoes`, `tarefas`, `produtos`

**Tabelas Orbit (multi-tenant por empresa_id):**
- `orbit_empresas`, `profiles`, `user_roles`
- `orbit_prospects`, `orbit_conversas`, `orbit_mensagens`
- `orbit_deals`, `orbit_pipeline_stages`, `orbit_activities`
- `orbit_campaigns`, `orbit_campaign_recipients`, `orbit_campaign_approvals`
- `orbit_message_templates`
- `orbit_lead_sources`, `orbit_lead_searches`, `orbit_leads`, `orbit_icps`
- `orbit_enrichment_jobs`, `orbit_enrichment_queue`, `orbit_enrichment_credits`, `orbit_enrichment_policy`
- `orbit_ai_config`, `orbit_zapi_config`, `orbit_meta_config`, `orbit_resend_config`
- `orbit_distribuicao_config`, `orbit_integrations_config`
- `orbit_transferencias`, `orbit_import_history`, `orbit_whatsapp_daily_limits`
- `orbit_audit_log`

### 4. Integracoes
- **WhatsApp (Z-API)**: Config, webhooks, envio de mensagens
- **Email (Resend)**: Config, campanhas, envio
- **Meta (Instagram/Facebook)**: Config, webhooks, mensagens
- **Lead Finder (Apollo.io)**: Busca de leads, enriquecimento
- **IA (Lovable AI)**: Qualificacao automatica, sugestoes

### 5. Edge Functions (Backend)
Lista das 16 funcoes serverless com descricao:
- `accept-invitation`, `add-empresa-user`, `create-empresa`, `create-master-user`
- `invite-org-user`
- `orbit-ai-agent`, `orbit-ai-suggest`
- `orbit-meta-webhook`, `orbit-send-message`, `orbit-send-email`, `send-orbit-meta-message`
- `orbit-search-leads`, `orbit-webhook`
- `request-campaign-approval`, `send-orbit-campaign`
- `send-vendedor-notification`

### 6. Autenticacao e Controle de Acesso
- Modelo dual: `user_roles` (legacy Orbit) + `pe_users` (PE)
- Roles: super_admin, admin, vendedor, visualizador (Orbit) e roles dinamicos via `pe_roles` (PE)
- RLS em todas as tabelas
- Funcoes helper: `get_user_empresa_id`, `has_role`, `pe_get_user_org_id`, `pe_is_super_admin`, `pe_user_can_write`, `pe_user_is_org_admin`

### 7. Rotas da Aplicacao
- `/auth` - Login
- `/orbit/*` - Modulo CRM (protegido)
- `/pe-admin/*` - Admin do Prospecting Engine (super_admin)
- `/super-admin/*` - Admin legado (super_admin)

### 8. Indices e Otimizacoes
- Indices compostos existentes (ex: `idx_tarefas_org_status_due`)
- Paginacao implementada em interacoes

---

## Exportacao PDF

- Botao "Exportar PDF" chama `window.print()`
- CSS `@media print` dedicado para:
  - Ocultar header fixo e botao de exportacao
  - Remover sidebar de navegacao
  - Ajustar margens e fontes para A4
  - Quebras de pagina entre secoes (`page-break-before`)
  - Fundo branco com texto preto

---

## Arquivos a criar/alterar

| Arquivo | Acao |
|---|---|
| `src/pages/DocumentacaoPage.tsx` | Nova pagina com toda a documentacao |
| `src/App.tsx` | Adicionar rota `/documentacao` (publica, sem ProtectedRoute) |

---

## Detalhes tecnicos

- Componente unico `DocumentacaoPage.tsx` com conteudo estatico (sem fetch de dados)
- Usar componentes `shadcn/ui` existentes: `Card`, `Badge`, `Separator`, `Table`
- Navegacao por ancoras com `id` em cada secao e scroll suave
- Estilo print embutido via `<style>` tag ou classe Tailwind `print:`
- Rota publica para acesso sem login

