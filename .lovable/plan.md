# Auditoria somente leitura — condução de preço e fechamento (Bullink)

Tenant auditado: `4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18`. Zero escritas, zero deploy, zero geração de resposta, zero Z-API, zero PII/transcrição.

## 1) Como está hoje (regras vigentes)

Fontes: `orbit_ai_config` (`prompt_identidade` 1169 chars, `prompt_roteiro` 4026, `prompt_regras` 7128, `updated_at` 2026-08-12 14:08:35Z), montagem em `supabase/functions/orbit-ai-agent/index.ts` (bloco de 3 partes + REGRAS CRÍTICAS 1–10 + REGRAS INVIOLÁVEIS), guard em `supabase/functions/_shared/commercial-stage-guard.ts`.

Flags do tenant: `strict_commercial_stage_guard=true`, `block_email_collection=true`, `modo_automatico=true`, `knowledge_base_enabled=true`, `responder_fora_horario=true`, `scheduling_mode=human_handoff_after_period`, `modelo_ia=claude-sonnet-4-5`.

- **Descoberta**: roteiro manda reconhecer o interesse, entender objetivo com YouTube e aprofundar só o que falta (estágio atual, resultado desejado, gargalo, disponibilidade, suporte desejado), uma pergunta por vez, ligando explicação ao gargalo.
- **Quando falar valores**: bloco "ESTAGIO COMERCIAL" (regras) diz que preço só aparece se o lead perguntar diretamente quanto custa / valor / preço / investimento / condições / parcelamento, ou manifestar intenção clara de fechar/comprar/inscrever. Dado cadastral isolado (e-mail, telefone, nome) nunca autoriza. Já o `prompt_roteiro`, em "OFERTAS", apresenta a Mentoria "por R$ 6.500,00 à vista no PIX ou 12x de R$ 642,44" como parte da própria explicação da solução.
- **Quando oferecer curso**: Curso Gravado R$ 997,00 à vista no PIX é alternativa quando o lead sinaliza limitação de orçamento ou pede opção acessível; explicitamente "nunca desqualificação"; renda/emprego nunca bloqueiam a Mentoria.
- **Quando perguntar PIX/cartão**: a frase é literal e obrigatória — "Perfeito! Para você, fica melhor fazer à vista no PIX ou parcelado no cartão de crédito?" — e só depois do aceite; o bloco ESTAGIO COMERCIAL restringe ainda mais: só quando o lead quiser fechar ou perguntar como pagar/inscrever. Antes da escolha é proibido link/chave.
- **Quando enviar dados de pagamento**: apenas após a escolha da forma. PIX: chave aleatória fixa + pedir comprovante. Cartão: informar somente "12x de R$ 642,44" + link. Proibido citar/calcular total acumulado do parcelamento; proibido inventar desconto/condição; proibido afirmar pagamento compensado sem confirmação.
- **Pergunta obrigatória ao final**: "quando for natural, termine com uma única pergunta curta"; nunca mais de uma pergunta por mensagem; se faltar espaço, cortar a explicação, nunca a pergunta.
- **Limite de frases**: máx. 3 frases curtas, ≤350 caracteres, um único parágrafo, sem listas/linhas em branco. O prompt do código traz ainda "máximo 2-3 frases" (regra crítica 7).
- **Pedido de e-mail**: proibido em qualquer hipótese (cadastro, acesso, inscrição, pagamento). Se o lead mandar espontaneamente, não repetir nem confirmar.

## 2) Conflitos e rigidez identificados

1. **Roteiro vs. Estágio comercial**: "OFERTAS" instrui a apresentar R$ 6.500 / 12x como descrição da solução, enquanto ESTAGIO COMERCIAL proíbe valor sem pergunta direta. O modelo recebe as duas instruções no mesmo prompt.
2. **Dois canais de pagamento conflitantes nas regras**: em "FORMATO WHATSAPP" o link de cartão é `pay.hypercash.com.br/...`; em "PREÇOS E FECHAMENTO" é `link.infinitepay.io/...`. Duas fontes de verdade para o mesmo passo.
3. **Sequência de preço contraditória**: uma regra manda, quando o lead pergunta valor e cartão juntos, **não citar nenhum valor** e só perguntar PIX/cartão; outra (ESTAGIO COMERCIAL/roteiro) trata pergunta de valor como autorização para informar preço. O resultado prático é o comportamento observado de "não responder o preço perguntado".
4. **"Não falar pagamento cedo" confundido com "não informar preço"**: o guard determinístico trata numa única categoria valor, preço, investimento, PIX, cartão, parcelamento, link, inscrição e fechamento (`COMMERCIAL_SENTENCE_PATTERNS`). Sem intenção reconhecida, a sentença com preço é removida junto com as de pagamento.
5. **Autorização baseada só na mensagem atual**: `evaluateCommercialStage` avalia exclusivamente o inbound corrente; histórico nunca autoriza. Um lead que perguntou preço, recebeu contexto e depois responde "e o cartão?" pode cair em `no_commercial_intent` se o inbound não bater nos regexes.
6. **Rigidez de gatilho por palavra**: `hasExplicitClosingIntent` exige formas como "quero fechar", "manda o link", "onde eu pago". Paráfrases ("bora", "vamos nessa então", "topo") podem não casar; e `\bpix\b` na lista de pricing faz qualquer menção a PIX liberar tudo.
7. **Assimetria de sanitização**: quando o guard age, ele apaga a frase comercial e, se nada sobrar, aplica um fallback genérico — a dúvida real do lead deixa de ser respondida.

## 3) Classificador estruturado de preço/compra?

