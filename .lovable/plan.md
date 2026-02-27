

# Adicionar upload de imagens no Wizard de Campanhas

## Situação atual
- O wizard tem um campo de URL de imagem no formulário de novo template (apenas texto)
- A TemplatesPage já tem lógica de upload para o bucket `campaign-images`
- O edge function `send-orbit-campaign` já envia imagens tanto para email (inline HTML) quanto WhatsApp (Z-API `/send-image`)
- Falta: upload direto de arquivo no wizard + preview da imagem selecionada

## Alterações

### 1. `src/components/orbit/CampaignWizard.tsx`
- Substituir o campo de input de URL por um componente de upload de imagem com drag-and-drop ou botão de seleção
- Adicionar estado `isUploadingImage` para feedback visual
- Implementar função `handleImageUpload` que faz upload para o bucket `campaign-images` (mesma lógica da TemplatesPage)
- Mostrar preview da imagem após upload com botão para remover
- Manter campo de URL como alternativa (aba ou fallback)
- Na revisão (Step 5), mostrar preview da imagem se houver

### 2. Preview de imagem no template selecionado (Step 2)
- Quando o usuário seleciona um template que já tem `imagem_url`, mostrar um thumbnail na listagem de templates

### Detalhes técnicos
```typescript
// Upload handler (reutilizando padrão existente)
const handleImageUpload = async (file: File) => {
  const { data: { user } } = await supabase.auth.getUser();
  const ext = file.name.split(".").pop();
  const path = `${user.id}/${Date.now()}.${ext}`;
  await supabase.storage.from("campaign-images").upload(path, file);
  const { data: { publicUrl } } = supabase.storage.from("campaign-images").getPublicUrl(path);
  setNewTemplate({ ...newTemplate, imagem_url: publicUrl });
};
```

- O bucket `campaign-images` já existe e é público, nenhuma alteração de backend necessária
- Sem mudanças nos edge functions (já tratam imagens corretamente)

