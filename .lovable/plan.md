

# Etapa 4A.2 -- Auto-Provisioning de Tenant (Orbit to PE)

## Objetivo

Automatizar a criacao da organization PE e do registro em `pe_tenant_map` sempre que uma empresa Orbit for criada, eliminando setup manual pelo Super Admin.

---

## 1. Backend -- RPC `pe_provision_tenant`

Criar funcao SQL `SECURITY DEFINER` idempotente que:

A) Verifica se ja existe mapeamento em `pe_tenant_map` para o `empresa_id` -- se sim, retorna o existente (idempotente).

B) Cria `organization` no PE com `name = p_empresa_nome`.

C) Insere `pe_tenant_map(empresa_id, organization_id)`.

D) Seed padrao para a nova org:
   - **Produtos** (7 itens): AEREO, RODOVIARIO, LOCACAO_VEICULO, TRANSFER (TRANSPORTE), HOSPEDAGEM (HOSPEDAGEM), SEGURO (PROTECAO), EVENTOS (EVENTOS) -- com `ON CONFLICT DO NOTHING` no par `(organization_id, codigo)` para idempotencia. Requer adicionar constraint UNIQUE em `(organization_id, codigo)` na tabela `produtos`.
   - **Funil Etapas** (6 etapas): Solicitacao Recebida (open, ordem 1), Em Qualificacao (open, 2), Cotacao Enviada (open, 3), Ajustes / Negociacao (open, 4), Emitido / Confirmado (won, 5), Perdido / Cancelado (lost, 6) -- com `ON CONFLICT DO NOTHING` no par `(organization_id, nome)` para idempotencia. Requer adicionar constraint UNIQUE em `(organization_id, nome)` na tabela `funil_etapas`.

E) Audit log: `TENANT_PROVISIONED`.

Retorno: `{ empresa_id, organization_id, seeded: true/false }`

```text
CREATE OR REPLACE FUNCTION public.pe_provision_tenant(
  p_empresa_id uuid,
  p_empresa_nome text,
  p_created_by_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_seeded boolean := false;
BEGIN
  -- A) Idempotente: retornar mapeamento existente
  SELECT organization_id INTO v_org_id
  FROM pe_tenant_map WHERE empresa_id = p_empresa_id;

  IF v_org_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'empresa_id', p_empresa_id,
      'organization_id', v_org_id,
      'seeded', false
    );
  END IF;

  -- B) Criar organization
  INSERT INTO organizations (name)
  VALUES (p_empresa_nome)
  RETURNING id INTO v_org_id;

  -- C) Inserir pe_tenant_map
  INSERT INTO pe_tenant_map (empresa_id, organization_id)
  VALUES (p_empresa_id, v_org_id);

  -- D) Seed produtos
  INSERT INTO produtos (organization_id, codigo, nome, categoria) VALUES
    (v_org_id, 'AEREO', 'Aereo', 'TRANSPORTE'),
    (v_org_id, 'RODOVIARIO', 'Rodoviario', 'TRANSPORTE'),
    (v_org_id, 'LOCACAO_VEICULO', 'Locacao de Veiculo', 'TRANSPORTE'),
    (v_org_id, 'TRANSFER', 'Transfer', 'TRANSPORTE'),
    (v_org_id, 'HOSPEDAGEM', 'Hospedagem', 'HOSPEDAGEM'),
    (v_org_id, 'SEGURO', 'Seguro Viagem', 'PROTECAO'),
    (v_org_id, 'EVENTOS', 'Eventos', 'EVENTOS')
  ON CONFLICT (organization_id, codigo) DO NOTHING;

  -- Seed funil etapas
  INSERT INTO funil_etapas (organization_id, nome, ordem, tipo) VALUES
    (v_org_id, 'Solicitacao Recebida', 1, 'open'),
    (v_org_id, 'Em Qualificacao', 2, 'open'),
    (v_org_id, 'Cotacao Enviada', 3, 'open'),
    (v_org_id, 'Ajustes / Negociacao', 4, 'open'),
    (v_org_id, 'Emitido / Confirmado', 5, 'won'),
    (v_org_id, 'Perdido / Cancelado', 6, 'lost')
  ON CONFLICT (organization_id, nome) DO NOTHING;

  v_seeded := true;

  -- E) Audit log
  INSERT INTO pe_audit_log (
    organization_id, actor_user_id, action, entity_type, metadata
  ) VALUES (
    v_org_id, p_created_by_user_id, 'TENANT_PROVISIONED', 'pe_tenant_map',
    jsonb_build_object(
      'empresa_id', p_empresa_id,
      'organization_id', v_org_id,
      'seeded', v_seeded
    )
  );

  RETURN jsonb_build_object(
    'empresa_id', p_empresa_id,
    'organization_id', v_org_id,
    'seeded', v_seeded
  );
END;
$$;
```

