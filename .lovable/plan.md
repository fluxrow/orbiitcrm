

# Etapa 4A -- Integracao Orbit → PE (Ponte + Conversao)

## Objetivo

Criar a infraestrutura que permite promover um prospect do Orbit CRM para Cliente/Contato no modulo PE, com deduplicacao inteligente e rastreabilidade completa.

---

## 1. Migracoes SQL (3 partes)

### 1.1 Tabela `pe_tenant_map`

Mapeia `empresa_id` (Orbit) para `organization_id` (PE).

```text
CREATE TABLE public.pe_tenant_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL UNIQUE,
  organization_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pe_tenant_map ENABLE ROW LEVEL SECURITY;

-- Super admin full access
CREATE POLICY "Super admin full access pe_tenant_map"
  ON public.pe_tenant_map FOR ALL
  USING (pe_is_super_admin(auth.uid()));

-- Org admin can view own mapping
CREATE POLICY "Org admin can view own tenant_map"
  ON public.pe_tenant_map FOR SELECT
  USING (organization_id = pe_get_user_org_id(auth.uid()));
```

### 1.2 Tabela `orbit_pe_links`

Ponte entre prospect (Orbit) e cliente/contato/oportunidade (PE).

```text
CREATE TABLE public.orbit_pe_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  prospect_id uuid NOT NULL,
  cliente_id uuid,
  contato_id uuid,
  oportunidade_id uuid,
  match_type text NOT NULL DEFAULT 'manual',
  match_confidence int NOT NULL DEFAULT 60,
  is_primary boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(empresa_id, prospect_id),
  CONSTRAINT match_confidence_range CHECK (match_confidence BETWEEN 0 AND 100)
);

CREATE INDEX idx_orbit_pe_links_empresa ON public.orbit_pe_links(empresa_id);
CREATE INDEX idx_orbit_pe_links_org ON public.orbit_pe_links(organization_id);
CREATE INDEX idx_orbit_pe_links_cliente ON public.orbit_pe_links(cliente_id);
CREATE INDEX idx_orbit_pe_links_contato ON public.orbit_pe_links(contato_id);

ALTER TABLE public.orbit_pe_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access orbit_pe_links"
  ON public.orbit_pe_links FOR ALL
  USING (pe_is_super_admin(auth.uid()));

CREATE POLICY "Org members can view orbit_pe_links"
  ON public.orbit_pe_links FOR SELECT
  USING (organization_id = pe_get_user_org_id(auth.uid()));

CREATE POLICY "Writers can manage orbit_pe_links"
  ON public.orbit_pe_links FOR ALL
  USING (pe_user_can_write(auth.uid(), organization_id));
```

### 1.3 Funcoes helper + `pe_promote_prospect`

Funcoes de normalizacao (reutilizando logica ja existente no frontend):

```text
-- normalize_phone: somente digitos
CREATE OR REPLACE FUNCTION public.normalize_phone(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(COALESCE(p, ''), '[^0-9]', '', 'g')
$$;

-- normalize_email: lowercase trim
CREATE OR REPLACE FUNCTION public.normalize_email(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(trim(COALESCE(p, '')))
$$;

-- normalize_name: sem acento, lowercase, apenas alfanumericos
CREATE OR REPLACE FUNCTION public.normalize_name(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
    lower(
      translate(
        COALESCE(p, ''),
        'ÁÀÃÂÄáàãâäÉÈÊËéèêëÍÌÎÏíìîïÓÒÕÔÖóòõôöÚÙÛÜúùûüÇçÑñ',
        'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
      )
    ),
    '[^a-z0-9 ]', '', 'g'
  )
$$;

-- extract_domain: do email ou url
CREATE OR REPLACE FUNCTION public.extract_domain(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p IS NULL OR p = '' THEN NULL
    WHEN p LIKE '%@%' THEN split_part(p, '@', 2)
    ELSE regexp_replace(
      regexp_replace(p, '^https?://', ''),
      '^www\.', ''
    )
  END
$$;
```

Funcao principal `pe_promote_prospect` (SECURITY DEFINER):

