

# Refatorar Wizard de Campanha: Modal → Página Dedicada

## Resumo

Transformar o fluxo de criação de campanha de modal (`Dialog`) para página dedicada com rota própria, reaproveitando toda a lógica existente do `CampaignWizard`.

## Alterações

### 1. Nova rota em `src/App.tsx`
- Adicionar rota `campanhas/nova` dentro do `OrbitRoutes`
- Preparar rota `campanhas/:id/editar` para uso futuro

### 2. Nova página `src/pages/orbit/NovaCampanhaPage.tsx`
- Página full-page com `OrbitLayout`
- Cabeçalho com botão voltar para `/campanhas`, título "Nova Campanha" e subtítulo da etapa atual
- Renderiza o conteúdo do wizard (sem Dialog wrapper)
- Stepper horizontal bem distribuído no topo
- Rodapé fixo (sticky bottom) com: Cancelar, Voltar, Salvar Rascunho, Próximo/Criar
- Ao criar com sucesso, redireciona para `/campanhas`

### 3. Refatorar `src/components/orbit/CampaignWizard.tsx`
- Extrair toda a lógica interna (state, handlers, steps) para um componente `CampaignWizardContent` que **não** usa `Dialog`
- O `CampaignWizardContent` recebe um `onComplete` callback e `onCancel`
- Manter o export `CampaignWizard` como alias deprecated (ou remover se não usado em outro lugar)
- O conteúdo do step 3 (RecipientSelector) usará largura total da página

### 4. Atualizar `src/pages/orbit/CampanhasPage.tsx`
- Botão "Nova Campanha" passa a navegar para `campanhas/nova` com `useNavigate`
- Remover `<CampaignWizard>` dialog e state `wizardOpen`

### 5. Layout da página

```text
┌─────────────────────────────────────────────┐
│ ← Voltar   Nova Campanha                   │
│            Etapa 2 de 5 — Template          │
├─────────────────────────────────────────────┤
│  ① Info  ─── ② Template ─── ③ Dest ─── ... │
├─────────────────────────────────────────────┤
│                                             │
│         Conteúdo da etapa (full width)      │
│                                             │
│                                             │
├─────────────────────────────────────────────┤
│ Cancelar          [Voltar]  [Próximo]       │  ← sticky bottom
└─────────────────────────────────────────────┘
```

## Componentes reaproveitados
- Toda lógica de estado, filtros, handlers do `CampaignWizard` (950 linhas)
- `RecipientSelector` — sem alterações, apenas ganha mais espaço
- Templates, AI generation, test email — tudo mantido

## Arquivos afetados

| Arquivo | Ação |
|---------|------|
| `src/App.tsx` | Adicionar rota `campanhas/nova` |
| `src/pages/orbit/NovaCampanhaPage.tsx` | Criar página dedicada |
| `src/components/orbit/CampaignWizard.tsx` | Extrair conteúdo para `CampaignWizardContent` sem Dialog |
| `src/pages/orbit/CampanhasPage.tsx` | Substituir modal por navegação |

