

# Badge de tarefas pendentes no menu Tarefas

## Alteração

**`src/components/orbit/OrbitSidebar.tsx`**:

1. Import `useOrbitTasks` hook
2. Query tasks with `status: "pending"` filter to get count
3. Add a badge next to "Tarefas" showing the pending count (only when > 0)

The badge will be a small rounded pill with the count, styled with `bg-destructive text-destructive-foreground` for visibility. The nav link rendering will check if the item is "Tarefas" and append the badge.

To avoid a separate special case, I'll add an optional `badge` property to the navigation items and render it generically -- but only the Tarefas item will have it populated.

## Implementation Detail

- Use `useOrbitTasks({ status: "pending" })` at the component level
- Compute `pendingCount = tasks?.length || 0`
- Render a small `<span>` badge after the item name when count > 0

Single file change, ~10 lines added.

