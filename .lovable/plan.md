# Diagnóstico: Fernando ofereceu "colocar em contato com um especialista" (Bullink)

Somente leitura. Nenhuma mutação de dados, nenhum deploy, nenhuma chamada Z-API, nenhuma mensagem enviada.

## Causa raiz (confirmada)

A frase não veio de criatividade do modelo nem de handoff real. Ela é uma **regra hardcoded global** dentro do system prompt do agente, em `supabase/functions/orbit-ai-agent/index.ts` linha 1203:

```text
REGRAS CRÍTICAS:
5. Quando TODAS as informações relevantes (cadastro + qualificação obrigatória) estiverem preenchidas,
   agradeça e informe: "Perfeito. Vou colocar um especialista para avançarmos de forma mais objetiva."
```

Essa regra é montada para todos os tenants, depois do bloco de identidade, e entra em conflito direto com o `prompt_identidade` da Bullink, que diz literalmente "Nunca se apresente como assistente virtual... equipe, atendente ou intermediário. Nunca diga que vai encaminhar a conversa para o Fernando, pois você fala como Fernando."

Por que disparou exatamente naquele turno:

- `campos_qualificacao` da Bullink está vazio (`[]`), então não existe nenhum campo obrigatório pendente.
- `ai_contexto` da conversa do Ronaldo tem `cadastro_completo: true` e `estado: qualificado`.
- O lead disse "Ficou mais claro." — encerrando as dúvidas. Com zero campos faltantes e cadastro completo, a condição da regra 5 fica satisfeita e o modelo executou a instrução, apenas parafraseada ("quer que eu te coloque em contato com um especialista para seguir de forma mais objetiva?").

Não foi handoff real: `handoff_sent_at` é `NULL`, `human_talk` é `false`, `commercial_notified` é `false` e nenhum registro em `orbit_handoffs` foi criado para esse turno. A separação de identidade existiu **só no texto**, o que é pior para a persona: prometeu um terceiro que nunca vai aparecer.

Não há template, tool schema ou notify-seller envolvido. `notifyCommercialHumanDetected` só roda em sinal comercial real (`falar_humano`, `venda_fechada`, `agendar_call`), e nenhum foi detectado nesse turno.

## Por que `commercial_v2.product_explained` continuava `false`

`updateCommercialState` (em `_shared/commercial-signals.ts`, linha 538) marca `product_explained` como verdadeiro apenas se:

1. a resposta do agente citou preço, ou
2. o sinal `informational_question` foi detectado **na mensagem do lead**.

As perguntas do Ronaldo foram "Gostaria de entender melhor", "O que preciso pra começar a trabalhar a colocar em prática?", "Qual o mínimo de especificações do computador?". Nenhuma casa com os padrões de `RE_INFORMATIONAL` (que esperam "como funciona", "o que inclui", "quantas aulas", "tem suporte" etc.), e o Fernando nunca citou valor. Resultado: `product_explained: false`, `product_focus: null`, apesar de cinco turnos consecutivos explicando a Mentoria.

Consequência prática: o estado comercial não reconhece que a oferta já foi explicada, então nenhuma permissão de avanço se abre — e o modelo, sem caminho comercial liberado e com a regra 5 satisfeita, cai justamente no "especialista".

## Outras ocorrências Bullink pós-cutoff

Busca em `orbit_mensagens` OUT do tenant desde 2026-08-01, excluindo menções legítimas à "IA especialista em algoritmo do YouTube" (que é entregável da Mentoria e está correta):

| Quando (UTC) | Conversa | Texto |
| --- | --- | --- |
| 2026-08-13 14:47:59 | b4996220 (Ronaldo) | "quer que eu te coloque em contato com um especialista para seguir de forma mais objetiva?" |
| 2026-08-12 17:12:37 | 560a2896 (Sandro) | "Então vou colocar um especialista para seguir de forma mais objetiva. Ele entra em contato com você em breve." |
| 2026-08-12 16:28:02 | 2ef9cf68 | "Perfeito. Vou colocar um especialista para seguir de forma mais objetiva." |
| 2026-08-12 01:52:36 | dd9f0fa2 | "Perfeito. Vou colocar um especialista para seguir de forma mais objetiva." |