```text
CREATE OR REPLACE FUNCTION public.pe_promote_prospect(
  p_empresa_id uuid,
  p_prospect_id uuid,
  p_create_opportunity boolean DEFAULT true,
  p_owner_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_prospect record;
  v_cliente_id uuid;
  v_contato_id uuid;
  v_oportunidade_id uuid;
  v_link_id uuid;
  v_match_type text := 'manual';
  v_confidence int := 60;
  v_etapa_id uuid;
  v_found record;
  v_norm_phone text;
  v_norm_email text;
  v_norm_name text;
  v_domain text;
BEGIN
  -- A) Resolver organization_id
  SELECT organization_id INTO v_org_id
  FROM pe_tenant_map WHERE empresa_id = p_empresa_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'tenant_map_missing: no mapping for empresa_id %', p_empresa_id;
  END IF;

  -- B) Carregar prospect
  SELECT * INTO v_prospect
  FROM orbit_prospects WHERE id = p_prospect_id;
  IF v_prospect IS NULL THEN
    RAISE EXCEPTION 'prospect_not_found: %', p_prospect_id;
  END IF;

  -- Normalizar dados
  v_norm_phone := normalize_phone(v_prospect.telefone_whatsapp);
  v_norm_email := normalize_email(v_prospect.email_principal);
  v_domain := extract_domain(v_prospect.email_principal);
  v_norm_name := normalize_name(v_prospect.nome_razao);

  -- C) Dedupe: encontrar cliente existente
  -- 1) CNPJ
  IF v_prospect.cnpj_cpf IS NOT NULL AND v_prospect.cnpj_cpf <> '' THEN
    SELECT id INTO v_cliente_id FROM clientes
    WHERE organization_id = v_org_id
      AND cnpj = regexp_replace(v_prospect.cnpj_cpf, '[^0-9]', '', 'g')
    LIMIT 1;
    IF v_cliente_id IS NOT NULL THEN
      v_match_type := 'cnpj'; v_confidence := 95;
    END IF;
  END IF;

  -- 2) Dominio
  IF v_cliente_id IS NULL AND v_domain IS NOT NULL AND v_domain <> '' THEN
    SELECT id INTO v_cliente_id FROM clientes
    WHERE organization_id = v_org_id AND dominio_principal = v_domain
    LIMIT 1;
    IF v_cliente_id IS NOT NULL THEN
      v_match_type := 'domain'; v_confidence := 85;
    END IF;
  END IF;

  -- 3) Nome + cidade + uf
  IF v_cliente_id IS NULL AND v_norm_name <> '' THEN
    SELECT id INTO v_cliente_id FROM clientes
    WHERE organization_id = v_org_id
      AND razao_social_normalizada = v_norm_name
      AND COALESCE(cidade,'') = COALESCE(v_prospect.cidade,'')
      AND COALESCE(uf,'') = COALESCE(v_prospect.estado,'')
    LIMIT 1;
    IF v_cliente_id IS NOT NULL THEN
      v_match_type := 'name'; v_confidence := 60;
    END IF;
  END IF;

  -- Se nao encontrou, criar cliente
  IF v_cliente_id IS NULL THEN
    INSERT INTO clientes (
      organization_id, razao_social, razao_social_normalizada,
      nome_fantasia, cnpj, cidade, uf,
      dominio_principal, status_geral
    ) VALUES (
      v_org_id, v_prospect.nome_razao, v_norm_name,
      v_prospect.nome_fantasia,
      CASE WHEN v_prospect.cnpj_cpf <> '' THEN regexp_replace(v_prospect.cnpj_cpf,'[^0-9]','','g') END,
      v_prospect.cidade, v_prospect.estado,
      v_domain, 'ativo'
    ) RETURNING id INTO v_cliente_id;
    v_match_type := 'new'; v_confidence := 100;
  ELSE
    -- Atualizar campos vazios do cliente existente
    UPDATE clientes SET
      nome_fantasia = COALESCE(NULLIF(nome_fantasia,''), v_prospect.nome_fantasia),
      cidade = COALESCE(NULLIF(cidade,''), v_prospect.cidade),
      uf = COALESCE(NULLIF(uf,''), v_prospect.estado),
      dominio_principal = COALESCE(NULLIF(dominio_principal,''), v_domain)
    WHERE id = v_cliente_id;
  END IF;

  -- D) Contato
  IF v_norm_email <> '' THEN
    SELECT id INTO v_contato_id FROM contatos
    WHERE organization_id = v_org_id AND email_normalizado = v_norm_email
    LIMIT 1;
  END IF;

  IF v_contato_id IS NULL THEN
    INSERT INTO contatos (
      organization_id, cliente_id, nome,
      email, email_normalizado,
      telefone, whatsapp, decisor
    ) VALUES (
      v_org_id, v_cliente_id, v_prospect.nome_razao,
      v_prospect.email_principal, v_norm_email,
      v_prospect.telefone_whatsapp, v_prospect.telefone_whatsapp, false
    ) RETURNING id INTO v_contato_id;
  END IF;

  -- E) Bridge orbit_pe_links (upsert)
  INSERT INTO orbit_pe_links (
    empresa_id, organization_id, prospect_id,
    cliente_id, contato_id, match_type, match_confidence
  ) VALUES (
    p_empresa_id, v_org_id, p_prospect_id,
    v_cliente_id, v_contato_id, v_match_type, v_confidence
  )
  ON CONFLICT (empresa_id, prospect_id) DO UPDATE SET
    cliente_id = EXCLUDED.cliente_id,
    contato_id = EXCLUDED.contato_id,
    match_type = EXCLUDED.match_type,
    match_confidence = EXCLUDED.match_confidence,
    updated_at = now()
  RETURNING id INTO v_link_id;

  -- F) Owner
  IF p_owner_user_id IS NOT NULL THEN
    -- verificar se oportunidades tem owner_user_id para setar no cliente? 
    -- clientes nao tem owner, entao skip
    NULL;
  END IF;

  -- G) Criar oportunidade
  IF p_create_opportunity THEN
    SELECT id INTO v_etapa_id FROM funil_etapas
    WHERE organization_id = v_org_id AND tipo = 'open'
    ORDER BY ordem LIMIT 1;

    IF v_etapa_id IS NOT NULL THEN
      INSERT INTO oportunidades (
        organization_id, cliente_id, etapa_id,
        owner_user_id, created_by_user_id, titulo
      ) VALUES (
        v_org_id, v_cliente_id, v_etapa_id,
        COALESCE(p_owner_user_id, auth.uid()),
        auth.uid(),
        'Solicitacao - ' || v_prospect.nome_razao
      ) RETURNING id INTO v_oportunidade_id;

      UPDATE orbit_pe_links SET oportunidade_id = v_oportunidade_id
      WHERE id = v_link_id;
    END IF;
  END IF;

  -- H) Audit
  INSERT INTO pe_audit_log (
    organization_id, actor_user_id, action, entity_type, entity_id, metadata
  ) VALUES (
    v_org_id, auth.uid(), 'PROSPECT_PROMOTED_TO_CLIENT', 'orbit_pe_link', v_link_id,
    jsonb_build_object(
      'empresa_id', p_empresa_id,
      'prospect_id', p_prospect_id,
      'cliente_id', v_cliente_id,
      'contato_id', v_contato_id,
      'oportunidade_id', v_oportunidade_id,
      'match_type', v_match_type,
      'match_confidence', v_confidence
    )
  );

  -- Atualizar status do prospect
  UPDATE orbit_prospects SET status_qualificacao = 'qualificado'
  WHERE id = p_prospect_id;

  RETURN jsonb_build_object(
    'organization_id', v_org_id,
    'cliente_id', v_cliente_id,
    'contato_id', v_contato_id,
    'oportunidade_id', v_oportunidade_id,
    'link_id', v_link_id,
    'match_type', v_match_type,
    'match_confidence', v_confidence
  );
END;
$$;
```

