

# Melhorar legibilidade e impacto do texto no Hero

## Alterações em `src/components/landing/HeroSection.tsx`

### 1. Largura do texto
- Adicionar `max-w-[640px]` no container de texto (coluna esquerda) para dar mais respiro à headline

### 2. Espaçamento
- Aumentar `space-y-6` para `space-y-8` no bloco de texto
- Adicionar `lg:pl-4` no container de texto para mais padding à esquerda
- Aumentar gap dos stats de `gap-6` para `gap-8`
- Aumentar `pt-2` dos stats para `pt-4` e `pt-4` dos CTAs para `pt-6`

### 3. Tipografia
- Mudar `leading-[1.1]` da headline para `leading-[1.15]`
- Dar destaque a "no piloto automático" envolvendo em `<span className="text-primary">` para diferenciar visualmente
- Aumentar subheadline de `text-lg` para `text-xl`

### 4. Layout — reduzir gap central
- Reduzir `lg:gap-16` do grid para `lg:gap-8` para aproximar mockup do texto

### 5. Stats com mais presença
- Aumentar valor dos stats de `text-xl` para `text-2xl`
- Aumentar label de `text-[11px]` para `text-xs`

