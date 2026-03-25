

# Ícone compacto no sidebar recolhido

## O que será feito
Copiar a imagem enviada pelo usuário para `src/assets/orbit-icon.png` e usá-la como logo quando o sidebar estiver recolhido. Quando expandido, continua mostrando a logo completa (`orbit-logo.png`).

## Mudanças

### 1. Copiar imagem
- Copiar `user-uploads://image-61.png` para `src/assets/orbit-icon.png`

### 2. `src/components/orbit/OrbitSidebar.tsx`
- Importar `orbitIcon` de `@/assets/orbit-icon.png`
- Na área do logo (linha ~86), trocar a imagem condicional:
  - Recolhido: mostrar `orbitIcon` (ícone do planeta, ~32x32px, centralizado)
  - Expandido: mostrar `orbitLogo` como está hoje

```tsx
{isExpanded ? (
  <img src={orbitLogo} alt="Orbit" className="h-9 shrink-0" />
) : (
  <img src={orbitIcon} alt="Orbit" className="h-8 w-8 shrink-0" />
)}
```