---

## 2. Codigo Frontend

### 2.1 Hook `usePromoteProspect` (novo arquivo)

`src/hooks/usePromoteProspect.ts`

- Mutation que chama `supabase.rpc('pe_promote_prospect', { ... })`
- Recebe `empresa_id`, `prospect_id`, `create_opportunity`, `owner_user_id`
- Invalida queries de `orbit_prospects`, `clientes`, `oportunidades`
- Retorna resultado com `cliente_id`, `contato_id`, `oportunidade_id`, `match_type`

### 2.2 Botao "Promover para Funil" na ProspectDialog

Alterar `src/components/orbit/ProspectDialog.tsx`:

- Adicionar botao "Promover para Funil (PE)" visivel apenas quando editando um prospect
- Ao clicar, abrir confirmacao (com checkbox "Criar oportunidade automaticamente?")
- Chamar o hook `usePromoteProspect`
- Exibir resultado: cliente criado/linkado, tipo de match, confianca
- Toast de sucesso com link para o cliente no PE

### 2.3 Indicador de link na ProspectsPage

Alterar `src/pages/orbit/ProspectsPage.tsx`:

- Para prospects ja promovidos (que tem registro em `orbit_pe_links`), exibir badge "Convertido" no card
- Consulta simples via join ou query separada

### 2.4 Atualizar DocumentacaoPage

Adicionar secao sobre a ponte Orbit-PE na documentacao existente.

---

## Resumo de arquivos

| Arquivo | Acao |
|---|---|
| Migration SQL | Criar `pe_tenant_map`, `orbit_pe_links`, funcoes helper, `pe_promote_prospect` |
| `src/hooks/usePromoteProspect.ts` | Novo hook para chamar a RPC |
| `src/components/orbit/ProspectDialog.tsx` | Adicionar botao "Promover para Funil" |
| `src/pages/orbit/ProspectsPage.tsx` | Badge "Convertido" para prospects linkados |
| `src/pages/DocumentacaoPage.tsx` | Adicionar secao ponte Orbit-PE |

## Riscos e consideracoes

- A funcao `pe_promote_prospect` e `SECURITY DEFINER` para poder inserir em tabelas PE com RLS restritiva
- O `CHECK` constraint em `match_confidence` usa validacao simples (0-100), nao depende de `now()`, entao e seguro
- A tabela `clientes` nao tem coluna `owner_user_id`, entao a distribuicao de owner fica pendente para Etapa 4D
- O mapeamento `pe_tenant_map` precisa ser preenchido manualmente (via Super Admin) antes de promover prospects

