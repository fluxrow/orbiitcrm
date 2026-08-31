# Bullink — checkout determinístico v2

Data: 2026-08-31

## Problema observado

O envio e a fila estavam saudáveis, mas o fechamento ainda dependia da resposta
livre do modelo. No caso real `b7f606dc…`, o preço da Mentoria foi informado e o
lead respondeu “Sim”. O runtime antigo classificou o turno como venda, notificou
e transferiu a conversa antes de concluir o checkout. A resposta pública prometeu
enviar os dados, mas perguntou um horário e não perguntou PIX ou cartão.

Há dois defeitos independentes:

1. produção ainda sem o marcador do runtime corrigido;
2. aceite da Mentoria não possui uma saída determinística equivalente à já
   existente para aceite do Curso Gravado.

## Arquitetura atual

```text
inbound persistido
  -> claim idempotente
  -> estado commercial_v2 + histórico recente
  -> Anthropic
  -> guards comerciais
  -> classificação venda_fechada
  -> notificação/handoff
  -> outbox ai_reply
  -> Z-API
```

Pontos envolvidos:

- `commercial-signals.ts`: sinais, permissões e estado do checkout;
- `bullink-conversation-guard.ts`: última barreira tenant-scoped;
- `orbit-ai-agent/index.ts`: decisão de notificação, handoff, persistência e envio;
- `orbit_ai_config`: preços e dados oficiais de pagamento;
- `orbit_whatsapp_outbox`: entrega idempotente e observável.

## Alternativas avaliadas

### A. Apenas prompt

Baixa complexidade, mas mantém preço, ordem e fechamento probabilísticos. Foi a
estratégia que permitiu as regressões atuais. Rejeitada.

### B. Alterar o motor comercial global

Padroniza todos os tenants, porém muda contratos comerciais distintos sem
homologação individual. Alto risco de regressão cruzada. Rejeitada nesta etapa.

### C. Checkout determinístico e isolado da Bullink

Mantém o motor compartilhado, adiciona a última decisão determinística somente
quando `empresa_id` é exatamente o da Bullink e usa dados oficiais já presentes
na configuração. Escolhida por preservar os demais tenants e cobrir o funil real.

## Fluxo escolhido

```text
preço da Mentoria + “faz sentido?”
  -> lead aceita
  -> resposta canônica: escolher PIX ou cartão
  -> mantém IA responsável e notifica Fernando uma única vez
  -> lead escolhe PIX/cartão
  -> resposta canônica com dado oficial correspondente
  -> mantém IA responsável aguardando confirmação/comprovante
  -> comprovante recebido
  -> guard de comprovante existente realiza handoff humano
```

Para o Curso Gravado, o produto possui somente PIX:

```text
R$ 997 informado + aceite
  -> chave PIX oficial + pedido de comprovante
  -> comprovante recebido
  -> handoff existente
```

## Configuração

Nenhum valor comercial novo será hardcoded. O contrato lógico é:

```yaml
bullink_checkout:
  empresa_id: orbit_empresas.id
  primary_offer:
    product: mentoria
    price_line: orbit_ai_config.primary_offer_lock.primary_price_line
    methods: [pix, cartao]
  secondary_offer:
    product: curso
    price_line: orbit_ai_config.primary_offer_lock.secondary_price_line
    methods: [pix]
  payment_details:
    pix_key: extraída de orbit_ai_config.prompt_regras/prompt_roteiro
    card_url: URL oficial InfinitePay extraída dos mesmos campos
  handoff:
    on_acceptance: false
    on_payment_method: false
    on_receipt: true
```

Se os dados oficiais não estiverem completos, o checkout determinístico falha
fechado e não inventa chave ou link; o comportamento existente de handoff humano
permanece disponível.

## Critérios de aceitação

- Aceite da Mentoria após preço pergunta apenas PIX ou cartão.
- Aceite não pausa a IA e não transfere a conversa antes do pagamento.
- Escolha PIX envia somente a chave oficial e pede comprovante.
- Escolha cartão envia somente o link oficial e não informa total divergente.
- Aceite do Curso continua enviando R$ 997 + PIX sem ciclos de permissão.
- Pergunta de preço continua respondida no mesmo turno.
- Objeção financeira continua oferecendo Curso por R$ 997.
- No máximo uma pergunta por mensagem.
- Nenhum outro tenant muda de comportamento.
- Toda `ai_reply` nova registra a versão do runtime.

## Observabilidade e rollback

O outbox registra `agent_runtime_version` e os motivos do guard são emitidos sem
PII. O rollback é a reversão do commit; não há migration nem alteração de dados.
O monitor Bullink/Viver valida a primeira resposta real antes de considerar a
etapa concluída.
