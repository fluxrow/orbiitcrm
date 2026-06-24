## Auditoria das rotas atuais

Levantei tudo que está registrado no `src/App.tsx` e classifiquei por necessidade.

### ✅ Manter (essenciais)

**Públicas (sem login)**
- `/` — Landing page
- `/auth` — Login/cadastro
- `/documentacao` — Documentação interna pública
- `/setup` — Setup inicial (usado pelo fluxo de signup em `AuthPage`)
- `/invite/:token`, `/accept-invite-pe/:token`, `/accept-invite` — Aceitar convite (3 formatos usados por edge functions diferentes)
- `/reset-password` — Reset de senha
- `/privacy`, `/terms` — Políticas
- `/apresentacao/orbit-2026` — Apresentação comercial (oculta, sem link)
- `/onboarding-cliente/:token` — Wizard público de onboarding do cliente

**Logadas**
- `/select-empresa` — Quando o usuário pertence a mais de uma empresa
- `/:slug/*` (tenant real do cliente) com todas as subrotas: `dashboard`, `prospects`, `conversas`, `funil`, `campanhas`, `campanhas/nova`, `campanhas/:id/editar`, `templates`, `templates/email/new`, `templates/email/:id/edit`, `lead-finder`, `config`, `analytics`, `tarefas`, `onboarding` (já restrito a super_admin), `meu-plano`, `usuarios`

**Admin Fluxrow (PE Admin — novo)**
- `/pe-admin`, `/pe-admin/cadastros`, `/pe-admin/organizations`, `/pe-admin/organizations/:id/users`, `/pe-admin/users`, `/pe-admin/planos`, `/pe-admin/tenants`, `/pe-admin/audit`, `/pe-admin/documentacao`

### ❌ Remover

**Demo (tudo)** — você não usa para vender
- Rotas: `/demo`, `/demo/*`, `/orbit`, `/orbit/*` (redirect legado que aponta para `/demo`)
- CTAs que apontam para `/demo`: botão "Ver demo" no `HotsiteHeader` (desktop e mobile) e botão "Ver demonstração" no `HeroSection`
- Badge "DEMO" no `OrbitSidebar` e barra "DEMO" no `OrbitLayout`
- Ramo `isDemo` do `TenantContext`, hook `useIsDemo`, e fallbacks que mandam pra `/demo` (`SuperAdminRoute`, `EmpresaSwitcher`, `OrbitRedirect`) — passam a redirecionar para `/auth` ou `/`

**Trial (tudo)** — não deve aparecer em lugar nenhum
- Rota `/trial` e página `TrialPage`
- Hook `useTrialRequests` e referências
- Aba "Trials" e listagem em `CadastrosPage` (PE Admin)
- Botão "Solicitar trial" e bloco "Trial expira em…" no `MeuPlanoPage`
- Labels "Trial" nos badges de status (`MeuPlanoPage`) — viram apenas "Ativo"/"Pendente"
- Bloqueio `trial_expired` em `TenantBlocked` — substituído por mensagem genérica "Acesso suspenso, entre em contato"
- `plan code "trial"` no `usePlanGuard` mantém grant total (sem mudar acesso a quem já está marcado), mas a interface não menciona mais trial

**Super Admin legado (substituído pelo PE Admin)**
- Rotas `/super-admin`, `/super-admin/empresas`, `/super-admin/empresas/:id/usuarios`, `/super-admin/usuarios`
- Páginas em `src/pages/super-admin/` (Dashboard, EmpresasPage, EmpresaUsersPage, UsuariosGlobaisPage, SuperAdminLayout)
- Componente `super-admin/EmpresaDialog`
- Os componentes ainda usados (`super-admin/AddUserDialog`) ficam — apenas a pasta de páginas e o layout são removidos

**Rota órfã**
- `/org/users` (`OrgUsersPage`) — não tem nenhum link interno apontando, função coberta por `/pe-admin/users` e `/:slug/usuarios`

### 🧹 Limpeza adicional
- Atualizar `DocumentacaoPage` para remover linhas que citam `/trial`, `/demo`, `/super-admin/*`
- Atualizar `PeAdminDocPage` se citar trial
- Remover imports e dead code dos arquivos acima em `App.tsx`

### 🛡️ Banco de dados (NÃO mexer)
- Tabela `trial_requests`, colunas `trial_ends_at`/`status='trial'` em `saas_empresa`, plan code `demo` no `saas_plans` — ficam intactos para não quebrar empresas já cadastradas. Só a UI e as rotas somem.

---

## Mudanças técnicas

Arquivos editados:
- `src/App.tsx` — remover rotas `/trial`, `/demo`, `/orbit`, `/orbit/*`, `/super-admin/*`, `/org/users`; remover imports correspondentes; `SuperAdminRoute` passa a redirecionar para `/auth` em vez de `/demo`
- `src/components/HotsiteHeader.tsx` — remover botões "Ver demo" e "Acessar Demo"
- `src/components/landing/HeroSection.tsx` — remover botão "Ver demonstração"
- `src/components/orbit/OrbitSidebar.tsx` — remover badge "DEMO" e prop `isDemo`
- `src/components/orbit/OrbitLayout.tsx` — remover barra de aviso "DEMO"
- `src/components/orbit/EmpresaSwitcher.tsx` — fallback para `/` em vez de `/demo/dashboard`
- `src/contexts/TenantContext.tsx` — remover ramo `isDemo`; o contexto sempre exige slug
- `src/pages/tenant/TenantLayout.tsx` — remover prop `isDemo` e bloco que redireciona super admin saindo de `/demo`
- `src/pages/orbit/MeuPlanoPage.tsx` — remover CTA `navigate("/trial")` e bloco "Trial expira em…"; mapear status `trial`/`trialing` para "Ativo"
- `src/pages/tenant/TenantBlocked.tsx` — remover branch `trial_expired`, usar mensagem genérica
- `src/pages/pe-admin/CadastrosPage.tsx` — remover aba/lista de trials e import de `useTrialRequests`
- `src/pages/DocumentacaoPage.tsx` — limpar linhas obsoletas

Arquivos deletados:
- `src/pages/TrialPage.tsx`
- `src/hooks/useTrialRequests.ts`
- `src/hooks/useIsDemo.ts`
- `src/pages/org/OrgUsersPage.tsx`
- `src/pages/super-admin/SuperAdminDashboard.tsx`
- `src/pages/super-admin/EmpresasPage.tsx`
- `src/pages/super-admin/EmpresaUsersPage.tsx`
- `src/pages/super-admin/UsuariosGlobaisPage.tsx`
- `src/pages/super-admin/SuperAdminLayout.tsx`
- `src/components/super-admin/EmpresaDialog.tsx`

Sem migrations. Sem mudanças em edge functions.

---

## O que pode quebrar

- Links externos antigos para `/demo/...`, `/trial`, `/orbit/...` ou `/super-admin/...` cairão no `NotFound`. Nenhum desses está em material seu de venda atual.
- Empresas cujo `saas_status = 'trial'` continuam funcionando normalmente — o app simplesmente não mostra mais a palavra "Trial". Se quiser, posso depois migrar todas para `active`.

Confirma esse pente fino?
