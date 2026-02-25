

# Corrigir criação de Templates e adicionar geração por IA

## Problema

Na página `TemplatesPage.tsx`, os botões "Novo" e "Gerar IA" no header não possuem `onClick` — são apenas decorativos. Não existe nenhum dialog/modal para criar templates diretamente nessa página.

O `CampaignWizard.tsx` já tem um fluxo funcional de criação de template inline (linhas 104-131), incluindo a busca do `empresa_id` via tabela `profiles`. Vamos reutilizar esse padrão.

## Alterações

| Arquivo | Alteração |
|---|---|
| `src/pages/orbit/TemplatesPage.tsx` | Refatorar completamente: adicionar dialog de criação/edição de template, dialog de geração por IA, e conectar os botões "Novo" e "Gerar IA" |
| `supabase/functions/orbit-ai-generate-template/index.ts` | Nova edge function que usa Lovable AI para gerar corpo de template baseado em parâmetros (canal, categoria, descrição do objetivo) |
| `supabase/config.toml` | Adicionar configuração da nova edge function |

### Detalhes técnicos

**1. Dialog de criação manual de template:**
- Campos: nome, categoria (geral/marketing/vendas/suporte), assunto (se email), corpo_texto
- Usa `useCreateTemplate` do hook existente
- Busca `empresa_id` via tabela `profiles` (mesmo padrão do CampaignWizard)

**2. Dialog de geração por IA:**
- Campos: canal (preenchido pela tab ativa), categoria, descrição/objetivo do template
- Chama a edge function `orbit-ai-generate-template`
- Retorna o template gerado que o usuário pode editar antes de salvar
- Ao confirmar, salva usando `useCreateTemplate`

**3. Edge function `orbit-ai-generate-template`:**
- Recebe: `{ canal, categoria, objetivo, tom_conversa? }`
- Usa Lovable AI (`google/gemini-3-flash-preview`) para gerar nome, assunto (se email) e corpo_texto
- Busca `orbit_ai_config` para usar o tom de conversa configurado
- Retorna o template gerado (sem salvar — o frontend salva)

**4. Botões de edição nos cards de template:**
- Adicionar botão de editar em cada card existente
- Reutilizar o dialog de criação em modo edição com `useUpdateTemplate`

