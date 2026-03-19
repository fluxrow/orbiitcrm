

# Instruir o agente IA a usar dados já existentes do prospect

## Problema
O agente de IA re-pergunta informações que já estão cadastradas no prospect (nome, empresa, cidade, email, etc.), mesmo quando esses dados já existem no banco.

## Solução
Modificar o system prompt no `orbit-ai-agent/index.ts` para incluir uma regra explícita sobre uso de dados já conhecidos. O prompt já recebe os dados do prospect (linhas 194-200) e os campos coletados (linha 191), mas falta uma instrução clara para o agente **não re-perguntar** o que já sabe.

## Alteração

**`supabase/functions/orbit-ai-agent/index.ts`** — Adicionar regra no bloco "REGRAS IMPORTANTES" (após a regra 7, ~linha 188):

```
8. USO DE DADOS JÁ EXISTENTES: Se um dado do prospect já estiver preenchido acima (nome, email, cidade, segmento, etc.), 
   NÃO peça novamente. Use naturalmente na conversa. 
   Se precisar confirmar um dado antigo, use confirmação leve: "Segue sendo pela [empresa], certo?"
   Nunca reinicie a coleta do zero se já houver dados cadastrados.
9. Ao coletar dados, pule campos que já estão preenchidos nos "Dados do prospect" acima. 
   Solicite APENAS os campos listados em "Campos faltantes".
```

Também ajustar a lógica de `camposFaltantes` (linha 155-157) para considerar dados do prospect como já preenchidos de forma mais abrangente, incluindo campos como `nome_fantasia` (empresa) e `segmento`:

```typescript
const camposFaltantes = camposCadastro.filter(
  (campo: string) => !camposColetados[campo] && !prospect?.[campo]
);
```

Esta lógica já existe e funciona corretamente — o problema é apenas que o prompt não instrui o agente de forma suficientemente explícita a respeitar esses dados.

## Arquivo modificado
- `supabase/functions/orbit-ai-agent/index.ts` — ~5 linhas adicionadas no system prompt

