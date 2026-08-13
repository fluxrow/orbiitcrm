# Diagnóstico read-only — Fernando perguntando cidade (Bullink)

Tenant: Bullink `4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18`. Corte de automação: `2026-08-11 19:34:16Z`.

Confirmação: **zero mutações** (somente SELECT e leitura de arquivos), **zero chamadas externas** (nenhuma invocação do agente, nenhuma chamada Z-API, nenhum e-mail, nenhum deploy).

## 1) Ocorrências pós-cutoff

| Métrica | Valor |
| --- | --- |
| OUT com termos de cidade/localização (pós-cutoff) | 14 |
| Idem, excluindo notificação interna "Novo Lead Qualificado" | **11** (perguntas reais ao lead) |
| Mesmas OUT **antes** do cutoff | **0** |
| Primeira ocorrência | 2026-08-11 21:24:08Z |
| Pedido de e-mail ao lead (pós-cutoff) | 2 |

Timestamps das perguntas ao lead (UTC): 21:24:08, 22:29:03, 23:32:57 (11/08); 00:02:36, 00:18:21, 12:59:31, 16:46:29, 16:48:01 (12/08) e demais do mesmo padrão. As 3 restantes são a notificação interna ao responsável (contém "Cidade: ..." como campo de ficha, não é pergunta ao lead).

Paráfrases anonimizadas (sem PII):
- "…nichos validados, idiomas de atuação, 3 meses de acompanhamento. **Qual cidade você mora?**"
- "…você aplica usando a sua ferramenta. **Qual é a sua cidade?**"
- "Perfeito. Agora só falta me dizer a sua **cidade e estado para finalizar o cadastro**."
- "Anotado. Agora me diz, **você mora em qual cidade?**"
- "Perfeito, então o caminho está mais claro. Pra finalizar: **qual é a sua cidade?**"

## 2) Vínculo por ocorrência

Padrão idêntico em todas: o inbound imediatamente anterior é uma resposta de conteúdo/objetivo do lead ("Não tenho nada em mente", "Queria usar minha ferramenta", "Nenhum", objetivo do canal, e em dois casos o **e-mail recém-informado**). A pergunta de cidade vem grudada no fim da resposta, como fechamento de cadastro.

- source/outbox: `ai_reply` com `status=sent` em 10 casos; 1 caso com último registro `manual/pending` na conversa.
- versão do agente: `orbit-ai-agent` com Claude `claude-sonnet-4-5`, `modo_automatico=true`.
- `commercial_v2` presente no `ai_contexto` dessas conversas: **não** (`false` em todos os casos listados; 29 conversas do tenant já têm o namespace, todas posteriores).

## 3) Onde a cidade aparece (e onde não aparece)

Não existe instrução de cidade no escopo oficial:
- `prompt_regras`: 0 menções a cidade/localização/estado/UF.
- `prompt_roteiro`: 0 menções.
- `prompt_identidade`: 0 menções reais (o único match é a expressão "de onde" fora desse contexto).
- Base de conhecimento ativa: 0 chunks mencionando cidade/localização.
- Onboarding/materiais do tenant: 0 menções.
- Templates de mensagem do tenant: nenhum com cidade.
- `campos_qualificacao` do tenant: **`[]`** (vazio).

A cidade aparece só em código genérico do CRM:
- `orbit-ai-agent/index.ts:1001` — fallback **hardcoded**: quando `campos_qualificacao` está vazio, os campos de cadastro passam a ser `["nome_razao", "email_principal", "cidade"]`.
- `:1005-1008` — `camposFaltantes` = esses campos ainda vazios no prospect; `cadastro_completo=false` enquanto faltarem.
- `:423-433` — mapeamento `cidade → city` em `missingFields`, injetado no prompt como `"city": true`.
- `:1146` — regra crítica nº 2: "Solicite APENAS os campos marcados como 'true' em missingFields".
- `:1149` — regra nº 5: só encerra a coleta "quando todas as informações (cadastro + qualificação) estiverem preenchidas".
- `:1195` — turno do usuário injeta literalmente "Campos faltantes: email_principal, cidade".
- `:232-239` — validador de cidade; `:1166` — `dados_extraidos.cidade` no schema JSON; `:1933` e `send-vendedor-notification` — cidade na notificação interna.

