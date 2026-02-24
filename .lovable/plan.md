

# Relatorio Tecnico: Fluxo de Criacao de Conta + Empresa + Provisionamento PE

---

## PASSO 1 — FLUXO ATUAL MAPEADO

### Existem dois fluxos distintos de criacao de empresa:

---

### FLUXO A: Criacao Direta pelo Super Admin (via `/pe-admin`)

```text
Super Admin logado
        |
        v
Edge Function: create-empresa
        |
        +---> INSERT orbit_empresas (ativo=true)
        +---> RPC pe_provision_tenant
        |        +---> INSERT organizations
        |        +---> INSERT pe_tenant_map
        |        +---> INSERT produtos (7 seed)
        |        +---> INSERT funil_etapas (6 seed)
        |        +---> INSERT pe_audit_log (TENANT_PROVISIONED)
        +---> INSERT saas_empresa (status="active")
        +---> auth.admin.createUser (email_confirm=true)
        +---> UPDATE profiles (empresa_id, cargo="Admin")
        +---> INSERT user_roles (role="admin")
        +---> INSERT orbit_pipeline_stages (6 stages)
        +---> INSERT orbit_ai_config
        |
        v
Retorna { empresa, user, provision }
```

**Arquivos envolvidos:**
- Frontend: Paginas em `/pe-admin` (EmpresasPage, EmpresaDialog)
- Edge Function: `supabase/functions/create-empresa/index.ts`
- RPC: `pe_provision_tenant`

**Observacoes criticas:**
- `email_confirm: true` = e-mail ja marcado como confirmado (skip verificacao)
- NAO envia e-mail de boas-vindas
- Status `saas_empresa` = "active" direto (sem trial)
- Pipeline stages duplicados: cria tanto em `orbit_pipeline_stages` quanto em `funil_etapas` (via pe_provision_tenant)

---

### FLUXO B: Convite SaaS (via `/accept-invite`)

```text
Super Admin
        |
        v
Edge Function: create-empresa-invite
        +---> INSERT orbit_empresas (ativo=false)
        +---> INSERT saas_empresa (status="invited")
        +---> Gera token SHA-256 (32 bytes)
        +---> INSERT saas_invites (token_hash, expires 48h)
        +---> Envia e-mail via Resend (se configurado)
        +---> INSERT pe_audit_log (EMPRESA_INVITED)
        |
        v
Destinatario recebe e-mail com link
        |
        v
Frontend: /accept-invite?token=xxx
        +---> validate-invite (verifica token)
        +---> Wizard: nome, senha, CNPJ (se pago)
        |
        v
Edge Function: accept-empresa-invite
        +---> Valida token (hash, expiracao, uso)
        +---> auth.admin.createUser (email_confirm=true)
        +---> UPDATE profiles (empresa_id)
        +---> INSERT user_roles (role="admin")
        +---> UPDATE orbit_empresas (ativo=true, cnpj)
        +---> UPDATE saas_empresa:
        |        +---> Pago: status="trial", trial_ends_at=+7d
        |        +---> Demo: status="active"
        +---> UPDATE saas_invites (used_at, used_by)
        +---> Se !demo:
        |        +---> RPC pe_provision_tenant
        |        +---> INSERT orbit_pipeline_stages (6)
        |        +---> INSERT orbit_ai_config
        +---> Se pago:
        |        +---> RPC generate_unique_slug
        |        +---> UPDATE orbit_empresas (slug, public_url)
        +---> INSERT pe_audit_log (EMPRESA_ACTIVATED)
        |
        v
Retorna redirect_url (/{slug}/dashboard ou /demo/dashboard)
```

**Arquivos envolvidos:**
- Frontend: `src/pages/AcceptInviteSaasPage.tsx`
- Edge Functions: `create-empresa-invite`, `validate-invite`, `accept-empresa-invite`, `fetch-cnpj`
- RPC: `pe_provision_tenant`, `generate_unique_slug`

---

### FLUXO C: Setup Inicial (primeiro Super Admin)

```text
/auth detecta 0 super_admins
        |
        v
Redireciona para /setup
        |
        v
Edge Function: create-master-user
        +---> Verifica se ja existe super_admin
        +---> auth.admin.createUser (email_confirm=true)
        +---> UPDATE profiles (nome, cargo="Super Administrador")
        +---> INSERT user_roles (role="super_admin")
        |
        v
Redirect /auth → login → /pe-admin
```

**Arquivos envolvidos:**
- Frontend: `src/pages/SetupPage.tsx`, `src/pages/AuthPage.tsx`
- Edge Function: `supabase/functions/create-master-user/index.ts`

---

### FLUXO D: Login (pos-criacao)

```text
/auth → signIn()
        |
        v
AuthPage.resolveRedirect():
        +---> Se super_admin → /pe-admin
        +---> Se tem empresa_id com slug → /{slug}/dashboard
        +---> Senao → /demo/dashboard
```

---

### Tabelas Afetadas (consolidado)

| Tabela | Fluxo A | Fluxo B | Fluxo C |
|---|---|---|---|
| orbit_empresas | INSERT | INSERT + UPDATE | - |
| saas_empresa | INSERT | INSERT + UPDATE | - |
| saas_invites | - | INSERT + UPDATE | - |
| saas_plans | SELECT | SELECT | - |
| auth.users | createUser | createUser | createUser |
| profiles | UPDATE | UPDATE | UPDATE |
| user_roles | INSERT | INSERT | INSERT |
| organizations | INSERT (via RPC) | INSERT (via RPC) | - |
| pe_tenant_map | INSERT (via RPC) | INSERT (via RPC) | - |
| produtos | INSERT (via RPC) | INSERT (via RPC) | - |
| funil_etapas | INSERT (via RPC) | INSERT (via RPC) | - |
| orbit_pipeline_stages | INSERT | INSERT | - |
| orbit_ai_config | INSERT | INSERT | - |
| pe_audit_log | INSERT (via RPC) | INSERT x2 | - |

