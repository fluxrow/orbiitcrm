
## Objetivo

Reposicionar o Orbit como **infraestrutura de agendamento que garante a call de fechamento** para mentores e operações High-Ticket. Unificar narrativa entre `/` (Home) e `/apresentacao/orbit-2026`, mantendo a identidade Aurora (bg fixo, glass cards, gradient emerald→violet, framer-motion). 100% frontend/copy — zero mudança em backend, schema ou fluxos.

---

## Parte 1 — Estrutura compartilhada

### 1.1 Novo arquivo `src/lib/orbit/pillars.ts`

```ts
import { Webhook, GitBranch, Send, Activity, Upload, type LucideIcon } from "lucide-react";

export type Pillar = {
  icon: LucideIcon;
  title: string;
  description: string;
  stack: string[];
};

export const PILLARS: Pillar[] = [ /* 5 pilares abaixo */ ];
```

**Os 5 pilares** (consumidos por Home e Apresentação):

1. **Hub de Ingestão Universal** (`Webhook`) — Typebot, Google Sheets (Apps Script), formulários, Meta Ads. Mapeamento visual de campos, validação CPF/CNPJ, normalização de WhatsApp. Stack: `Webhook · Apps Script · Meta Ads`.
2. **Motor de Fluxos & Condições** (`GitBranch`) — Disparos em tempo real, filtros por origem, tipo de fonte e chaves do payload (`utm_source=instagram`). Stack: `Realtime · JSONB filters · UTM-aware`.
3. **Ações Inteligentes de Escalonamento** (`Send`) — Mídia rica (áudio/vídeo/PDF), movimentação automática de etapas, tarefas para SDR, Agendamento via Google Calendar (FreeBusy). Stack: `Rich media · Pipeline auto · Calendar FreeBusy`.
4. **Painel de Observabilidade** (`Activity`) — Latência das Edge Functions (sub-segundo), taxa de sucesso de automações, logs detalhados de webhooks. Stack: `Sub-second · Run logs · KPIs live`.
5. **Importador Inteligente & Gestão em Massa** (`Upload`) — CSV com mapeamento de-para, JSONB para campos extras, ações em lote, Soft-Delete. Stack: `CSV mapper · JSONB safe · Soft-delete`.

---

## Parte 2 — Apresentação `/apresentacao/orbit-2026`

Arquivo: `src/pages/ApresentacaoOrbit2026.tsx`.

### 2.1 Copy refinado (tom Infraestrutura Enterprise)

| Seção | Mudança |
|---|---|
| **Hero** | Headline: "Infraestrutura comercial / **no nível das maiores.**" Sub: "Captação multicanal, motor de fluxos em tempo real e observabilidade enterprise — sua mentoria operando com a confiabilidade de um SaaS de produto." |
| **Dores** | Foco em "operação sem infraestrutura": lead que entra no Typebot e morre numa planilha, custo de SDR, horas em tarefas manuais. |
| **Comparativo** | +2 linhas: "Rastreamento UTM/origem" (humano: "não rastreia" → Orbit: "campo por campo, JSONB"); "Latência de webhook" (humano: "minutos" → Orbit: "sub-segundo"). |
| **Qualificação** | "Ingestão universal" com Typebot/Sheets/Forms + normalização CPF/CNPJ/WhatsApp. |
| **Personalização** | Card "Mapeamento visual de campos"; renomeia "Fluxos condicionais" → "Condições cirúrgicas por payload". |
| **WhatsApp** | "Mídia rica: áudio, vídeo, PDF/ebook"; troca métrica por "Edge Functions sub-segundo". |
| **Email** | "Deliverability monitorada e logs por envio". |
| **Funil + IA** | "Movimentação automática entre etapas, tarefas para SDR e Agendamento Inteligente com FreeBusy do Google Calendar". |
| **Fechamento** | "Operação enterprise, preço de startup." |
| **Investimento** | Refinamento leve; valores intactos. |

### 2.2 Nova seção "Infraestrutura Enterprise"

Inserida **entre Comparativo e Qualificação**. `id="infraestrutura"`, numeração `03 ·`, demais seções renumeram (+1).

Grid responsivo consumindo `PILLARS` — cards `glass`, ícone Lucide em badge gradient emerald→violet, título, parágrafo enterprise, chips de stack ao pé.

---

## Parte 3 — Home `/` (reconstrução visual)

Arquivo: `src/pages/LandingPage.tsx` — reescrita completa sobre o sistema visual da Apresentação. Helpers replicados localmente: `AuroraBg`, `Section`, classe `glass`. Mantém `WhatsAppFab` e integração com `PublicLayout`/`HotsiteHeader`. SEO: `document.title = "Orbit CRM — Infraestrutura comercial multicanal"`.

### 3.1 Hero (tom implacável)

- **Headline**: "O lead preencheu seu formulário, mas **a call de fechamento não aconteceu?**"
- **Sub-headline com word rotator**: "O Orbit é a infraestrutura comercial de escala para sua **[rotator]**. Convertemos o interesse do formulário em uma call confirmada, sem que você precise trocar uma única mensagem manual."
- **Word rotator (framer-motion `AnimatePresence`)** ciclando a cada ~2.2s, gradient emerald→violet:
  - "mentoria de negócios"
  - "mentoria para dentistas"
  - "mentoria para médicos"
  - "mentoria para advogados"
  - "mentoria de investimentos"
