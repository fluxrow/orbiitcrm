

# Fix: Assinatura com imagem não deve incluir texto

## Problema
Quando o usuário configura uma imagem de assinatura, o sistema ainda anexa o texto (nome, cargo, telefone, email) junto com a imagem. O correto é: se há imagem, usar somente a imagem; se não há imagem, usar o texto.

## Solução

### 1. Edge Function `orbit-send-email/index.ts`
Na construção do bloco de assinatura (linhas ~107-118), alterar a lógica para:
- Se `signature_image_url` existe → renderizar **apenas** a imagem
- Se não existe → renderizar os campos de texto (nome, cargo, phone, email)

### 2. Frontend Preview em `UserProfileDialog.tsx`
Espelhar a mesma lógica no preview da assinatura (~linhas 185-205):
- Se há imagem configurada → mostrar apenas a imagem no preview
- Se não há imagem → mostrar os campos de texto

## Arquivos modificados
- `supabase/functions/orbit-send-email/index.ts` — lógica condicional na montagem do HTML da assinatura
- `src/components/orbit/UserProfileDialog.tsx` — preview condicional

