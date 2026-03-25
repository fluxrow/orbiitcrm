

# Sidebar recolhível com expansão por hover

## Resumo
Transformar o OrbitSidebar em um menu que inicia recolhido (apenas ícones, ~64px) no desktop e expande suavemente ao hover. No mobile, usar toggle por botão. O sidebar expandido sobrepõe o conteúdo (overlay) para evitar reflow do layout.

## Mudanças

### 1. `src/components/orbit/OrbitSidebar.tsx`
- Adicionar estado `collapsed` (true por padrão no desktop) e `hovered` controlado por `onMouseEnter`/`onMouseLeave`
- Usar `useIsMobile()` para desabilitar hover no mobile e usar toggle manual
- Sidebar visível = `!collapsed || hovered`
- Largura: colapsado `w-[68px]`, expandido `w-64`, com `transition-all duration-300`
- Quando colapsado e sem hover:
  - Logo: mostrar apenas o ícone/imagem sem texto
  - Nav items: mostrar apenas ícones centralizados, com `<Tooltip>` mostrando o nome
  - Badge de tarefas: pequeno dot indicator ao invés do número completo
  - User footer: mostrar apenas avatar compacto
  - Ocultar textos com `opacity-0 w-0 overflow-hidden` animado
- Quando expandido (hover):
  - Mostrar tudo normalmente como está hoje
  - Sidebar fica com `position: absolute` + `z-50` para sobrepor o conteúdo sem empurrá-lo
- Adicionar zona de hover invisível (`w-2 h-full fixed left-0`) para facilitar ativação

### 2. `src/components/orbit/OrbitLayout.tsx`
- Trocar o sidebar de ocupar espaço fixo no flex para:
  - Reservar `w-[68px]` de espaço fixo para o sidebar colapsado
  - Sidebar expandido fica em overlay (absolute/fixed) por cima do conteúdo
- No mobile: sidebar fica offcanvas (hidden por padrão), com botão hamburger no header

### 3. `src/index.css`
- Adicionar classe utilitária para a transição do sidebar se necessário

## Detalhes técnicos

Estrutura do sidebar:
```
<div className="fixed left-0 inset-y-0 z-50" onMouseEnter/onMouseLeave>
  {/* Hover zone invisível */}
  <aside className={cn(
    "h-full bg-sidebar border-r flex flex-col transition-all duration-300",
    isExpanded ? "w-64" : "w-[68px]"
  )}>
    {/* Logo - condicional */}
    {/* Nav - ícones sempre, texto condicional com tooltip */}
    {/* User - avatar sempre, texto condicional */}
  </aside>
</div>
```

Layout:
```
<div className="flex h-screen">
  <div className="w-[68px] shrink-0" /> {/* spacer */}
  <OrbitSidebar />
  <main className="flex-1">...</main>
</div>
```

Tooltips nos ícones quando colapsado usando o componente `Tooltip` existente do shadcn.

Mobile: sidebar hidden, botão hamburger no topo, sidebar abre como drawer overlay.

## Arquivos modificados
- `src/components/orbit/OrbitSidebar.tsx`
- `src/components/orbit/OrbitLayout.tsx`