Quatro ocorrências, todas parafraseando a mesma regra hardcoded. Nenhuma menção indevida a "consultor", "nossa equipe" ou "vou encaminhar" fora desse padrão.

## Guard mínimo proposto (a implementar depois, se aprovado)

Novo módulo `_shared/no-identity-split.ts`, ativado por flag tenant-scoped em `orbit_ai_config` (nada muda para outros tenants sem a flag):

1. **Neutralizar a regra 5 quando a flag estiver ligada.** Em vez da frase do "especialista", a instrução passa a ser: com tudo preenchido, avançar você mesmo (aprofundar, apresentar condições ou propor o próximo passo direto), porque você é o dono da oferta.
2. **Bloco de prompt de identidade única.** Proibição explícita de prometer terceiro: especialista, consultor, equipe, atendente, responsável, colega, "alguém entra em contato", "vou te encaminhar", "vou passar para".
3. **Detector determinístico por cláusula** na saída: promessa de terceiro + verbo de transferência. Deve ignorar deliberadamente:
   - "IA especialista em algoritmo do YouTube" e variantes (entregável real da Mentoria);
   - "especialista" como adjetivo do próprio Fernando ("sou especialista em...").
4. **Exceção de handoff humano genuíno.** O guard não bloqueia quando o lead pede pessoa/humano/atendente/ligação com alguém (`intencao = falar_humano`), quando o handoff configurado da Patrícia é acionado por venda ou agendamento de call, ou quando `human_talk` já está ativo. Nesses casos a transferência é real e a frase é honesta.
5. **Sanitização + retry corretivo**, no mesmo padrão dos guards já existentes (`no-location-collection`, `primary-offer-guard`): remove só a cláusula ofensora, tenta um retry com instrução corretiva e, se necessário, usa fallback que mantém a condução com o Fernando — nunca deixa a mensagem vazia e nunca inventa preço ou link.
6. **Correção do `product_explained`**, para o estado comercial refletir a realidade: marcar como explicado quando o próprio agente descreveu a oferta (entregáveis, duração, formato), não apenas quando o lead usa uma das frases catalogadas.

## Resposta correta para aquele turno

Depois de "Ficou mais claro.", com a Mentoria já explicada e nenhuma objeção de preço, a resposta coerente com a persona seria o Fernando conduzindo ele mesmo, por exemplo:

> "Boa, Ronaldo. Então o próximo passo é você entrar na Mentoria e começar com a estrutura pronta. Quer que eu te passe o valor e as condições?"

Isso respeita o formato WhatsApp (3 frases, 350 caracteres, uma pergunta), mantém identidade única, não cita preço sem permissão e não envia PIX nem link.

## Smokes previstos (dry_run, stub, sem Z-API)

- Caso Ronaldo exato, cadastro completo + `campos_qualificacao` vazio, sem objeção: saída não pode conter promessa de terceiro.
- "Perfeito. Vou colocar um especialista..." como candidata do modelo: sanitizada e substituída por condução do Fernando.
- Lead diz "quero falar com uma pessoa": handoff permitido, guard não interfere.
- Venda fechada / agendamento de call com handoff da Patrícia: frase de transferência permitida.
- Resposta citando "IA especialista em algoritmo do YouTube": preservada byte-for-byte.
- "sou especialista em Canal Dark" dito pelo próprio Fernando: preservado.
- Regressão: tenant sem a flag mantém a regra 5 e a saída legada inalteradas.
- Estado: agente explica a oferta e `product_explained` passa a `true` sem depender de frase catalogada do lead.

## Confirmação

Zero mutações: apenas `SELECT` no banco e leitura de arquivos. Zero chamadas Z-API, zero mensagens enviadas, zero deploy, zero reprocessamento.
