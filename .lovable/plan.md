

# Reconstrução do Hero — Landing Page Premium

## Visão geral

Substituir o hero atual (logo + texto + badges + CTA) por um hero imersivo com mockup animado do sistema, efeito parallax via mouse, partículas e CTA com glow premium.

## Estrutura

### 1. Novo componente `src/components/landing/HeroSection.tsx`

Componente dedicado contendo todo o hero. Substitui o bloco `{/* HERO */}` atual no `LandingPage.tsx`.

**Layout (desktop):** Duas colunas — texto à esquerda, mockup do sistema à direita.

### 2. Background imersivo

- Manter `AnimatedBackground` existente (gradient animado + grid + blobs)
- Adicionar campo de partículas leve com `motion.div` — ~20 pontos pequenos com animação de float aleatório (sem lib externa, apenas Framer Motion + CSS)

### 3. Mockup animado do sistema (coluna direita)

Componente `src/components/landing/HeroDashboardMockup.tsx` — um "screenshot vivo" do Orbit renderizado com divs estilizadas:

- **Barra lateral** mini com ícones
- **Pipeline Kanban** com 3 colunas (Qualificação, Proposta, Fechamento) e cards animados se movendo entre colunas (loop infinito com Framer Motion)
- **Feed de IA** no canto: mensagens aparecendo sequencialmente (typing → mensagem) simulando a IA qualificando um lead
- **Contador de leads** incrementando automaticamente
- Bordas com glow `border-primary/30`, fundo `bg-card/80 backdrop-blur`

### 4. Efeito parallax com mouse

- `onMouseMove` no container do hero captura posição do cursor
- `useMotionValue` + `useTransform` do Framer Motion aplica `rotateX/rotateY` sutil (±3deg) no mockup
- Camadas internas com intensidade de parallax diferente (perspectiva 3D)

### 5. Texto (coluna esquerda)

- Headline: **"Sua equipe comercial no piloto automático"** (mantida)
- Subheadline nova: **"IA que atende, qualifica e distribui leads 24h — sem intervenção humana."**
- Remover badges atuais — substituir por mini-stats animados (ex: "2.400+ leads qualificados", "24/7 atendimento IA")

### 6. CTA premium

- Botão principal com:
  - `animate-glow-pulse` (já existe no CSS)
  - Hover: `scale(1.05)` + aumento do glow
  - Ícone `ArrowRight` animado (translateX no hover)
- Botão secundário "Ver demonstração" com estilo ghost

### 7. Partículas

Componente `src/components/landing/HeroParticles.tsx` — ~15-20 círculos pequenos (2-4px) com posição aleatória, opacidade baixa (0.1-0.3), animação float com durations variados (8-15s). Puro CSS/Framer Motion, sem dependência externa.

## Arquivos

| Arquivo | Ação |
|---------|------|
| `src/components/landing/HeroSection.tsx` | **Criar** — hero completo |
| `src/components/landing/HeroDashboardMockup.tsx` | **Criar** — mockup animado do sistema |
| `src/components/landing/HeroParticles.tsx` | **Criar** — partículas flutuantes |
| `src/pages/LandingPage.tsx` | **Editar** — substituir bloco hero pelo `<HeroSection />` |

## Detalhes técnicos

- Todo parallax via `useMotionValue`/`useTransform` do Framer Motion (já instalado)
- Animações do Kanban: cards com `animate` + `transition.repeat: Infinity` e delays escalonados
- Mensagens IA: array de textos com `AnimatePresence` ciclando a cada ~3s
- Sem bibliotecas novas — tudo com Framer Motion + Tailwind existentes
- Responsivo: em mobile, mockup fica abaixo do texto com parallax desabilitado

