# Comando de handoff para o agente do StackDocs

Copiar e enviar o bloco abaixo somente após confirmar que o agente está trabalhando
no projeto StackDocs correto.

---

## TAREFA: CONECTOR STACKDOCS → ORBIT V1 — LADO EMISSOR, DESLIGADO POR PADRÃO

O Orbit concluiu a Fase S0 do contrato da integração. Implemente exclusivamente o
lado emissor no StackDocs, preservando toda a infraestrutura de webhook já
homologada e sem acessar banco, código ou credenciais do Orbit.

### Escopo

1. Criar o provider/conector `orbit_v1` na infraestrutura existente de integrações.
2. Emitir inicialmente somente o evento
   `stackdocs.submission.completed`, `schema_version: "1.0"`.
3. Manter o conector e qualquer conexão Orbit **desligados por padrão**.
4. Não criar nem ativar conexão real; usar somente fixtures e endpoint mock local.
5. Não enviar mensagens, acionar IA, agenda, campanhas ou qualquer ação no Orbit.

### Endpoint configurável

```text
POST {ORBIT_INTAKE_BASE_URL}/orbit-stackdocs-intake/v1/events
```

Não hardcode host de produção. O valor deve pertencer à configuração segura da
conexão e permanecer vazio no ambiente publicado até autorização explícita.

### Headers obrigatórios

```text
Content-Type: application/json
X-StackDocs-Connection: <public_connection_id>
X-StackDocs-Timestamp: <unix_seconds>
X-StackDocs-Signature: v1=<lowercase_hex_hmac_sha256>
Idempotency-Key: <event_id>
```

Assinar exatamente:

```text
signed_payload = timestamp + "." + raw_request_body_utf8
signature = lowercase_hex(HMAC_SHA256(connection_secret, signed_payload))
```

O mesmo corpo bruto assinado deve ser transmitido. O mesmo `event_id` e a mesma
`Idempotency-Key` devem ser mantidos em todos os retries da ocorrência.

### Envelope permitido

```json
{
  "event_id": "evt_...",
  "event_type": "stackdocs.submission.completed",
  "schema_version": "1.0",
  "occurred_at": "2026-08-21T12:00:00Z",
  "source": "stackdocs",
  "connection_id": "conn_...",
  "correlation_id": "corr_...",
  "subject": {
    "organization_id": "org_...",
    "form_id": "form_...",
    "response_id": "resp_..."
  },
  "payload": {
    "status": "completed",
    "lead": {
      "name": "Nome",
      "phone": "+5511999999999",
      "email": "lead@example.com",
      "document": null,
      "consent": {
        "status": "granted",
        "captured_at": "2026-08-21T12:00:00Z",
        "purpose": "lead_intake"
      }
    },
    "answers": {},
    "attribution": {},
    "attachments": []
  }
}
```

Regras:

- Não enviar `tenant_id`, `empresa_id` ou slug como autorização. O Orbit resolverá
  o tenant pela conexão autenticada.
- Não enviar `requestedActions`, `activateAgent`, `sendMessage`, `startCampaign` ou
  qualquer comando operacional.
- Anexos devem conter apenas referência temporária HTTPS, expiração, MIME, tamanho
  e SHA-256; nunca incluir binário ou URL permanente no webhook.
- Não registrar secret, assinatura, corpo completo ou PII em logs.
- Armazenar o secret somente no mecanismo seguro já adotado pelo StackDocs.

### Semântica HTTP

- `202`: entrega concluída; marcar como entregue mesmo quando `duplicate: true`.
- `400`, `401`, `403`, `409`, `413`: não repetir indefinidamente; classificar e
  mostrar erro sanitizado ao operador.
- `429`: respeitar `Retry-After` e depois usar a política de backoff existente.
- `5xx`, timeout ou falha de rede: aplicar a fila/retry existente.
- Nunca interpretar `202` como confirmação de criação de prospect ou execução no
  CRM; significa somente recibo durável.

### Testes obrigatórios

1. Vetor determinístico de HMAC cobrindo timestamp + ponto + bytes exatos do corpo.
2. Serialização estável: bytes assinados são os mesmos bytes transmitidos.
3. Retry conserva `event_id`, `correlation_id`, corpo e idempotency key.
4. `202` normal e `202 duplicate` encerram o delivery.
5. `429` respeita `Retry-After`; `5xx` entra no backoff existente.
6. Erros permanentes não entram em loop infinito.
7. Schema rejeita campos desconhecidos e comandos operacionais.
8. Logs e histórico não expõem secret, assinatura nem PII integral.
9. Teste E2E somente contra mock local; zero chamada ao Orbit publicado.

### Entregável

- Código e testes do provider `orbit_v1`.
- UI/configuração de conexão somente se puder permanecer desativada e sem secret no
  client-side.
- Exemplo de payload sanitizado.
- Vetor de teste HMAC compartilhável com o Orbit.
- Relatório de testes e lista dos arquivos alterados.
- Não ativar, publicar credenciais ou executar webhook real.
- Ao concluir, parar e aguardar a implementação do intake canário no Orbit.

---

O contrato normativo completo permanece no repositório Orbit em
`docs/integrations/stackdocs/openapi.yaml` e
`docs/integrations/stackdocs/schemas/stackdocs-submission-completed-v1.schema.json`.

