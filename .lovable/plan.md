

# Diagnóstico: Orbit Mensagens e Integração Z-API

## Problemas encontrados

### 1. Bug visual: direção das mensagens invertida
O frontend compara `m.direcao === "outbound"` mas o banco armazena `"OUT"` e `"IN"`. Resultado: **todas as mensagens aparecem alinhadas à esquerda** (como se fossem recebidas), mesmo as enviadas.

**Arquivo:** `src/pages/orbit/ConversasPage.tsx` (linha 61)

### 2. Z-API não configurada
A tabela `orbit_zapi_config` está **vazia**. Sem configuração, o `orbit-send-message` não consegue enviar via Z-API e as mensagens ficam com status `"pendente"` eternamente.

### 3. Conversas sem `empresa_id`
As 2 conversas existentes têm `empresa_id = NULL`. Isso significa que usuários não-super-admin **não conseguem ver essas conversas** por causa das políticas RLS que filtram por `empresa_id = get_user_empresa_id(auth.uid())`.

### 4. `orbit-send-message` não inclui `empresa_id` no insert da mensagem
A edge function insere em `orbit_mensagens` sem preencher `empresa_id`, o que causa o mesmo problema de visibilidade via RLS.

---

## Plano de correção

### Correção 1 — Frontend: direção das mensagens
Trocar `"outbound"` por `"OUT"` no `ConversasPage.tsx` (2 ocorrências na linha 61).

### Correção 2 — Edge function: incluir `empresa_id`
No `orbit-send-message`, passar `empresa_id` do profile ao inserir na `orbit_mensagens` e ao atualizar `orbit_conversas`.

### Correção 3 — Dados existentes: corrigir `empresa_id` nulo
Migração SQL para preencher `empresa_id` das conversas e mensagens existentes que estão com valor nulo, usando o `empresa_id` do prospect associado ou do perfil do usuário.

### Correção 4 — Webhook: garantir `empresa_id` nas mensagens
O `orbit-webhook` já resolve `empresa_id` mas **não o inclui no insert de `orbit_mensagens`** (linha 231). Corrigir para incluir.

### Sem alteração na Z-API
A configuração da Z-API precisa ser feita pelo administrador na tela de Configurações (instance_id, token, client_token). Isso não é um bug — é uma configuração pendente.

