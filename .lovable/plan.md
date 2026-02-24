

# Adicionar botao "Sair" na sidebar do Orbit

## Problema
A area de usuario no rodape da sidebar mostra "Usuario" e "Admin" estaticamente, sem opcao de deslogar. O usuario quer um botao de sair.

## Solucao

Editar `src/components/orbit/OrbitSidebar.tsx`:

1. Importar `useAuth` para obter `user` e `signOut`
2. Importar `useNavigate` para redirecionar apos logout
3. Importar `LogOut` do lucide-react
4. Mostrar nome/email real do usuario (iniciais no avatar, nome e email nos textos)
5. Adicionar botao "Sair" com icone `LogOut` que chama `signOut()` e redireciona para `/`

### Detalhes da area de usuario (rodape da sidebar)

```text
┌─────────────────────────────┐
│  [Avatar]  Nome do Usuario  │
│           email@example.com │
│  [LogOut] Sair              │
└─────────────────────────────┘
```

- Avatar: exibe inicial do nome ou email
- Nome: `user.user_metadata?.nome` ou email
- Subtexto: email do usuario
- Botao "Sair": `variant="ghost"`, icone LogOut, chama `signOut()` e `navigate("/")`

### Arquivo

| Acao | Arquivo |
|---|---|
| Editar | `src/components/orbit/OrbitSidebar.tsx` |