A migracao tambem adicionara as constraints UNIQUE necessarias:
- `ALTER TABLE produtos ADD CONSTRAINT uq_produtos_org_codigo UNIQUE (organization_id, codigo);`
- `ALTER TABLE funil_etapas ADD CONSTRAINT uq_funil_etapas_org_nome UNIQUE (organization_id, nome);`

---

## 2. Edge Function `create-empresa` -- Integracao

Modificar `supabase/functions/create-empresa/index.ts` para chamar `pe_provision_tenant` logo apos criar a empresa com sucesso (usando o service role client).

Adicionar entre os passos 1 e 2 atuais:

```text
// 1.5 Auto-provision PE tenant
const { data: provision, error: provisionError } = await supabaseAdmin
  .rpc("pe_provision_tenant", {
    p_empresa_id: empresa.id,
    p_empresa_nome: empresa.nome,
    p_created_by_user_id: user.id,
  });

if (provisionError) {
  console.error("Error provisioning tenant:", provisionError);
  // Non-blocking: empresa still works, provisioning can be retried
}
```

O provisionamento e nao-bloqueante: se falhar, a empresa e criada normalmente e o Super Admin pode reprovisionar pela UI.

O retorno da edge function sera estendido com `provision` (organization_id, seeded).

---

## 3. UX -- Status de Provisionamento

### 3.1 TenantMapPage.tsx

Atualizar a pagina existente para mostrar status "Provisionado" (verde) para empresas com mapeamento e adicionar botao "Re-provisionar" (chama `pe_provision_tenant` via RPC) para empresas sem mapeamento.

### 3.2 EmpresasPage.tsx

Adicionar coluna ou badge "PE" na listagem de empresas indicando se a empresa esta provisionada (tem entrada em `pe_tenant_map`).

### 3.3 Hook `useTenantMap.ts`

Adicionar mutation `useProvisionTenant()` que chama `supabase.rpc('pe_provision_tenant', ...)` para permitir re-tentativa manual.

---

## 4. Documentacao

Atualizar `DocumentacaoPage.tsx` com secao sobre Auto-Provisioning.

---

## Resumo de arquivos

| Arquivo | Acao |
|---|---|
| Migration SQL | Criar RPC `pe_provision_tenant` + UNIQUE constraints |
| `supabase/functions/create-empresa/index.ts` | Chamar `pe_provision_tenant` apos criar empresa |
| `src/hooks/useTenantMap.ts` | Adicionar `useProvisionTenant` mutation |
| `src/pages/pe-admin/TenantMapPage.tsx` | Botao "Re-provisionar" para empresas sem map |
| `src/pages/super-admin/EmpresasPage.tsx` | Badge de status PE provisionado |

---

## Detalhes tecnicos

- A funcao `pe_provision_tenant` usa `SECURITY DEFINER` pois precisa inserir em `organizations`, `pe_tenant_map`, `produtos`, e `funil_etapas` sem depender de RLS do caller.
- O `p_created_by_user_id` e passado como parametro (nao usa `auth.uid()`) porque a edge function roda com service role, onde `auth.uid()` retornaria null.
- As constraints UNIQUE `(organization_id, codigo)` e `(organization_id, nome)` garantem idempotencia dos seeds via `ON CONFLICT DO NOTHING`.
- O provisionamento na edge function e nao-bloqueante: falha no PE nao impede a criacao da empresa Orbit.
- A funcionalidade manual do TenantMapPage (mapear/remover) permanece intacta para cenarios de remapeamento.