## 4) Campo canônico genérico + regra de "cadastro completo"

Sim, é exatamente isso. `orbit_prospects.cidade`/`estado` são colunas canônicas do CRM (363 prospects Bullink, apenas 9 com cidade). Como o Bullink não definiu `campos_qualificacao`, o agente cai no fallback genérico e passa a tratar `cidade` (e `email_principal`) como pendência obrigatória de cadastro, com instrução explícita para pedir os campos faltantes e só "finalizar" quando completos. Daí a frase literal "para finalizar o cadastro".

## 5) Impacto comercial da cidade no Bullink: nenhum

Produto (Mentoria F.A. / Curso Gravado), preço (R$ 6.500 PIX ou 12x R$ 642,44; R$ 997), forma de pagamento, link oficial InfinitePay, qualificação, entrega (100% online), agendamento (timezone fixo `America/Sao_Paulo`) e roteamento/handoff (Fernando/Patrícia) não dependem de cidade ou estado em nenhuma regra, prompt ou fluxo do tenant. **Classificação: fora de escopo** — pergunta puramente cadastral herdada do CRM, que consome turnos e desvia da condução consultiva.

## 6) commercial_v2 não causou nem expôs isso

Primeira ocorrência 11/08 21:24Z, todas as ocorrências listadas em conversas **sem** `commercial_v2` no contexto. O módulo de sinais comerciais não trata cidade em nenhum ponto. O comportamento é anterior e independente; o que o antecedeu foi a entrada do tenant em automação (cutoff 11/08 19:34Z), quando o agente começou a responder leads novos com o fallback genérico ativo.

## 7) Causa raiz, alcance, risco

- **Causa raiz**: `campos_qualificacao = []` no Bullink faz `orbit-ai-agent` aplicar o fallback hardcoded `["nome_razao","email_principal","cidade"]`, que entra no prompt como `missingFields.city = true` + "Campos faltantes: … cidade" + regra "solicite apenas os campos faltantes" e "só encerre quando o cadastro estiver completo". O LLM cumpre a instrução e pergunta cidade (e e-mail).
- **Alcance**: qualquer tenant sem `campos_qualificacao` definido — no Bullink, todo lead pós-cutoff atendido pelo agente. 11 perguntas de cidade e 2 de e-mail já enviadas.
- **Risco**: conflito direto com a diretriz de não coletar e-mail, perda de turnos em pergunta irrelevante, atrito na condução comercial e risco de o lead perceber script de cadastro em vez de conversa com o Fernando. Nenhum risco de dado sensível.

## Correção mínima recomendada (tenant-scoped, não implementada)

1. Definir explicitamente o conjunto de campos de cadastro do Bullink como vazio/irrelevante — de preferência via configuração do tenant (`campos_qualificacao` com as perguntas realmente oficiais, ou campos de cadastro explicitamente vazios), para que `camposFaltantes` não inclua `cidade` nem `email_principal`.
2. Tornar o fallback hardcoded opt-in em vez de padrão: quando o tenant não define campos, não injetar `missingFields` de cadastro nem a instrução de "finalizar cadastro" (mudança global de comportamento padrão, sem efeito em tenants que já configuram campos).
3. Reforço barato e imediato no `prompt_regras` do Bullink: proibir perguntar cidade, estado, localização e e-mail, já que não influenciam produto, preço, pagamento, entrega, agendamento ou roteamento.
4. Sem reprocessamento, sem reenvio e sem mexer nas 11 mensagens já enviadas.

Recomendo aplicar (1) + (3) como correção mínima no Bullink e tratar (2) como hardening global em entrega separada.
