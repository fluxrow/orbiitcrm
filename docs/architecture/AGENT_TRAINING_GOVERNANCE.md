# Governança do treinamento do agente

**Versão:** 1.0

**Data:** 2026-08-31

**Status:** Aprovado para implementação
**Escopo inicial:** Bullink (`tenant_agent_training_governance_v1`)

## Objetivo

Dar autonomia ao administrador do tenant para melhorar linguagem, tratamento de objeções e chamadas para ação sem permitir edição direta dos prompts-base ou das travas comerciais do Orbit.

O treinamento do cliente será uma camada adicional de orientação. Identidade, preços, meios de pagamento, regras de produto, handoff, memória, idempotência e demais guardrails determinísticos continuam sob controle do núcleo.

## Estado atual

```text
ConfigPage -> useUpdateAIConfig -> orbit_ai_config -> orbit-ai-agent
     |                                  ^
     +-> AgentSandbox ------------------+
```

- Identidade, roteiro e regras são editáveis no mesmo formulário.
- O botão de salvar pode alterar a configuração ativa imediatamente.
- A sandbox usa a configuração ativa, não um rascunho.
- Avaliações da sandbox não identificam qual conteúdo foi testado.
- O versionamento existente de prompts é separado da tela de configuração e não bloqueia o caminho direto.

## Opções consideradas

### A. Manter edição direta e criar backup automático

- Menor esforço.
- Não impede publicação de conteúdo não testado.
- Rollback existe, mas o incidente já pode ter alcançado leads.

### B. Versionar os três prompts-base no painel do cliente

- Reaproveita as tabelas de versões existentes.
- Ainda permite ao tenant contradizer regras estruturais, preços e identidade.
- Exige validar semanticamente textos livres que misturam comportamento e política.

### C. Camada de conversão governada e subordinada — escolhida

- O cliente edita somente orientações de conversão.
- Prompts-base ficam visíveis, mas bloqueados no painel comum.
- O rascunho é testado na sandbox por fingerprint imutável.
- Publicação exige aprovação dos cinco cenários do mesmo fingerprint.
- Publicação e rollback são transações tenant-scoped auditadas.
- O runtime injeta a camada antes das regras determinísticas, que sempre prevalecem.

## Arquitetura escolhida

```text
Administrador do tenant
        |
        v
AgentTrainingGovernanceCard
  | salvar rascunho
  v
orbit_agent_training_drafts -------+
  | fingerprint                     |
  +-> AgentSandbox -----------------+-> orbit-ai-sandbox
  |       | avaliar cenário              (carrega o rascunho no servidor)
  |       v
  |  orbit_agent_training_reviews
  |
  +-> publicar (5/5 do mesmo fingerprint)
          |
          v
orbit_agent_training_versions (imutável)
          |
          +-> orbit_ai_config.conversion_guidance
                       |
                       v
                 orbit-ai-agent
                       |
        prompts-base + orientação + guardrails determinísticos
```

## Contratos de dados

```yaml
feature_flag:
  key: tenant_agent_training_governance_v1
  rollout: tenant-scoped
  initial_tenant: bullink-negocios
  required_scenarios:
    - initial_approach
    - qualification
    - objection_handling
    - human_handoff
    - safety_boundaries

draft:
  empresa_id: uuid
  content: text
  revision: integer
  fingerprint: md5
  updated_by: uuid
  updated_at: timestamptz

review:
  empresa_id: uuid
  draft_fingerprint: text
  scenario_key: enum-like text
  status: pending | approved | rejected
  comment: text | null
  reviewer_id: uuid
  reviewed_at: timestamptz

version:
  empresa_id: uuid
  version_number: integer
  content: text
  fingerprint: text
  changelog: text
  is_active: boolean
  published_by: uuid
  published_at: timestamptz
```

## Autorização

