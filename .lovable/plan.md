

# ETAPA SAAS-ROUTING-V3 -- Slug na Raiz + Trial 7 Dias

## Resumo

Empresas pagas acessam via `/{slug}/*`, demo via `/demo/*`. Slug gerado no onboarding. Trial de 7 dias para planos pagos com status `trial`. Rotas `/orbit/*` mantidas como redirect de compatibilidade.

## Parte 1: Migration SQL

### 1.1 Colunas em orbit_empresas
```sql
ALTER TABLE orbit_empresas
  ADD COLUMN slug text,
  ADD COLUMN public_url text,
  ADD COLUMN slug_created_at timestamptz;

CREATE UNIQUE INDEX idx_orbit_empresas_slug_unique
  ON orbit_empresas (slug) WHERE slug IS NOT NULL;
```

### 1.2 Funcoes SQL

**normalize_slug(text)**: lowercase, remove acentos (translate), substitui espacos por hifens, remove caracteres nao-alfanumericos, remove hifens duplicados e nas extremidades.

**generate_unique_slug(p_nome text)**: chama normalize_slug, testa colisao em orbit_empresas.slug, incrementa sufixo `-2`, `-3` ate encontrar disponivel.

**get_empresa_by_slug(p_slug text)**: SECURITY DEFINER. Retorna jsonb com empresa_id, nome, plan_code, saas_status, trial_ends_at. Valida: se plan_code=demo retorna null. Se status NOT IN (trial, active) retorna blocked=true + reason.

### 1.3 Ajuste de trial

O campo `saas_empresa.status` ja existe (default `invited`). Os valores possiveis passam a incluir `trial`. O campo `trial_ends_at` ja existe. Nenhuma alteracao de schema necessaria aqui.

A mudanca e na **logica do onboarding**: planos pagos recebem `status='trial'` + `trial_ends_at = now() + 7 days` (em vez do atual `status='active'` com 14/30 dias).

## Parte 2: Edge Function accept-empresa-invite

Alteracoes no `supabase/functions/accept-empresa-invite/index.ts`:

1. **Trial 7 dias**: Trocar logica atual (status='active', trialDays=14/30) por:
   - Se pago: `status='trial'`, `trial_ends_at = now() + 7 days`, `activated_at = now()`
   - Se demo: `status='active'`, `activated_at = now()`, sem trial

2. **Gerar slug** (apos ativar empresa e provisionar tenant):
   - Se pago: chamar RPC `generate_unique_slug(empresa_nome)`
   - Salvar `slug`, `public_url = '/' + slug`, `slug_created_at = now()` em orbit_empresas
   - Demo: nao gera slug

3. **Retornar** no response: `slug`, `redirect_url` (`/{slug}/dashboard` ou `/demo/dashboard`)

## Parte 3: TenantContext

**Novo arquivo**: `src/contexts/TenantContext.tsx`

```typescript
interface TenantState {
  empresaId: string | null;
  slug: string | null;
  isDemo: boolean;
  basePath: string;       // "/demo" ou "/{slug}"
  planCode: string | null;
  saasStatus: string | null;
  trialEndsAt: string | null;
  isLoading: boolean;
}
```

Provider e hook `useTenant()`.

## Parte 4: TenantLayout + Telas de Bloqueio

**Novo arquivo**: `src/pages/tenant/TenantLayout.tsx`
- Recebe `:slug` do React Router param
- Se slug == "demo": modo demo, carrega empresa_id do usuario logado (profiles.empresa_id)
- Senao: chama RPC `get_empresa_by_slug(slug)` para resolver empresa_id
- Valida `profiles.empresa_id == empresa_id` (ou super_admin)
- Se blocked: renderiza tela de bloqueio (trial expirado, suspenso)
- Se ok: seta TenantContext, renderiza OrbitLayout + `<Outlet />`

**Novo arquivo**: `src/pages/tenant/TenantNotFound.tsx` -- "Empresa nao encontrada"

