

# Fix: Conversão de timezone não funciona no Deno

## Problema

A correção anterior usou `new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }))`, que não funciona corretamente no runtime Deno das edge functions. O agente IA continua enviando a mensagem de "fora do horário" às 15:12 BRT porque o timezone não está sendo convertido.

Os logs confirmam: a função processou às 18:12 UTC (= 15:12 BRT), mas enviou a mensagem de fora do horário.

## Solução

Usar `Intl.DateTimeFormat` com opções explícitas para extrair hora e minuto no timezone correto. Esta API é bem suportada no Deno:

```typescript
const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const parts = formatter.formatToParts(new Date());
const hh = parts.find(p => p.type === "hour")!.value;
const mm = parts.find(p => p.type === "minute")!.value;
const currentTime = `${hh}:${mm}`;
```

### Alteração

Arquivo: `supabase/functions/orbit-ai-agent/index.ts`, linhas 57-65.

Substituir a lógica de conversão de timezone pelo `Intl.DateTimeFormat` e adicionar um log para diagnóstico.

