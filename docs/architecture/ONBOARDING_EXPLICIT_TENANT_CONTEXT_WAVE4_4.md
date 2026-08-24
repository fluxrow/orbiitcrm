# Onda 4.4 — contexto explícito no onboarding

**Versão:** 1.1
**Data:** 22/08/2026  
**Status:** aprovado para implementação canário  
**Rollout:** somente `fluxrow`

## Objetivo

Remover `profiles.empresa_id` como autoridade implícita das operações internas do
onboarding sem interromper o wizard público já utilizado por clientes. O slug da
rota será resolvido e autorizado no banco em cada requisição interna. As RPCs
públicas por token continuam compatíveis e independentes do contexto autenticado.

## Estado atual

```text
Painel /{slug}/onboarding
  -> hooks React consultam tabelas diretamente
  -> Super Admin omite o filtro empresa_id e recebe todos os onboardings
  -> RLS usa get_user_empresa_id(auth.uid()) ou privilégio global

Wizard /onboarding-cliente/{token}
  -> get_onboarding_by_token
  -> save_onboarding_responses
  -> submit_onboarding
  -> token opaco, sem sessão autenticada obrigatória
```

As tabelas `orbit_client_onboardings` e `orbit_onboarding_assets` possuem grants
históricos para `anon`, mas não possuem policies destinadas a esse papel. A RLS
impede acesso direto anônimo. O wizard público acessa os dados exclusivamente por
RPCs `SECURITY DEFINER` baseadas no token.

## Alternativas consideradas

### A — reforçar somente filtros no frontend

Menor esforço, mas não cria uma fronteira de autorização server-side e mantém o
Super Admin carregando dados de outros tenants. Rejeitada.

### B — contrato interno por slug e contrato público por token

RPCs internas resolvem o tenant pelo slug, validam associação/role e aplicam o
`empresa_id` resolvido em todas as leituras e mutações. O wizard público permanece
inalterado. Escolhida por preservar capacidades e permitir rollback por flag.

### C — substituir imediatamente policies e fluxo público

Eliminaria o legado mais rapidamente, mas pode interromper onboardings em curso e
mistura duas fronteiras de confiança diferentes. Adiada até equivalência no canário.

## Arquitetura escolhida

```text
/{tenant_slug}/onboarding
  -> useOrbitOnboarding(tenantSlug, empresaId)
  -> feature flag tenant_onboarding_context_wave4_v1
       false -> caminho legado existente
       true  -> orbit_tenant_onboarding_read_scoped(slug, section, id?)
             -> orbit_tenant_onboarding_mutate_scoped(slug, action, id, payload)
  -> banco resolve slug
  -> banco valida auth.uid() + associação ou Super Admin
  -> banco revalida onboarding/asset/insight contra empresa_id
  -> auditoria sanitizada em mutações

/onboarding-cliente/{token}
  -> contrato público existente por token
  -> nenhuma dependência do slug ou profiles.empresa_id
```

## Contratos propostos

### Leitura interna

`orbit_tenant_onboarding_read_scoped(p_tenant_slug text, p_section text, p_entity_id uuid default null) returns jsonb`

Seções permitidas:

- `list`: onboardings do tenant ativo;
- `assets`: ativos de um onboarding do tenant;
- `insights`: análises de materiais do mesmo onboarding;
- `draft`: rascunho de implementação do mesmo onboarding.

Nenhuma seção retorna conteúdo de outro tenant. Tokens públicos não serão
incluídos em logs ou mensagens de erro.

### Mutação interna

`orbit_tenant_onboarding_mutate_scoped(p_tenant_slug text, p_action text, p_onboarding_id uuid, p_payload jsonb default '{}'::jsonb) returns jsonb`

Ações iniciais:

- `archive_onboarding`;
- `update_checklist`;
- `update_responses`;
- `review_insight`;
- `reconcile_asset_reference`.

Todas exigem Admin/Super Admin, feature flag ativa, lock do registro quando
necessário, allowlist de payload e auditoria sem respostas, token ou PII.

## Configuração

```yaml
tenant_onboarding_context:
  feature_key: tenant_onboarding_context_wave4_v1
  default_enabled: false
  canary_slug: fluxrow
  public_token_contract: preserved
  audit_payload_mode: field_names_only
  rollback: disable_feature_flag
```

