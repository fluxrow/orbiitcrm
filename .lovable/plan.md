
# Landing Page reimaginada — mistura do que já existe + DNA da Apresentação Orbit 2026

A LP atual já tem ótimo conteúdo (problemas, solução, steps, features, diferenciais, prova de valor, audiências, FAQ). A apresentação trouxe **movimento, impacto e narrativa** (stats animados, comparativo humano vs IA, mock de chat, parallax). O plano é **reusar 100% do conteúdo bom da LP** e **enxertar os movimentos da apresentação por cima**, removendo qualquer menção a preço e trocando o CTA principal por WhatsApp.

## Regras firmes

- **Sem nenhum valor monetário do sistema** (R$, "12x", "/mês", "trial 7 dias grátis" como destaque). Linguagem qualitativa só: "uma fração de um SDR", "menos que um café por dia".
- **Remover** a seção de Planos inteira, toggle mensal/anual, `PLANS_DATA`, `formatPrice`, estado `isAnnual`.
- **Atualizar `HotsiteHeader`**: tirar item "Planos" do menu; tirar botão "Começar Trial"; manter "Acessar Demo" e "Entrar"; adicionar botão verde "Falar no WhatsApp" no lugar do trial.
- **CTA principal em toda a página = WhatsApp** com mensagem específica da LP.
- Tom visual mantém o que já existe (dark, glass, aurora, `GlowCard`, `AnimatedSection`), com camada extra de animação tipo apresentação.

## Mensagem do WhatsApp (link específico da LP)

Número: `5541992361868`.
Texto:

> Cauã, vim pelo site do Orbit CRM e quero saber mais sobre a plataforma. Pode me explicar como funciona?

Helper no topo de `LandingPage.tsx`:

```ts
const WHATSAPP_HREF =
  "https://wa.me/5541992361868?text=" +
  encodeURIComponent(
    "Cauã, vim pelo site do Orbit CRM e quero saber mais sobre a plataforma. Pode me explicar como funciona?"
  );
```

Exportar também do `HotsiteHeader` (constante compartilhada via novo `src/lib/whatsapp.ts` pra não duplicar string).

## Estrutura final da LP (mistura)

Ordem pensada pra contar a história: **dor real → o que custa hoje → como o Orbit resolve → como funciona → o que tem dentro → por que é diferente → resultados → pra quem é → fala comigo**.

1. **Hero** (`HeroSection` existente)
   - Mantém o layout/parallax atual.
   - **Troca** CTA primário: "Falar no WhatsApp" (verde, ícone Lucide `MessageCircle`) → `WHATSAPP_HREF`, `target=_blank`.
   - CTA secundário continua "Ver demonstração" → `/demo`.
   - **Remove** "Testar grátis por 7 dias".
   - Stats mini do hero (2.400+, 24/7, 3x) ficam como estão.

2. **NOVO — Stats da dor real do mercado** (inspirado na seção 2 da apresentação)
   - 4 cards com `CountUp` (reaproveitar `@/components/apresentacao/CountUp`):
     - **73%** dos leads de anúncio nunca são respondidos
     - **5 min** = janela de ouro; depois disso conversão cai 80%
     - **4h** tempo médio da 1ª resposta humana
     - **42h/sem** gastas em tarefas repetitivas
   - Fundo aurora sutil + stagger no scroll.

3. **Problema** (`PROBLEMS` atual — mantém intacto)

4. **Solução** (`SOLUTION_POINTS` atual — mantém intacto)

5. **NOVO — Humano vs Orbit** (inspirado na seção 3 da apresentação)
   - Tabela comparativa lado a lado animada (slide-in).
   - Linhas:
     | | SDR Humano | Orbit |
     |--|--|--|
     | Tempo de resposta | 4h em média | **8 segundos** |
     | Disponibilidade | 8h/dia, seg-sex | **24/7/365** |
     | Leads simultâneos | 1 por vez | **Ilimitado** |
     | Custo | Alto, fixo, com encargos | **Uma fração de um SDR** |
     | Esquece follow-up | Sempre | **Nunca** |
   - **Sem valor em R$** na coluna de custo.

6. **Como funciona** (`STEPS` atual — mantém timeline desktop/mobile)
   - Polir: adicionar leve parallax/`whileInView` mais marcado nos cards (continuar usando `framer-motion` já presente).

7. **Funcionalidades** (`FEATURE_GROUPS` atual — mantém intacto)

