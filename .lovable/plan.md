

# Starfield Hyperspace Background — Hero Landing Page

## Visão geral

Substituir o `AnimatedBackground` + `HeroParticles` atuais por um canvas starfield animado com efeito warp/hyperspace, mantendo o conteúdo existente (texto, CTA, mockup, parallax).

## Estrutura

### 1. Novo componente `src/components/landing/StarfieldCanvas.tsx`

Canvas HTML5 2D de tela cheia renderizando um starfield com efeito de velocidade.

**Mecânica:**
- ~300 estrelas com propriedades aleatórias (x, y, z)
- Projeção perspectiva: estrelas se movem em Z em direção ao usuário
- Quando z <= 0, a estrela é reciclada ao fundo (z máximo)
- 3 camadas implícitas via profundidade Z:
  - **Fundo** (z alto): pontos pequenos (1-2px), lentos, opacidade baixa
  - **Meio** (z médio): pontos médios (2-3px), velocidade moderada
  - **Frente** (z baixo): pontos maiores (3-5px), rápidos, com trail/motion blur (linha curta desenhada na direção do movimento)
- `requestAnimationFrame` loop para ~60fps
- Canvas redimensiona com `ResizeObserver`

**Interação mouse (parallax):**
- `onMouseMove` no canvas captura posição normalizada (-1 a 1)
- Offset sutil aplicado ao ponto de fuga das estrelas (centro de projeção desloca com o mouse)
- Transição suave via lerp

**Scroll → velocidade:**
- Listener de scroll modula a velocidade base das estrelas (scroll rápido = warp mais intenso)

### 2. Overlay de legibilidade

Dentro do próprio `StarfieldCanvas` ou como div irmã:
- Gradient radial escuro do centro para fora: `radial-gradient(ellipse at center, transparent 30%, hsl(var(--background)) 80%)`
- Gradient linear de baixo: `linear-gradient(to top, hsl(var(--background)), transparent 40%)`

### 3. Integração no `HeroSection.tsx`

- Remover imports de `AnimatedBackground` e `HeroParticles`
- Substituir por `<StarfieldCanvas />`
- Manter todo o conteúdo existente (texto, stats, CTA, mockup com parallax)
- Passar `mouseX`/`mouseY` do hero para o starfield via props ou compartilhar o mesmo handler

### 4. Limpeza

- `AnimatedBackground.tsx` e `HeroParticles.tsx` podem ser mantidos (usados em outros lugares?) ou removidos se exclusivos do hero

## Detalhes técnicos

- Canvas 2D puro (sem WebGL/Three.js) — leve e sem dependências
- Estrelas como array de objetos `{ x, y, z, prevZ }` — prevZ para calcular trail
- Trail: `ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(prevSx, prevSy); ctx.stroke()` com opacidade proporcional à velocidade
- Cor das estrelas: branco/azulado com leve variação (`hsl(200, 80%, 85-100%)`)
- Canvas com `position: absolute; inset: 0` e `pointer-events: none`
- Cleanup de listeners e animationFrame no `useEffect` return

## Arquivos

| Arquivo | Ação |
|---------|------|
| `src/components/landing/StarfieldCanvas.tsx` | **Criar** — canvas starfield com warp, parallax mouse, scroll speed |
| `src/components/landing/HeroSection.tsx` | **Editar** — trocar AnimatedBackground + HeroParticles por StarfieldCanvas |

