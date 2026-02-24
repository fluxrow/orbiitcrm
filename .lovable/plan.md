

# Adicionar header do hotsite em todas as paginas publicas (nao autenticadas)

## Paginas afetadas

Rotas publicas que devem ter o header:
- `/` (LandingPage) — ja tem
- `/auth` (AuthPage)
- `/trial` (TrialPage)
- `/demo` (DemoAuthGate, antes do login)
- `/documentacao` (DocumentacaoPage)
- `/invite/:token` (AcceptInvitePage)
- `/accept-invite` (AcceptInviteSaasPage)
- `/setup` (SetupPage)

## Plano

### 1. Criar `src/components/HotsiteHeader.tsx`

Extrair o header fixo da `LandingPage.tsx` (logo, nav desktop com links Produto/Recursos/Planos/FAQ, botoes Acessar Demo/Entrar/Começar Trial, menu mobile hamburger) para um componente reutilizavel.

- Links de ancora (`#como-funciona`, `#recursos`, etc.) passam a usar `navigate("/#como-funciona")` para funcionar de qualquer pagina
- Manter estilo `fixed top-0`, `glass-card`, altura `h-16`

### 2. Criar `src/layouts/PublicLayout.tsx`

Layout wrapper que renderiza:
```text
<HotsiteHeader />
<div className="pt-16">  ← compensa header fixo
  <Outlet />
</div>
```

### 3. Atualizar `src/App.tsx`

Agrupar as rotas publicas dentro do `PublicLayout`:

```text
<Route element={<PublicLayout />}>
  <Route path="/" element={<LandingPage />} />
  <Route path="/auth" element={<AuthPage />} />
  <Route path="/trial" element={<TrialPage />} />
  <Route path="/documentacao" element={<DocumentacaoPage />} />
  <Route path="/setup" element={<SetupPage />} />
  <Route path="/invite/:token" element={<AcceptInvitePage />} />
  <Route path="/accept-invite" element={<AcceptInviteSaasPage />} />
</Route>
```

### 4. Atualizar `src/pages/LandingPage.tsx`

- Remover o header inline (ja vem do `PublicLayout`)
- Remover o `pt-32` do hero e ajustar para `pt-16` (o `pt-16` do layout ja compensa o header, hero precisa apenas de spacing interno)

### 5. Atualizar `src/pages/tenant/TenantLayout.tsx`

Quando `isDemo && !user` (DemoAuthGate), renderizar `<HotsiteHeader />` acima do formulario de auth, com `pt-16` no conteudo.

### 6. Ajustar paginas individuais

- `AuthPage.tsx`: remover `min-h-screen` (o layout ja cuida) ou manter — nao conflita
- `TrialPage.tsx`: idem

### Resumo de arquivos

| Acao | Arquivo |
|---|---|
| Criar | `src/components/HotsiteHeader.tsx` |
| Criar | `src/layouts/PublicLayout.tsx` |
| Editar | `src/App.tsx` |
| Editar | `src/pages/LandingPage.tsx` |
| Editar | `src/pages/tenant/TenantLayout.tsx` |

Nenhuma alteracao de banco de dados.

