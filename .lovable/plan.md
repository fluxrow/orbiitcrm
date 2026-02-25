

# Adicionar botão "Reenviar Convite" nos Convites Pendentes

## Problema
Na seção de convites pendentes (aba Usuários em Configurações), só existe o botão "Cancelar". Quando o email não chega ou o convite está próximo de expirar, o admin precisa cancelar e criar um novo convite manualmente.

## Solução

Adicionar um botão "Reenviar" ao lado do "Cancelar" em cada convite pendente. O reenvio vai chamar a Edge Function `invite-org-user` existente com os mesmos dados do convite original (o que cancela implicitamente o antigo ao criar um novo com token fresco e nova data de expiração).

### Alterações

| Arquivo | Alteração |
|---|---|
| `src/hooks/usePeInvitations.ts` | Adicionar hook `useResendInvitation` que cancela o convite antigo e chama `invite-org-user` com os mesmos dados |
| `src/components/orbit/ConfigUsersTab.tsx` | Adicionar botão "Reenviar" com ícone de email na tabela de convites pendentes |

### Detalhes

**Hook `useResendInvitation`**: Recebe os dados do convite pendente (email, role_code, organization_id), cancela o convite antigo atualizando status para "canceled", e chama a Edge Function `invite-org-user` para criar um novo convite com token e expiração atualizados. Isso garante que o email é reenviado com um link válido.

**UI**: Na coluna de ações da tabela de convites pendentes, ao lado do botão "Cancelar", adicionar um botão "Reenviar" com ícone `RefreshCw` ou `Send`. Mostrará "Reenviando..." enquanto a mutação estiver em progresso.

