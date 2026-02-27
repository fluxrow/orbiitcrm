

# Adicionar Reply-To nos e-mails enviados

## Problema
Quando um destinatário responde a um e-mail de campanha ou teste, a resposta vai para o endereço de envio (noreplay@promotripcorporate.com). O usuário quer que respostas sejam direcionadas para `comercial@promotripcorporate.com`.

## Alterações

### 1. `supabase/functions/orbit-send-email/index.ts`
- Adicionar campo `reply_to` no payload enviado ao Resend API (linha 104):
  - `reply_to: "comercial@promotripcorporate.com"`

### 2. `supabase/functions/send-orbit-campaign/index.ts`
- Adicionar campo `reply_to` no payload do envio de e-mail de campanhas (linhas 158-163):
  - `reply_to: "comercial@promotripcorporate.com"`

### 3. Banco de dados (opcional/recomendado)
- Adicionar coluna `reply_to_email` na tabela `orbit_resend_config` para tornar o endereço configurável pela interface, em vez de hardcoded. Atualizar o registro existente com `comercial@promotripcorporate.com`.
- As edge functions lerão esse campo da config; se não existir, usam fallback hardcoded.

## Técnico
A API do Resend suporta o campo `reply_to` no corpo da requisição POST. Basta incluir `reply_to: ["comercial@promotripcorporate.com"]` no JSON enviado.

