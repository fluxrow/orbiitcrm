

# Diagnóstico: IA não responde mensagens recebidas

## Problemas encontrados (3 causas encadeadas)

### 1. Webhook crasha ao encontrar prospect existente sem `empresa_id`
O prospect `554196204249` foi criado antes das correções e tem `empresa_id = NULL`. O webhook filtra por `empresa_id = c4ea82e5...`, não encontra, tenta inserir um novo e **crasha com erro de unique constraint** (`idx_prospect_telefone`). O fluxo inteiro para aqui — a IA nunca é chamada.

### 2. Z-API está marcada como `ativo = false`
A configuração Z-API foi salva com `ativo = false`. O AI agent busca Z-API com `.eq("ativo", true)` e não encontra nada. Resultado: "Z-API não configurado, salvando apenas no banco" — a resposta da IA fica salva mas **nunca é enviada** via WhatsApp.

### 3. AI agent não filtra Z-API por `empresa_id`
A query na `sendWhatsAppMessage` busca qualquer config ativa sem filtrar por empresa, o que pode causar cross-tenant no futuro.

---

## Plano de correção

### Correção 1 — Webhook: tratar prospect duplicado (catch 23505)
No `orbit-webhook`, quando o insert de prospect falhar com código `23505`, fazer fallback para buscar o prospect existente **sem filtro de empresa_id** e atualizar o `empresa_id` se necessário.

### Correção 2 — Migração: corrigir prospect existente
SQL para atualizar o prospect `554196204249` que está com `empresa_id = NULL`.

### Correção 3 — AI agent: filtrar Z-API por `empresa_id`
Na função `sendWhatsAppMessage`, adicionar filtro `.eq("empresa_id", empresaId)` na query de `orbit_zapi_config`, passando o `empresaId` do prospect.

### Correção 4 — UI: ativar Z-API automaticamente ao salvar
No `ConfigPage`, quando o usuário salvar a configuração Z-API, garantir que o campo `ativo` seja `true` se `instance_id` e `token` estão preenchidos.

