

# Resetar campanha para reenvio

## O que aconteceu
A campanha "teste com LEAD Vagner e Augusto" está com status `concluida` e os 2 destinatários com status `falhou`. O botão de reenvio não aparece porque não há destinatários `pendente`.

## Solução
Executar um UPDATE no banco para:
1. Resetar os 2 recipients para `status = 'pendente'`
2. Alterar a campanha para `status = 'aprovada_para_envio'` e zerar contadores

Depois disso, o botão **Enviar Campanha (2 pendentes)** aparecerá na UI para você disparar.

## SQL a executar (migration)

```sql
UPDATE public.orbit_campaign_recipients
SET status = 'pendente', erro = null
WHERE campaign_id = 'eb08928d-9413-40e9-a8bd-728aff8f3866';

UPDATE public.orbit_campaigns
SET status = 'aprovada_para_envio', enviados = 0
WHERE id = 'eb08928d-9413-40e9-a8bd-728aff8f3866';
```

## Resultado
Após a migration, basta atualizar a página de Campanhas e clicar no botão verde **Enviar Campanha (2 pendentes)**.

