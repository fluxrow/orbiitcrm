## Validação dos fixes aplicados pelo Claude

Plano para verificar se os 12 arquivos ficaram consistentes com `useTenant().empresaId` e isolamento por tenant.

### 1. Releitura dos 12 arquivos alterados
Ler em paralelo:
- `src/components/orbit/CampaignWizard.tsx`
- `src/components/orbit/CampaignWizardContent.tsx`
- `src/components/orbit/ProspectDialog.tsx`
- `src/components/orbit/RecipientSelector.tsx`
- `src/pages/orbit/TemplatesPage.tsx`
- `src/pages/orbit/EmailTemplateEditorPage.tsx`
- `src/pages/orbit/ProspectsPage.tsx`
- `src/hooks/useEmpresaVendedores.ts`
- `src/hooks/useUserRole.ts`
- `src/hooks/useIsDemo.ts`
- `src/hooks/useImportProspects.ts`
- `src/hooks/useLeadFinder.ts`

### 2. Checklist por arquivo
Para cada um confirmar:
- `useTenant()` importado e usado no topo do componente/hook
- Nenhum `supabase.from("profiles").select("empresa_id")` remanescente para descobrir tenant ativo (lookups legítimos — ex: contar usuários — ficam)
- `queryKey` inclui `empresaId` quando a query depende dele
- `enabled: !!empresaId` em queries dependentes (evita race condition antes do tenant carregar)
- Mutations passam `empresa_id: tenantEmpresaId` explicitamente
- Hooks não chamam outros hooks condicionalmente

### 3. Grep global de regressão
- `rg "from\\(.profiles.\\)\\.select\\(.empresa_id" src/` — deve sobrar só `TenantContext.tsx`, `useUserRole.ts` (lookup legítimo de empresa do user), e telas pe-admin/super-admin não-orbit
- `rg "myProfile\\?\\.empresa_id|profile\\?\\.empresa_id" src/` no escopo orbit — deve estar zerado

### 4. Typecheck
- `bunx tsgo --noEmit` (ou o que o projeto usar) para garantir que as assinaturas continuam batendo após as edições do Claude

### 5. Smoke tests existentes
- Rodar `bunx vitest run src/test/orbit-smoke.test.ts src/test/orbit-ux-smoke.test.ts` se passarem sem mudar nada — só pra ver que nada quebrou estruturalmente

### 6. Relatório
Devolver:
- ✅ arquivos consistentes
- ⚠️ qualquer arquivo onde falte `enabled`/`queryKey`/grant de tenant
- 🔴 erros de typecheck ou imports quebrados

**Não vou editar nada** nesta etapa — só validar e reportar. Se achar inconsistência, te mostro o diff sugerido antes de aplicar.