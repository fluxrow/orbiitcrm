

# Plano: Padronizacao de Trial + Email de Boas-Vindas

---

## Resumo das Mudancas

Duas Edge Functions serao modificadas. Nenhuma RPC, trigger ou tabela sera alterada.

---

## FASE 1 — Padronizacao de Trial em `create-empresa`

**Arquivo:** `supabase/functions/create-empresa/index.ts`

**Mudanca:** Linhas 57-65 — substituir bloco de insercao `saas_empresa` que hoje usa `status: "active"` fixo.

**Antes:**
```text
const planCode = body.plano_saas || "demo";
try {
  const { data: planRow } = await supabaseAdmin.from("saas_plans").select("id").eq("code", planCode).single();
  if (planRow) {
    await supabaseAdmin.from("saas_empresa").insert({
      empresa_id: empresa.id, plan_id: planRow.id, status: "active", created_by_user_id: user.id,
    });
  }
} catch (e) { ... }
```

**Depois:**
```text
const planCode = body.plano_saas || "demo";
const isPaid = ["basic", "professional", "plus"].includes(planCode);
let planName = planCode;
try {
  const { data: planRow } = await supabaseAdmin.from("saas_plans").select("id, name").eq("code", planCode).single();
  if (planRow) {
    planName = planRow.name;
    const now = new Date();
    const saasInsert = {
      empresa_id: empresa.id, plan_id: planRow.id, created_by_user_id: user.id,
      activated_at: now.toISOString(),
      status: isPaid ? "trial" : "active",
      trial_ends_at: isPaid ? new Date(now.getTime() + 7 * 86400000).toISOString() : undefined,
    };
    await supabaseAdmin.from("saas_empresa").insert(saasInsert);
  }
} catch (e) { ... }
```

**Efeito:** Planos pagos iniciam com `status=trial` + `trial_ends_at=now+7d`. Demo continua `status=active`. Mesma regra do Fluxo B.

---

## FASE 2 — Email de Boas-Vindas

### 2A. `create-empresa` (Fluxo A)

**Ponto de insercao:** Apos linha 92 (insert `orbit_ai_config`), antes do `return ok` na linha 94.

**Adicionar:**
1. Funcao `getResendApiKey()` — reutilizada do `create-empresa-invite` (lookup `orbit_resend_config` global, fallback `RESEND_API_KEY` env)
2. Funcao `buildWelcomeEmailHtml()` — template HTML simples com nome do admin, nome da empresa, nome do plano
3. INSERT `pe_audit_log` com `action=EMPRESA_ACTIVATED`
4. Idempotency check: SELECT `pe_audit_log` WHERE `action=WELCOME_EMAIL_SENT` AND `entity_id=empresa.id`
5. Se nao existir → enviar e-mail via Resend → INSERT `pe_audit_log` com `action=WELCOME_EMAIL_SENT`
6. Todo o bloco de e-mail dentro de try/catch — falha nao bloqueia o return

### 2B. `accept-empresa-invite` (Fluxo B)

**Ponto de insercao:** Apos linha 177 (audit log `EMPRESA_ACTIVATED`), antes do `return ok` na linha 181.

**Adicionar:**
1. Funcao `getResendApiKey()` — mesma logica
2. Funcao `buildActivationEmailHtml()` — template com nome, empresa, plano e botao com `redirect_url`
3. Idempotency check: SELECT `pe_audit_log` WHERE `action=WELCOME_EMAIL_SENT` AND `entity_id=invite.empresa_id`
4. Se nao existir → enviar e-mail "Conta ativada com sucesso" → INSERT `WELCOME_EMAIL_SENT`
5. Tambem extrair `planName` do join ja existente (`saas_plans.name`) para uso no template

---

## FASE 3 — Nao Alterados

| Componente | Status |
|---|---|
| `pe_provision_tenant` RPC | Inalterado |
| `generate_unique_slug` RPC | Inalterado |
| `create-empresa-invite` | Inalterado |
| `validate-invite` | Inalterado |
| `email_confirm: true` | Mantido |
| Logica de convite | Inalterada |

---

## Garantias de Idempotencia

- **create-empresa:** Antes de enviar, verifica `pe_audit_log` com `action=WELCOME_EMAIL_SENT` e `entity_id=empresa_id`. Se existir, pula envio.
- **accept-empresa-invite:** Mesma verificacao. Adicionalmente, o convite so pode ser usado uma vez (`used_at` not null), tornando duplicacao por replay impossivel.
- **WELCOME_EMAIL_SENT** so e inserido APOS resposta 200 do Resend, garantindo que log = envio real.

---

## Tabelas Impactadas

| Tabela | Mudanca |
|---|---|
| `saas_empresa` | Fluxo A agora insere `activated_at`, `trial_ends_at` (planos pagos), `status=trial` |
| `pe_audit_log` | Novos registros: `EMPRESA_ACTIVATED` (Fluxo A) e `WELCOME_EMAIL_SENT` (ambos) |
| `orbit_resend_config` | Somente leitura (lookup de API key) |

Nenhuma tabela nova. Nenhuma migracao SQL necessaria.

---

## Arquivos Modificados

| Arquivo | Tipo |
|---|---|
| `supabase/functions/create-empresa/index.ts` | Trial unificado + audit log + welcome email |
| `supabase/functions/accept-empresa-invite/index.ts` | Activation email + idempotency check |

---

## Detalhes Tecnicos

### Funcoes auxiliares adicionadas em cada Edge Function

```text
getResendApiKey(supabase) → { apiKey, fromEmail }
  - SELECT orbit_resend_config WHERE empresa_id IS NULL
  - Fallback: Deno.env.get("RESEND_API_KEY")

buildWelcomeEmailHtml(empresaNome, planName, adminNome) → string
  (apenas em create-empresa)

buildActivationEmailHtml(empresaNome, planName, userName, redirectUrl) → string
  (apenas em accept-empresa-invite)
```

### Novo audit action codes

- `EMPRESA_ACTIVATED` — ja existe no Fluxo B, adicionado ao Fluxo A
- `WELCOME_EMAIL_SENT` — novo, registrado em ambos os fluxos apos envio bem-sucedido

