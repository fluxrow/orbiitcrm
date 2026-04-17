

O usuário confirma que já existe configuração Resend ativa com `orbit@fluxrow.pro` no super admin (vide `system-email.ts` que lê de `orbit_resend_config` global e/ou `PE_RESEND_API_KEY`). Não precisa do fluxo de "configurar domínio" do Lovable nem do auth-email-hook scaffold padrão.

A solução é: criar uma edge function própria que envia o e-mail de recuperação via Resend (mesma chave/remetente do `system-email.ts`), e mudar o frontend para chamar essa função em vez do `supabase.auth.resetPasswordForEmail`.

Estratégia:
- Gerar o link de recovery no servidor via `supabase.auth.admin.generateLink({ type: 'recovery' })` — isso retorna o `action_link` com token seguro do Supabase, sem disparar o email default.
- Enviar via Resend usando `getSystemEmailConfig()` (mesmo padrão dos demais emails de sistema).
- Resposta neutra: sempre 200 OK, nunca revelar se o e-mail existe.

# Recuperação de Senha via Resend (@fluxrow.pro)

## Arquitetura

```
ForgotPasswordDialog
   │
   ▼
supabase.functions.invoke('orbit-send-recovery-email', { email })
   │
   ▼
Edge Function (verify_jwt=false, service role)
   ├─ admin.generateLink({ type:'recovery', redirectTo:/reset-password })  → action_link
   ├─ getSystemEmailConfig()  →  Orbit CRM <orbit@fluxrow.pro>
   ├─ Resend POST /emails  →  template HTML do Orbit
   └─ sempre retorna { ok:true } (resposta neutra)
```

## Mudanças

### 1. Nova edge function `orbit-send-recovery-email`
- `verify_jwt = false` (usuário não está autenticado)
- Input: `{ email }`
- Validação: formato de email; se inválido, ainda retorna `{ ok:true }` (anti-enumeração)
- Usa **service role** para chamar `supabase.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: \`${APP_URL}/reset-password\` } })`
- Se o usuário não existir, `generateLink` retorna erro → captura e retorna `{ ok:true }` mesmo assim
- Se gerou link: envia via Resend com:
  - **From**: `Orbit CRM <orbit@fluxrow.pro>` (via `getSystemEmailConfig`)
  - **Subject**: "Recuperação de senha - Orbit"
  - **HTML**: template inline com identidade do Orbit (dark, glass-card vibe), botão "Redefinir senha" → `action_link`, aviso de validade 60 min, "se não foi você, ignore"
- Logs estruturados (sem expor email completo) para auditoria
- Sempre retorna `{ ok: true, data: { sent: true } }` no formato padrão

### 2. `supabase/config.toml`
- Adicionar bloco `[functions.orbit-send-recovery-email]` com `verify_jwt = false`

### 3. `src/components/auth/ForgotPasswordDialog.tsx`
- Trocar `supabase.auth.resetPasswordForEmail(...)` por `supabase.functions.invoke('orbit-send-recovery-email', { body: { email } })`
- Manter validação zod, estados (idle/loading/success), mensagem neutra de sucesso, tratamento de rate limit
- Sem mudança visual

### 4. (Opcional) Limpar scaffold do hook
- Remover `supabase/functions/auth-email-hook/*` e `supabase/functions/_shared/email-templates/*` se foram criados, e bloco correspondente do `config.toml` — para evitar dois caminhos paralelos. **Confirmar com o usuário se quer remover.**

## O que NÃO muda

- `ResetPasswordPage.tsx`: continua igual — o link gerado pelo `admin.generateLink` ativa a sessão de recovery do Supabase normalmente, e a página detecta via `onAuthStateChange`/hash URL.
- Token, expiração (1h padrão Supabase), uso único, hash da nova senha: nativos do Supabase Auth.

## Arquivos afetados

| Arquivo | Ação |
|---|---|
| `supabase/functions/orbit-send-recovery-email/index.ts` | **Novo** — gera link + envia via Resend |
| `supabase/config.toml` | Adicionar `verify_jwt=false` para a função |
| `src/components/auth/ForgotPasswordDialog.tsx` | Trocar chamada para a edge function |
| `supabase/functions/auth-email-hook/*` | (opcional) remover scaffold se existir |

