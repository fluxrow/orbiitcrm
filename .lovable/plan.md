

# Horário do servidor vs horário local

## Problema encontrado

O servidor (edge functions) roda em **UTC**. Agora são:
- **UTC**: 18:13
- **São Paulo (BRT)**: 15:13

No `orbit-ai-agent`, a verificação de horário usa `new Date()` que retorna UTC. Quando são 18:13 UTC, o código interpreta como "fora do horário" (limite 18:00), mesmo que em São Paulo sejam apenas 15:13 — dentro do horário.

Por isso a IA enviou a mensagem de fora do horário: _"Nosso horário de atendimento é das 08h às 18h"_.

## Correção

Converter o horário atual para o fuso do Brasil antes de comparar. O `orbit-ai-agent` precisa calcular o horário no timezone correto.

### Código proposto (orbit-ai-agent, linhas 57-62)

```typescript
// Verificar horário de atendimento no fuso de São Paulo
const now = new Date();
const brasilTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
const hh = brasilTime.getHours().toString().padStart(2, "0");
const mm = brasilTime.getMinutes().toString().padStart(2, "0");
const currentTime = `${hh}:${mm}`;
const startTime = (aiConfig.horario_inicio || "08:00").substring(0, 5);
const endTime = (aiConfig.horario_fim || "18:00").substring(0, 5);
const isWithinHours = currentTime >= startTime && currentTime <= endTime;
```

### Consideração adicional

O `horario_inicio` e `horario_fim` vêm do banco como `"08:00:00"` (com segundos). A comparação com string `"18:13"` contra `"18:00:00"` pode dar resultado errado por conta do comprimento. A correção inclui truncar para 5 caracteres (`HH:MM`).

Opcionalmente, podemos adicionar um campo `timezone` na tabela `orbit_ai_config` para que cada empresa configure seu fuso. Por enquanto, fixamos `America/Sao_Paulo`.

