# Manual Mestre do Orbit CRM

Fonte única de verdade para governança operacional do Orbit. Alterações relevantes de segurança, permissões, RPCs e rollout devem atualizar este documento no mesmo commit.

## Escopo de governança

- Super Admin: onboarding, infraestrutura, limites, rollout por tenant e suporte JIT.
- Tenant Admin: regras de negócio, IA, agenda, Z-API, filas, mídias, prompts, fluxos e alertas do próprio tenant.
- Vendedor: operação comercial e conversas atribuídas ou sem responsável, conforme as RPCs específicas.
- Visualizador: relatórios com PII parcialmente mascarada, sem mutações.
- O tenant é sempre derivado/validado no banco. O slug recebido por uma RPC nunca é autorização suficiente.

## Matriz resumida

| Recurso | Super Admin | Tenant Admin | Vendedor | Visualizador |
|---|---:|---:|---:|---:|
| Centro de Operações habilitado | leitura/ação | leitura/ação | sem acesso | sem acesso |
| Auditoria sanitizada | todos os tenants habilitados | próprio tenant | não | não |
| Suporte JIT | master exclusivamente | não | não | não |
| Alertas | editar | editar próprio tenant | não | leitura operacional indireta |
| Prompts/fluxos | publicar/rollback | publicar/rollback | não | não |
| Mídias e agenda | administrar | administrar | não | não |

O Super Admin master é `fbcfarias@icloud.com`. A feature flag `tenant_operations_center_v1` nasce `false`; durante o canário, somente `fluxrow` permanece habilitado.

## RPCs do Centro de Operações

- `orbit_tenant_ops_read(p_section)`: leitura agregada tenant-scoped.
- `orbit_tenant_ops_read_scoped(p_tenant_slug,p_section)`: leitura canário com tenant explícito, resolvido e autorizado no banco; exige também `tenant_explicit_context_v1`.
- `orbit_tenant_ops_action(p_tenant_slug,p_action_type,p_payload)`: ações atômicas, feature-gated e auditadas.
- `orbit_get_tenant_audit_logs(...)`: auditoria paginada e sanitizada; limite máximo de 200 registros por chamada.
- `orbit_start_jit_support_session(p_tenant_slug,p_reason)`: abre sessão de até 60 minutos, somente para o master.
- `orbit_end_jit_support_session(p_session_id)`: revogação imediata da sessão pelo próprio master.
- `orbit_get_active_jit_support_session(p_tenant_slug)`: estado seguro para o banner persistente.
- `orbit_get_tenant_alert_config(p_tenant_slug)`: leitura dos canais e thresholds.
- `orbit_apply_log_retention()`: rotina interna chamada diariamente pelo Supabase Cron.

Todas as funções privilegiadas usam `SECURITY DEFINER`, `SET search_path=public`, validação explícita de `auth.uid()` e revogação de `PUBLIC`/`anon`. Funções internas não são concedidas a `authenticated`.

## Auditoria, sanitização e retenção

O trigger `orbit_audit_attach_jit` adiciona `support_jit.session_id`, justificativa e janela temporal a toda entrada criada durante uma sessão ativa. A RPC de consulta mascara recursivamente tokens, segredos, senhas, autorização, telefones, e-mails, documentos e IPs.

- Logs brutos de webhook/eventos: 90 dias.
- Auditoria administrativa `orbit_audit_log`: 365 dias.
- Job: `orbit-log-retention-daily`, diariamente às 03:17 UTC.
- A retenção é segmentada por classe de dados e nunca remove objetos de negócio.

## Suporte Just-in-Time

1. O master acessa o tenant canário e informa justificativa com no mínimo 10 caracteres.
2. O banco revoga eventual sessão anterior do mesmo ator e cria uma sessão de 60 minutos.
3. O banner exibe motivo e contagem regressiva.
4. Toda ação auditada recebe metadados JIT automaticamente.
5. O encerramento manual revoga imediatamente; expiração também invalida a sessão sem depender do frontend.

Uma sessão JIT não troca JWT, não copia identidade de usuário do tenant e não amplia permissões. Ela contextualiza e audita o uso das prerrogativas já existentes do Super Admin.

## Alertas

Cada tenant possui e-mails operacionais, habilitação do canal, limites de aviso/crítico da fila e tolerância de instância offline. O fallback master `fbcfarias@icloud.com` não pode ser removido pela UI. Mudanças são registradas com before/after no log administrativo.

## Versionamento e rollback

Prompts e fluxos mantêm rascunho separado da versão publicada. Versões são imutáveis; somente `is_active` pode mudar. Publicação cria uma nova versão e atualiza o runtime na mesma transação. Rollback reativa a versão histórica e reaplica seu conteúdo ao runtime em uma única transação auditada.

## Rollout de novos tenants

1. Concluir onboarding, RLS e associação dos administradores em `profiles`.
2. Validar credenciais, filas, agenda, prompts, fluxos e canais de alerta.
3. Executar leituras e testes transacionais sem envio real.
4. Registrar aceite e plano de rollback.
5. Ativar `tenant_operations_center_v1` somente para o tenant aprovado.
6. Homologar menu, rota, isolamento de cache e rejeição de tenants não habilitados.
7. Monitorar auditoria, filas, instância e alertas antes de ampliar o rollout.

O desacoplamento de contexto usa uma segunda flag, `tenant_explicit_context_v1`. Ela nasce desabilitada e deve ser promovida tenant a tenant somente após os testes de duas abas, troca rápida de slug, isolamento de cache e equivalência do envelope com a RPC legada. No canário inicial, apenas `fluxrow` usa a RPC explícita.

## Operação segura

- Nunca conceder tabelas sensíveis a `PUBLIC` ou `anon`.
- Nunca expor service role no frontend.
- Ações destrutivas usam cancelamento/soft delete quando possível.
- Ações de grande impacto exigem confirmação reforçada.
- Alterações fora do escopo devem ser preservadas e não incluídas no commit.
