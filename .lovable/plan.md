

Plan: implementar fluxo de "Esqueci minha senha" no Orbit usando Supabase Auth + emails customizados via auth-email-hook do domínio @fluxrow.pro.

Análise:
- O projeto usa Supabase Auth (`useAuth` em `src/hooks/useAuth.tsx`).
- A tela de login (`src/pages/AuthPage.tsx`) NÃO tem link de recuperação.
- Não existe rota `/reset-password`.
- Não existe `auth-email-hook` no projeto — emails de auth hoje saem com template padrão do Supabase.
- O domínio `fluxrow.pro` já é usado para emails de sistema (`orbit@fluxrow.pro`), então provavelmente já está verificado no workspace.
- Supabase Auth já gerencia tokens seguros, expiração, uso único e hash de senha — não precisamos reinventar isso.

# Fluxo de Recuperação de Senha

## 1. Modal "Esqueci minha senha" na tela de login

**Arquivo:** `src/pages/AuthPage.tsx`

- Adicionar link "Esqueci minha senha?" abaixo do campo de senha (visível apenas no modo login).
- Criar componente novo `src/components/auth/ForgotPasswordDialog.tsx` (Dialog do shadcn) com:
  - Título "Recuperar senha" + texto de apoio
  - Campo email com validação (zod: obrigatório + formato)
  - Estados: idle / loading / success / error
  - Botão "Enviar link de recuperação" (loading com spinner)
  - Botão "Voltar para login"
  - Auto-foco no email, submit no Enter, bloqueio durante envio
- Lógica de envio: `supabase.auth.resetPasswordForEmail(email, { redirectTo: \`${window.location.origin}/reset-password\` })`
- Resposta sempre neutra: "Se este e-mail estiver cadastrado, enviaremos um link..."
- Toast em caso de erro técnico (ex: rate limit do Supabase).

## 2. Página `/reset-password`

**Arquivos:**
- `src/pages/ResetPasswordPage.tsx` (novo)
- `src/App.tsx` (registrar rota pública dentro de `PublicLayout`)

**Comportamento:**
- Estado "validando token" → Supabase coloca a sessão de recovery automaticamente via hash da URL. Detectar via `onAuthStateChange` evento `PASSWORD_RECOVERY`.
- Se não houver sessão de recovery após mount, exibir tela "Link inválido ou expirado" com botão "Solicitar novo link" (volta para `/auth` e abre o modal).
- Formulário: nova senha + confirmar senha
  - Validação zod: mínimo 8 caracteres, senhas coincidem, ambos obrigatórios
- Submit: `supabase.auth.updateUser({ password })`
- Sucesso: toast "Senha redefinida com sucesso" → `signOut()` → redirecionar `/auth`
- Erros tratados com mensagens amigáveis

## 3. Email customizado pelo domínio @fluxrow.pro

**Pré-requisito:** verificar se `fluxrow.pro` já está configurado como domínio de email no workspace (já é usado em `system-email.ts`). Se sim, o setup só precisa scaffoldar o hook.

**Ação:** scaffoldar `auth-email-hook` para customizar o template de **recovery** com:
- Remetente: `Orbit CRM <orbit@fluxrow.pro>`
- Assunto: "Recuperação de senha - Orbit"
- Corpo conforme spec (aviso, botão "Redefinir senha", validade 60 min, ignorar se não foi você)
- Aplicar identidade visual do Orbit (cores do `index.css`, logo se disponível em `src/assets`)

**Sequência:**
1. `email_domain--scaffold_auth_email_templates`
2. Customizar `recovery.tsx` (e demais templates com branding leve do Orbit)
3. `supabase--deploy_edge_functions(["auth-email-hook"])`
4. Botão `<lov-open-email>` para o usuário monitorar status

> Token, expiração (Supabase default 1h, configurável), uso único e hash seguro são gerenciados nativamente pelo Supabase Auth — nada a implementar.

## 4. Rota e navegação

`src/App.tsx`:
```
<Route path="/reset-password" element={<ResetPasswordPage />} />
```
Dentro de `PublicLayout` (rota pública, sem `ProtectedRoute`).

## Arquivos afetados

| Arquivo | Ação |
|---|---|
| `src/components/auth/ForgotPasswordDialog.tsx` | **Novo** — modal com form + estados |
| `src/pages/AuthPage.tsx` | Adicionar link "Esqueci minha senha?" + integrar dialog |
| `src/pages/ResetPasswordPage.tsx` | **Novo** — página de redefinição |
| `src/App.tsx` | Registrar rota `/reset-password` |
| `supabase/functions/auth-email-hook/index.ts` | **Novo** (scaffold) — roteia emails de auth |
| `supabase/functions/_shared/email-templates/recovery.tsx` | **Novo** (scaffold) — customizar para Orbit |
| `supabase/functions/_shared/email-templates/*.tsx` | **Novo** (scaffold) — branding consistente |
| `supabase/config.toml` | Atualizado pelo scaffold |

