

# Etapa 4X.2 -- Edge Function `create-empresa-invite`

## Objetivo

Edge function que permite ao Super Admin pre-cadastrar uma empresa e enviar convite por email com link seguro de ativacao.

---

## 1. Nova Edge Function

**Arquivo:** `supabase/functions/create-empresa-invite/index.ts`

### Entrada (POST body)

```text
{
  empresa_nome: string,
  responsible_name: string,
  responsible_email: string,
  plan_code: "demo" | "basic" | "professional" | "plus"
}
```

### Fluxo completo

1. **Autenticacao** -- Extrair JWT do header Authorization, validar via `supabaseAdmin.auth.getUser(token)`, verificar role `super_admin` em `user_roles` (mesmo padrao de `create-empresa`).

2. **Buscar plan_id** -- `SELECT id FROM saas_plans WHERE code = plan_code`. Retornar 400 se nao encontrar.

3. **Criar orbit_empresas** -- Inserir registro com `nome = empresa_nome`, `ativo = false` (status pendente). NAO provisionar PE tenant, NAO criar auth user.

4. **Upsert saas_empresa** -- Inserir com:
   - `empresa_id`, `plan_id`
   - `status = 'invited'`
   - `responsible_name`, `responsible_email`
   - `invited_at = now()`
   - `created_by_user_id = user.id`

5. **Invalidar convites anteriores** -- Buscar convites ativos (`used_at IS NULL AND expires_at > now()`) para o mesmo `responsible_email`. Se existir, atualizar `expires_at = now()` para invalidar.

6. **Gerar token** -- Gerar 32 bytes aleatorios via `crypto.getRandomValues()`, converter para hex. Calcular SHA-256 e armazenar apenas o hash.

7. **Inserir saas_invites** -- Com `empresa_id`, `email`, `responsible_name`, `token_hash`, `expires_at = now() + 48h`, `created_by_user_id`.

8. **Enviar email** -- Chamar a API Resend diretamente (reutilizando o padrao de `orbit-send-email`: buscar config em `orbit_resend_config` ou fallback para env `RESEND_API_KEY`). Email contem:
   - Nome da empresa
   - Plano selecionado
   - Link: `https://{APP_URL}/accept-invite?token={TOKEN_PLAINTEXT}`
   - CTA button

9. **Audit log** -- Inserir em `pe_audit_log`:
   - `action = 'EMPRESA_INVITED'`
   - `entity_type = 'saas_invites'`
   - metadata com `empresa_id`, `email`, `plan_code`

10. **Retorno** -- `{ empresa_id, invite_id, expires_at }`

### Tratamento de erros

- 401: sem Authorization header ou token invalido
- 403: usuario nao e super_admin
- 400: campos obrigatorios faltando ou plan_code invalido
- 500: erros internos (com rollback da empresa se falhar apos criacao)

---

## 2. Config TOML

Adicionar em `supabase/config.toml`:

```text
[functions.create-empresa-invite]
verify_jwt = false
```

`verify_jwt = false` porque a validacao e feita manualmente no codigo (padrao existente).

---

## 3. Geracao segura do token

```text
// Gerar 32 bytes aleatorios
const tokenBytes = new Uint8Array(32);
crypto.getRandomValues(tokenBytes);
const tokenPlaintext = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('');

// Hash SHA-256 para armazenamento
const encoder = new TextEncoder();
const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(tokenPlaintext));
const tokenHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
```

O `tokenPlaintext` vai no link do email. Apenas `tokenHash` e salvo no banco.

---

## 4. Template do email

HTML simples com:
- Logo/header Orbit
- "Voce foi convidado para {empresa_nome}"
- "Plano: {plan_name}"
- Botao CTA: "Ativar Minha Conta"
- Texto de expiracao: "Este link expira em 48 horas"

---

## 5. URL do app

A URL base do app sera obtida de:
1. Variavel de ambiente `APP_URL` (se configurada)
2. Fallback: header `Origin` ou `Referer` da requisicao
3. Fallback final: URL do preview do projeto

---

## 6. Resumo de arquivos

| Arquivo | Acao |
|---|---|
| `supabase/functions/create-empresa-invite/index.ts` | Novo -- edge function completa |
| `supabase/config.toml` | Adicionar entry `create-empresa-invite` com `verify_jwt = false` |

---

## Detalhes tecnicos

- O token plaintext nunca e armazenado no banco; apenas o SHA-256 hash. Quando o destinatario clicar no link, a pagina de aceitacao fara hash do token recebido e comparara com `token_hash` no banco.
- Convites anteriores para o mesmo email sao invalidados (expires_at = now()) antes de criar um novo, evitando tokens orfaos.
- A empresa e criada com `ativo = false` para nao aparecer como ativa ate o convite ser aceito.
- O email e enviado via Resend seguindo a mesma logica hierarquica de configuracao ja existente (`orbit_resend_config` da empresa -> global -> env).
- A funcao NAO cria auth user, NAO provisiona PE tenant -- isso sera feito na etapa de aceitacao do convite (futura edge function `accept-empresa-invite`).

