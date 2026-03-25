

# API Resend separada para PE Admin (convites e notificações)

## Problema atual

As funções `invite-org-user` e `create-empresa` resolvem a API key do Resend lendo diretamente da tabela `orbit_resend_config` (registro global), o que pode puxar branding de tenant (ex: "Promotrip Corporate"). Além disso, compartilham a mesma API key usada pelo Orbit para campanhas.

## Solução

Criar um secret dedicado `PE_RESEND_API_KEY` para emails do PE Admin e atualizar o helper `system-email.ts` para priorizá-lo. Atualizar as funções que ainda não usam o helper.

### 1. Adicionar secret `PE_RESEND_API_KEY`

Solicitar ao usuário a API key do Resend dedicada para o PE Admin. Se não for configurada, o sistema faz fallback para o fluxo atual (global config → `RESEND_API_KEY`).

### 2. Atualizar `supabase/functions/_shared/system-email.ts`

Ordem de resolução da API key:
1. `PE_RESEND_API_KEY` (env var — dedicada ao PE Admin)
2. `orbit_resend_config` global (`api_key` only, sem `from_name`/`from_email`)
3. `RESEND_API_KEY` (env var — fallback geral)

Remetente fixo: `Orbit CRM <orbit@fluxrow.pro>` (já está assim).

### 3. Atualizar `supabase/functions/invite-org-user/index.ts`

- Remover a lógica local de resolução do Resend (linhas 54-72)
- Importar e usar `getSystemEmailConfig` do `_shared/system-email.ts`
- Garantir remetente fixo "Orbit CRM"

### 4. Atualizar `supabase/functions/create-empresa/index.ts`

- Remover a função local `getResendApiKey` (linhas 18-29)
- Importar e usar `getSystemEmailConfig` do `_shared/system-email.ts`
- Garantir remetente fixo "Orbit CRM"

## Resultado

| Tipo de email | API Key | Remetente |
|---|---|---|
| PE Admin (convites, notificações, ativação, trial) | `PE_RESEND_API_KEY` → fallback global | `Orbit CRM <orbit@fluxrow.pro>` |
| Tenant (campanhas, 1:1 via orbit-send-email) | `orbit_resend_config` por empresa_id → global | Configurável por tenant |

## Arquivos

| Arquivo | Ação |
|---|---|
| Secret `PE_RESEND_API_KEY` | Solicitar ao usuário |
| `supabase/functions/_shared/system-email.ts` | Editar — priorizar `PE_RESEND_API_KEY` |
| `supabase/functions/invite-org-user/index.ts` | Editar — usar `getSystemEmailConfig` |
| `supabase/functions/create-empresa/index.ts` | Editar — usar `getSystemEmailConfig` |

