

# Ajustar posição do menu "Tarefas"

Mover o item "Tarefas" para logo abaixo de "Funil" no sidebar.

## Alteração

**`src/components/orbit/OrbitSidebar.tsx`** — Reordenar o array de itens de navegação:

```
Prospects
Conversas
Funil
Tarefas        ← mover para cá
Campanhas
Templates
Lead Finder
Analytics
Meu Plano
Configurações
```

Mudança de uma única linha: mover a entrada `{ name: "Tarefas", ... }` da posição atual (após Analytics) para logo após Funil.

