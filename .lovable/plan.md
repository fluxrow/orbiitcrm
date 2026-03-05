

# Validação automática de WhatsApp pré-envio de campanha

## Resumo

Adicionar um "pré-flight check" no envio de campanhas WhatsApp que valida cada destinatário via Z-API antes de enviar, com um novo campo `whatsapp_last_check_at` para cache de validações recentes (7 dias). O relatório final retorna contagens detalhadas.

## 1. Migration SQL

Adicionar coluna `whatsapp_last_check_at` à tabela `orbit_prospects`:

```sql
ALTER TABLE orbit_prospects ADD COLUMN whatsapp_last_check_at timestamptz;
```

## 2. Edge Function: `send-orbit-campaign/index.ts`

Reescrever o loop de envio WhatsApp com lógica pré-flight:

- Adicionar contadores: `enviados`, `validados_enviados`, `sem_whatsapp`, `whatsapp_invalido`, `falhas`
- Para cada recipient com `canal === "whatsapp"`:
  1. Se `prospect.whatsapp` vazio → status `"ignorado"`, erro `"sem whatsapp"`, incrementa `sem_whatsapp`
  2. Se `whatsapp_status === "invalido"` → status `"ignorado"`, erro `"whatsapp invalido"`, incrementa `whatsapp_invalido`
  3. Se `whatsapp_status === "valido"` e `whatsapp_last_check_at` <= 7 dias → enviar direto, incrementa `enviados`
  4. Se `whatsapp_status === "nao_verificado"` ou check expirado → chamar Z-API `phone-exists`:
     - Se válido: update `whatsapp_status=valido`, `whatsapp_last_check_at=now()`, enviar, incrementa `validados_enviados`
     - Se inválido: update `whatsapp_status=invalido`, `whatsapp_last_check_at=now()`, não enviar, incrementa `whatsapp_invalido`
- Rate limit: delay 300ms entre validações Z-API
- Retornar: `{ enviados, validados_enviados, sem_whatsapp, whatsapp_invalido, falhas }`

## 3. Frontend: `CampanhasPage.tsx`

Atualizar `handleSend` para exibir o relatório detalhado via toast com as novas contagens:

```
Enviados: X | Validados+Enviados: Y | Sem WhatsApp: Z | Inválidos: W | Erros: E
```

## 4. Atualizar `orbit-validate-whatsapp`

Após validar, também atualizar `whatsapp_last_check_at` no prospect.

## Arquivos alterados

| Arquivo | Ação |
|---|---|
| Migration SQL | ADD `whatsapp_last_check_at` |
| `send-orbit-campaign/index.ts` | Pré-flight check com validação Z-API |
| `orbit-validate-whatsapp/index.ts` | Atualizar `whatsapp_last_check_at` |
| `CampanhasPage.tsx` | Exibir relatório detalhado no toast |

