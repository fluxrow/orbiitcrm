

## Traduzir alertas do Supabase Auth na redefinição de senha

**Problema:** Mensagens de erro do Supabase aparecem em inglês (ex: "New password should be different from the old password") porque `toast.error(error.message)` exibe o erro bruto.

**Solução:** Criar um mapeador de mensagens do Supabase Auth para PT-BR em `ResetPasswordPage.tsx`, cobrindo os erros mais comuns no fluxo de redefinição:

| Mensagem original (Supabase) | Tradução PT-BR |
|---|---|
| "New password should be different from the old password" | "A nova senha deve ser diferente da senha atual." |
| "Password should be at least 6 characters" / similar | "A senha deve ter pelo menos 8 caracteres." |
| "Auth session missing" / "session_not_found" | "Sessão expirada. Solicite um novo link de recuperação." |
| "Token has expired or is invalid" | "Link expirado ou inválido. Solicite um novo link." |
| "Password is too weak" / "weak_password" | "Senha muito fraca. Use letras, números e símbolos." |
| "Email rate limit exceeded" / "over_email_send_rate_limit" | "Muitas tentativas. Aguarde alguns minutos e tente novamente." |
| Fallback (qualquer outro) | "Não foi possível redefinir sua senha. Tente novamente." |

**Mudança:**

- `src/pages/ResetPasswordPage.tsx`: adicionar função `translateAuthError(error)` que inspeciona `error.message` e `error.code` (case-insensitive, busca por substring) e retorna o texto em PT-BR. Trocar `toast.error(error.message || ...)` por `toast.error(translateAuthError(error))`.

Sem mudanças em outros arquivos — o `ForgotPasswordDialog` já está todo em PT-BR.

