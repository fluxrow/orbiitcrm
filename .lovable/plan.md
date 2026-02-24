

# Fluxo de Autenticacao no /demo

## Situacao Atual

Quando o usuario acessa `/demo`, o `TenantLayout` verifica se esta logado. Se nao estiver, redireciona para `/auth`. Depois do login em `/auth`, o redirect resolve o slug da empresa ou manda para `/demo/dashboard`.

## Problema

O usuario quer que ao acessar `/demo`:
1. Se ja estiver logado, entre direto como usuario do sistema
2. Se nao estiver logado, mostre um formulario de cadastro/login inline (sem redirecionar para `/auth`)

## Plano

### Alteracao 1: `src/pages/tenant/TenantLayout.tsx`

Quando `isDemo=true` e o usuario nao esta logado, em vez de redirecionar para `/auth`, renderizar um componente de autenticacao inline (login + cadastro) diretamente na pagina `/demo`.

Criar um componente `DemoAuthGate` que:
- Mostra formulario com duas abas: "Entrar" e "Criar Conta"
- Campos de cadastro: nome, email, senha
- Campos de login: email, senha
- Usa as funcoes `signIn`/`signUp` do `useAuth`
- Apos autenticacao, o `TenantLayout` detecta o usuario e renderiza o `Outlet` normalmente

### Alteracao 2: `src/pages/tenant/TenantLayout.tsx` (TenantContent)

Mudar a logica do bloco `if (!user)`:

```text
ANTES:
  if (!user) return <Navigate to="/auth" replace />;

DEPOIS:
  if (!user && tenant.isDemo) return <DemoAuthGate />;
  if (!user) return <Navigate to="/auth" replace />;
```

Para tenants com slug (nao-demo), mantém o redirect para `/auth`.

### Componente DemoAuthGate (inline no mesmo arquivo)

- Logo Orbit no topo
- Titulo "Acesse o Orbit CRM"
- Formulario com toggle login/cadastro
- Campos: nome (so cadastro), email, senha
- Botao submit
- Estilizado com `glass-card`, consistente com o design existente do AuthPage
- Usa `useAuth()` para `signIn` e `signUp`

### Resumo de Arquivos

| Tipo | Arquivo |
|---|---|
| Edit | `src/pages/tenant/TenantLayout.tsx` |

Nenhuma alteracao de banco de dados necessaria -- o trigger `handle_new_user` e `handle_new_user_pe` ja criam automaticamente os registros em `profiles` e `pe_users` ao cadastrar.

