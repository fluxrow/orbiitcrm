

# Diagnóstico: Mensagens humanas não chegam no WhatsApp

## Problema identificado

As mensagens enviadas pela IA têm `status: "enviada"` e `provider_message_id` preenchido. As duas mensagens que você enviou manualmente ("Boa Tarde tudo bem?" e "Gostaria de um café la pelas 23:30?") foram salvas no banco com `status: "pendente"` e **sem** `provider_message_id` — ou seja, a chamada à Z-API foi pulada.

O código pula o envio Z-API quando alguma dessas condições falha (linha 91):
```
if (zapiConfig?.instance_id && zapiConfig?.token && telefone)
```

Os dados no banco estão corretos (Z-API configurada, telefone presente). A causa mais provável é que o **deploy anterior não aplicou corretamente** ou que houve um erro silencioso. A ausência total de logs da função confirma isso.

## Correção

1. **Adicionar logs de diagnóstico** no `orbit-send-message` para rastrear cada etapa: autenticação, profile, Z-API config, telefone recebido, e resultado do envio.

2. **Redesenhar o fluxo para buscar o telefone do banco** caso o frontend não o envie — a função já recebe `conversa_id`, então pode buscar o `telefone_whatsapp` direto da tabela `orbit_conversas`, eliminando a dependência do parâmetro do frontend.

3. **Redeployar** a função.

### Alterações em `supabase/functions/orbit-send-message/index.ts`

- Após receber os parâmetros, se `telefone` estiver vazio, buscar da tabela `orbit_conversas` pelo `conversa_id`
- Adicionar `console.log` em pontos-chave: parâmetros recebidos, Z-API config encontrada, resultado do fetch
- Garantir que o status nunca fique "pendente" sem razão — se Z-API não está configurada, salvar como "falhou" com motivo claro

