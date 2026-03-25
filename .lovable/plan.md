

# Fix: Erro 409 ao reenviar convite + Email com remetente "PromoTrip Corporate"

## Problemas identificados

### 1. Erro 409 ao reenviar convite
A função `auto-approve-trial` verifica se já existe um `saas_invites` pendente (linha 143-153) **antes** de invalidar os antigos (linha 195-200). Quando o admin clica "Reenviar", o convite anterior ainda está válido, causando o erro 409.

**Fix:** Mover a invalidação de convites antigos para **antes** da checagem de duplicatas. Assim, ao reenviar, os convites anteriores são expirados primeiro, permitindo criar um novo.

### 2. Email com nome "PromoTrip Corporate"
A função `getResendApiKey` (linha 33-45) lê o registro global de `orbit_resend_config` e usa `cfg.from_name` como nome do remetente. Esse registro tem `from_name` configurado como "PromoTrip Corporate" (dados de outro cliente). Para emails de sistema (trial/ativação), o remetente deveria ser sempre "Orbit".

**Fix:** Na função `auto-approve-trial`, forçar `from_name = "Orbit"` para emails de ativação de conta, ignorando o valor da config global. A config global serve para emails de campanha/negócio, não para emails de sistema.

## Alterações

### Arquivo: `supabase/functions/auto-approve-trial/index.ts`

1. **Mover invalidação** (linhas 194-200) para **antes** da checagem de duplicatas (linha 142)
2. **Forçar remetente** "Orbit" no `buildEmailHtml` e no envio do email, independente da config global
3. Ajustar `getResendApiKey` para retornar apenas a `api_key`, usando nome fixo "Orbit" para o `from` do email de trial

### Resultado
- Admin pode reenviar convites sem erro 409
- Emails de ativação sempre mostram "Orbit" como remetente
- Emails de campanha continuam usando a config por empresa normalmente

