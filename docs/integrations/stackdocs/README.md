# StackDocs → Orbit — contrato V1

Este pacote fecha a Fase S0 documental da integração definida na
[ADR 0002](../../adr/0002-stackdocs-orbit-integration-v1.md). Ele não representa
um endpoint já implantado.

## Artefatos normativos

- `openapi.yaml`: contrato HTTP de recepção e catálogo de respostas.
- `schemas/stackdocs-submission-completed-v1.schema.json`: envelope permitido.
- `THREAT_MODEL.md`: fronteiras de confiança, ameaças e controles obrigatórios.
- `STACKDOCS_HANDOFF_COMMAND.md`: comando pronto e limitado ao lado emissor.

Em conflito, o JSON Schema governa o corpo, o OpenAPI governa o transporte e a ADR
governa a arquitetura e o rollout.

## Compatibilidade

- `event_type` inicial: `stackdocs.submission.completed`.
- `schema_version` inicial: `1.0`.
- Alterações compatíveis adicionam somente campos opcionais.
- Remoção, mudança de tipo ou semântica exige uma nova versão de schema.
- Campos desconhecidos são rejeitados no V1 para evitar comandos operacionais ou
  PII não prevista.
- O mesmo `event_id` deve ser reutilizado em todos os retries da mesma ocorrência.
- O Orbit deriva o tenant da conexão autenticada; o payload não escolhe tenant.

## Assinatura V1

O StackDocs calcula:

```text
signed_payload = <X-StackDocs-Timestamp> + "." + <raw_request_body_utf8>
signature = lowercase_hex(HMAC_SHA256(connection_secret, signed_payload))
header = "v1=" + signature
```

O corpo deve ser assinado exatamente como transmitido, antes de qualquer parse ou
reformatação. O Orbit valida timestamp, conexão, versão da assinatura e assinatura
antes de persistir o recibo.

## Semântica de entrega

- `202 accepted`: o recibo está durável; não significa que o CRM foi alterado.
- Retry de transporte somente quando não houver `202` ou conforme `Retry-After`.
- Uma duplicata idêntica também retorna `202` e o mesmo `receipt_id`.
- Um `event_id` repetido com corpo diferente retorna `409` e exige investigação.
- O StackDocs não envia comandos para IA, fluxo, campanha, agenda ou WhatsApp.

## Estado do rollout

Até a Fase S1:

- endpoint não implantado;
- `stackdocs_integration_v1` deve permanecer inexistente ou `false` por padrão;
- `stackdocs_integration_apply_v1` deve permanecer `false` em todos os tenants;
- nenhum tenant cliente recebe dados ou mudança;
- o `fluxrow` será o único candidato ao canário.
