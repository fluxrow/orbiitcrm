# ADR 0001 — Autonomia Operacional Supervisionada V2

- **Data:** 2026-08-20
- **Status:** Aceito para implementação por fases, sujeito aos gates de rollout
- **Decisores:** Produto Orbit, Arquitetura e Super Admin Master
- **Canário inicial:** `fluxrow`

## Contexto

O Orbit já possui um Centro de Operações tenant-scoped, ações operacionais atômicas, recursos de agenda e mídia, versionamento de prompts e fluxos, auditoria e suporte Just-in-Time. A próxima evolução busca reduzir intervenções manuais de engenharia no onboarding, na ingestão de conhecimento e na manutenção da IA sem transferir poder irrestrito a um agente ou propagar alterações aos tenants de clientes.

Os tenants `bullink-negocios`, `fabrica-de-pesquisadores`, `viver-semijoias` e quaisquer outros tenants não promovidos operam com clientes reais. Preservar isolamento, compatibilidade e comportamento existente tem prioridade sobre velocidade.

A arquitetura precisa distinguir quatro fronteiras:

1. proposta versus aprovação;
2. agente proponente versus agente avaliador;
3. entrega técnica versus ativação por tenant;
4. canário `fluxrow` versus tenants de clientes.

## Alternativas consideradas

### Opção A — aprovação humana para toda alteração

O Orbit enviaria cada solicitação ao Super Admin pelo painel, e-mail ou WhatsApp. É simples e conservador, mas mantém a aprovação humana como gargalo permanente.

### Opção B — autonomia por risco com Guardião e escalonamento

Um Copiloto produz uma proposta tipada. Validadores determinísticos e sandbox medem integridade e impacto. Um Guardião independente decide entre autoaprovar, solicitar ajuste, rejeitar ou escalar para aprovação humana.

### Opção C — agente totalmente autônomo

Um único agente propõe, aprova e publica. Oferece velocidade máxima, mas concentra privilégios e cria risco incompatível com tenants em produção.

## Decisão

Adotar a **Opção B — autonomia supervisionada por risco**.

O Copiloto de Evolução não poderá aprovar o próprio trabalho. O Guardião receberá somente a proposta, diff, políticas aplicáveis, evidências do sandbox, saúde operacional e estimativa de alcance. Regras determinísticas são soberanas; o parecer do modelo é evidência adicional, não autorização suficiente.

O estado oficial de solicitações e aprovações permanecerá no Orbit. E-mail e WhatsApp serão adaptadores de notificação e decisão, nunca fontes paralelas de verdade.

## Fluxo decisório

```text
Solicitação tenant-scoped
  → Copiloto produz proposta tipada e diff
  → validadores determinísticos
  → sandbox sem efeitos reais
  → Guardião independente
      → autoaprovar
      → pedir esclarecimento ou ajuste
      → rejeitar
      → escalar aprovação humana
  → publicador atômico e versionado
  → observação
  → manter ou fazer rollback tenant-scoped
```

Estados previstos:

```text
submitted → analyzed → proposal_ready → sandbox_running
→ sandbox_passed | sandbox_failed
→ policy_review
→ auto_approved | awaiting_human | rejected | needs_clarification
→ applying → applied | apply_failed → rolled_back
```

## Matriz determinística de risco

### Verde — autoaprovação possível

- Adição de conhecimento após validação, quarentena e deduplicação.
- Atualização de FAQ e texto informativo sem alterar regras protegidas.
- Correção ortográfica ou de descrição.
- Criação de rascunho inativo de prompt ou fluxo.
- Atualização de metadado sem efeito operacional.

Requisitos cumulativos: ação allowlisted, diff limitado, sandbox aprovado, confiança mínima satisfeita, auditoria e rollback disponíveis.

### Amarelo — Guardião pode aprovar

- Alteração de preço ou informação comercial com verificação de consistência.
- Alteração de prompt dentro de seções permitidas.
- Mudança de qualificação ou fluxo ainda inativo.
- Associação de mídia aprovada a fluxo inativo.
- Parâmetro de agenda dentro de limites definidos.

