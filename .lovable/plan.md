# Diagnóstico: vídeo de prova social disparado por "Opa" (Bullink)

Auditoria somente leitura. Zero mutações, zero chamadas externas, apenas SELECTs e leitura de código no tenant `4f6b4a18…`.

## 1. Incidente identificado (anonimizado)

Caso A — conversa `88b16eeb…`, prospect `96d494b1…`:

| Hora (UTC) | Evento |
|---|---|
| 19:02:14 | OUT inicial do fluxo (status `simulated`): "…quero entender melhor o que você busca construir no YouTube. Qual é o principal resultado que você quer alcançar agora?" |
| 19:02:30 | IN exatamente `Opa` (msg `33e0de4b…`) |
| 19:02:56 | OUT `tipo_midia=video`, legenda "Dá uma olhada no resultado recente de um dos nossos alunos:" (msg `6ccdd9fa…`) |
| 19:02:59 | OUT texto de boas-vindas (ainda `queued`) — ou seja, o vídeo saiu ANTES da própria saudação |
| 19:03:10 | Envio real confirmado |

Registro na fila: outbox `9e5eed2d…`, `source_type=ai_reply`, `source_id=33e0de4b…` (o próprio inbound), `payload_type=video`, `status=sent`, `sent_at=19:03:10.614Z`, `media_library_id=c6fc4d5f…`, `quota_reason=engaged_reply_reserve` (96/100 diário, 1/30 na conversa), idempotência `media:<media>:<inbound>|ai_reply|<empresa>|<prospect>|<inbound>` (correta, sem duplicidade).

**Metadata decisiva:** `media_intent_reason = "affirmative_after_offer"`.

## 2. Causa raiz exata

O caminho disparado foi `affirmative_after_offer` — os dois lados do gate deram falso positivo:

1. `isShortAffirmative("Opa")` → **true**. O `AFFIRMATIVE_RE` em `supabase/functions/_shared/proof-media.ts:14` inclui, além de aceites reais, interjeições de saudação/preenchimento: `opa`, `aham`, `uhum`, `ok`, `blz`, `top`, `legal`, `show`, `s`, `ss`. "Opa" em PT-BR é cumprimento, não aceite.
2. `agentOfferedProof(última OUT)` → **true** indevidamente. `PROOF_OFFER_RE` casa `result\w*` com a palavra "**resultado**" da pergunta padrão de descoberta do Fernando, e `OFFER_VERB_RE` casa "**quer**". A mensagem não oferecia prova alguma — é o *opening* padrão de todo lead novo.

Ou seja: **toda conversa Bullink que abre com o opening padrão ("qual é o principal resultado que você quer alcançar") fica com uma "oferta de prova" latente; qualquer primeira resposta curta do lead ("opa", "ok", "oi" não, mas "opa/ok/blz/top" sim) dispara vídeo imediato.**

Descartado: não é `explicit_request` (o inbound não tem termo de prova) nem `agent_decision` (o reason gravado seria outro). A busca do histórico está correta — filtra por `conversa_id` + `empresa_id`, `direcao=OUT`, `timestamp desc limit 1` (`orbit-ai-agent/index.ts:1638-1646`); não há vazamento de outra conversa nem ordenação errada. `readAgentProofDecision` não é o gatilho aqui, mas é permissivo (aceita 4 nomes de flag booleana e regex em 4 campos de string) — risco secundário, não a causa. Defeito adjacente: essa busca aceita OUT com status `simulated`, portanto uma mensagem que o lead nunca recebeu conta como "oferta".

## 3. Alcance e risco

Mídias de prova social já enviadas no Bullink (histórico completo da tabela): **3**, todas do mesmo tenant — agregação por `empresa_id` retorna uma única linha, o incidente é **tenant-scoped**.

- `8b03aff4…` (11/08 19:20) — `dry_run: true`, teste.
- `bb159570…` (12/08 01:41) — inbound era literalmente `ok`, reason `affirmative_after_offer`, **sent**.
- `9e5eed2d…` (12/08 19:02) — inbound `Opa`, reason `affirmative_after_offer`, **sent**.

**2 de 2 envios reais foram falsos positivos** (inbound sem termo de prova e sem oferta válida imediatamente anterior). Risco atual: alto e recorrente — Bullink está com `envio_real_liberado=true` e adapter ativo, com fluxo de leads novos ativo; a probabilidade de repetição é próxima de 1 para cada lead que responde com interjeição curta. Impacto: vídeo de prova social chegando como primeira mensagem, antes da saudação, sem contexto — dano de percepção comercial, não de dados/segurança. Sem risco de rajada (idempotência e cota engajada funcionaram).

## 4. Correção mínima recomendada (não implementada)

Escopo: apenas `supabase/functions/_shared/proof-media.ts` + testes; nada de banco, prompt, fila ou outros tenants.

1. **Retirar interjeições do `AFFIRMATIVE_RE`**: remover `opa`, `aham`, `uhum`, `top`, `legal`, `show`, `s`, `ss`, `blz`, `beleza`, `ok`, `okay` — manter só aceites inequívocos (`sim`, `quero`, `quero ver`, `manda`, `manda aí`, `mostra`, `pode mandar`, `claro`, `com certeza`, `por favor`, `positivo`, 👍/👌/✅).
2. **Endurecer `agentOfferedProof`**: exigir que a OUT anterior contenha um substantivo de prova (`prova`, `depoimento`, `testemunho`, `case`, `print`, `vídeo`) **ou** `resultado` acompanhado de um verbo de exibição de mídia (`mandar`, `enviar`, `mostrar`, `ver`) na mesma frase — e explicitamente não casar quando a frase é uma pergunta de descoberta ("qual resultado você quer/busca…"). Uma opção mais simples e segura: remover `result\w*` da `PROOF_OFFER_RE` e manter apenas termos de prova.
3. **Só considerar oferta uma OUT realmente entregue**: no call site, filtrar `status in ('enviada','entregue','lida')` (excluir `simulated`, `queued`, `canceled`, `failed`).
4. **Guard de abertura**: não enviar prova quando ainda não houve nenhuma OUT real entregue na conversa (evita mídia como primeira mensagem).
5. **Estreitar `readAgentProofDecision`**: aceitar apenas `enviar_prova_social === true` e `media_intent === "prova_social"` (match exato), não regex em 4 campos.
6. **Testes de regressão** em `proof_media_test.ts`: "Opa"/"ok"/"blz"/"top" após o opening padrão → sem intent; "sim" após oferta explícita de vídeo/depoimento → intent; pergunta de descoberta com "resultado" → não é oferta; OUT `simulated` não conta como oferta; nenhuma mídia antes da primeira OUT entregue.

## Declaração

Zero mutações (somente `SELECT` e leitura de arquivos), zero chamadas externas, zero acesso a dados de outros tenants além da contagem agregada por `empresa_id`. Nenhum telefone, nome de lead ou identificador pessoal foi incluído neste relatório.
