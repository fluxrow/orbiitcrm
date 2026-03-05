

# Refatorar pré-flight WhatsApp no `send-orbit-campaign`

## Problema atual

A função ignora prospects sem `whatsapp` preenchido, mesmo que tenham número válido em `telefone`. Bases importadas onde tudo ficou em `telefone` não conseguem enviar campanhas WhatsApp. Também falta fallback de 10 dígitos com adição do 9, e o delay só ocorre na validação (não no envio).

## Mudanças no arquivo `supabase/functions/send-orbit-campaign/index.ts`

### 1. Novo fluxo pré-flight para cada recipient WhatsApp

Substituir o bloco WhatsApp (linhas 206–282) por:

```
1. Determinar candidate_phone:
   - Se prospect.whatsapp preenchido → usar
   - Senão, se prospect.telefone preenchido → usar como fallback
   - Senão → IGNORED_NO_NUMBER, continue

2. Normalizar: remover não-dígitos, garantir prefixo 55
   - Se começa com 55 e tem 12-13 dígitos → ok
   - Se tem 10-11 dígitos → prefixar 55
   - Se vazio após normalização → IGNORED_NO_NUMBER

3. Se whatsapp_status=valido e last_check <= 7 dias → enviar direto

4. Senão, validar via Z-API phone-exists:
   a. Se válido → salvar em prospect.whatsapp (se veio do telefone),
      status=valido, last_check=now(), enviar
   b. Se inválido e número tem 10 dígitos (sem 55):
      - Tentar 55 + DDD + 9 + restante
      - Se válido → salvar versão com 9, status=valido, enviar
      - Se inválido → status=invalido, IGNORED_NO_WHATSAPP
   c. Se inválido e 11 dígitos → status=invalido, IGNORED_NO_WHATSAPP
```

### 2. Contadores atualizados

Renomear e adicionar contadores:
- `enviados` — enviados sem necessidade de validação
- `validados_enviados` — validados + enviados
- `ignorados_sem_numero` — sem telefone nem whatsapp
- `ignorados_sem_whatsapp` — número existe mas não é WhatsApp
- `ignorados_whatsapp_invalido` — já marcado como inválido (cache)
- `falhas` — erros técnicos

### 3. Delay com jitter em TODOS os envios

Aplicar delay aleatório (150–350ms) antes de cada envio de mensagem, não apenas na validação:

```typescript
const jitterDelay = () => delayMs(150 + Math.random() * 200);
```

### 4. Códigos padronizados no campo `erro`

Usar códigos no campo `erro` do `orbit_campaign_recipients`:
- `IGNORED_NO_NUMBER` — sem número candidato
- `IGNORED_NO_WHATSAPP` — validação Z-API retornou inexistente
- `IGNORED_INVALID_WHATSAPP` — cache indica inválido

### 5. Relatório final

Retornar objeto com todas as contagens separadas no response.

## Arquivo único alterado

| Arquivo | Ação |
|---|---|
| `supabase/functions/send-orbit-campaign/index.ts` | Refatorar bloco WhatsApp com fallback telefone, tentativa +9, jitter delay, códigos padronizados |