**Novo arquivo**: `src/pages/tenant/TenantBlocked.tsx` -- "Acesso pausado"
- Se reason=`trial_expired`: "Seu periodo de teste de 7 dias acabou" + CTA upgrade
- Se reason=`suspended`: motivo + contato suporte

## Parte 5: Reestruturar Rotas (App.tsx)

```text
/auth              → AuthPage
/setup             → SetupPage
/invite/:token     → AcceptInvitePage
/accept-invite     → AcceptInviteSaasPage
/documentacao      → DocumentacaoPage

/demo/*            → TenantLayout (demo mode)
  dashboard        → OrbitDashboard
  prospects        → ProspectsPage
  conversas        → ConversasPage
  funil            → FunilPage
  campanhas        → CampanhasPage
  templates        → TemplatesPage
  lead-finder      → LeadFinderPage
  config           → ConfigPage
  analytics        → AnalyticsPage
  usuarios         → UsuariosEmpresaPage

/:slug/*           → TenantLayout (paid mode, trial ou active)
  (mesmas sub-rotas acima)

/orbit/*           → Redirect para /demo/* (compatibilidade)
/orbit             → Redirect para /demo/dashboard

/super-admin/*     → (sem mudanca)
/pe-admin/*        → (sem mudanca)
/org/*             → (sem mudanca)
```

Rotas reservadas (`auth`, `setup`, `invite`, `accept-invite`, `documentacao`, `super-admin`, `pe-admin`, `org`, `demo`) sao declaradas antes do catch-all `/:slug`.

## Parte 6: OrbitSidebar Dinamico

Trocar links hardcoded `/orbit/...` por `${basePath}/...` usando `useTenant().basePath`.

Tambem atualizar links no OrbitDashboard ("Ver todos", "Ver todas").

## Parte 7: Redirect Pos-Login (AuthPage)

Apos login bem-sucedido:
1. Buscar `profiles.empresa_id`
2. Buscar `orbit_empresas.slug` para essa empresa
3. Se slug existe: redirect para `/${slug}/dashboard`
4. Se nao (demo): redirect para `/demo/dashboard`

## Parte 8: Redirect Pos-Onboarding (AcceptInviteSaasPage)

No step 5 (done), em vez de "Ir para Login", redirecionar diretamente:
- Se pago (slug retornado): fazer auto-login e redirect para `/${slug}/dashboard`
- Se demo: redirect para `/demo/dashboard`

## Parte 9: useIsDemo Adaptacao

O hook `useIsDemo` pode ser simplificado para ler do TenantContext quando disponivel, mantendo fallback para queries diretas quando fora do contexto de tenant.

## Resumo de Arquivos

| Tipo | Arquivo |
|---|---|
| Migration | Colunas slug/public_url/slug_created_at, normalize_slug(), generate_unique_slug(), get_empresa_by_slug() |
| Novo | `src/contexts/TenantContext.tsx` |
| Novo | `src/pages/tenant/TenantLayout.tsx` |
| Novo | `src/pages/tenant/TenantNotFound.tsx` |
| Novo | `src/pages/tenant/TenantBlocked.tsx` |
| Edit | `src/App.tsx` (rotas) |
| Edit | `src/components/orbit/OrbitSidebar.tsx` (links dinamicos) |
| Edit | `src/pages/orbit/OrbitDashboard.tsx` (links dinamicos) |
| Edit | `src/pages/AuthPage.tsx` (redirect pos-login) |
| Edit | `src/pages/AcceptInviteSaasPage.tsx` (redirect pos-onboarding) |
| Edit | `supabase/functions/accept-empresa-invite/index.ts` (trial 7d + slug) |
| Deploy | accept-empresa-invite |

## Ordem de Execucao

1. Migration SQL (colunas + funcoes + RPC)
2. Edge function accept-empresa-invite (trial 7d + slug)
3. TenantContext + TenantLayout + telas bloqueio
4. App.tsx (rotas)
5. OrbitSidebar + OrbitDashboard (links dinamicos)
6. AuthPage (redirect pos-login)
7. AcceptInviteSaasPage (redirect pos-onboarding)
8. Deploy edge function
9. Teste end-to-end

