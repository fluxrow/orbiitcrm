

# Migração inteligente de telefone/WhatsApp com validação Z-API

## Contexto

Hoje a migração SQL apenas copia números de 11 dígitos para `whatsapp`. Números com 10 dígitos (que podem ser celulares antigos sem o 9) ficam apenas em `telefone` sem tentativa de validação. O pedido é: para números de 10 dígitos, tentar validar via Z-API se é WhatsApp; se não for, adicionar o 9 após o DDD e tentar novamente.

## Abordagem

Criar uma **Edge Function `orbit-migrate-phones`** que executa a migração em lote por empresa, usando Z-API para resolver números ambíguos de 10 dígitos. Também ajustar a função `normalizePhoneFields` no import CSV para tratar o código de país 55.

## 1. Nova Edge Function: `orbit-migrate-phones`

**`supabase/functions/orbit-migrate-phones/index.ts`**

Lógica:
1. Recebe `{ empresa_id }` (ou executa para todas se super admin)
2. Busca todos prospects com `telefone` preenchido e `whatsapp` vazio, paginando
3. Para cada prospect:
   - Remove não-dígitos do telefone
   - Se começa com `55`, remove temporariamente para análise
   - Se resultado tem **11 dígitos** (DDD+9): copia direto para `whatsapp` com prefixo `55`, marca `nao_verificado`
   - Se resultado tem **10 dígitos** (DDD+8): busca config Z-API da empresa
     - Tenta validar `55 + número` via Z-API `phone-exists`
     - Se válido: salva em `whatsapp` como `55{número}`, status `valido`
     - Se inválido: insere o 9 após o DDD → `55{DDD}9{restante}`, tenta novamente
     - Se válido com 9: salva em `whatsapp` como `55{DDD}9{restante}`, status `valido`
     - Se ambos inválidos: mantém apenas em `telefone`, status `invalido`
   - Outros tamanhos: ignora
4. Retorna resumo: `{ total, migrados, validados_zapi, invalidos }`

Rate limiting: delay de 500ms entre chamadas Z-API para não estourar limites.

## 2. Ajustar `normalizePhoneFields` no import CSV

**`src/hooks/useImportProspects.ts`** — função `normalizePhoneFields`:

- Ao receber número, remover não-dígitos
- Se começa com `55` e tem 12+ dígitos, remover o `55` para análise
- Se 11 dígitos → `whatsapp = '55' + digits`, status `nao_verificado`
- Se 10 dígitos → `telefone = digits`, `whatsapp_status = 'nao_verificado'` (será validado depois via Z-API)
- Manter prefixo `55` no campo `whatsapp` para formato internacional

## 3. Ajustar `orbit-validate-whatsapp` existente

**`supabase/functions/orbit-validate-whatsapp/index.ts`**:

Adicionar lógica de fallback para números de 10 dígitos no campo `telefone`:
- Se prospect não tem `whatsapp` mas tem `telefone` com 10 dígitos, incluir na validação
- Tentar `55 + telefone` → se válido, mover para `whatsapp`
- Senão, tentar `55 + DDD + 9 + restante` → se válido, mover para `whatsapp`
- Atualizar `whatsapp_status` conforme resultado

## 4. Botão na UI para executar migração

**`src/pages/orbit/ConfigPage.tsx`** — Adicionar botão "Migrar telefones existentes" na seção de configuração, que chama a edge function `orbit-migrate-phones`. Mostrar progresso/resultado via toast.

## Resumo de arquivos

| Arquivo | Ação |
|---|---|
| **Nova:** `supabase/functions/orbit-migrate-phones/index.ts` | Edge function de migração em lote com validação Z-API |
| `supabase/functions/orbit-validate-whatsapp/index.ts` | Adicionar fallback para telefones de 10 dígitos |
| `src/hooks/useImportProspects.ts` | Tratar código país 55 na normalização |
| `src/pages/orbit/ConfigPage.tsx` | Botão para executar migração |