A configuração operacional é armazenada em `orbit_feature_flags`; o YAML acima é
o contrato normativo e não contém segredo ou identificador mutável de tenant.

## Preservação de capacidades

| Capacidade atual | Estado na onda |
|---|---|
| Criar tenant + onboarding pelo Super Admin | Preservada |
| Enviar link por e-mail | Preservada |
| Wizard público por token | Preservada sem alteração |
| Autosave e retomada | Preservados |
| Upload público de materiais | Preservado |
| Processamento assistido de ativos | Preservado |
| Checklist e revisão interna | Migrados para RPC por slug no canário |
| Visão central global | Disponível somente ao Super Admin em `/fluxrow/onboarding`; tenant-alvo derivado do onboarding |

### Adendo 1.1 — console central do Super Admin

A homologação do canário mostrou que não existe outra rota para a fila central
de onboardings. Restringir a seção `list` ao `empresa_id` da Fluxrow produzia
um estado vazio falso e impedia o Super Admin de acompanhar clientes já
implantados.

Por isso, a rota `/fluxrow/onboarding` é também o contexto explícito do console
central, exclusivamente quando o banco comprova `super_admin`. Para usuários
comuns, todas as leituras e mutações continuam limitadas ao tenant resolvido pelo
slug. No escopo central:

- a listagem pode retornar onboardings de todos os tenants;
- assets, insights, drafts e mutações recebem somente o `onboarding_id`;
- o `empresa_id` alvo é derivado da linha do onboarding no banco;
- nenhum `empresa_id` arbitrário é aceito do navegador;
- a auditoria é gravada no tenant-alvo e registra a Fluxrow apenas como contexto;
- respostas, tokens, nomes, e-mails e conteúdo de materiais não entram no log.

## Segurança

- O slug é entrada não confiável e nunca é aceito como autorização.
- Toda entidade é revalidada contra o `empresa_id` resolvido.
- Funções privilegiadas usam `SET search_path = public, pg_temp`.
- `PUBLIC` e `anon` não recebem execução das novas RPCs internas.
- `authenticated` recebe execução, mas a função valida usuário, role e tenant.
- Nenhuma resposta interna expõe segredos de integração.
- O contrato público por token será auditado separadamente antes de qualquer
  alteração de grants históricos.

## Plano de testes

1. Testes SQL de acesso positivo no `fluxrow`.
2. Testes SQL de rejeição para slug divergente e entidade de outro tenant.
3. Teste de Super Admin em duas abas com tenants diferentes.
4. Equivalência entre lista legada e lista scoped no `fluxrow`.
5. Testes unitários dos mappers e query keys tenant-scoped.
6. Regressão do wizard público: carregar, salvar, retomar e submeter por token.
7. Confirmação de que tenants protegidos permanecem na flag `false`.
8. `tsc --noEmit`, testes e build local.

Nenhum teste enviará e-mail, WhatsApp, mídia real ou executará processamento de IA.

## Observabilidade

Métricas sanitizadas permitidas:

- tenant slug resolvido;
- seção/ação;
- sucesso ou código de erro;
- contagem de registros;
- duração.

Não registrar respostas do onboarding, nomes, e-mails, telefones, token público,
conteúdo de ativos ou resultados extraídos.

## Rollback

Desligar `tenant_onboarding_context_wave4_v1` somente no `fluxrow` restaura o
caminho legado do frontend. As novas RPCs são aditivas e não substituem nem
removem policies ou RPCs públicas nesta onda.

## Ordem de implantação

1. Publicar primeiro o frontend compatível. Enquanto a RPC de modo não existir,
   somente os códigos `42883`/`PGRST202` acionam o caminho legado.
2. Aplicar a migration e reauditar flags, grants, funções e policies.
3. A flag ativa no `fluxrow` passa a selecionar o contrato scoped.
4. Erros de autorização, tenant ou banco nunca acionam fallback.

## Fora de escopo

- Ativar a onda em tenants clientes.
- Alterar ou invalidar tokens de onboardings existentes.
- Revogar grants públicos antes da regressão completa do wizard.
- Aplicar automaticamente o rascunho de implementação em prompts ou fluxos.
- Enviar notificações reais durante homologação.
