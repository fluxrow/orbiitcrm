
# Apresentação comercial — Orbit CRM

Rota oculta `/apresentacao/orbit-2026` (sem link em nav/footer, sem auth, fora do TenantLayout). Visual Glass Aurora — fundo `#0a0a14` com gradiente aurora `#4ade80 → #a78bfa`, glassmorphism (já existe `glass-card` no projeto), tipografia Outfit + Inter, Framer Motion (`framer-motion` já instalado) para animações on-scroll, contadores e parallax sutil.

## Formato híbrido

- **Scroll vertical** por padrão — cada seção é uma "tela" (100vh) com snap suave, ideal para enviar link.
- **Botão "Modo Apresentação"** flutuante (canto inf. direito) → entra em fullscreen, oculta scrollbar, ativa navegação por ←/→/Space/Esc entre seções (scrollIntoView). Atalho `P` também ativa.
- Indicador de progresso lateral (dots) com a seção atual destacada.

## Estrutura das seções

1. **Hero** — Logo Orbit, headline "Seu time de vendas nunca dorme. O nosso também não.", sub "Atendimento, qualificação e vendas no piloto automático — 24/7." CTA scroll-down animado. Partículas/aurora em canvas leve atrás.

2. **A dor real do mercado** — Grid de 4 stats animados (CountUp on-scroll):
   - **73%** dos leads de anúncio nunca são respondidos (fonte: Harvard Business Review)
   - **5 min** = janela de ouro. Depois disso, conversão cai **80%**
   - **R$ 8.500** custo médio mensal de 1 SDR júnior + encargos
   - **42h/semana** o tempo que um SDR gasta em tarefas repetitivas

3. **Humano vs. Orbit** — Comparativo lado a lado animado (slide-in das duas colunas):
   | | SDR Humano | Orbit |
   |--|--|--|
   | Tempo de resposta | 4h em média | **8 segundos** |
   | Disponibilidade | 8h/dia, seg-sex | **24/7/365** |
   | Leads simultâneos | 1 por vez | **Ilimitado** |
   | Custo mensal | R$ 8.500+ | R$ 1.197 |
   | Esquece follow-up | Sempre | Nunca |
   | Mau humor na sexta 18h | Acontece | Não existe |

4. **Qualificação de leads de anúncio** — Mockup de conversa WhatsApp animada (mensagens aparecem digitando): lead vindo de Meta Ads → IA pergunta orçamento, prazo, decisor → marca como Quente/Morno/Frio → notifica vendedor humano só nos quentes. "Pare de queimar verba de anúncio com lead que nunca foi atendido."

5. **Personalização total** — Cards com tilt 3D no hover mostrando: tom de voz da marca, base de conhecimento própria, fluxos condicionais por palavra-chave, biblioteca de áudios da sua voz, handoff humano quando quiser. "Não é um chatbot genérico. É a sua empresa falando."

6. **WhatsApp em escala** — Mockup de 3 telas de celular em parallax mostrando conversas reais simultâneas. Contador "1.847 mensagens enviadas nos últimos 30 dias por clientes Orbit" subindo em tempo real.

7. **Campanhas de e-mail** — Preview de editor + métricas animadas (taxa abertura 38%, cliques 12%, respostas 4%). "Dispara, segmenta, mede. Tudo num lugar só."

8. **Funil + IA juntos** — Kanban mockup com cards se movendo sozinhos entre etapas conforme a IA qualifica. "Seu pipeline se organiza enquanto você dorme."

9. **ROI** — Comparativo de custo anual:
   - SDR humano: R$ 102.000/ano
   - Orbit: R$ 17.364/ano
   - **Economia: R$ 84.636/ano** (animação grande)

10. **Investimento** — Card central glass destacado:
    - **Implementação (única):** 12x R$ 397 **ou** R$ 3.000 à vista
    - **Mensalidade:** R$ 1.197/mês
    - Bullet curto explicando a implementação: setup do número WhatsApp, treinamento da IA com a base de conhecimento da empresa, configuração dos fluxos, integração com anúncios, criação dos templates iniciais, biblioteca de áudios e handoff — "2 semanas de trabalho dedicado pra entregar a operação rodando sozinha no dia 15."
    - CTA "Quero implementar"

11. **Fechamento** — "Cada dia sem Orbit = leads de anúncio perdidos." Logo + assinatura.

## Animações (Framer Motion)

- `whileInView` com `once: true` em todas as seções
- Stagger nos grids de stats
- CountUp customizado simples (sem lib extra) para números
- Parallax leve nos mockups de celular (translateY baseado em scroll)
- Gradiente aurora animado no fundo do hero (CSS keyframes)
- Mensagens WhatsApp aparecendo com delay sequencial simulando digitação

## Arquivos

**Criar:**
- `src/pages/ApresentacaoOrbit2026.tsx` — página principal (orquestra seções + modo apresentação)
- `src/components/apresentacao/SectionWrapper.tsx` — wrapper 100vh + snap + observer
- `src/components/apresentacao/HeroSection.tsx`
- `src/components/apresentacao/DoresSection.tsx`
- `src/components/apresentacao/ComparativoSection.tsx`
- `src/components/apresentacao/QualificacaoSection.tsx` (mock chat WhatsApp)
- `src/components/apresentacao/PersonalizacaoSection.tsx`
- `src/components/apresentacao/WhatsAppSection.tsx`
- `src/components/apresentacao/EmailSection.tsx`
- `src/components/apresentacao/FunilSection.tsx`
- `src/components/apresentacao/RoiSection.tsx`
- `src/components/apresentacao/InvestimentoSection.tsx`
- `src/components/apresentacao/FechamentoSection.tsx`
- `src/components/apresentacao/PresentationControls.tsx` (botão modo apresentar + dots + atalhos)
- `src/components/apresentacao/CountUp.tsx`
- `src/components/apresentacao/AuroraBackground.tsx`

**Editar:**
- `src/App.tsx` — adicionar `<Route path="/apresentacao/orbit-2026" element={<ApresentacaoOrbit2026 />} />` ANTES da rota catch-all `/:slug` (senão o slug pega). Sem PublicLayout (sem header do hotsite).

**NÃO editar:** nenhum arquivo de menu/nav/footer — rota fica realmente oculta.

## Garantias

- Zero backend, zero migration, zero edge function
- Zero impacto nas rotas multi-tenant existentes (rota literal vem antes do `/:slug`)
- Dark mode forçado na página (independe do toggle global)
- Mobile-responsive (você pode mostrar no celular numa reunião)
- Sem tracking, sem analytics, sem indexação (`<meta name="robots" content="noindex" />`)