- **CTA primário**: "Automatizar meu agendamento →" (verde emerald glow → WhatsApp).
- **CTA secundário discreto**: "Ver apresentação completa" → `/apresentacao/orbit-2026`.
- Chips glass abaixo: "resposta em 8s · 24/7 · latência sub-segundo".

### 3.2 Seção Dores — "O Impacto do Processo" (split-screen comparativo)

Layout 2 colunas (`md:grid-cols-2`, colapsa em mobile), separador vertical com glow violet→emerald no meio.

**Lado esquerdo — O Caos Manual** (tom dor, glass com leve tint rose/zinc):
- Animação CSS/framer pura (sem Lottie, sem nova dep):
  - "Planilha" — linhas adicionadas sequencialmente com `staggerChildren`, células piscando.
  - Ícone `MessageCircle` com badge "47" pulsando vermelho (mensagens não respondidas).
  - Ícone `Clock` com ponteiro girando contínuo.
- Texto: "Você gasta horas qualificando na mão, esquece do follow-up e o lead esfria."

**Lado direito — A Infraestrutura Orbit** (tom solução, glass emerald→violet):
- Animação de pipeline horizontal: 3 nós (`Webhook` → `Sparkles` → `Calendar`) com linha animada (gradient travel) conectando-os e checkmark verde ao final.
- Texto: "O Orbit qualifica, persegue e agenda. A call cai na sua agenda. Dinheiro no bolso."

**Abaixo do split — 4 stats glass** (em grid 2×2 mobile, 4×1 desktop):
- "73%" — leads não respondidos no mercado
- "5min" — janela de ouro para contato
- "42h/sem" — perdidas em tarefas manuais
- "R$ 8.500/mês" — custo médio de um SDR júnior

### 3.3 Seções restantes da Home

3. **Pilares Enterprise** — consome `PILLARS` (mesmo grid da Apresentação).
4. **Timeline horizontal de 4 etapas** — numeração massiva: **Ingestão Multicanal → Qualificação IA → Motor de Fluxos → Funil + Calendar**. Linha conectora gradient emerald→violet animada via `whileInView`.
5. **Diferenciais Enterprise — grid 2×2**:
   - **IA real (não chatbot)** — agente com RAG sobre base de conhecimento do mentor.
   - **Multi-tenant isolado** — RLS por empresa, dados nunca cruzam.
   - **Observabilidade nativa** — KPIs, latência e logs de webhook em tempo real.
   - **Anti-bloqueio WhatsApp** — cadência humanizada, mídia rica e validação de número.
6. **FAQ enterprise** (Accordion) — 8 perguntas reescritas:
   - "Como o Orbit lida com o webhook do meu Typebot?"
   - "Como a latência afeta minha taxa de fechamento?"
   - "Os dados da minha mentoria ficam isolados de outras contas?"
   - "Posso usar minha planilha do Google Sheets como fonte de leads?"
   - "O agendamento no Google Calendar é nativo?"
   - "Como vocês evitam o bloqueio do meu WhatsApp?"
   - "Consigo enviar PDFs, áudios e vídeos pela automação?"
   - "Como acompanho a saúde técnica da operação?"
7. **CTA WhatsApp** full-bleed com glow emerald + headline curta: "Pare de operar sua mentoria no improviso."
8. **Acesso por slug** — input + botão estilo glass (mantém função atual).
9. **Footer** — mantém.

---

## Detalhes Técnicos

- **Sem novas dependências** — animações 100% via `framer-motion` (já instalado) + Tailwind. Nada de Lottie.
- **Tokens visuais** — segue padrão atual da Apresentação (classes emerald/violet diretas como exceção visual deliberada do projeto; consistente com a memória do projeto sobre identidade Orbit).
- **Responsividade** — split-screen colapsa em 1 coluna no mobile; tipografia escala `text-4xl md:text-6xl lg:text-7xl`; timeline vira vertical no mobile.
- **Performance** — word rotator com `mode="wait"` em `AnimatePresence`; animações de planilha/pipeline param fora do viewport (`whileInView` + `viewport={{ once: false }}` apenas para os blocos pequenos).
- **Acessibilidade** — `prefers-reduced-motion` respeitado (estado estático nas animações de loop).
- **SEO Home** — `<title>` "Orbit CRM — Infraestrutura comercial multicanal" via efeito no mount; H1 único na hero.

---

## Arquivos afetados

- `src/lib/orbit/pillars.ts` — **novo**, array compartilhado dos 5 pilares.
- `src/pages/ApresentacaoOrbit2026.tsx` — copy refinado em todas as seções + nova seção "Infraestrutura Enterprise" + renumeração.
- `src/pages/LandingPage.tsx` — reescrita completa: hero com word rotator, split-screen Caos vs Orbit, stats de impacto, pilares, timeline, diferenciais 2×2, FAQ enterprise, CTAs.

Nenhum outro arquivo é tocado. Nenhuma rota nova. Nenhuma edge function. Nenhum schema.
