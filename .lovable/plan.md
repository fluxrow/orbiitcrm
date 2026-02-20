

# Etapa 4X.1 -- SaaS Plans + Invites + Usage + CNPJ Unique

## Objetivo

Criar a infraestrutura SaaS completa: tabela de planos, estado comercial por empresa, convites, controle de uso mensal, e CNPJ normalizado com unicidade.

---

## 1. Migration SQL

Uma unica migracao criando todas as tabelas, funcoes e seeds.

### 1.1 Tabela `saas_plans`

```text
CREATE TABLE public.saas_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  features jsonb NOT NULL DEFAULT '{}',
  limits jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.saas_plans ENABLE ROW LEVEL SECURITY;

-- Read: todos autenticados
CREATE POLICY "Authenticated can view plans"
  ON public.saas_plans FOR SELECT
  TO authenticated USING (true);

-- Write: so super_admin
CREATE POLICY "Super admin can manage plans"
  ON public.saas_plans FOR ALL
  TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role));
```

**Seed (4 planos)**:

| code | features | limits |
|------|----------|--------|
| demo | crm=true, email/wa/ig/fb/lead_search=false, sandbox=true | users:2, email_per_month:0, wa_per_month:0 |
| basic | crm=true, email=true, rest=false | users:5, email_per_month:5000, wa_per_month:0 |
| professional | crm+email+whatsapp=true, ig/fb/lead_search=false | users:15, email_per_month:20000, wa_per_month:5000 |
| plus | tudo=true | users:50, email_per_month:100000, wa_per_month:50000 |

### 1.2 Tabela `saas_empresa`

Estado comercial 1:1 com `orbit_empresas`.

```text
CREATE TABLE public.saas_empresa (
  empresa_id uuid PRIMARY KEY REFERENCES orbit_empresas(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES saas_plans(id),
  status text NOT NULL DEFAULT 'pending',
  responsible_name text,
  responsible_email text,
  invited_at timestamptz,
  activated_at timestamptz,
  trial_ends_at timestamptz,
  billing_status text,
  created_by_user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

RLS:
- SELECT: membros da empresa (`get_user_empresa_id(auth.uid()) = empresa_id`) + super_admin
- ALL: super_admin

### 1.3 Tabela `saas_invites`

```text
CREATE TABLE public.saas_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES orbit_empresas(id),
  email text NOT NULL,
  responsible_name text,
  token_hash text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by_user_id uuid,
  created_by_user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  metadata jsonb
);

CREATE INDEX idx_saas_invites_empresa ON saas_invites(empresa_id);
CREATE INDEX idx_saas_invites_email ON saas_invites(email);
CREATE INDEX idx_saas_invites_expires ON saas_invites(expires_at);
```

RLS:
- ALL: super_admin
- SELECT adicional: admin da empresa (`has_role + get_user_empresa_id`)

### 1.4 Tabela `saas_usage_monthly`

```text
CREATE TABLE public.saas_usage_monthly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES orbit_empresas(id),
  period text NOT NULL,
  email_sent int DEFAULT 0,
  whatsapp_sent int DEFAULT 0,
  ig_sent int DEFAULT 0,
  fb_sent int DEFAULT 0,
  lead_search_calls int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(empresa_id, period)
);
```

RLS:
- SELECT: admin/manager da empresa + super_admin
- INSERT/UPDATE: super_admin (edge functions usam service role)

### 1.5 CNPJ Normalizado

A tabela `orbit_empresas` ja tem coluna `cnpj` com unique index (`orbit_empresas_cnpj_key`). Vamos adicionar `cnpj_normalized` e migrar:

```text
-- Adicionar coluna
ALTER TABLE orbit_empresas ADD COLUMN cnpj_normalized text;

-- Funcao de normalizacao
CREATE OR REPLACE FUNCTION public.normalize_cnpj(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p IS NULL OR p = '' THEN NULL
    ELSE regexp_replace(p, '[^0-9]', '', 'g')
  END
$$;

-- Preencher dados existentes
UPDATE orbit_empresas SET cnpj_normalized = normalize_cnpj(cnpj)
WHERE cnpj IS NOT NULL AND cnpj <> '';

-- Unique parcial (ignora NULLs = demo sem CNPJ)
CREATE UNIQUE INDEX uq_orbit_empresas_cnpj_norm
  ON orbit_empresas(cnpj_normalized) WHERE cnpj_normalized IS NOT NULL;

-- Trigger para auto-normalizar
CREATE OR REPLACE FUNCTION trg_normalize_cnpj()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.cnpj_normalized := normalize_cnpj(NEW.cnpj);
  RETURN NEW;
END;
$$;

CREATE TRIGGER orbit_empresas_normalize_cnpj
  BEFORE INSERT OR UPDATE OF cnpj ON orbit_empresas
  FOR EACH ROW EXECUTE FUNCTION trg_normalize_cnpj();
```

Remover o unique index antigo em `cnpj` (que nao e normalizado):
```text
DROP INDEX IF EXISTS orbit_empresas_cnpj_key;
```

---

## 2. Frontend -- Hook `useSaasPlans.ts`

Novo hook com:
- `useSaasPlans()` -- lista todos os planos
- `useSaasEmpresa(empresaId)` -- estado SaaS de uma empresa
- `useSaasUsage(empresaId, period)` -- uso mensal
- `useUpdateSaasEmpresa()` -- mutation para atualizar status/plano

---

## 3. Integracao com `create-empresa`

Atualizar `supabase/functions/create-empresa/index.ts` para:
- Apos criar empresa + provisionar tenant, inserir registro em `saas_empresa` com:
  - `plan_id` = plano selecionado (lookup por code no body)
  - `status` = 'active' (ou 'pending' se fluxo de convite)
  - `created_by_user_id` = user.id

---

## 4. UI -- EmpresaDialog e EmpresasPage

### 4.1 EmpresaDialog
- Adicionar campo "Plano" (select com opcoes demo/basic/professional/plus)
- CNPJ obrigatorio quando plano != demo

### 4.2 EmpresasPage
- Coluna "Plano" mostrando badge do plano SaaS (em vez do campo legado `plano` da orbit_empresas)
- Coluna "Status SaaS"

---

## 5. Resumo de arquivos

| Arquivo | Acao |
|---|---|
| Migration SQL | Criar 4 tabelas + normalize_cnpj + trigger + seed + RLS |
| `src/hooks/useSaasPlans.ts` | Novo hook para planos, estado e uso |
| `supabase/functions/create-empresa/index.ts` | Inserir `saas_empresa` apos criacao |
| `src/components/super-admin/EmpresaDialog.tsx` | Campo plano + validacao CNPJ |
| `src/pages/super-admin/EmpresasPage.tsx` | Colunas plano SaaS e status |

---

## Detalhes tecnicos

- `saas_plans` usa `code` como chave logica (demo, basic, etc.) para lookup na edge function sem depender de UUIDs hardcoded.
- `cnpj_normalized` usa partial unique index (`WHERE cnpj_normalized IS NOT NULL`) para permitir multiplas empresas demo sem CNPJ.
- O trigger `trg_normalize_cnpj` garante que qualquer INSERT/UPDATE em `cnpj` atualiza automaticamente `cnpj_normalized`.
- As politicas RLS em `saas_usage_monthly` restringem INSERT/UPDATE ao super_admin; edge functions que incrementam uso operam via service role, contornando RLS.
- O seed dos 4 planos usa `INSERT ... ON CONFLICT (code) DO NOTHING` para idempotencia.

