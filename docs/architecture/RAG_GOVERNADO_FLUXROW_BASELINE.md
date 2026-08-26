# RAG governado — baseline e rollout canário

## Estado encontrado

O Orbit já possui ingestão de texto, URL, PDF, DOCX e arquivos de texto,
fragmentação, embeddings `google/gemini-embedding-001`, armazenamento em
`orbit_ai_knowledge` e recuperação semântica no `orbit-ai-agent`.

Na baseline de 26/08/2026:

- Bullink e Viver já possuíam `knowledge_base_enabled = true`;
- Fluxrow possuía uma fonte pronta, mas `knowledge_base_enabled = false`;
- a RPC `match_orbit_knowledge` era `SECURITY DEFINER` e executável por
  `authenticated`, apesar de aceitar `p_empresa_id` arbitrário.

O primeiro passo é endurecer esse contrato sem alterar o comportamento dos
agentes existentes. A busca passa a ser interna (`service_role`) e
`SECURITY INVOKER`.

## Modos governados

- `disabled`: nenhuma recuperação adicional.
- `shadow`: recupera e registra apenas metadados sanitizados; o contexto não é
  anexado ao prompt e não influencia a resposta.
- `active`: o contexto aprovado pode ser usado pelo runtime após promoção
  explícita e individual do tenant.

A criação da tabela de configuração não ativa nenhum modo. Não existe seed nem
alteração automática de `orbit_ai_config.knowledge_base_enabled`.

## Shadow mode do Fluxrow

O shadow mode só poderá ser ligado depois de:

1. definir um provedor de embeddings que não dependa de créditos do agente
   Lovable;
2. aprovar um orçamento e limites de chamadas;
3. classificar e versionar as fontes do Fluxrow;
4. criar avaliações com perguntas esperadas e critérios de conflito;
5. validar que logs não armazenam texto de consulta, chunks, prompts, respostas
   ou PII;
6. executar uma reauditoria de grants e RLS.

## Promoção segura

`fluxrow/disabled -> fluxrow/shadow -> fluxrow/active -> tenant específico/shadow`

Cada mudança exige evidência de avaliação, aprovação explícita, feature flag
tenant-scoped e rollback para `disabled`. Bullink, Viver, Fábrica e demais
tenants nunca herdam o estado do Fluxrow.

## Fronteira determinística

RAG pode apoiar produtos, preços, objeções, FAQs e provas sociais. Agenda,
consentimento, campanhas, identidade, links oficiais, posse humana, limites,
filas e idempotência continuam sob regras determinísticas e dados autoritativos.

## Governança de fontes

Cada fonte passa a possuir classificação, sensibilidade, estado de aprovação e
versões identificadas por hash SHA-256. O histórico de versões e decisões é
append-only para o runtime; conflitos guardam apenas hashes e metadados, nunca o
conteúdo recuperado.

A fonte legada existente do Fluxrow entra como `reference/internal/draft`. Esse
registro apenas cria a baseline documental: não liga `knowledge_base_enabled`,
não cria configuração `shadow` e não autoriza o uso da fonte em respostas.
