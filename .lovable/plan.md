

# Diagnóstico: Convites PE não enviam email

## Problema encontrado

A Edge Function `invite-org-user` **cria o registro na tabela `pe_invitations`** mas **nunca envia um email** ao convidado. O token é gerado e retornado na resposta JSON, mas ninguém o recebe.

Em contraste, o fluxo SaaS (`auto-approve-trial`) envia o email via Resend com o link de ativação. O fluxo PE simplesmente não tem essa etapa.

## Solução

Adicionar envio de email na Edge Function `invite-org-user` após criar o registro do convite, reutilizando a mesma infraestrutura de email (Resend via `orbit_resend_config` ou secret `RESEND_API_KEY`) já usada no fluxo SaaS.

### Alterações

| Arquivo | Alteração |
|---|---|
| `supabase/functions/invite-org-user/index.ts` | Adicionar lógica de envio de email com Resend após inserir o convite. Construir URL de aceitação (`/accept-invite-pe/{token}`) e enviar email HTML ao convidado com link, nome da organização e papel |

### Detalhes técnicos

A função passará a:

1. Buscar a configuração do Resend (`orbit_resend_config` global ou `RESEND_API_KEY`)
2. Buscar o nome da organização para incluir no email
3. Construir o link de convite: `{appUrl}/accept-invite-pe/{token}`
4. Enviar email via Resend API com template HTML informando organização, papel e link
5. Registrar no audit log se o email foi enviado ou não
6. Retornar `email_sent: true/false` na resposta

Se o Resend não estiver configurado, o convite será criado normalmente (como hoje) mas a resposta indicará `email_sent: false` para que o admin saiba que precisa compartilhar o link manualmente.

```text
invite-org-user (atual):
  Validar permissões → Inserir pe_invitations → Retornar { invitation, token }

invite-org-user (corrigido):
  Validar permissões → Inserir pe_invitations → Buscar Resend config
  → Enviar email com link → Retornar { invitation, token, email_sent }
```

### Template do email

O email conterá:
- Nome da organização convidando
- Papel atribuído
- Botão/link para aceitar o convite
- Informação de validade (7 dias)

