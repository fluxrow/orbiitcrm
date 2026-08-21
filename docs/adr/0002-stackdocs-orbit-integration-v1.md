# ADR 0002 — Integração StackDocs → Orbit por inbox assíncrona

- **Data:** 2026-08-21
- **Status:** Proposto — arquitetura pronta para validação; implementação bloqueada até aprovação
- **Decisores:** Produto Orbit, Arquitetura e Super Admin Master
- **Canário inicial:** `fluxrow`
- **Relacionado:** [ADR 0001 — Autonomia Operacional Supervisionada V2](./0001-autonomia-operacional-supervisionada-v2.md)

## Contexto e limite desta decisão

O StackDocs já possui entrega de webhooks com HMAC SHA-256, timestamp, chave de
idempotência, fila concorrente, retries e histórico de delivery. Ele deve continuar
como SaaS independente e integrar-se ao Orbit como produto opcional por tenant.

Esta ADR preserva integralmente o Plano Mestre V2. Ela detalha somente a fronteira
de integração StackDocs → Orbit. Não autoriza migration, deploy, envio real nem
ativação em tenant. Os tenants `bullink-negocios`, `fabrica-de-pesquisadores` e
`viver-semijoias` permanecem fora do rollout.

## Baseline comprovada no repositório

O Orbit já expõe `POST /functions/v1/orbit-lead-ingest/{source_id}` com
`verify_jwt = false`. O endpoint:

1. resolve `empresa_id` pela fonte `orbit_lead_sources`, sem aceitar tenant no corpo;
2. autentica com `x-source-token` comparado em tempo constante;
3. limita cada fonte a 60 requisições por minuto usando `orbit_webhook_logs`;
4. normaliza nome, telefone, e-mail e documento;
5. deduplica prospect por documento, telefone ou e-mail dentro do tenant;
6. cria ou altera imediatamente `orbit_prospects` usando `service_role`;
7. recalcula lead score em best effort;
8. grava `lead_recebido` em `orbit_flow_events`; e
9. aciona o dispatcher, permitindo efeitos operacionais do fluxo.

A deduplicação do evento atual usa uma janela de dez minutos e depende do prospect,
não de um identificador imutável fornecido pela origem. O payload bruto também é
mesclado em `dados_adicionais`. Portanto, esse endpoint é adequado às fontes
genéricas atuais, mas não oferece recibo durável desacoplado, versionamento de
contrato, replay seguro de longo prazo ou shadow mode para o StackDocs.

## Alternativas consideradas

### Opção A — reutilizar diretamente `orbit-lead-ingest`

Menor esforço inicial e reaproveitamento do mapeamento existente. Rejeitada para a
primeira fase porque uma entrega válida já altera prospect e pode iniciar fluxos.
Também acopla o retry de transporte ao processamento de negócio.

### Opção B — criar um adaptador StackDocs que chama o ingresso legado

Permite um contrato externo versionado, mas mantém os efeitos síncronos e cria uma
camada que apenas transfere o acoplamento. Pode ser útil futuramente como consumidor
interno, depois dos gates de segurança.

### Opção C — inbox assíncrona versionada com normalização em shadow mode

Recebe, autentica, valida e persiste o evento antes de responder `202`. Um
processador separado produz uma projeção normalizada e, inicialmente, não altera
prospects, deals, fluxos, IA, agenda ou mensagens. Exige mais estrutura, mas separa
transporte, política e execução e oferece replay, auditoria e rollout seguro.

## Decisão proposta

Adotar a **Opção C**. O ingresso legado continuará funcionando sem mudanças para as
fontes existentes. O conector StackDocs será uma expansão independente, aditiva e
controlada pelas flags `stackdocs_integration_v1` e
`stackdocs_integration_apply_v1`, ambas `false` por padrão.

A primeira flag libera somente recepção e shadow mode. A segunda, criada mas não
ativada durante o piloto, governará qualquer aplicação futura no CRM. Publicar
código nunca implicará ativar uma das flags.

## Fronteiras de responsabilidade

```text
StackDocs outbox
  → entrega evento factual assinado
  → Orbit intake autentica a conexão e grava recibo imutável
  → responde 202
  → worker valida e normaliza
  → shadow projection + evidências
  → política/Guardião avalia proposta
  → aplicação futura, tipada, idempotente e tenant-scoped
```

O StackDocs informa fatos. Campos como `activateAgent`, `sendMessage`,
`startCampaign` ou qualquer outro comando operacional não fazem parte do contrato.
O Orbit decide ações conforme entitlement, feature flags, permissões, política de
risco e evidências do sandbox.

