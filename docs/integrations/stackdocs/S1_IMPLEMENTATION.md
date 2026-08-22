# StackDocs → Orbit — Fase S1 do intake canário

- **Status do código:** implementado e validado localmente
- **Status operacional:** não aplicado e não implantado
- **Canário:** `fluxrow`
- **Modo:** recepção + projeção `shadow_only`

## O que S1 cria

- `orbit_external_connections`: registro server-side de conexão e referências de
  secrets de ambiente, nunca secrets em texto no banco.
- `orbit_integration_inbox`: recibos duráveis tenant-scoped e campos de evento
  imutáveis.
- `orbit_integration_projections`: evidência normalizada e proposta não executável.
- `orbit_stackdocs_accept_event`: RPC `SECURITY INVOKER`, restrita a
  `service_role`, que resolve tenant pela conexão e grava inbox + projeção.
- `orbit-stackdocs-intake`: Edge Function pública somente no transporte, protegida
  por HMAC por conexão, timestamp, Schema V1 e idempotência.

Não existe trigger, worker ou RPC que escreva em prospects, deals, conversas,
fluxos, IA, agenda, mídia, outbox ou campanhas.

## Gates de rollout

| Flag | `fluxrow` | Demais tenants |
|---|---:|---:|
| `stackdocs_integration_v1` | `true` | `false`/ausente |
| `stackdocs_integration_apply_v1` | `false` | `false`/ausente |

A RPC de recebimento falha se `stackdocs_integration_apply_v1` estiver ligada
durante S1. Nenhuma conexão é criada pela migration; por isso o endpoint permanece
incapaz de aceitar eventos até um provisionamento posterior e explícito.

## Configuração externa

```yaml
stackdocs_intake:
  max_body_bytes: 1048576
  signature_clock_skew_seconds: 300
  rate_limit_per_connection_per_minute: 60
  connection_secret_env_pattern: STACKDOCS_ORBIT_V1_<IDENTIFICADOR>_SECRET
```

Variáveis opcionais da Edge Function:

- `STACKDOCS_INTAKE_MAX_BODY_BYTES`
- `STACKDOCS_INTAKE_CLOCK_SKEW_SECONDS`
- `STACKDOCS_INTAKE_RATE_LIMIT_PER_MINUTE`

O secret de uma conexão será cadastrado no ambiente da função. A tabela guarda
somente o nome da variável e permite uma referência anterior com expiração para
rotação controlada.

## Fluxo de recepção

```text
request
→ limite de tamanho
→ conexão server-side
→ timestamp/anti-replay
→ HMAC sobre timestamp + "." + corpo bruto
→ JSON Schema V1
→ identidade do header = envelope
→ hash SHA-256
→ RPC transacional
   → feature flags
   → deduplicação/conflito
   → rate limit
   → inbox imutável
   → projeção shadow não executável
→ HTTP 202
```

## Semântica importante

- `202` confirma somente recibo durável.
- Duplicata com o mesmo hash retorna o mesmo recibo.
- Mesmo `event_id` com hash diferente retorna `409`.
- Timestamp fora da janela ou HMAC inválido retorna `401`.
- Conexão/flag desabilitada retorna `403`.
- Falha antes da persistência confirmada retorna erro retryable.
- Nenhum log contém assinatura, secret, corpo ou PII.

## Gates concluídos localmente

- Schema da Edge Function semanticamente idêntico ao contrato documental.
- Vetor HMAC compartilhado StackDocs/Orbit validado.
- Testes Deno: schema, campos proibidos, HMAC, timestamp, hash e UTF-8.
- `deno check` da função.
- `tsc --noEmit` do produto.
- build Vite de produção.

## Gates pendentes antes de conectar o StackDocs

1. Revisar a migration no Lovable Cloud sem aplicá-la a tenants clientes.
2. Aplicar migration e confirmar grants/RLS/flags por consulta read-only.
3. Implantar a Edge Function com `verify_jwt = false` intencionalmente, pois a
   autenticação é HMAC, e confirmar que sem conexão retorna rejeição.
4. Provisionar somente uma conexão `fluxrow` com ID opaco e secret forte.
5. Configurar o mesmo ID/secret no StackDocs, ainda com sua PR em draft.
6. Enviar um único evento sintético sem dados reais.
7. Comprovar inbox + projeção shadow e ausência de escritas operacionais.
8. Revogar a conexão e repetir a auditoria dos tenants protegidos.

## Rollback de S1

O primeiro rollback é lógico: suspender/revogar a conexão ou desligar
`stackdocs_integration_v1` somente no `fluxrow`. A função passa a rejeitar novos
eventos e preserva recibos já aceitos. Não apagar inbox ou projeções durante um
rollback operacional.
