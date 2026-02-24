

# Fix: Pagina /demo em branco

## Problema

Na configuracao de rotas em `App.tsx`, a rota `/demo` tem apenas um filho com `path="*"`:

```text
<Route path="/demo" element={<TenantLayout isDemo />}>
  <Route path="*" element={<OrbitRoutes />} />
</Route>
```

Em React Router v6, `path="*"` nao corresponde ao caminho vazio (index). Quando o usuario acessa `/demo` exatamente, nenhum filho corresponde, e o `<Outlet />` do `TenantContent` renderiza nada -- tela em branco.

Acessando `/demo/dashboard` diretamente funciona normalmente.

## Solucao

Adicionar uma rota `index` que redireciona para `dashboard`:

```text
<Route path="/demo" element={<TenantLayout isDemo />}>
  <Route index element={<Navigate to="dashboard" replace />} />
  <Route path="*" element={<OrbitRoutes />} />
</Route>
```

Fazer o mesmo para a rota de slug `/:slug`:

```text
<Route path="/:slug" element={<TenantLayout />}>
  <Route index element={<Navigate to="dashboard" replace />} />
  <Route path="*" element={<OrbitRoutes />} />
</Route>
```

## Arquivo

| Acao | Arquivo |
|---|---|
| Editar | `src/App.tsx` — adicionar `<Route index>` nos dois blocos de tenant |

Alteracao de 2 linhas. Sem alteracao de banco de dados.