Requisitos cumulativos: testes de regressão, blast radius calculado, ausência de contradições, política específica e janela de observação. Falha ou ambiguidade causa escalonamento.

### Vermelho — humano obrigatório com step-up

- Ativação de envio real ou campanha em massa.
- Alteração de fluxo ativo de alto alcance.
- Credenciais, integrações, RLS, schema, cobrança ou infraestrutura.
- Exclusão física de dados ou mídia.
- Novo tipo de ação executável no backend.
- Primeira promoção de uma capacidade para tenant de cliente.
- Operação que alcance mais de um tenant.

O canal pode notificar e iniciar a decisão, mas ações Vermelhas exigem autenticação reforçada no Orbit.

### Ações proibidas ao agente

- SQL arbitrário ou escrita direta em tabelas operacionais.
- Acesso a tokens, secrets, service role ou credenciais em texto claro.
- Desativar RLS, auditoria, kill switch ou controles de rollout.
- Elevar o próprio privilégio.
- Aprovar proposta que o próprio agente produziu.
- Continuar após falha de sandbox, autorização ou telemetria.
- Enviar WhatsApp ou criar agendamento real durante testes.

## Registro de Capacidades do Orbit

O conhecimento técnico do agente será fornecido por um catálogo curado e versionado, contendo:

- entidades e relacionamentos permitidos;
- RPCs e ações tipadas;
- matriz de papéis e permissões;
- tipos de nodes/edges;
- invariantes e políticas de segurança;
- feature flags e versões ativas;
- dependências e pré-condições;
- saúde operacional e histórico de rollback;
- contexto comercial tenant-scoped.

O catálogo não conterá secrets nem concederá uma ferramenta genérica de SQL. Mudanças no catálogo serão versionadas e revisadas como alteração arquitetural.

## Sandbox obrigatório

Toda mudança Verde ou Amarela com efeito no runtime deve passar por sandbox. O sandbox usará dados sintéticos ou sanitizados, adaptadores falsos para integrações e bloqueio absoluto de envio/agendamento real.

Evidências mínimas:

- validação estrutural;
- cenários esperados e adversos;
- comparação entre versão atual e candidata;
- divergências classificadas;
- latência e erros;
- impacto estimado;
- versão da política e do modelo avaliador.

Ausência de telemetria ou evidência implica **fail closed**.

## Aprovação multicanal

Cada decisão remota utilizará desafio assinado contendo:

- identificador e versão exata da solicitação;
- tenant e ação;
- nonce aleatório armazenado somente como hash;
- identidade e canal autorizados;
- expiração curta;
- uso único e chave de idempotência;
- assinatura de webhook validada;
- nova verificação do estado antes da aplicação.

Exemplo de comando correlacionado:

```text
APROVAR 7K4P
NAO_APROVAR 7K4P
```

Uma resposta isolada com “aprovado” não terá valor de autorização.

Ordem preferencial dos adaptadores:

1. painel autenticado do Orbit;
2. WhatsApp Meta Cloud API;
3. e-mail;
4. Z-API como compatibilidade ou contingência.

O número/instância administrativo será separado das instâncias de atendimento dos tenants.

## Entrega técnica e ativação por tenant

Publicar código não ativa capacidade nem configuração em tenant de cliente.

### Entrega técnica

Código e schema devem chegar com:

- feature flags desligadas por padrão;
- mudanças aditivas;
- defaults que preservem o comportamento atual;
- contratos anteriores aceitos;
- nenhum backfill ou job operacional implícito;
- nenhum envio real durante validação.

### Ativação

Cada promoção será registrada por tenant, capacidade, versão, configuração e aprovador. Não será permitido habilitar múltiplos tenants por omissão ou herança do `fluxrow`.

## Protocolo de promoção

```text
testes locais
→ sandbox sem efeitos reais
→ fluxrow em shadow mode
→ fluxrow com ativação limitada
→ janela de observação
→ tenant específico em opt-in e shadow mode
→ ativação parcial de uma capacidade
→ observação ampliada
→ estabilização ou rollback individual
```

O `fluxrow` é ambiente de validação, não template de dados ou configurações a ser copiado.

A primeira promoção de qualquer capacidade para um tenant cliente é Vermelha e exige decisão humana. Ondas iniciais incluem somente um tenant e uma capacidade.

