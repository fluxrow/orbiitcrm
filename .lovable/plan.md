

# Refatorar Agente IA com Contexto Estruturado e Máquina de Estados

## Resumo
Reestruturar o `orbit-ai-agent` para operar com um objeto de contexto estruturado, máquina de estados explícita, validação de dados extraídos, e prompt otimizado que elimine coleta redundante.

## O que já funciona
- Busca de prospect por telefone (no webhook)
- `camposFaltantes` já filtra campos preenchidos
- Regras 8 e 9 no prompt (adicionadas anteriormente)
- Detecção de campanha outbound
- Handoff com 3 níveis de prioridade

## Alterações necessárias

### 1. Contexto estruturado antes da chamada IA
Montar objeto `leadContext` com dados do prospect mapeados para nomes claros (personName, companyName, city, email, demandType, isRecurring), mais o estado da conversa e campos faltantes calculados. Passar esse objeto serializado no prompt.

### 2. Máquina de estados no `ai_contexto`
Implementar estados: `novo`, `aguardando_resposta`, `qualificando`, `qualificado`, `handoff`, `encerrado`. Atualizar estado automaticamente:
- Mensagem de campanha enviada → `aguardando_resposta`
- Lead respondeu → `qualificando`
- Dados mínimos completos → `qualificado`
- Handoff enviado → `handoff`

### 3. Validação de dados extraídos
Antes de salvar `dados_extraidos` no prospect, validar:
- `email_principal`: deve conter `@`
- `nome_fantasia` (empresa): não pode ser nome de pessoa (heurística simples)
- `cidade`: texto simples, sem números

### 4. Ordem de coleta no prompt
Instruir a IA a seguir ordem: corporativo → empresa → cidade → email → recorrência. Pular campos já preenchidos.

### 5. Prompt refatorado
Reescrever o system prompt com:
- Contexto estruturado do lead inline
- Regras de uso de dados existentes mais explícitas
- Instrução de continuidade para campanhas
- Mensagem de handoff específica: "Perfeito. Vou colocar o Alexandre aqui para avançarmos de forma mais objetiva."
- Nunca resetar conversa

### 6. Atualizar estado da conversa após resposta
Após processar resposta da IA, atualizar `ai_contexto.estado` baseado na intenção e completude do cadastro.

## Arquivo modificado
- `supabase/functions/orbit-ai-agent/index.ts` — refatoração do bloco de contexto (linhas ~143-216), validação de dados (linhas ~288-293), atualização de estado (linhas ~274-285)

## Detalhes técnicos

```text
Fluxo atualizado:

  webhook recebe msg
        │
        ▼
  orbit-ai-agent
        │
        ├─ Carrega prospect (já existe)
        ├─ Monta leadContext estruturado  ← NOVO
        ├─ Calcula missingFields          ← APRIMORADO
        ├─ Determina estado conversa      ← NOVO
        ├─ Gera prompt com contexto       ← REFATORADO
        ├─ Chama IA
        ├─ Valida dados_extraidos         ← NOVO
        ├─ Atualiza prospect
        ├─ Atualiza estado conversa       ← NOVO
        └─ Handoff se qualificado
```

Campos mapeados prospect → contexto:
- `nome_razao` → personName
- `nome_fantasia` → companyName
- `cidade` → city
- `email_principal` → email
- `segmento` → demandType
- `ai_contexto.is_recurring` → isRecurring

