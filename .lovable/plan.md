

# Adicionar aba "Usuários" nas Configurações para ORG_ADMIN

## Objetivo

Permitir que administradores da organização (ORG_ADMIN) gerenciem usuários diretamente pela página de Configurações (`/config`), adicionando uma nova aba "Usuários" ao lado das abas existentes (IA, Z-API, Email, Importar).

## Alterações

| Arquivo | Alteração |
|---|---|
| `src/pages/orbit/ConfigPage.tsx` | Adicionar aba "Usuários" com a funcionalidade completa de listar, adicionar e convidar usuários da organização. Visível apenas para ORG_ADMIN. |

### Detalhes

A nova aba "Usuários" reutilizará os hooks já existentes:
- `usePeAuth` para verificar se o usuário é ORG_ADMIN
- `useOrgUsers` para listar usuários
- `useAddOrgUser` para adicionar diretamente
- `useInviteUser` para convidar por email
- `useUpdateOrgUser` para alterar papel/status
- `usePeRoles` para listar papéis disponíveis
- `useOrgInvitations` / `useCancelInvitation` para convites pendentes

A aba só aparecerá no `TabsList` quando o usuário for ORG_ADMIN. O conteúdo incluirá:
1. Tabela de usuários da organização (nome, email, papel, status) com ações (alterar papel, ativar/inativar)
2. Botões "Adicionar" e "Convidar"
3. Seção de convites pendentes
4. Dialogs para adicionar usuário (nome, email, senha, papel) e convidar (nome, email, papel)

Essencialmente, o mesmo conteúdo da página `/org/users` será incorporado como uma aba dentro de Configurações.

