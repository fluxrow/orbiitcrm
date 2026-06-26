## Parte 1 — Corrigir header sumido na home (`/`)

**Causa:** A rota `/` está fora do `<Route element={<PublicLayout />}>`, então a `LandingPage` perdeu o `HotsiteHeader` (onde mora o botão **Entrar**).

**Correção em `src/App.tsx`:** mover `<Route path="/" element={<LandingPage />} />` para dentro do grupo `PublicLayout`. O `HotsiteHeader` volta com Produto/Recursos/FAQ + WhatsApp + **Entrar** + theme toggle. `LandingPage` herda `pt-16` do layout.

Sem mudanças no componente `HotsiteHeader.tsx` (botão Entrar já funciona).

---

## Parte 2 — Refatoração de copy "Linguagem de Dinheiro"

Aplicada nas **3 superfícies** que compõem a narrativa: `ApresentacaoOrbit2026.tsx`, `LandingPage.tsx` e o array compartilhado `src/lib/orbit/pillars.ts`.

### Regras de ouro (globais)

- **Banir tecniquês:** Edge Functions, JSONB, Webhook, Latência sub-segundo, Pipeline, SDR, Inside Sales, Multi-tenant, RLS, Typebot, Apps Script, FreeBusy, UTM, payload.
- **Falar linguagem de dinheiro:** Agendamento confirmado, Call de fechamento, ROI do anúncio, Agenda cheia, Venda realizada, Assistente de vendas, Velocidade de agendamento, Processo manual, Custo de oportunidade.
- **Manter 100% da identidade visual:** Aurora bg, glass cards, gradientes emerald→violet, framer-motion, tipografia massiva, animações, estrutura/ordem das seções, todos os mockups e componentes (`StatsImpactoSection`, `HumanoVsOrbitSection`, etc.).
- **Manter números de impacto:** R$ 8.500/mês, 42h, 73%, 5min, 4h — eles dão lastro financeiro pro cara high-ticket.
- **Tom:** parceiro de receita, não fornecedor de TI. Empatia com o mentor que tem tráfego rodando mas caixa parado.

### 2.1 — `src/lib/orbit/pillars.ts` (consumido pelas duas páginas)

Re-escrever as 5 entradas mantendo a interface `Pillar` (icon, title, description, stack). O campo `stack` deixa de ser tech stack e vira **resultados-chave** (3 chips por card, linguagem de negócio):

| # | Title | Description (resumo) | Chips |
|---|---|---|---|
| 1 | Captura de Leads de Qualquer Canal | "Recebe leads do seu Instagram, formulário, indicação ou anúncio. Nada cai no esquecimento, nada vira linha esquecida em planilha." | Anúncios · Formulários · Indicação |
| 2 | Perseguição Automática até Agendar | "O Orbit não desiste do lead. Manda mensagem, áudio, lembrete — no ritmo certo, sem parecer robô — até a call cair na sua agenda." | Cadência humana · Multi-toque · Sem desistência |
| 3 | Confirmação e Lembrete da Call | "Dispara confirmações, lembretes 24h e 1h antes da call e reagendamento automático. O lead nunca esquece do seu horário." | Confirmação · Lembrete · Reagendamento |
| 4 | Painel do Seu Caixa em Tempo Real | "Quantas calls foram marcadas hoje, quantas confirmaram, quanto entrou. Você opera sua mentoria olhando o dinheiro, não a caixa de WhatsApp." | Calls marcadas · Confirmadas · Faturamento |
| 5 | Sobe Sua Base Antiga em 5 Minutos | "Importa seus leads antigos do Excel, separa quem ainda tem fit e começa a faturar em cima da base que já tava parada." | Importação · Base antiga · Faturamento extra |

Ícones (Lucide) mantidos do arquivo atual: `Webhook → Inbox`, `GitBranch → Target`, `Send → CalendarCheck`, `Activity → LineChart`, `Upload → Upload`. Pequeno ajuste de ícones para combinar com a nova narrativa.

### 2.2 — `src/pages/ApresentacaoOrbit2026.tsx`

Substituir o texto de cada seção. Zero mudança visual.

