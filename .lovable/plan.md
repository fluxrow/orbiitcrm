

# Bug: Contagem de destinatários ignora filtros vazios

## Problema raiz

Em `calculateAllRecipientIds()` (linha 171-196), o passo 1 **sempre** executa `applyFilters(prospects)` e adiciona todos os resultados ao Set. Quando nenhum filtro está configurado (`data.filtros` é `{}`), `applyFilters` retorna **todos** os prospects com email válido (524 neste caso). Isso significa que mesmo selecionando apenas 1 prospect individual, os 524 do filtro vazio são incluídos.

## Correção

### `src/components/orbit/CampaignWizard.tsx`

Na função `calculateAllRecipientIds`, adicionar uma verificação: só incluir resultados de filtros se pelo menos um filtro estiver preenchido. Caso contrário, pular o passo de filtros.

```typescript
const calculateAllRecipientIds = (): string[] => {
  const ids = new Set<string>();

  // 1. From filters — only if at least one filter is set
  const f = data.filtros;
  const hasAnyFilter = !!(
    f.status_qualificacao?.length ||
    f.segmento ||
    f.cidade ||
    f.estado ||
    f.origem_contato ||
    f.origem_lead ||
    f.tags?.length ||
    (f.score_min !== undefined && f.score_min > 0) ||
    f.responsavel_id ||
    f.apenas_consentimento
  );

  if (hasAnyFilter) {
    const fromFilters = applyFilters(prospects);
    fromFilters.forEach(p => ids.add(p.id));
  }

  // 2. Individual selection
  data.selected_prospect_ids?.forEach(id => ids.add(id));

  // 3. From groups
  // ... (sem mudança)
};
```

Mesma lógica se aplica a `handleCreate` que usa `calculateAllRecipientIds()` para gerar os recipients reais.

| Arquivo | Ação |
|---|---|
| `CampaignWizard.tsx` | Só incluir prospects de filtros quando ao menos 1 filtro está ativo |

