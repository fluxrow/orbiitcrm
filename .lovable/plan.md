

# Atualizar e-mail de envio das campanhas

## Contexto

Atualmente, a tabela `orbit_resend_config` tem o registro global com `from_email = noreplay@fluxrow.pro` e `from_name = Orbit CRM`. O usuário quer alterar para `noreplay@promotripcorporate.com`.

## Alterações

1. **Atualizar o registro na tabela `orbit_resend_config`** via SQL:
   - `from_email` → `noreplay@promotripcorporate.com`
   - `from_name` → `Promotrip Corporate` (ou manter como está, confirmar com o contexto)
   - `dominio_verificado` → `promotripcorporate.com`

⚠️ **Importante**: Para que os e-mails sejam entregues corretamente, o domínio `promotripcorporate.com` precisa estar verificado no Resend. A API Key atual está associada ao domínio `fluxrow.pro`. Se a conta Resend não tiver o domínio `promotripcorporate.com` configurado e verificado, os envios falharão.

## Plano de execução

1. Executar migration SQL para atualizar o `from_email` para `noreplay@promotripcorporate.com` e o `dominio_verificado` para `promotripcorporate.com` no registro existente
2. O `from_name` será mantido ou ajustado conforme necessário