- Leitura: usuário autenticado com acesso comprovado ao tenant.
- Salvar rascunho, avaliar, publicar e rollback: `super_admin` ou administrador ativo do tenant.
- Nenhuma tabela nova terá acesso direto de `anon` ou `authenticated`; o frontend usa RPCs com validação server-side.
- Funções `SECURITY DEFINER` validam `auth.uid()`, tenant e papel, usam `search_path` fixo e têm `EXECUTE` revogado de `PUBLIC`/`anon`.
- Toda mutação gera registro sanitizado em `orbit_audit_log`.

## Fluxo principal

1. O administrador escreve orientações de conversão e salva um rascunho.
2. O banco calcula um fingerprint e incrementa a revisão.
3. Aprovações de outro fingerprint não contam.
4. A sandbox envia somente o fingerprint; a Edge Function carrega o texto no servidor.
5. Cada um dos cinco cenários é aprovado ou rejeitado.
6. Publicar exige changelog, conteúdo inalterado e cinco aprovações do fingerprint atual.
7. O banco cria uma versão imutável, ativa-a e atualiza `conversion_guidance` atomicamente.
8. Rollback reativa uma versão do mesmo tenant e sincroniza runtime e rascunho.

## Preservação de capacidade

| Capacidade anterior | Resultado |
|---|---|
| Configurações não relacionadas a prompt | Preservada |
| Teste sem enviar WhatsApp | Preservada |
| Guardrails por tenant e compartilhados | Preservada e priorizada |
| Administração central dos prompts-base | Preservada no centro de operações |
| Histórico e rollback de prompts-base | Preservados |
| Edição direta insegura pelo tenant | Substituída por treinamento governado |

## Testes obrigatórios

- Contratos SQL: RLS, grants, autorização, fingerprint, cinco aprovações, imutabilidade, tenant isolation, publish e rollback atômicos.
- Frontend: prompts-base bloqueados, save comum não envia prompts, rascunho/diff/histórico e gates de publicação.
- Sandbox: carrega o conteúdo pelo fingerprint; rejeita fingerprint ausente, antigo ou de outro tenant.
- Runtime: orientação publicada é injetada antes das regras críticas.
- Regressão: suíte Vitest, typecheck, Deno check e build.

## Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Aprovar um texto e publicar outro | Fingerprint validado no banco e novamente na sandbox |
| Mistura de tenant | Tenant derivado do slug e validado por `user_has_empresa_access` |
| Cliente sobrescrever preço/identidade | Campos-base bloqueados; camada subordinada a guardrails |
| Publicação parcial | RPC transacional atualiza versão e runtime na mesma transação |
| Rollback para versão externa | FK lógica e filtro obrigatório por `empresa_id` |
| Bypass pelo save antigo | Hook remove campos protegidos; UI não os edita |
| Deploy de código sem migration | Feature falha fechada e card fica indisponível até RPC existir |

## Rollout e rollback

1. Aplicar migration e publicar `orbit-ai-sandbox` e `orbit-ai-agent` juntos.
2. Publicar frontend.
3. Validar a Bullink com rascunho vazio e baseline v1.
4. Fernando cria o primeiro rascunho, executa 5 cenários e publica.
5. Rollback operacional: selecionar uma versão anterior no painel.
6. Rollback de feature: desativar `tenant_agent_training_governance_v1`; a última orientação publicada permanece estável no runtime.

## Critérios de aceite

- Nenhuma edição do tenant altera produção antes de publicação explícita.
- Publicação sem cinco aprovações do fingerprint atual é recusada no banco.
- Sandbox não aceita conteúdo livre enviado pelo navegador.
- Um administrador da Bullink não lê nem altera dados de outro tenant.
- Uma versão anterior pode ser restaurada em um clique.
- Nenhum crédito Lovable é usado na implementação ou validação.

## Aprovação

- Produto/usuário: aprovado pela solicitação explícita de autonomia urgente em 2026-08-31.
- Arquitetura: opção C escolhida por preservar guardrails e eliminar o caminho direto.
- Segurança: implementação condicionada aos testes de isolamento, autorização e publicação fail-closed.