| Seção | Nova narrativa |
|---|---|
| **Hero** | H1: "A agenda cheia / **das mentorias que faturam.**" Sub: "O Orbit persegue cada lead do seu anúncio até a call de fechamento entrar no seu Google Calendar — sem você levantar o dedo." Chips: "Resposta em 8s · Funciona 24/7 · Sem perder lead". |
| **Dores** | 4 cards: (1) "O lead preencheu o form e sumiu" — você responde 2h depois, ele já comprou do concorrente. (2) "Seu tráfego está virando prejuízo" — leads esfriando enquanto o anúncio queima dinheiro. (3) "Sua agenda está vazia mesmo com leads chegando" — processo manual não escala. (4) "Você virou refém do WhatsApp" — 14h/dia respondendo, sem fechar venda. |
| **Comparativo** | Renomear colunas: **"Processo Manual"** vs **"Orbit"**. Critérios trocados para resultado: Velocidade de agendamento · Leads que viram call · Follow-up garantido · Visibilidade do ROI do anúncio · Custo mensal real. Remover linhas de latência/UTM/JSONB. |
| **"O que o Orbit faz pelo seu caixa"** (antes "Infraestrutura Enterprise") | Mantém grid 5 cards consumindo `PILLARS` atualizado. Numeração `03·` preservada. |
| **Qualificação IA** | "A IA que separa o curioso do comprador" — conversa, qualifica e só coloca na sua agenda quem tem dinheiro e fit. |
| **Personalização** | "Cada lead recebe a mensagem certa, no canal certo, na hora certa — como se você tivesse 10 assistentes trabalhando." |
| **WhatsApp** | "Seu agendador pessoal que persegue o lead até a call ser confirmada" — manda áudio/foto/PDF, segue cadência humana, sem bloqueio. |
| **Email** | "A esteira que garante que o lead nunca esqueça do seu horário" — confirmação imediata, lembrete 24h antes, lembrete 1h antes, reagendamento automático. |
| **Funil** | "O mapa do seu dinheiro" — veja em uma tela quantos leads estão prontos para a call de fechamento agora. |
| **Investimento** | Headline: "O que você perde por mês esperando é maior que o investimento no Orbit por ano." Sub: "1 call de fechamento perdida ≈ mensalidade inteira do Orbit." Valores intactos, tom de custo de oportunidade. |
| **Fechamento** | "Pare de operar sua mentoria no improviso. **Comece a operar como gente grande.**" |
| **FAQ** | 6-8 perguntas no idioma do mentor: "Funciona pra quem vende ticket de R$ 5k a R$ 50k?" · "Preciso saber mexer em tecnologia?" · "Em quantos dias minha agenda começa a encher?" · "E se o lead não responder à primeira mensagem?" · "Funciona com meu Google Calendar atual?" · "Posso importar meus leads antigos?" · "E se eu já uso outra ferramenta de WhatsApp?" · "Meus dados ficam seguros?". Zero menção a webhooks/JSON/RLS. |

### 2.3 — `src/pages/LandingPage.tsx`

Mesmo tratamento de copy, estrutura visual intacta:

- **Hero** (mantém word rotator framer-motion): H1 "A agenda cheia / **das [mentorias de negócios / advogados / coaches / dentistas / médicos] que faturam.**" Sub: "O Orbit persegue cada lead do seu tráfego até a call de fechamento entrar na sua agenda." CTA primário: "Quero minha agenda cheia →". CTA secundário: "Ver apresentação completa".
- **Mini-stats hero**: 73% dos leads abandonados · 5min de janela de ouro · R$ 8.500/mês substituídos.
- **Split-screen "Caos vs Orbit"** (`HumanoVsOrbitSection`): rótulos das etapas re-escritos: "Lead chegou → Foi qualificado → Agendou call → Confirmou presença → Compareceu". Lado esquerdo "Sua rotina hoje" (planilha + WhatsApp esquecido), lado direito "Sua rotina com Orbit" (call marcada + lembrete + venda fechada).
- **Stats de impacto** (`StatsImpactoSection`): copy dos 4 cards re-escrito sem "SDR júnior" — virar "assistente de vendas".
- **Pilares**: consome `PILLARS` atualizado.
- **Timeline 4 etapas**: "Lead entra → IA qualifica → Orbit agenda → Você fecha". Sem termos técnicos.
- **Diferenciais 2×2**: "IA que conversa como humano" · "Sua agenda sincronizada" · "Confirmação automática da call" · "Seus dados protegidos".
- **FAQ**: mesmas perguntas da Apresentação.
- **CTA WhatsApp** + acesso por slug preservados (apenas copy).

---

## Arquivos afetados

- `src/App.tsx` — mover rota `/` para dentro do `PublicLayout`.
- `src/lib/orbit/pillars.ts` — re-escrever as 5 entradas com linguagem de negócio (mesma interface).
- `src/pages/ApresentacaoOrbit2026.tsx` — substituição completa de copy, zero mudança visual/estrutural.
- `src/pages/LandingPage.tsx` — substituição completa de copy + ajuste de rótulos nos componentes filhos consumidos.

## Fora de escopo

Zero backend, zero schema, zero hooks, zero novas dependências, zero mudança de layout/cores/animações/ordem de seções.