Não existe. Hoje há apenas:
- o enum livre `intencao` que o próprio LLM devolve (`saudacao|orcamento|duvida|reclamacao|agradecimento|agendar_call|venda_fechada|falar_humano|outro`) — sem estados de preço, objeção de orçamento ou forma de pagamento;
- regex determinísticos pós-geração no `commercial-stage-guard.ts` (`hasExplicitPricingIntent`, `hasExplicitClosingIntent`, `isInboundOnlyContactData`).

Não há modelo/classificador dedicado a estados de compra, nem matriz de preço por produto/estágio. A **matriz de intents de preço discutida anteriormente ficou apenas como proposta** — não há código, tabela ou coluna correspondente.

## 4) Memória persistente de estágio comercial?

Parcial e insuficiente. `orbit_conversas.ai_contexto` persiste `estado`, `ultima_intencao`, `em_coleta_orcamento`, `campos_coletados`, `cadastro_completo`, `commercial_notified`, `intro_already_sent`, flags de agendamento. `agent-memory.ts` hidrata fatos canônicos cadastrais/qualificação (inclui `renda_capital` como campo genérico).

Não existe registro de: produto apresentado, preço informado (qual, quando), objeção de orçamento levantada, intenção de fechamento manifestada, forma de pagamento escolhida, dados de pagamento já enviados, comprovante pendente.

## 5) Regra determinística pós-geração que bloqueia/reescreve preço

Sim, três camadas em `orbit-ai-agent`, na ordem: guard de repetição → guard de e-mail (`no-email-collection.ts`) → **guard de estágio comercial** (`strict_commercial_stage_guard=true` no Bullink). O terceiro: avalia inbound+resposta, em violação faz **uma** regeração com instrução corretiva, e se ainda violar remove as sentenças comerciais (`sanitizeCommercialAdvance`) ou aplica o fallback "Perfeito. Seguimos por aqui mesmo no WhatsApp. Qual é a principal dúvida que você quer resolver agora?". Existe também o normalizador PT-BR de estilo. Nenhuma dessas camadas consulta memória de estágio.

## 6) Mudanças recentes: prova social vs. preço

- `a2d953c` ("Corrigiu falso positivo prova social", 2026-08-12 19:34Z) — 3 arquivos: `_shared/proof-media.ts`, `_shared/proof_media_test.ts`, `orbit-ai-agent/index.ts` (+197/−31), todos no caminho de mídia. **Não tocou preço, prompts, guard comercial nem dados do tenant.** Confirmado.
- A última alteração que tocou condução comercial foi na configuração do tenant (`orbit_ai_config.updated_at` 2026-08-12 14:08:35Z), que inseriu o bloco "ESTAGIO COMERCIAL", e o `commercial-stage-guard.ts` com `strict_commercial_stage_guard`.

## 7) Arquitetura proposta (não implementada)

Substituir gatilho por palavra isolada por **sinais acumulados + estado flexível**, com três permissões distintas em vez de um único portão.

### Camada A — extrator de sinais por turno (determinístico + LLM como reforço)
Por inbound, produzir sinais com peso e decaimento, nunca decisão: `pergunta_valor_direta`, `pergunta_condicoes/parcelamento`, `comparacao_produtos`, `objecao_orcamento`, `intencao_fechar`, `escolha_forma_pagamento`, `pedido_dados_pagamento`, `apenas_dado_cadastral`, `pergunta_informativa`. O LLM devolve os mesmos rótulos em campo estruturado; sinal vale quando regex **ou** LLM apontam, e conflita para o lado conservador só nas permissões mais fortes.

### Camada B — estado comercial persistente (por conversa)
Novo bloco em `ai_contexto` (ex.: `estagio_comercial`): produto em foco, `preco_informado` (produto, valor, timestamp), `objecao_orcamento`, `intencao_fechamento_em`, `forma_pagamento_escolhida`, `dados_pagamento_enviados_em`, `aguardando_comprovante`, contador de perguntas de valor não respondidas. Atualizado após cada turno e injetado no prompt como fato autoritativo.

### Camada C — três permissões independentes
- **`pode_mencionar_preço`**: liberado quando há qualquer sinal de interesse comercial acumulado ou preço já informado antes; permite falar de faixa/ancoragem no contexto da explicação.
- **`deve_responder_preço_agora`** (obrigação, não permissão): ativo quando o inbound pergunta valor/condições, ou quando existe pergunta de valor pendente não respondida. Nesse estado o guard **não pode** apagar o preço — a omissão passa a ser a violação, e a resposta deve trazer o número do produto em foco em uma frase.
- **`pode_pedir_forma_de_pagamento`**: só com preço já informado **e** sinal de fechamento/escolha (ou pedido explícito de como pagar). Enviar chave/link exige `forma_pagamento_escolhida` registrada.

### Camada D — guard reorientado
O guard deixa de ser lista única: separa "preço/valor" de "pagamento/checkout", consulta as três permissões e o estado persistido, e passa a ter dois vereditos — avanço indevido (sanitiza) e **preço omitido quando devido** (regera cobrando a resposta). Mantém idempotência, uma única regeração e fallback consultivo apenas quando nada for permitido.

### Camada E — higiene de configuração
Eliminar as duplicidades apontadas em §2 (link de cartão divergente, sequência de preço contraditória, oferta proativa vs. gate) deixando uma única fonte de verdade por produto/forma de pagamento, e testes determinísticos por permissão.

### Riscos e escopo
Mudança tenant-scoped por flag nova, com o comportamento atual preservado quando desligada; sem alteração de preços, persona, warm-up, cutoff, quotas, campanhas, fluxos, RLS ou outros tenants; validação em dry-run/stub sem Z-API.

**Nenhuma alteração foi feita nesta auditoria.**
