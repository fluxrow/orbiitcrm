# Threat model — StackDocs → Orbit V1

## Escopo

Este modelo cobre a entrega de `stackdocs.submission.completed`, sua persistência
na inbox do Orbit e a projeção em shadow mode. Aplicação no CRM, ingestão de
arquivos, IA, agenda e mensagens reais permanecem fora da Fase S1.

## Ativos protegidos

- isolamento e identidade de cada tenant;
- secrets das conexões e credenciais internas do Orbit;
- PII dos leads e respostas de formulários;
- integridade dos prospects, deals, fluxos, IA, agenda e filas;
- disponibilidade do intake e do worker;
- evidências de auditoria, idempotência e correlação.

## Fronteiras de confiança

```text
Navegador StackDocs (não confiável para autorização)
  → backend/outbox StackDocs
  → internet
  → Edge Function de intake Orbit
  → inbox tenant-scoped
  → worker de normalização
  → projeção shadow

Plano de controle autenticado Orbit
  → provisiona/suspende conexão
  → guarda referência do secret
```

O identificador público da conexão não é secret. Tenant, entitlement e permissões
são resolvidos no Orbit a partir da conexão autenticada.

## Ameaças e controles obrigatórios

| ID | Ameaça | Controle | Gate |
|---|---|---|---|
| T01 | Payload escolhe outro tenant | Derivar `empresa_id` da conexão; rejeitar qualquer divergência informativa | S1 |
| T02 | Secret roubado permite forjar evento | Vault, rotação, revogação, rate limit e auditoria por conexão | S1 |
| T03 | Replay duplica lead ou fluxo | Timestamp, `(connection_id,event_id)` único e hash imutável | S1 |
| T04 | Mesmo ID troca o conteúdo | Retornar `409`; preservar primeiro recibo e gerar alerta | S1 |
| T05 | Assinatura é validada sobre JSON reformatado | HMAC sobre bytes crus recebidos antes do parse | S1 |
| T06 | Timing leak da assinatura | Comparação constante de bytes e resposta genérica | S1 |
| T07 | Retry de transporte repete negócio | Responder após recibo durável; worker e operações idempotentes | S1/S3 |
| T08 | Evento inicia IA ou envio no piloto | Inbox separada; `apply` flag false; testes negativos de escrita | S1 |
| T09 | Campo arbitrário injeta comando | JSON Schema fechado e ausência de `requestedActions` | S0/S1 |
| T10 | Payload/attachments esgotam recursos | Limite de corpo, itens, arquivo, timeout e concorrência | S1/S2 |
| T11 | URL de anexo acessa rede interna | Bloquear IP privado/redirecionamento; allowlist HTTPS; fetch isolado | S2 |
| T12 | Arquivo malicioso entra na base | Quarentena, hash, MIME real, antivírus e ingestão separada | S2 |
| T13 | PII vaza em logs e erros | Logs sanitizados, respostas mínimas e retenção definida | S1 |
| T14 | Conexão suspensa continua processando | Checar status no intake e novamente no worker | S1 |
| T15 | Flag muda entre recibo e execução | Revalidar flags/política no worker e antes de aplicar | S1/S3 |
| T16 | Concorrência cria dois recibos | Constraint única + `INSERT ... ON CONFLICT` transacional | S1 |
| T17 | Worker perde lease ou processa duas vezes | Lease com expiração, compare-and-set e operações idempotentes | S1 |
| T18 | Falha vira loop infinito | Tentativas limitadas, backoff e dead letter auditada | S1 |
| T19 | Enumeração revela tenants/conexões | Erros externos genéricos e IDs opacos | S1 |
| T20 | Mudança de schema quebra entregas | `schema_version`, schemas imutáveis e compatibilidade aditiva | S0 |

## Regras fail-closed

O evento não será aceito quando ocorrer qualquer uma destas condições:

- assinatura, timestamp, conexão ou versão inválidos;
- conexão não ativa, entitlement ausente ou flag de recepção desligada;
- corpo acima do limite ou fora do schema;
- `Idempotency-Key` diferente de `event_id`;
- `connection_id` do corpo diferente do header;
- evento conhecido com hash divergente;
- indisponibilidade que impeça confirmar a persistência durável.

O worker não processará quando a conexão ou a flag deixarem de estar ativas, mesmo
que o evento tenha sido recebido anteriormente.

## PII, consentimento e retenção

- Guardar somente campos permitidos pelo contrato e necessários ao propósito.
- Não registrar corpo bruto em console ou `orbit_webhook_logs`.
- Persistir payload sanitizado e hash; secrets nunca integram o recibo.
- Definir antes de S1 a base legal, retenção de recibos/projeções e processo de
  exclusão/exportação por titular.
- `consent.status` é evidência informada pela origem, não autorização automática
  para mensagem; o Orbit aplica sua própria política antes de qualquer contato.

## Configurações a definir antes da implementação

Valores abaixo serão externos ao código e terão defaults conservadores:

```yaml
stackdocs_intake:
  max_body_bytes: 1048576
  signature_clock_skew_seconds: 300
  rate_limit_per_connection_per_minute: 60
  max_worker_attempts: 5
  lease_seconds: 60
  retention_days: pending_product_decision
  allowed_schema_versions: ["1.0"]
  apply_enabled_default: false
```

## Evidências mínimas para liberar S1

- revisão do SQL de RLS/grants e funções privilegiadas;
- testes de HMAC com vetores compartilhados entre StackDocs e Orbit;
- teste concorrente de idempotência;
- teste negativo de escrita em todas as tabelas operacionais;
- teste de conexão/flag suspensa entre intake e worker;
- logs sanitizados inspecionados;
- rollback do endpoint e revogação da conexão demonstrados;
- prova de que somente `fluxrow` pode receber o canário.

## Riscos residuais que exigem decisão

1. Período de retenção dos recibos e projeções.
2. Lista final de MIME types e tamanho por tipo de anexo.
3. Política comercial do entitlement e comportamento após suspensão por cobrança.
4. Responsável e SLA para dead letters e conflitos de idempotência.
5. Momento em que telefone/e-mail podem gerar contato, sempre fora de S1/S2.

