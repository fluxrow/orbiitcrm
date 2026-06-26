# Etapa A — Camada de Ingestão de Leads (somente)

Escopo travado: **só** criar a tabela `orbit_lead_sources` e a edge function `orbit-lead-ingest`. Sem UI, sem trigger novo no Motor de Fluxos, sem atribuição de vendedor.

---

## 1. Migration — `orbit_lead_sources`

Tabela multi-tenant que guarda cada fonte de ingestão (Typebot, Google Sheets Apps Script, Webhook genérico, Form público futuro).

**Colunas:**

- `id uuid PK default gen_random_uuid()`
- `empresa_id uuid NOT NULL` → FK `orbit_empresas(id)` ON DELETE CASCADE
- `tipo text NOT NULL CHECK (tipo IN ('typebot','google_sheets','webhook_generico','form_publico'))`
- `nome text NOT NULL`
- `ativo boolean NOT NULL default true`
- `secret_token text NOT NULL UNIQUE default encode(gen_random_bytes(24),'hex')` — token usado pelo header `x-source-token`
- `field_mapping jsonb NOT NULL default '{}'::jsonb` — ex.: `{"nome":"full_name","telefone":"phone","email":"email_addr","documento":"cpf"}`
- `config jsonb NOT NULL default '{}'::jsonb` — espaço para metadados específicos (URL do bot, ID da planilha, etc.)
- `last_received_at timestamptz`
- `total_received int NOT NULL default 0`
- `created_at`, `updated_at` (com trigger `update_updated_at_column` já existente no projeto)

**GRANTs + RLS (padrão do projeto):**

- `GRANT SELECT, INSERT, UPDATE, DELETE ON public.orbit_lead_sources TO authenticated;`
- `GRANT ALL ON public.orbit_lead_sources TO service_role;` (sem `anon`)
- Enable RLS
- Policy `select/insert/update/delete` para `authenticated` usando `public.user_has_empresa_access(empresa_id)` + bypass `is_super_admin(auth.uid())` (mesmos helpers já usados em outras tabelas).

**Índices:** `(empresa_id, ativo)`, `(secret_token)` (UNIQUE já cria).

## 2. Edge function `orbit-lead-ingest`

Rota pública (`verify_jwt = false` em `supabase/config.toml`):

```text
POST /functions/v1/orbit-lead-ingest/{source_id}
Headers:  x-source-token: <secret_token>
          Content-Type: application/json
Body:     { ...payload bruto do Typebot/Sheets/etc... }
```

**Fluxo:**

1. CORS via `getCorsHeaders(req)` (já temos em `_shared/cors.ts`) + OPTIONS handler.
2. Lê `source_id` do path; valida UUID.
3. Carrega `orbit_lead_sources` por `id`. Se `ativo=false` ou não encontrado → 404.
4. Compara `x-source-token` com `secret_token` em **tempo constante** (mesmo pattern já usado em `orbit-webhook`). Falha → 401.
5. Faz `await req.json()` com try/catch → 400 `invalid_json`.
6. Aplica `field_mapping` no payload:
  - `nome = payload[mapping.nome] ?? payload.nome ?? payload.name`
  - `telefone = normalizeBrPhone(payload[mapping.telefone] ?? payload.telefone ?? payload.phone ?? payload.whatsapp)`
  - `email = (payload[mapping.email] ?? payload.email ?? '').toLowerCase().trim() || null`
  - `documento = onlyDigits(payload[mapping.documento] ?? payload.documento ?? payload.cpf ?? payload.cnpj)`
  - `payload_extra =` payload original (mantemos tudo bruto para Etapa B usar como filtro).
