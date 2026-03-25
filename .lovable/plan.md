

# Landing Page Premium — Redesign Imersivo

## Resumo

Transformar a landing page atual (560 linhas, estática, sem animações) em uma experiência visual premium inspirada em Vercel/Linear/Stripe, com animações Framer Motion, efeitos de glassmorphism avançado, gradientes neon animados, grid tech no hero, e micro-interações em todos os elementos.

## Implementação

### 1. Instalar Framer Motion
- Adicionar `framer-motion` como dependência

### 2. Criar componentes auxiliares reutilizáveis

**`src/components/landing/AnimatedSection.tsx`**
- Wrapper com `motion.div` que aplica fade+slide on scroll via `whileInView`
- Props: `delay`, `direction` (up/down/left/right)

**`src/components/landing/GlowCard.tsx`**
- Card com border gradient animado, backdrop-blur, hover com translateY(-4px) + glow
- Substitui todos os `glass-card` atuais nos cards da landing

**`src/components/landing/AnimatedBackground.tsx`**
- Canvas ou div-based animated gradient background para o hero
- Grid tech pattern (CSS grid lines com opacity animada)
- Blobs flutuantes com CSS animations (não JS pesado)

### 3. Reescrever `src/pages/LandingPage.tsx`

Manter toda a estrutura de dados (PROBLEMS, SOLUTIONS, STEPS, etc.) e refatorar o JSX:

**Hero:**
- Background com gradient animado (CSS `@keyframes gradient-shift` com background-size 400%)
- Grid pattern overlay (linhas CSS semi-transparentes)
- Título com stagger animation (cada palavra aparece sequencialmente)
- Badges com motion stagger
- CTA com glow pulsante (`animate-glow` já existe) + hover scale
- Mockup placeholder: screenshot/ilustração do dashboard flutuando com parallax leve (translateY baseado em scroll)

**Seção Problema:**
- Cards com `GlowCard` + border-destructive gradient
- Stagger animation nos 3 cards

**Seção Solução:**
- Cards com `GlowCard` + border-primary gradient
- Ícones com hover rotate/pulse

**Como Funciona:**
- Timeline vertical/horizontal com linha SVG conectando etapas
- Cada step aparece com stagger progressivo
- Highlight na etapa ao hover (glow + scale)

**Funcionalidades:**
- Grid com ícones que reagem ao hover (rotate 12deg + scale)
- Cards com `GlowCard`

**Planos:**
- Toggle mensal/anual (state local, multiplica preço por 0.8 para anual)
- Plano destacado com glow mais forte, scale(1.05), z-10
- CTA com animação pulse contínua no plano highlighted

**FAQ:**
- Accordion items com `GlowCard` styling

**Fundo geral:**
- Noise texture via CSS (`background-image: url(data:image/svg+xml,...)` inline SVG noise)
- Gradient blobs posicionados absolute com blur e animação float

### 4. Atualizar `src/components/HotsiteHeader.tsx`
- Nav links com underline animado (já existe `.story-link` no CSS)
- CTA "Começar Trial" com glow hover
- Backdrop blur mais forte no header

### 5. Atualizar `src/index.css`
- Adicionar keyframes: `gradient-shift`, `float`, `glow-pulse`
- Adicionar classes utilitárias: `.noise-bg`, `.gradient-border`
- Adicionar grid pattern CSS para hero background

## Arquivos

| Arquivo | Ação |
|---------|------|
| `package.json` | Adicionar `framer-motion` |
| `src/components/landing/AnimatedSection.tsx` | **Criar** |
| `src/components/landing/GlowCard.tsx` | **Criar** |
| `src/components/landing/AnimatedBackground.tsx` | **Criar** |
| `src/pages/LandingPage.tsx` | Reescrever JSX com animações |
| `src/components/HotsiteHeader.tsx` | Micro-interações + glow |
| `src/index.css` | Keyframes + utilitários novos |

## Performance
- Todas animações usam `transform` e `opacity` (GPU-accelerated)
- `whileInView` com `once: true` para não re-animar
- Blobs e gradientes via CSS puro (sem JS runtime)
- Framer Motion tree-shakes bem (~15KB gzipped)