---

## PASSO 2 — PONTOS DE INSERCAO

### 1. Melhor ponto para e-mail de boas-vindas

**Fluxo A (create-empresa):** Apos a linha 94 (`return ok(...)`) — mas ANTES do return, apos confirmar que empresa + usuario foram criados com sucesso. Especificamente apos `user_roles.insert` (linha 78) e antes do `return ok` (linha 94).

**Fluxo B (accept-empresa-invite):** Ja envia e-mail de convite no `create-empresa-invite`. O e-mail de boas-vindas pos-ativacao poderia ser disparado no `accept-empresa-invite` apos o audit log (linha 173), imediatamente antes do `return ok`.

### 2. Validacao de e-mail confirmado

**Situacao atual:** Todos os fluxos usam `email_confirm: true` no `createUser`, o que marca o e-mail como ja confirmado automaticamente. NAO existe verificacao real de e-mail em nenhum fluxo.

Para implementar verificacao real:
- Fluxo A: Mudar para `email_confirm: false` e enviar link de confirmacao
- Fluxo B: Ja possui validacao implicita (usuario recebeu o e-mail de convite, prova que o e-mail e valido)

### 3. Logica de trial

**Existe:** Sim, apenas no Fluxo B (`accept-empresa-invite`):
- `activated_at`: timestamp da ativacao
- `trial_ends_at`: `now + 7 dias` para planos pagos
- `status`: "trial" (pagos) ou "active" (demo)

**NAO existe no Fluxo A:** `create-empresa` define `status: "active"` direto, sem trial.

### 4. Controle de status da empresa

**create-empresa:** `ativo: true` direto, sem controle granular
**create-empresa-invite:** `ativo: false` na criacao, `ativo: true` na ativacao — controle correto
**saas_empresa.status:** "invited" → "trial"/"active" — correto no Fluxo B, ausente no A

---

## PASSO 3 — PROPOSTA DE IMPLEMENTACAO SEGURA

### Estrategia recomendada: Envio de e-mail dentro das Edge Functions existentes

**Opcao A (recomendada): Adicionar envio de e-mail diretamente nas Edge Functions existentes**

Motivo: Evita criar funcoes extras, garante que o e-mail so e enviado quando a operacao toda foi bem-sucedida.

```text
create-empresa:
  ... (fluxo existente) ...
  → Apos audit log, antes do return ok:
  → Buscar Resend API key (mesma logica de create-empresa-invite)
  → Enviar e-mail de boas-vindas ao admin_email
  → Log de envio (sucesso/falha) — nao bloquear o return

accept-empresa-invite:
  ... (fluxo existente) ...
  → Apos audit log EMPRESA_ACTIVATED, antes do return ok:
  → Enviar e-mail de "conta ativada com sucesso"
  → Incluir link de acesso (redirect_url)
```

**Como evitar envio duplicado:**
- No `create-empresa`: Verificar se ja existe registro em `pe_audit_log` com `action=WELCOME_EMAIL_SENT` para o `empresa_id`
- No `accept-empresa-invite`: O convite so pode ser usado uma vez (`used_at` not null = ja usado), entao duplicacao ja e impossivel

**Como garantir que apenas empresas criadas com sucesso disparem:**
- O e-mail e enviado DEPOIS de todos os INSERTs/UPDATEs terem sucesso
- Se qualquer etapa anterior falhar, a funcao retorna erro antes de chegar ao ponto de envio
- Envio de e-mail e fire-and-forget (falha de envio nao reverte a criacao)

---

## RISCOS POTENCIAIS

| Risco | Severidade | Mitigacao |
|---|---|---|
| Resend API key nao configurada | Media | Ja tratado: log warning e continua sem enviar |
| E-mail duplicado em retry | Baixa | Idempotencia via check em audit_log |
| Pipeline stages duplicados (Fluxo A cria em orbit_pipeline_stages E funil_etapas via RPC) | Media | Revisar se ambos sao necessarios ou unificar |
| Fluxo A nao aplica trial | Media | Alinhar logica: aplicar trial tambem no Fluxo A para planos pagos |
| `email_confirm: true` pula verificacao real | Alta | Manter para Fluxo B (convite ja prova e-mail). Avaliar para Fluxo A |
| Falha no pe_provision_tenant nao bloqueia criacao | Media | Empresa existe sem PE. Ja tratado com try/catch mas sem rollback |

---

## CHECKLIST ANTES DE IMPLEMENTAR

- [ ] Confirmar que RESEND_API_KEY ou `orbit_resend_config` global esta configurado
- [ ] Decidir se Fluxo A (create-empresa) deve aplicar logica de trial
- [ ] Decidir se `email_confirm` deve continuar como `true` no Fluxo A
- [ ] Definir template HTML do e-mail de boas-vindas (reutilizar estrutura do convite?)
- [ ] Definir se o e-mail de pos-ativacao (Fluxo B) e necessario alem do convite
- [ ] Resolver duplicacao de pipeline stages (orbit_pipeline_stages vs funil_etapas)
- [ ] Testar cenario de falha parcial: empresa criada mas e-mail falhou
- [ ] Verificar rate limits do Resend para envios em massa