O plano de controle cria, vincula, suspende e rotaciona conexões. O plano de dados
somente recebe eventos por uma conexão já provisionada. Desativar uma conexão
interrompe novas entregas e processamentos sem excluir recibos históricos.

## Contrato externo V1

### Endpoint conceitual

```text
POST /functions/v1/orbit-stackdocs-intake/v1/events
```

O caminho definitivo será confirmado contra as convenções de deploy do Lovable
Cloud antes da implementação. A resposta de sucesso significa apenas recebimento
durável, nunca processamento de negócio concluído.

### Headers obrigatórios

```text
Content-Type: application/json
X-StackDocs-Connection: <public_connection_id>
X-StackDocs-Timestamp: <unix_seconds>
X-StackDocs-Signature: v1=<hmac_sha256>
Idempotency-Key: <event_id>
```

O tenant será derivado exclusivamente da conexão autenticada. Se o corpo trouxer
um tenant como dado informativo, ele deverá coincidir com a conexão; jamais será
usado como fonte de autorização.

### Envelope

```json
{
  "event_id": "evt_01J...",
  "event_type": "stackdocs.submission.completed",
  "schema_version": "1.0",
  "occurred_at": "2026-08-21T12:00:00Z",
  "source": "stackdocs",
  "connection_id": "conn_01J...",
  "correlation_id": "corr_01J...",
  "subject": {
    "organization_id": "org_01J...",
    "form_id": "form_01J...",
    "response_id": "resp_01J..."
  },
  "payload": {
    "status": "completed",
    "lead": {
      "name": "Nome",
      "phone": "+5511999999999",
      "email": "lead@example.com",
      "document": null
    },
    "answers": {},
    "attribution": {},
    "attachments": []
  }
}
```

`event_id` deve ser globalmente estável para todos os retries da mesma ocorrência.
O Orbit aplicará unicidade por conexão e evento. `response_id` também será
preservado como chave de negócio da origem.

Anexos usarão metadados e referência temporária; conteúdo binário, tokens e URLs
permanentes não serão aceitos no payload. Limites de tamanho, tipos e expiração
serão definidos no JSON Schema antes da implementação.

### Respostas mínimas

```json
{ "ok": true, "status": "accepted", "receipt_id": "uuid", "duplicate": false }
```

- `202`: recibo persistido ou duplicata já conhecida;
- `400`: envelope ou versão inválidos;
- `401`: assinatura ausente ou inválida;
- `403`: conexão suspensa, tenant/entitlement/flag não autorizados;
- `409`: mesmo identificador com conteúdo divergente;
- `413`: payload excede o limite;
- `429`: limite da conexão excedido;
- `5xx`: nenhum recibo durável foi confirmado e o StackDocs pode repetir.

Erros não retornarão PII, existência de tenant, secrets ou detalhes internos.

## Modelo de dados proposto

Os nomes são provisórios até a inspeção read-only do schema publicado:

```yaml
orbit_external_connections:
  id: uuid
  empresa_id: uuid
  provider: stackdocs
  public_connection_id: text_unique
  status: pending|active|suspended|revoked
  entitlement_key: stackdocs_integration
  secret_reference: vault_reference
  active_secret_version: integer
  previous_secret_valid_until: timestamptz_nullable
  created_at: timestamptz
  updated_at: timestamptz

orbit_integration_inbox:
  id: uuid
  empresa_id: uuid
  connection_id: uuid
  event_id: text
  event_type: text
  schema_version: text
  correlation_id: text
  occurred_at: timestamptz
  received_at: timestamptz
  payload_hash: text
  sanitized_payload: jsonb
  status: received|validated|processed|failed|dead
  attempt_count: integer
  last_error_code: text_nullable
  unique: [connection_id, event_id]

orbit_integration_projections:
  id: uuid
  inbox_id: uuid_unique
  empresa_id: uuid
  mapping_version_id: uuid
  normalized_payload: jsonb
  proposed_operations: jsonb
  validation_evidence: jsonb
  apply_status: shadow_only|eligible|applied|rejected
```

Secrets deverão permanecer no Vault ou mecanismo equivalente do Lovable Cloud. As
tabelas expostas terão RLS, nenhum grant para `anon`/`PUBLIC`, e funções
privilegiadas terão `search_path` fixo e grants explícitos.

## Segurança e anti-replay

