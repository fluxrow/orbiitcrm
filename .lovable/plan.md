

O usuário quer que o e-mail de recuperação de senha seja enviado pela API do Resend (em vez do Resend padrão do Supabase). O domínio `fluxrow.pro` já está em uso para emails do sistema (vide `supabase/functions/_shared/system-email.ts`), e a chave `PE_RESEND_API_KEY` já está configurada como secret.

A forma correta de fazer isso no Supabase é usar o **Auth Email Hook** (Send Email Hook), que intercepta os emails de auth e permite enviá-los pelo provedor próprio (Resend). Já existe a ferramenta `email_domain--scaffold_auth_email_templates` que faz exatamente esse scaffold.

Plano enxuto:

# Enviar e-mail de recuperação via Resend (@fluxrow.pro)

## Estratégia

Usar o **Auth Email Hook** do Supabase para interceptar o e-mail de recuperação e enviá-lo via Resend, com a identidade `Orbit CRM <orbit@fluxrow.pro>` — mantendo consistência com os outros emails de sistema (`system-email.ts`).

## Etapas

### 1. Scaffold do Auth Email Hook
- Rodar `email_domain--scaffold_auth_email_templates` (o domínio `fluxrow.pro` já está configurado).
- Isso cria:
  - `supabase/functions/auth-email-hook/index.ts` — função que roteia eventos de auth pelo Resend
  - `supabase/functions/_shared/email-templates/recovery.tsx` — template React Email do reset de senha
  - Mais 5 templates (signup, magic-link, invite, email-change, reauthentication) com branding consistente
  - Atualização de `supabase/config.toml`

### 2. Customizar o template `recovery.tsx`
- Remetente: `Orbit CRM <orbit@fluxrow.pro>`
- Assunto: **"Recuperação de senha - Orbit"**
- Corpo conforme spec original:
  - Aviso de solicitação
  - Botão **"Redefinir senha"** apontando para `{{ .ConfirmationURL }}` (Supabase preenche com o link real e token seguro)
  - Aviso de validade (60 minutos)
  - "Se não foi você, ignore este e-mail"
- Identidade visual leve do Orbit (cores do `index.css`, tipografia limpa, tom escuro/claro consistente)

### 3. Aplicar o mesmo branding leve nos outros 5 templates
- Apenas header/footer/cores consistentes — para evitar inconsistência caso o Supabase use outro evento (ex: invite).

### 4. Deploy
- `supabase--deploy_edge_functions(["auth-email-hook"])` para ativar o hook.
- Após o deploy, o Supabase passa a rotear todos os emails de auth pela função, que envia via Resend usando `PE_RESEND_API_KEY` (já configurada).

## O que NÃO precisa mudar

- Frontend (`ForgotPasswordDialog.tsx`, `ResetPasswordPage.tsx`): continuam chamando `supabase.auth.resetPasswordForEmail()` e `supabase.auth.updateUser()`. O hook é transparente.
- Token, expiração, uso único, hash de senha: gerenciados nativamente pelo Supabase Auth.

## Arquivos afetados

| Arquivo | Ação |
|---|---|
| `supabase/functions/auth-email-hook/index.ts` | **Novo** (scaffold) — roteia auth emails via Resend |
| `supabase/functions/auth-email-hook/deno.json` | **Novo** (scaffold) — config JSX |
| `supabase/functions/_shared/email-templates/recovery.tsx` | **Novo** (scaffold) + customização Orbit |
| `supabase/functions/_shared/email-templates/*.tsx` | **Novo** (scaffold) — branding leve consistente |
| `supabase/config.toml` | Atualizado pelo scaffold |

