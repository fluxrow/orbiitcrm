

# Sistema de controle de ritmo (anti-bloqueio) para campanhas WhatsApp

## Resumo

Implementar rate limiting inteligente com delays aleatórios, lotes com pausas, limite diário, e warm-up para números novos. Requer 2 novas tabelas, refatoração da Edge Function e ajustes na UI.

## 1. Novas tabelas (Migration SQL)

### `orbit_whatsapp_sending_config`
Configuração por empresa:
- `empresa_id` (uuid, unique)
- `min_delay_ms` (int, default 1500)
- `max_delay_ms` (int, default 3500)
- `batch_size` (int, default 50)
- `batch_pause_ms` (int, default 30000)
- `daily_limit` (int, default 500)
- `max_per_minute` (int, default 15)
- `warmup_enabled` (bool, default false)
- `warmup_start_date` (date, nullable)
- `enabled` (bool, default true)
- `created_at`, `updated_at`

RLS: empresa_id isolation + super_admin full access.

### `orbit_whatsapp_daily_usage`
Rastreio diário:
- `empresa_id` (uuid)
- `usage_date` (date)
- `sent_count` (int, default 0)
- `updated_at`
- UNIQUE(empresa_id, usage_date)

RLS: same pattern.

## 2. Edge Function: `send-orbit-campaign/index.ts`

Refatorar o loop de envio WhatsApp:

**Antes do loop:**
- Buscar `orbit_whatsapp_sending_config` para a empresa (usar defaults se não existir)
- Buscar/criar `orbit_whatsapp_daily_usage` para hoje
- Calcular `daily_limit` efetivo considerando warm-up:
  - Se `warmup_enabled` e `warmup_start_date` definido, calcular dias desde início
  - Escala: dia 1→50, dia 2→80, dia 3→120, dia 4→200, dia 5→300, dia 6+→config.daily_limit
  - Delays maiores nos primeiros 3 dias: multiplicar min/max por 1.5

**No loop:**
- Substituir `jitterDelay` atual (150-350ms) por `delayMs(random(config.min_delay_ms, config.max_delay_ms))` antes de CADA envio
- Contar envios no lote; ao atingir `batch_size`, pausar `batch_pause_ms`
- Antes de enviar, checar: se `daily_usage.sent_count >= effective_daily_limit`:
  - Marcar campanha status `"pausada_por_limite"`
  - Retornar com `pausada_por_limite: true` e `remaining_pending` no relatório
  - Parar o loop
- Incrementar `sent_count` na tabela `orbit_whatsapp_daily_usage` a cada envio bem-sucedido

**Novo status de campanha:** `pausada_por_limite`

## 3. UI: `CampanhasPage.tsx`

- Adicionar `pausada_por_limite` ao `statusConfig` (ex: laranja/amarelo, "Limite Diário Atingido")
- No `handleSend` response, mostrar info extra se `pausada_por_limite: true`
- Permitir "Retomar" em campanhas `pausada_por_limite` (já funciona pois usa `handleSend`)

## 4. UI: `ConfigPage.tsx`

Na aba Z-API, adicionar seção "Controle de Ritmo":
- Campos para min/max delay, batch size, pause, daily limit, max/min
- Toggle warm-up com data de início
- Exibir contador "Enviados hoje: X / Y"

## 5. Hook: `useOrbitConfig.ts`

Adicionar hooks:
- `useWhatsAppSendingConfig(empresaId)` — buscar config
- `useUpdateWhatsAppSendingConfig()` — upsert config
- `useWhatsAppDailyUsage(empresaId)` — buscar uso de hoje

## Arquivos alterados

| Arquivo | Ação |
|---|---|
| Migration SQL | Criar 2 tabelas + RLS |
| `send-orbit-campaign/index.ts` | Rate limiting, lotes, limite diário, warm-up |
| `src/pages/orbit/CampanhasPage.tsx` | Novo status + relatório expandido |
| `src/pages/orbit/ConfigPage.tsx` | Seção de configuração de ritmo |
| `src/hooks/useOrbitConfig.ts` | 3 novos hooks |

