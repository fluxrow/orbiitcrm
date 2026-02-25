

# Melhorar tela de aceite de convite com confirmação de senha

## Problema atual

A tela de aceite de convite (`AcceptInvitePage`) tem apenas um campo de senha. Não há campo de confirmação de senha, o que pode levar a erros de digitação. Além disso, o email do convite PE usa a rota `/accept-invite-pe/:token`, mas essa rota não existe no App.tsx — somente `/invite/:token` está registrada.

## Alterações

| Arquivo | Alteração |
|---|---|
| `src/pages/AcceptInvitePage.tsx` | Adicionar campo "Confirmar Senha" com validação de correspondência. Exibir o email do convite de forma destacada como confirmação. Desabilitar botão até que as senhas coincidam e tenham no mínimo 6 caracteres. |
| `src/App.tsx` | Adicionar rota `/accept-invite-pe/:token` apontando para `AcceptInvitePage`, corrigindo o link enviado no email de convite. |

### Detalhes da UI

A tela de aceite passará a ter:

1. **Email confirmado** — já é exibido na seção de detalhes do convite (organização, papel, email)
2. **Nome completo** — campo existente, mantido
3. **Senha** — campo existente, com indicação de mínimo 6 caracteres
4. **Confirmar Senha** — novo campo que deve coincidir com o campo de senha
5. **Validação visual** — mensagem de erro abaixo do campo de confirmação quando as senhas não coincidem
6. **Botão desabilitado** — enquanto senha < 6 caracteres ou senhas não conferem

### Rota faltante

O email de convite gera links para `/accept-invite-pe/:token`, mas essa rota não existe. Será adicionada no `App.tsx` para que o link do email funcione corretamente.

