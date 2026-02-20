
# Etapa 4A.1 -- Tenant Map Management (UX + Seguranca)

## Objetivo

Criar uma interface administrativa para gerenciar o mapeamento entre empresas Orbit (`empresa_id`) e organizacoes PE (`organization_id`), eliminando a necessidade de SQL manual na tabela `pe_tenant_map`.

---

## 1. Backend (Migracoes SQL)

### 1.1 RPC `pe_upsert_tenant_map`

Funcao SECURITY DEFINER que apenas Super Admins podem executar:

```text
CREATE OR REPLACE FUNCTION public.pe_upsert_tenant_map(
  p_empresa_id uuid,
  p_organization_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validar que caller e super admin
  IF NOT pe_is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'access_denied: only super admins can manage tenant mappings';
  END IF;

  -- Validar existencia de empresa_id
  IF NOT EXISTS (SELECT 1 FROM orbit_empresas WHERE id = p_empresa_id) THEN
    RAISE EXCEPTION 'empresa_not_found: %', p_empresa_id;
  END IF;

  -- Validar existencia de organization_id
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = p_organization_id) THEN
    RAISE EXCEPTION 'organization_not_found: %', p_organization_id;
  END IF;

  -- Upsert
  INSERT INTO pe_tenant_map (empresa_id, organization_id)
  VALUES (p_empresa_id, p_organization_id)
  ON CONFLICT (empresa_id) DO UPDATE SET organization_id = EXCLUDED.organization_id;

  -- Handle reverse conflict (org already mapped to different empresa)
  -- The UNIQUE on organization_id will raise an error naturally

  -- Audit log
  INSERT INTO pe_audit_log (
    organization_id, actor_user_id, action, entity_type, entity_id, metadata
  ) VALUES (
    p_organization_id, auth.uid(), 'TENANT_MAP_UPSERT', 'pe_tenant_map', null,
    jsonb_build_object('empresa_id', p_empresa_id, 'organization_id', p_organization_id)
  );

  RETURN jsonb_build_object('empresa_id', p_empresa_id, 'organization_id', p_organization_id);
END;
$$;
```

### 1.2 RPC `pe_delete_tenant_map`

Para permitir desfazer mapeamentos incorretos:

```text
CREATE OR REPLACE FUNCTION public.pe_delete_tenant_map(p_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_org_id uuid;
BEGIN
  IF NOT pe_is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  SELECT organization_id INTO v_org_id FROM pe_tenant_map WHERE empresa_id = p_empresa_id;

  DELETE FROM pe_tenant_map WHERE empresa_id = p_empresa_id;

  INSERT INTO pe_audit_log (
    organization_id, actor_user_id, action, entity_type, entity_id, metadata
  ) VALUES (
    v_org_id, auth.uid(), 'TENANT_MAP_DELETED', 'pe_tenant_map', null,
    jsonb_build_object('empresa_id', p_empresa_id, 'organization_id', v_org_id)
  );
END;
$$;
```

---

## 2. Frontend -- Hook

### 2.1 Novo hook `src/hooks/useTenantMap.ts`

- `useTenantMaps()` -- query que busca todos os registros de `pe_tenant_map` (Super Admin ve todos via RLS)
- `useUpsertTenantMap()` -- mutation que chama `supabase.rpc('pe_upsert_tenant_map', ...)`
- `useDeleteTenantMap()` -- mutation que chama `supabase.rpc('pe_delete_tenant_map', ...)`

---

## 3. Frontend -- Pagina

### 3.1 Nova pagina `src/pages/pe-admin/TenantMapPage.tsx`

Layout: tabela com todas as empresas Orbit, mostrando status de mapeamento.

| Coluna | Conteudo |
|---|---|
| Empresa (Orbit) | Nome da empresa |
| CNPJ | CNPJ se disponivel |
| Status | Badge "Mapeado" (verde) ou "Nao mapeado" (amarelo) |
| Organizacao (PE) | Nome da org mapeada ou Select para escolher |
| Acoes | Salvar / Remover mapeamento |

Comportamento:
- Carrega lista de empresas (`useEmpresas`) e lista de organizacoes (`useOrganizations`)
- Carrega mapeamentos existentes (`useTenantMaps`)
- Para cada empresa, mostra select com organizacoes disponiveis (filtrando as ja mapeadas a outras empresas)
- Botao "Mapear" executa `pe_upsert_tenant_map`
- Botao "Remover" executa `pe_delete_tenant_map`
- Warning visual se tentar mapear org ja vinculada

### 3.2 Rota e navegacao

- Adicionar rota `/pe-admin/tenants` no `App.tsx` dentro do bloco `<PeAdminLayout>`
- Adicionar item de navegacao no `PeAdminLayout.tsx`: icone `Link2`, label "Tenant Map"

---

## 4. Auto-heal na ProspectDialog

### 4.1 Melhorar tratamento do erro `tenant_map_missing`

No `ProspectDialog.tsx`, quando o erro `tenant_map_missing` e recebido:
- Se o usuario for Super Admin (via `usePeAuth`): mostrar botao "Configurar Mapeamento" que navega para `/pe-admin/tenants`
- Se nao for Super Admin: manter mensagem "Contate o administrador"

---

## 5. Documentacao

Atualizar `DocumentacaoPage.tsx` adicionando secao sobre Tenant Map Management.

---

## Resumo de arquivos

| Arquivo | Acao |
|---|---|
| Migration SQL | Criar RPCs `pe_upsert_tenant_map` e `pe_delete_tenant_map` |
| `src/hooks/useTenantMap.ts` | Novo hook com queries e mutations |
| `src/pages/pe-admin/TenantMapPage.tsx` | Nova pagina de gerenciamento |
| `src/pages/pe-admin/PeAdminLayout.tsx` | Adicionar nav item "Tenant Map" |
| `src/App.tsx` | Adicionar rota `/pe-admin/tenants` |
| `src/components/orbit/ProspectDialog.tsx` | Melhorar erro tenant_map_missing com CTA para Super Admin |
| `src/pages/DocumentacaoPage.tsx` | Documentar Tenant Map |

---

## Detalhes tecnicos

- As RPCs usam `SECURITY DEFINER` para acessar tabelas com RLS restritiva
- Validacao de existencia de `empresa_id` e `organization_id` acontece no backend (nao confia no frontend)
- O constraint `UNIQUE` em `organization_id` na tabela `pe_tenant_map` impede mapeamento duplicado naturalmente
- O select de organizacoes no frontend filtra as ja mapeadas para evitar confusao visual
