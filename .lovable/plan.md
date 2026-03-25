

# Bloqueio Automático por Plano e Status — IMPLEMENTADO

## Matriz de Status

| Status | Login | Dashboard | Envios | Cadastro | Ação |
|--------|-------|-----------|--------|----------|------|
| demo | ✓ | ✓ | sim* | ✓ | sandbox |
| trial | ✓ | ✓ | ✓ | ✓ | normal |
| active | ✓ | ✓ | ✓ | ✓ | normal |
| past_due | ✓ | ✓ | ✗ | ✗ | banner + portal |
| unpaid | ✓ | ✓ (ro) | ✗ | ✗ | banner + portal |
| canceled | ✓ | bloqueio | ✗ | ✗ | tela bloqueio |
| suspended | ✓ | bloqueio | ✗ | ✗ | tela bloqueio |
| expired | ✓ | bloqueio | ✗ | ✗ | tela bloqueio |

## Validações Backend (saas_can_use)

- `past_due` → PLAN_STATUS_BLOCKED (bloqueia envios/cadastro)
- `user_add` → conta profiles ativos vs max_users
- `prospect_add` → conta orbit_prospects vs max_prospects
- `email_send`, `whatsapp_send`, etc. → limits mensais existentes

## Validações Frontend

- `usePlanGuard` → hook centralizado (canUseFeature, isWithinLimit, statusLevel)
- Sidebar filtra Campanhas e Lead Finder por features do plano
- PaymentWarningBanner exibe aviso para past_due/unpaid
- PlanLimitDialog navega para "Meu Plano" em vez de "Solicitar upgrade"
- useCreateProspect checa saas_can_use('prospect_add') antes de inserir

## Arquivos Alterados

| Arquivo | Ação |
|---------|------|
| SQL Migration | saas_can_use + get_empresa_by_slug atualizados |
| src/hooks/usePlanGuard.ts | Criado |
| src/components/orbit/PaymentWarningBanner.tsx | Criado |
| src/contexts/TenantContext.tsx | stripeStatus adicionado |
| src/pages/tenant/TenantBlocked.tsx | Mensagens por status + botão portal |
| src/pages/tenant/TenantLayout.tsx | Props empresaId/basePath no TenantBlocked |
| src/components/orbit/OrbitLayout.tsx | PaymentWarningBanner incluído |
| src/components/orbit/OrbitSidebar.tsx | Nav filtrada por features |
| src/components/orbit/PlanLimitDialog.tsx | Botão "Ver Meu Plano" |
| src/hooks/useOrbitProspects.ts | Guard prospect_add |
