

# Criar Template Inline no Wizard de Campanha

## Problema

No passo 2 do wizard de criação de campanha (seleção de template), se não existir um template adequado, o usuário precisa sair do wizard, ir à página de Templates, criar um e depois voltar. Isso quebra o fluxo.

## Solução

Adicionar uma opção "Criar novo template" no passo 2 do `CampaignWizard`. Ao clicar, um formulário inline aparece permitindo preencher os campos do template (nome, categoria, assunto se email, corpo texto). O template é salvo no banco e automaticamente selecionado na campanha.

## Alterações

| Arquivo | Alteração |
|---|---|
| `src/components/orbit/CampaignWizard.tsx` | No step 2, adicionar botão "Criar novo template" que alterna para um formulário inline. Usar o hook `useCreateTemplate` para salvar. Após salvar, selecionar automaticamente o novo template e voltar à visualização de lista. |

### Detalhes do formulário inline

O step 2 passará a ter dois modos:

1. **Modo seleção** (atual) — lista de templates existentes + botão "Criar novo template" no topo
2. **Modo criação** — formulário com campos:
   - Nome do template (obrigatório)
   - Categoria (select: geral, marketing, vendas, suporte)
   - Assunto do email (apenas se canal = email)
   - Corpo do texto (textarea, obrigatório)
   - Botões "Salvar Template" e "Cancelar" (volta ao modo seleção)

Ao salvar, o hook `useCreateTemplate` (já existente em `useOrbitTemplates.ts`) é chamado com os dados + `empresa_id` + `canal` do wizard. O template criado é selecionado automaticamente como `template_id` da campanha, e o modo volta para seleção.

A validação do `canProceed()` no step 2 continuará exigindo `template_id`, mas agora o usuário pode criá-lo sem sair do wizard.

### Fluxo

```text
Step 2 → Lista templates + botão [+ Criar novo]
         ↓ clica "Criar novo"
         Formulário inline (nome, categoria, assunto, corpo)
         ↓ clica "Salvar Template"
         Template criado → selecionado automaticamente → volta à lista
```