7. Validação mínima (zod inline): exige **pelo menos um** de `telefone`, `email` ou `documento`; senão 400 `validation_error` com mensagem clara.
8. **Dedupe por empresa** (ordem: documento → telefone → email):
  - `select id from orbit_prospects where empresa_id = ... and (cnpj_cpf = $doc or whatsapp = $tel or email = $mail) limit 1`
  - Se existe: `update` mesclando `dados_adicionais = dados_adicionais || payload_extra` e atualizando campos vazios; `created=false`.
  - Se não existe: `insert` em `orbit_prospects` com `empresa_id`, `nome_razao`, `whatsapp`, `email`, `cnpj_cpf`, `tipo_documento` (PF/PJ por len), `origem = 'lead_source:' || tipo`, `dados_adicionais = payload_extra`; `created=true`.
9. Update na fonte: `total_received = total_received + 1`, `last_received_at = now()`.
10. Log em `orbit_webhook_logs` (já existe) com `source='lead_ingest'`, `payload`, `status`.
11. Resposta padrão envelope (`_shared/responses.ts`): `ok({ prospect_id, created, source_id })`.

**Rate limit ad-hoc:** contagem em `orbit_webhook_logs` últimos 60s por `source_id`; se > 60 req/min → 429 com `Retry-After: 30`. (Sem nova tabela.)

**Anti-loop / segurança extra:** ignora payload se `payload._triggered_by_flow_id` presente (consistente com `orbit-flow-dispatcher`).

**config.toml:** adicionar bloco

```toml
[functions.orbit-lead-ingest]
verify_jwt = false
```

## 3. Smoke test entregue ao final

Após deploy, te entrego:

**Passo 1 — criar fonte de exemplo** (vou rodar via `supabase--insert` na empresa `viver-semijoias` que está aberta agora) e te devolver o `source_id` + `secret_token`.

**Passo 2 — comando curl pronto para colar:**

```bash
curl -i -X POST \
  "https://oqsnzwkiwgqwopuaugxj.supabase.co/functions/v1/orbit-lead-ingest/<SOURCE_ID>" \
  -H "Content-Type: application/json" \
  -H "x-source-token: <SECRET_TOKEN>" \
  -d '{
    "full_name": "Lead Teste Typebot",
    "phone": "5551999887766",
    "email_addr": "teste.typebot@example.com",
    "cpf": "529.982.247-25",
    "origem_form": "landing-anel-noivado"
  }'
```

**Passo 3 — query de verificação** (te entrego pronta):

```sql
SELECT id, nome_razao, whatsapp, email, cnpj_cpf, origem, dados_adicionais, created_at
FROM orbit_prospects
WHERE empresa_id = '<EMPRESA_ID>' AND email = 'teste.typebot@example.com';
```

Você confirma o resultado e só então liberamos a Etapa B.

---

## Entregáveis desta etapa


| #   | Item                                                                       |
| --- | -------------------------------------------------------------------------- |
| 1   | Migration: tabela `orbit_lead_sources` + GRANTs + RLS + trigger updated_at |
| 2   | `supabase/functions/orbit-lead-ingest/index.ts`                            |
| 3   | Bloco `[functions.orbit-lead-ingest]` em `supabase/config.toml`            |
| 4   | Insert de 1 fonte de teste para `viver-semijoias` (tipo `typebot`)         |
| 5   | Deploy + curl + SQL de verificação no chat                                 |


**Fora desta etapa (confirmado):** UI da aba "Fontes de Lead", trigger `lead_recebido` no Motor de Fluxos, conector Google Sheets pull, atribuição de vendedor, templates de fluxo.

Aprova para eu entrar em build e disparar a migration?  
Aprovado. O plano está blindado.  
Essa estrutura de `orbit_lead_sources` com normalização de dados e deduplicação inteligente (`upsert` via `cnpj_cpf`, `whatsapp` ou `email`) é exatamente o que vai garantir que o seu CRM não vire um "cemitério de leads duplicados".  
Pode entrar em modo Build e disparar a migration.  
Estou aguardando o seu sinal de que o deploy subiu. Assim que você me mandar o `source_id`, o `secret_token` e o comando `curl`, eu rodo o teste aqui na minha ponta para validarmos se o lead está caindo exatamente onde deve.  
Governança ativada: Nada de Etapa B antes de confirmarmos que o dado está na tabela `orbit_prospects` conforme o planejado.