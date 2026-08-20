# Inventário de Migração do Contexto de Tenant

Baseline: 20/08/2026

Escopo de rollout: somente `fluxrow`

Tenants protegidos: `bullink-negocios`, `fabrica-de-pesquisadores`, `viver-semijoias`

## Objetivo

Eliminar a dependência de `profiles.empresa_id` como contexto de autorização da requisição sem interromper o runtime atual. O slug da URL é uma entrada não confiável: toda RPC explícita deve resolvê-lo no banco, validar `auth.uid()` e associação ao tenant, aplicar o `empresa_id` resolvido em todas as consultas e continuar protegida por feature flag.

O rollout permanece aditivo. `switch_active_empresa` não será removido enquanto existirem telas, policies ou RPCs dependentes do perfil persistido.

## Classificação

| Classe | Definição | Tratamento |
|---|---|---|
| A — explícita | Query key, filtro e Realtime incluem `empresaId` da rota | Manter e testar em duas abas |
| B — ID + RLS | Operação usa apenas ID do registro e confia na RLS/contexto persistido | Migrar para RPC tenant-scoped ou acrescentar predicado explícito |
| C — persistente | Código lê ou altera `profiles.empresa_id` para navegar/autorizar | Remover somente após substituição completa |
| D — global intencional | Catálogos globais sem dados privados do tenant | Documentar e manter separado |

## Matriz inicial

| Superfície | Estado | Classe | Evidência principal | Prioridade |
|---|---|---:|---|---:|
| Centro de Operações | RPC `orbit_tenant_ops_read_scoped` resolve slug e valida acesso | A | `useTenantOperations`; flag `tenant_explicit_context_v1` | concluído no canário |
| Conversas — lista/detalhe | Filtro, query key e Realtime usam `empresaId` da rota | A | `useOrbitConversas` | P0 — preservar |
| Conversas — upload | Usa conversa ativa, mas possui fallback para `profiles.empresa_id` | C | `ConversasPage` | P0 |
| Conversas — update/leitura | Predicado inclui `empresa_id`; assumir/devolver usam RPCs atômicas | A | `useOrbitConversas` | P0 — testes |
| Prospects — lista/contagem | Filtro e query key incluem `empresaId` | A | `useOrbitProspects` | P0 — preservar |
| Prospect — detalhe | Filtro imediato por tenant + RPC explícita em shadow mode | A (shadow) | `useOrbitProspect`; `orbit_tenant_prospect_read_scoped` | Onda 1 em canário |
| Prospect — editar/excluir | RPC atômica tenant-scoped no canário; legado também ganhou predicado de tenant | A (canário) | `orbit_tenant_entity_mutate_scoped` | Onda 2.1 |
| Funil — stages/deals | Leituras filtradas + snapshot RPC em shadow mode | A (shadow) | `useOrbitDeals`; `orbit_tenant_funnel_read_scoped` | Onda 1 em canário |
| Funil — Realtime | Assina todos os deals e apenas invalida cache | B | `useOrbitDealsGrouped` | P1 |
| Funil — deal update/move/delete | RPC atômica tenant-scoped no canário; legado também ganhou predicado | A (canário) | `useOrbitDeals`; `orbit_tenant_entity_mutate_scoped` | Onda 2.1 |
| Funil — stages create/update/archive/reorder | RPC atômica e análise de impacto no canário; legado ganhou predicado de tenant | A (canário) | `useOrbitPipelineConfig`; RPCs de stage | Onda 2.2 |
| Mensagens | Query key, leitura e Realtime incluem tenant da rota | A | `useOrbitMensagens` | P0 — preservar |
| Configurações | Maioria das leituras recebe `empresaId`; algumas mutações dependem de RLS | A/B | `useOrbitConfig` | P1 |
| Agenda/Google | Edge Functions recebem `empresa_id` do frontend | B | `useOrbitGoogleCalendar` | P1 — validar server-side |
| Fluxos | Lista filtra tenant; ações/execuções são consultadas por `flow_id` | A/B | `useOrbitFlows` | P1 |
| Busca global | RPC recebe `_empresa_id`; autorização server-side precisa de auditoria | B | `useOrbitSearch` | P1 |
| TenantProvider | Resolve slug, valida acesso e chama `switch_active_empresa` | C | `TenantContext` | P2 — remover por último |
| EmpresaSwitcher | Persiste empresa antes de navegar | C | `EmpresaSwitcher` | P2 — remover por último |
| Templates globais | Catálogos oficiais podem ser globais intencionalmente | D | pipeline/flow templates | documentar |

## Sequência aprovada para shadow mode