8. **NOVO — Mock de qualificação no WhatsApp** (inspirado na seção 4 da apresentação)
   - Mockup de tela de celular com bolhas de chat aparecendo em sequência (delays escalonados via `framer-motion`):
     - Lead: "Oi, vi o anúncio, quanto custa?"
     - Orbit IA: "Oi! Posso te ajudar 👋 Pra te dar o melhor preço, qual é o porte da sua empresa?"
     - Lead: "Uns 30 funcionários"
     - Orbit IA: "Perfeito. Já estou chamando um especialista pra você. Em 2 min ele te responde."
   - Headline: "Pare de queimar verba de anúncio com lead que nunca foi atendido."
   - Estático em SSR/print, animado on-scroll.

9. **Diferenciais** (`DIFFERENTIALS` atual — mantém intacto)

10. **Prova de valor** (`VALUE_PROOFS` atual — mantém intacto)

11. **Para quem é** (`AUDIENCES` atual — mantém intacto)

12. **CTA final reformulado**
    - Headline: "Pronto pra parar de perder lead de anúncio?"
    - Botão único grande verde: **"Falar agora no WhatsApp"** → `WHATSAPP_HREF`.
    - Microcopy: "Resposta em minutos, sem formulário."
    - **Remove** "7 dias grátis / sem cartão".

13. **FAQ** (`FAQ_ITEMS` atual)
    - **Remover** a pergunta "O trial é realmente gratuito?" (menciona cartão de crédito).
    - **Editar** "O que exatamente o Orbit faz?" pra tirar qualquer ranço de preço (não tem hoje, ok).
    - Adicionar 1 nova: "Como falo com vocês?" → "É só clicar no botão verde do WhatsApp em qualquer parte do site. A gente responde em minutos."

14. **Acesso rápido (slug)** (mantém)

15. **Footer** (mantém)

## Botão flutuante de WhatsApp (FAB)

- Componente novo `src/components/landing/WhatsAppFab.tsx`.
- Círculo verde 56px, ícone WhatsApp (SVG inline da marca pra ficar fiel; fallback Lucide `MessageCircle`).
- `position: fixed; bottom: 24px; right: 24px; z-50;` sombra + `animate-glow-pulse` discreto.
- `href = WHATSAPP_HREF`, `target=_blank`, `rel="noopener noreferrer"`, `aria-label="Falar no WhatsApp"`.
- Renderizado dentro do `LandingPage.tsx` (não no layout, pra não vazar em outras rotas públicas).
- Mobile: tap target ≥ 48px, esconder se o usuário rolar até o footer? Não — sempre visível, mais simples.

## Arquivos

**Criar:**
- `src/lib/whatsapp.ts` — exporta `WHATSAPP_NUMBER`, `WHATSAPP_LP_MESSAGE`, `WHATSAPP_LP_HREF`.
- `src/components/landing/WhatsAppFab.tsx` — botão flutuante.
- `src/components/landing/StatsImpactoSection.tsx` — bloco 2 (stats CountUp).
- `src/components/landing/HumanoVsOrbitSection.tsx` — bloco 5 (comparativo).
- `src/components/landing/WhatsAppMockSection.tsx` — bloco 8 (chat animado).

**Editar:**
- `src/pages/LandingPage.tsx` — remover Planos/preços/`isAnnual`/`formatPrice`/`PLANS_DATA`, inserir os 3 novos blocos nas posições 2/5/8, trocar CTAs do hero e do CTA final por WhatsApp, atualizar FAQ, renderizar `<WhatsAppFab />` ao final do JSX.
- `src/components/HotsiteHeader.tsx` — remover item "Planos" e botão "Começar Trial"; adicionar botão verde "Falar no WhatsApp" usando `WHATSAPP_LP_HREF`. Idem no menu mobile.
- `src/components/landing/HeroSection.tsx` — trocar botão primário "Testar grátis" por "Falar no WhatsApp" (link `<a>` estilizado como `Button asChild`), manter "Ver demonstração" como secundário.

**Não tocar:**
- `src/pages/ApresentacaoOrbit2026.tsx` (continua com preço — uso comercial).
- `src/components/apresentacao/CountUp.tsx` (só consumir).
- Demais layouts/rotas.

## Garantias

- Zero backend, zero migration, zero edge function.
- Zero menção a preço do Orbit em qualquer parte da LP, header ou FAB.
- WhatsApp da LP usa **mensagem própria** ("vim pelo site, quero saber mais"), diferente da apresentação ("bora implementar").
- Conteúdo bom da LP atual permanece — apenas reordenado e enriquecido com 3 blocos novos + FAB.
- Build TS limpo: remover imports órfãos (`Star` se não usado fora dos planos, `Input` se removermos Planos mas mantermos slug, etc.) — auditar ao final.