## Compatibilidade

Alterações incompatíveis seguirão o padrão **expandir → migrar → contrair**:

1. adicionar a estrutura nova sem remover a antiga;
2. manter leitor/adaptador compatível;
3. migrar e validar;
4. trocar a leitura por feature flag tenant-scoped;
5. observar;
6. remover legado somente em release posterior aprovada.

Escritores devem preservar campos desconhecidos quando o contrato permitir. Cada release declarará dependências, ordem, versão de contrato e procedimento de retorno.

## Snapshot, observabilidade e rollback

Antes de ativar uma capacidade em um tenant, registrar:

- versões ativas de prompts e fluxos;
- configurações afetadas;
- contagem sanitizada das filas por estado;
- flags e integrações relevantes;
- versão do contrato e da aplicação;
- manifesto de rollback.

O rollback restaura somente o tenant e a capacidade afetados. O sistema interromperá ou reverterá a promoção diante de:

- qualquer indício de cross-tenant;
- aumento de duplicidade, falhas ou backlog acima da política;
- alteração inesperada de handoff;
- erro de RLS, autorização ou auditoria;
- contrato incompatível ou dado obrigatório ausente;
- falha de integração acima do limite;
- telemetria indisponível.

Kill switches existirão no nível global, por tenant e por capacidade. O switch global será reservado a incidentes; falha isolada deve usar rollback tenant-scoped.

## Segurança Supabase

- Todas as entidades expostas serão tenant-scoped e protegidas por RLS.
- `TO authenticated` não será considerado autorização suficiente sem predicado de propriedade/tenant.
- Views expostas utilizarão `security_invoker = true`.
- Funções privilegiadas fixarão `search_path`, validarão `auth.uid()` internamente e terão `EXECUTE` revogado de `PUBLIC` e `anon`.
- `SECURITY DEFINER` será usado apenas onde o bypass de RLS for indispensável.
- Claims editáveis de `user_metadata` não serão usados para autorização.
- Tokens e PII não serão retornados em logs, diffs, erros ou payloads do agente.

## Consequências positivas

- Redução progressiva da dependência do Super Admin.
- Mudanças explicáveis, versionadas e reversíveis.
- Aprovação humana concentrada em exceções reais.
- Evolução independente por tenant.
- Canais de decisão desacoplados do núcleo.
- Base mensurável para aumentar autonomia.

## Consequências negativas

- Maior complexidade de políticas, testes e observabilidade.
- Custo de manter Copiloto, Guardião e registro de capacidades separados.
- Rollout inicialmente mais lento.
- Necessidade de curadoria contínua das políticas e suítes tenant-scoped.
- E-mail e WhatsApp adicionam riscos de identidade, replay e indisponibilidade.

## Gates antes da implementação

- Baseline read-only de código e Lovable Cloud reconciliada.
- Zero achado P0 aberto.
- Matriz de risco validada por Produto, Arquitetura e Super Admin.
- Contratos e políticas documentados.
- Estratégia de testes, logs e rollback aprovada.
- Ausência de perda de capacidades existentes.
- Acoplamentos entre domínios identificados e removidos ou formalizados.

## Decisões pendentes

1. Thresholds iniciais de confiança, impacto e observação.
2. Subconjunto exato de ações Verdes e Amarelas do primeiro piloto.
3. Política de step-up por tipo de ação Vermelha.
4. Provedor e número administrativo de WhatsApp.
5. Duração mínima do shadow mode no `fluxrow`.
6. Primeiro tenant cliente e primeira capacidade para opt-in futuro.

## Referências

- Plano Mestre de Autonomia Operacional e Evolução Segura do Orbit, versão 2.0.
- `docs/MANUAL_MESTRE_ORBIT.md`.
- Migrations das Fases 1–4 do Centro de Operações.

## Revisão da decisão

Esta ADR deve ser revista antes de:

- permitir autoaprovação fora do `fluxrow`;
- autorizar novo tipo de ação executável;
- remover contratos legados;
- realizar rollout para múltiplos tenants;
- alterar os limites de ações Vermelhas ou proibidas.
