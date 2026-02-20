

# Etapa 4X.3 -- UI/Front accept-invite + Onboarding

## Prerequisito

A migration da Etapa 4X.1 (tabelas `saas_plans`, `saas_empresa`, `saas_invites`, `saas_usage_monthly`, `cnpj_normalized`) precisa ser aplicada primeiro, pois as tabelas ainda nao existem no banco. A implementacao desta etapa inclui re-executar essa migration.

---

## 1. Edge Function: `validate-invite`

**Arquivo:** `supabase/functions/validate-invite/index.ts`

Endpoint publico (sem JWT) que recebe `{ token }` e retorna os dados do convite para exibicao na tela.

**Fluxo:**
1. Receber `token` no body
2. Calcular SHA-256 do token
3. Buscar em `saas_invites` por `token_hash`, fazendo join com `orbit_empresas` e `saas_plans`
4. Validar: nao expirado, `used_at IS NULL`
5. Retornar: `empresa_nome`, `responsible_name`, `responsible_email`, `plan_code`, `plan_name`, `expires_at`

**Config TOML:** `verify_jwt = false`

---

## 2. Edge Function: `accept-empresa-invite`

**Arquivo:** `supabase/functions/accept-empresa-invite/index.ts`

Endpoint publico que finaliza a aceitacao do convite SaaS.

**Entrada:**
```text
{
  token: string,
  password: string,
  full_name: string,
  cnpj?: string  // obrigatorio se plan != demo
}
```

**Fluxo:**
1. Validar token (mesma logica do validate-invite)
2. Validar CNPJ se plan != demo:
   - Normalizar (strip non-digits)
   - Validar comprimento (14 digitos)
   - Verificar unicidade em `orbit_empresas.cnpj_normalized` (se existir a coluna) ou `cnpj`
3. Criar auth user com email do convite + senha
4. Criar profile vinculado a empresa
5. Atribuir role `admin` em `user_roles`
6. Atualizar `orbit_empresas`: `ativo = true`, preencher `cnpj` se fornecido
7. Atualizar `saas_empresa`: `status = 'active'`, `activated_at = now()`
8. Marcar convite como usado: `used_at = now()`, `used_by_user_id`
9. Se plan != demo: chamar `pe_provision_tenant` + criar pipeline/AI config (mesmo padrao de create-empresa)
10. Se plan == demo: NAO provisionar PE, NAO criar integ. externas
11. Audit log: `EMPRESA_ACTIVATED`
12. Retornar `{ success, empresa_id, user_id }`

**Config TOML:** `verify_jwt = false`

---

## 3. Pagina: `AcceptInviteSaasPage.tsx`

**Arquivo:** `src/pages/AcceptInviteSaasPage.tsx`

Pagina publica com fluxo multi-step.

### Step 1: Validacao do Token
- Extrair `token` de `?token=...` (query param)
- Chamar `validate-invite`
- Se invalido/expirado: mostrar tela de erro
- Se valido: mostrar dados (empresa, plano, responsavel)

### Step 2: Criacao de Conta
- Campos: Nome completo (pre-preenchido com responsible_name), Senha, Confirmar Senha
- Email exibido como readonly (do convite)

### Step 3: Dados da Empresa (condicional)
- **Se plan == demo:** Pular este step. Mostrar botao "Entrar na Demo"
- **Se plan != demo:**
  - Campo CNPJ com mascara (XX.XXX.XXX/XXXX-XX)
  - Ao digitar CNPJ completo (14 digitos): chamar BrasilAPI (`https://brasilapi.com.br/api/cnpj/v1/{cnpj}`)
  - Autopreencher: Razao Social, Nome Fantasia, Endereco, CNAE
  - Campos editaveis para ajuste
  - Validacao de DV do CNPJ no client-side

### Step 4: Finalizacao
- Chamar `accept-empresa-invite`
- Mostrar loading/progress
- Ao concluir: tela de sucesso com botao "Ir para Login"

### Componente visual
- Card centralizado, similar ao AuthPage
- Progress stepper no topo (Step 1/2/3)
- Branding Orbit

---

## 4. Rota no App.tsx

Adicionar rota publica:
```text
<Route path="/accept-invite" element={<AcceptInviteSaasPage />} />
```

Nota: a rota existente `/invite/:token` continua para convites de organizacao PE (sistema diferente).

---

## 5. Utilitario: validacao CNPJ

**Arquivo:** `src/lib/cnpj.ts`

- `formatCnpj(value: string): string` -- aplica mascara
- `validateCnpjDv(cnpj: string): boolean` -- valida digitos verificadores
- `normalizeCnpj(cnpj: string): string` -- strip non-digits

---

## 6. Migration SQL (re-aplicar Etapa 4X.1)

A migration sera incluida para criar as tabelas `saas_plans`, `saas_empresa`, `saas_invites`, `saas_usage_monthly` e a coluna `cnpj_normalized` com trigger, caso ainda nao existam (usando `IF NOT EXISTS`).

---

## 7. Resumo de arquivos

| Arquivo | Acao |
|---|---|
| Migration SQL | Criar tabelas saas_* + cnpj_normalized (idempotente) |
| `supabase/functions/validate-invite/index.ts` | Nova edge function |
| `supabase/functions/accept-empresa-invite/index.ts` | Nova edge function |
| `supabase/config.toml` | Adicionar 2 entries |
| `src/pages/AcceptInviteSaasPage.tsx` | Nova pagina multi-step |
| `src/lib/cnpj.ts` | Utilitarios CNPJ |
| `src/App.tsx` | Adicionar rota `/accept-invite` |

---

## Detalhes tecnicos

- O `validate-invite` e separado do `accept-empresa-invite` para permitir validacao sem side-effects (exibir dados antes de criar conta).
- A chamada a BrasilAPI e feita diretamente do frontend (`fetch` client-side) pois e uma API publica sem necessidade de auth.
- O CNPJ e validado tanto no client (DV check) quanto no server (unicidade via unique index parcial).
- Para demo, o onboarding e simplificado: nao pede CNPJ, nao provisiona PE tenant, nao cria integ. externas. A empresa fica com `ativo = true` mas sem organizacao PE associada.
- O `accept-empresa-invite` segue o mesmo padrao do `create-empresa` para provisionamento (pipeline stages, AI config, PE tenant via `pe_provision_tenant`), mas sem criar o usuario admin inline (o usuario ja e criado no step de signup).
