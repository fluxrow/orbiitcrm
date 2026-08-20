# Fase 0 — Baseline Lovable Cloud de 20/08/2026

## Identificação

- Projeto: `143c37b1-339e-469f-b2f1-df4584af8003`
- Nome confirmado: `orbiitcrm`
- Banco: Supabase/PostgreSQL 17.6, habilitado
- Commit publicado no momento da auditoria: `617b82053616f06ed369d12d6906ac54a12e63fa`
- Método: consultas `SELECT` pela integração interna do Lovable Cloud
- Mutação executada: nenhuma

## Parecer

As estruturas materiais das Fases 1–4 existem no catálogo de produção e correspondem ao desenho versionado no repositório. O ledger de migrations, porém, termina em `20260820173745` e não contém as migrations tenant-ops criadas entre `20260819230541` e `20260820230000`. Isso confirma aplicação direta de DDL e drift do histórico.

A migration `20260820235900_lovable_phase1_4_baseline_reconciliation.sql` cria um ponto de reconciliação idempotente, preserva decisões existentes de rollout, reduz grants anônimos e valida o contrato antes de concluir.

Após autorização explícita, ela foi aplicada em 20/08/2026 pela integração interna do Lovable Cloud e registrada no ledger com:

- versão `20260820235900`;
- nome `lovable_phase1_4_baseline_reconciliation`;
- idempotency key `orbit-phase0-20260820235900`.

Consequentemente:

- **Paridade de schema no escopo Fases 1–4:** comprovada.
- **Ponto de reconciliação no ledger:** registrado e comprovado.
- **Grants anônimos no escopo saneado:** zero após a aplicação.
- **Paridade da baseline das Fases 1–4:** concluída para os objetos e contratos enumerados neste documento.

## Objetos confirmados

- `orbit_feature_flags`, com RLS.
- Cinco views tenant-ops com `security_invoker=true`.
- `orbit_tenant_ops_read(text)` como invoker, stable e `search_path=public, pg_temp`.
- `orbit_tenant_ops_action(text,text,jsonb)` como definer e `search_path=public`.
- `orbit_get_tenant_audit_logs(...)` como definer e sanitizada no corpo observado.
- `orbit_prompt_versions` e `orbit_flow_versions`, com RLS.
- `orbit_support_sessions`, com RLS e duração máxima de 60 minutos.
- Trigger `orbit_audit_attach_jit`.
- Constraint da outbox contendo `stale_canceled`.
- Job `orbit-log-retention-daily`, ativo às `03:17`.

## Feature flags confirmadas

| Tenant | Estado |
|---|---:|
| `fluxrow` | `true` |
| `bullink-negocios` | `false` |
| `fabrica-de-pesquisadores` | `false` |
| `viver-semijoias` | `false` |

Outros tenants ativos sem linha para a flag permanecem desabilitados pela semântica definida no contrato.

## Grants e RLS

As policies relevantes estão direcionadas a `authenticated` e filtram tenant ou papel. Entretanto, o catálogo revelou grants de tabela excessivos para `anon` em tabelas como:

- `orbit_ai_knowledge`;
- `orbit_audit_log`;
- `orbit_conversas`;
- `orbit_onboarding_implementation_drafts`;
- `orbit_whatsapp_outbox`.

RLS sem policy para `anon` impedia acesso normal a linhas, mas manter privilégios de tabela aumentava a superfície e violava o baseline de menor privilégio. A migration de reconciliação revogou esses grants; a reauditoria retornou zero privilégios de tabela para `anon` no conjunto saneado.

As colunas de token não possuem `SELECT` para `anon` ou `authenticated`. O catálogo ainda mostrava privilégios de escrita herdados de grants de tabela em algumas configurações. Esses caminhos devem ser testados antes de retirar grants de `authenticated`, para não interromper OAuth/configuração; o acesso por `anon` é revogado na reconciliação.

## Contexto do Super Admin

`switch_active_empresa(uuid)` é `SECURITY DEFINER` e atualiza `profiles.empresa_id`. O frontend a chama ao alternar o slug. Como esse perfil é compartilhado por abas, o desenho não isola de forma robusta dois tenants abertos simultaneamente.

O plano de desacoplamento está em `docs/architecture/TENANT_CONTEXT_AND_JIT.md` e propõe tenant explícito por RPC, validado server-side contra membership/papel.

## JIT

O JIT existe e sua auditoria está ativa, mas não é obrigatório para toda ação cross-tenant. `orbit_tenant_ops_action` permite Super Admin diretamente e o trigger apenas enriquece a auditoria quando encontra sessão ativa.

Tornar JIT obrigatório é uma mudança de autorização Vermelha e deverá ser implementada em etapa própria, com shadow mode e inventário de todas as funções privilegiadas.

## Integridade operacional observada

Somente contagens e estados sanitizados foram consultados. Nenhuma fila foi alterada.

- Bullink: 72 pendentes, 273 canceladas, 1.585 enviadas.
- Fábrica de Pesquisadores: 22 pendentes, 141 falhas, 435 canceladas, 1.231 enviadas.
- Viver Semijoias: 41 falhas, 40 canceladas, 1.248 enviadas e 1 simulada.
- Nenhuma linha de outbox foi retornada para Fluxrow.
- Zero sessão JIT ativa no instante consultado.

Estados sanitizados de WhatsApp:

- Bullink, Fábrica e Viver estavam ativos, online e com envio real liberado.
- Fluxrow estava inativo e com envio real bloqueado.
- Nenhum estado foi modificado.

Esses números são fotografia do instante da consulta, não métricas permanentes.

## Reauditoria pós-aplicação

Confirmado após o commit transacional:

1. Migration presente no ledger.
2. `fluxrow=true`; Bullink, Fábrica e Viver permanecem `false`.
3. Zero grants de tabela para `anon` no conjunto saneado.
4. Zero `EXECUTE` público nas RPCs auditadas.
5. `orbit_tenant_ops_read` permanece invoker; funções mutáveis permanecem definer com `search_path=public`.
6. As cinco views permanecem `security_invoker=true`.
7. Zero sessão JIT ativa.
8. Estados sanitizados das instâncias WhatsApp permaneceram inalterados.
9. Pendentes, falhas e canceladas permaneceram inalteradas. A contagem `sent` da Bullink avançou em uma unidade durante a janela, compatível com processamento normal da fila ativa e sem relação com a migration de grants.

## Gates arquiteturais seguintes

- Desacoplar tenant da mutação de `profiles.empresa_id`.
- Tornar JIT obrigatório para escrita cross-tenant após shadow mode.
- Inventariar e consolidar wrappers das RPCs privilegiadas.
- Introduzir idempotência uniforme nas ações administrativas.

Nenhum tenant cliente deve receber novas flags ou mudanças funcionais durante esse saneamento.
