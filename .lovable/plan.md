

# Fix: Super admin redirecionado para /demo apos login

## Problema

Na `AuthPage.tsx`, a funcao `resolveRedirect` (linha 33-59) verifica apenas `profile.empresa_id`. Como o usuario `vagner.terres@hotmail.com` tem `empresa_id = null` (correto para super admin), o codigo cai no fallback e redireciona para `/demo/dashboard`.

```text
resolveRedirect():
  profile.empresa_id == null → navigate("/demo/dashboard")  ← BUG
```

## Solucao

Antes de verificar `empresa_id`, checar se o usuario e super admin (via `user_roles` ou `pe_users.is_super_admin`). Se for, redirecionar para `/pe-admin`.

Logica corrigida:

```text
resolveRedirect():
  1. Checar user_roles → se tem 'super_admin' → navigate("/pe-admin")
  2. Checar profile.empresa_id → se tem slug → navigate("/{slug}/dashboard")
  3. Fallback → navigate("/demo/dashboard")
```

## Arquivo

| Acao | Arquivo |
|---|---|
| Editar | `src/pages/AuthPage.tsx` — adicionar checagem de super admin antes do redirect |

Alteracao pontual na funcao `resolveRedirect` (linhas 33-59). Sem alteracao de banco de dados.