### Onda 1 — P0, somente leitura

1. Criar RPC explícita de leitura para detalhe de prospect e agregação do funil.
2. Manter as queries REST existentes como caminho legado.
3. No `fluxrow`, executar leitura nova e comparar IDs, tenant e contagens com o resultado legado.
4. Registrar apenas métricas sanitizadas de divergência; nunca conteúdo/PII.
5. Não renderizar o resultado shadow até obter equivalência estável.

Implementação: `tenant_explicit_reads_wave1_v1`, ativa exclusivamente no `fluxrow`.
As comparações registram somente recurso e contagens, sem IDs, conteúdo ou PII.

### Onda 2 — P0, mutações

1. Criar RPCs atômicas tenant-scoped para editar/excluir prospect e mover/editar deal/stage.
2. Exigir `p_tenant_slug`, validar associação e flag específica de mutação.
3. Usar `WITH CHECK`/validação de tenant e auditoria obrigatória.
4. Homologar apenas no `fluxrow`, com registros sintéticos identificados.

Parte 2.1: `tenant_explicit_mutations_wave2_v1` cobre edição/soft delete de
prospect e edição/movimentação/soft delete de deal. A RPC usa lock de linha,
allowlist de campos, valida referências no mesmo tenant e grava diff na auditoria.

Parte 2.2: `tenant_pipeline_stages_wave2_v1` cobre criação, edição,
arquivamento e reordenação atômica. O arquivamento é bloqueado quando a etapa
possui deals ativos, referências em fluxos publicados ou ações agendadas. Não
há migração automática ou invisível de deals entre etapas.

### Onda 3 — P1

Migrar configurações, Agenda/Google, fluxos e busca global após auditoria das Edge Functions e RPCs correspondentes. Realtime deve sempre usar filtro de tenant e canal com nome tenant-scoped.

#### Parte 3.1 — busca global explícita

Auditoria read-only confirmou que `orbit_global_search` é `SECURITY INVOKER`,
filtra todas as entidades pelo `_empresa_id`, mas ainda aceita esse UUID do
frontend e depende da RLS/contexto persistido. A RPC
`orbit_global_search_scoped` passa a resolver o tenant pelo slug, validar o
usuário e a flag `tenant_explicit_search_wave3_v1` antes de executar a busca.
O rollout ativo permanece exclusivo do `fluxrow`; os demais tenants continuam
no contrato legado com a flag `false`.

Agenda/Google já valida JWT e associação por perfil ou membership dentro das
Edge Functions antes de usar `service_role`. Configurações, fluxos e fontes de
lead ainda possuem mutações por ID e grants históricos amplos para `anon` e
serão tratados nas partes seguintes, sem ampliar o rollout da Parte 3.1.

#### Parte 3.2 — governança de fontes de lead

`tenant_lead_sources_wave3_v1` migra criação, edição, arquivamento e rotação de
token para uma RPC tenant-scoped exclusiva do canário. A exclusão física foi
substituída por `deleted_at`, e a rotação do segredo passou a ocorrer no banco.
O audit log registra somente os nomes dos campos alterados, nunca o token.

Grants anônimos sem policy correspondente foram removidos das configurações e
do motor de fluxos. O endpoint público de ingestão não depende deles: autentica
o `x-source-token` e acessa as tabelas via `service_role`. Privilégios
`TRUNCATE`, `TRIGGER` e `REFERENCES` também foram removidos de `authenticated`;
as permissões DML necessárias e as policies RLS permanecem intactas.

### Onda 4 — remoção do contexto persistido

Somente após todas as ondas:

1. remover a chamada automática a `switch_active_empresa` do `TenantProvider`;
2. fazer o switcher navegar sem mutar o perfil;
3. manter empresa preferida apenas como preferência de UX, sem valor de autorização;
4. repetir testes de duas abas, refresh alternado, navegação A → B → A e sessão JIT.

## Gates de promoção

- CI verde: instalação limpa, TypeScript, testes e build.
- `fluxrow` é o único tenant com a flag de contexto explícito.
- Nenhuma divergência de tenant ID ou conjunto de IDs no shadow mode.
- Nenhum dado sensível em logs de comparação.
- Tenants protegidos continuam com flags desligadas e rotas ocultas.
- Plano de rollback: desligar a flag da onda e retornar imediatamente ao contrato legado.

## Fora de escopo desta etapa

- Alterar RLS ou grants.
- Ativar flags adicionais.
- Remover `switch_active_empresa`.
- Executar mutações de homologação em tenants clientes.
- Corrigir automaticamente vulnerabilidades de dependências com versões major.
