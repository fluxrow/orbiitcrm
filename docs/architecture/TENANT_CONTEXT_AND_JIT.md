# Contexto de Tenant e Suporte JIT

## Estado observado em 20/08/2026

O `TenantContext` resolve o slug da URL e chama `switch_active_empresa` quando o tenant selecionado é diferente de `profiles.empresa_id`. A RPC atual é `SECURITY DEFINER`, valida acesso e persiste o novo `empresa_id` no perfil.

As policies e algumas RPCs derivam o tenant ativo de `profiles.empresa_id`. Esse desenho oferece um contexto simples para uma navegação sequencial, mas o perfil é um estado persistente compartilhado por todas as abas e requisições do usuário.

## Risco de múltiplas abas

Exemplo:

1. Aba A abre `/fluxrow` e persiste Fluxrow no perfil.
2. Aba B abre `/bullink-negocios` e persiste Bullink.
3. Uma refetch da Aba A pode executar com o contexto persistente de Bullink, embora a URL continue em Fluxrow.

Filtros explícitos do frontend reduzem o risco de renderização incorreta, e RLS continua sendo obrigatória, mas os dois contextos podem divergir. O risco existe especialmente em RPCs que não recebem tenant e dependem apenas do perfil ativo.

## Decisão proposta

Desacoplar navegação do estado persistente do perfil. Cada requisição tenant-scoped deve carregar um contexto explícito e ser validada contra uma associação autorizada.

Não confiar em um header arbitrário diretamente dentro do Postgres. O frontend pode informar slug ou tenant ID, mas a RPC deve:

1. resolver o tenant server-side;
2. validar `auth.uid()` contra `user_empresa_memberships` ou papel global;
3. rejeitar slug e ID divergentes;
4. filtrar todas as leituras e escritas pelo tenant resolvido;
5. registrar tenant, ator, sessão e origem na auditoria.

## Contrato recomendado

```text
URL /:tenantSlug
  → frontend inclui slug na RPC tipada
  → RPC resolve slug para empresa_id
  → autorização por auth.uid() + memberships/role
  → operação usa o empresa_id resolvido
  → resposta inclui tenant_id e tenant_slug
```

Para Edge Functions, o slug pode viajar em header ou payload tipado, mas sempre será tratado como entrada não confiável. A função valida JWT e delega a autorização ao banco. Não se deve usar `user_metadata` para autorização.

## Migração sem quebra

1. Adicionar novas RPCs ou versões com `p_tenant_slug` explícito.
2. Manter as RPCs antigas temporariamente.
3. Executar dual-read em shadow mode no `fluxrow` e comparar tenant/resultados.
4. Trocar hooks do `fluxrow` por feature flag.
5. Testar duas abas, troca rápida de slug, refresh e Realtime.
6. Migrar um tenant por vez somente após estabilidade.
7. Remover `switch_active_empresa` da navegação.
8. Descontinuar contratos antigos em release posterior.

O perfil pode conservar uma empresa preferida para UX, mas ela não deve representar o escopo de autorização da requisição.

## Suporte JIT atual

O Lovable Cloud contém:

- `orbit_support_sessions` com duração máxima de 60 minutos;
- RPCs de início, consulta e encerramento;
- trigger `orbit_audit_attach_jit` para anexar metadados quando existe sessão ativa;
- restrição do início/encerramento ao Super Admin Master.

Entretanto, a sessão JIT **não é obrigatória** para todas as ações cross-tenant. A RPC `orbit_tenant_ops_action` autoriza diretamente um `super_admin`; o trigger apenas acrescenta metadados se uma sessão já estiver ativa.

## Política JIT recomendada

Uma futura mudança, classificada como Vermelha, deve exigir sessão JIT ativa para toda escrita do Super Admin em tenant diferente de seu tenant master.

O guard central deve validar:

- sessão pertencente a `auth.uid()`;
- tenant idêntico ao alvo;
- `revoked_at IS NULL`;
- `expires_at > now()`;
- justificativa presente;
- feature flag aplicável;
- ação allowlisted para suporte.

Exceções devem ser mínimas e explícitas, por exemplo início/encerramento da própria sessão e resposta a incidente via kill switch. Toda exceção precisa de auditoria separada.

## Gates antes de implementar JIT obrigatório

- Inventariar todas as RPCs `SECURITY DEFINER` capazes de escrita cross-tenant.
- Confirmar que jobs e service role não serão confundidos com ação humana.
- Adicionar testes para sessão ausente, expirada, revogada e tenant divergente.
- Validar fluxo de emergência caso o JIT esteja indisponível.
- Implementar primeiro no `fluxrow`.
- Não ativar a exigência em tenants clientes até concluir shadow mode.

## Testes de isolamento obrigatórios

- Fluxrow e Bullink abertos simultaneamente em duas abas.
- Refetch alternado nas duas abas.
- Navegação rápida A → B → A.
- RPC antiga versus RPC com slug explícito.
- Super Admin sem JIT tentando leitura e escrita.
- Super Admin com JIT do tenant A tentando escrever no tenant B.
- Sessão JIT expirada durante uma confirmação.
- Cache React Query e Realtime separados por `empresa_id`.

Até esses testes serem aprovados, nenhuma ampliação do Centro de Operações deve ocorrer fora do `fluxrow`.

## Implementação canário: leitura explícita do Centro de Operações

A primeira etapa do desacoplamento é aditiva e limitada ao Centro de Operações:

- `orbit_tenant_ops_read_scoped(p_tenant_slug,p_section)` resolve o slug no banco;
- a função exige usuário autenticado e valida Super Admin, perfil ativo do tenant ou membership;
- as flags `tenant_operations_center_v1` e `tenant_explicit_context_v1` precisam estar ativas;
- o `empresa_id` resolvido é aplicado a todas as agregações e volta no envelope junto com `tenant_slug`;
- `PUBLIC` e `anon` não possuem `EXECUTE`;
- a RPC antiga permanece disponível durante a transição.

O hook seleciona o contrato pela flag `tenant_explicit_context_v1` e inclui `empresaId`, slug e modo de contexto na chave do React Query. Assim, troca de slug não reutiliza cache de outro tenant. O rollout inicial habilita o novo contrato somente para `fluxrow`; os tenants protegidos permanecem explicitamente desligados.

Esta etapa não remove `switch_active_empresa`, pois outras telas e policies ainda dependem do perfil persistido. A remoção só ocorrerá após inventário e migração das demais leituras/escritas tenant-scoped.