- HMAC SHA-256 sobre versão, timestamp e corpo bruto canônico.
- Tolerância de relógio configurável e fail closed fora da janela.
- Nonce/evento de uso único por conexão, protegido por constraint.
- Comparação de assinatura em tempo constante.
- Rotação de secret com sobreposição curta e auditada.
- Rate limit por conexão e limite global de proteção.
- Allowlist de campos, tamanho e tipos; PII sanitizada em logs.
- `service_role` nunca exposto ao StackDocs ou ao navegador.
- Correlação ponta a ponta por `correlation_id`, delivery e receipt.

## Idempotência e processamento

O intake executará uma única transação curta: validar metadados essenciais, inserir
o recibo ou reconhecer duplicata e responder. O worker possuirá lease atômico,
tentativas limitadas e dead letter. Reprocessamento manterá a mesma identidade do
evento e nunca criará um segundo recibo.

Uma duplicata com o mesmo hash retorna o recibo existente. O mesmo `event_id` com
hash diferente será conflito de segurança e não substituirá o payload original.

## Rollout e gates

### Fase S0 — contrato e threat model

- validar esta ADR com Produto, Arquitetura e Super Admin;
- publicar OpenAPI e JSON Schema versionados;
- definir retenção, consentimento, limites e catálogo de erros;
- nenhuma mudança de banco ou runtime.

### Fase S1 — recepção canário

- estruturas aditivas e grants mínimos;
- `stackdocs_integration_v1 = true` somente no `fluxrow`;
- HMAC, anti-replay, recibo durável, `202` e observabilidade;
- `stackdocs_integration_apply_v1 = false` em todos os tenants.

### Fase S2 — mapeamento e sandbox

- mapping versionado por conexão;
- preview de prospect, negócio, qualificação e anexos;
- comparação com o estado atual sem qualquer escrita operacional;
- payloads sintéticos, sem envio ou agendamento real.

### Fase S3 — aplicação controlada no `fluxrow`

- mutações tipadas e idempotentes por RPC interna;
- começar por criação/merge de prospect;
- deal, fluxo, IA e agenda permanecem desligados até gates próprios;
- auditoria, kill switch, métricas e rollback lógico.

### Fase S4 — entitlement e provisionamento

- StackDocs como add-on do Orbit e ligação de organização standalone;
- ativação e suspensão separadas da entrega técnica;
- nenhuma herança automática da configuração do `fluxrow`.

### Fase S5 — promoção individual

- primeira promoção para tenant cliente é ação Vermelha;
- um tenant e uma capacidade por onda;
- shadow mode, aprovação humana, janela de observação e rollback individual.

## Testes exigidos antes de S1

- assinatura válida, inválida, antiga, futura e secret rotacionado;
- evento duplicado igual e evento duplicado divergente;
- conexão suspensa, flag desligada e tenant incompatível;
- concorrência do mesmo evento sem recibos duplicados;
- payload grande, campos desconhecidos, PII e anexos inválidos;
- falha antes e depois da persistência do recibo;
- worker retry/dead letter sem duplicar operações;
- prova negativa de que nenhum evento S1 altera tabelas operacionais;
- prova de isolamento para os três tenants protegidos.

## Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Evento recebido iniciar atendimento involuntariamente | Inbox separada e apply flag desligada |
| Cross-tenant por ID no payload | Tenant derivado somente da conexão autenticada |
| Retry duplicar prospect ou fluxo | Constraint de evento + operações idempotentes |
| Vazamento de PII em logs | Payload sanitizado e allowlist de observabilidade |
| Comprometimento de secret | Vault, rotação, expiração e revogação por conexão |
| Contrato mudar sem coordenação | `schema_version`, compatibilidade aditiva e schemas versionados |
| Acoplamento entre os produtos | Outbox/inbox e contrato público; sem acesso direto ao banco do outro produto |

## Critérios para aprovar implementação

- [ ] Produto confirma StackDocs como SaaS independente e add-on do Orbit.
- [ ] Arquitetura aprova a separação entre inbox e ingresso legado.
- [ ] Super Admin aprova endpoint, eventos e dados permitidos.
- [ ] OpenAPI e JSON Schema V1 estão versionados.
- [ ] Threat model e política de retenção estão definidos.
- [ ] Plano de testes possui prova negativa de efeitos operacionais.
- [ ] Rollout mantém somente `fluxrow` e flags default `false`.

Até esses itens serem concluídos, o próximo estado é **documentação e validação**, não
implementação.
