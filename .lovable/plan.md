# Smoke Test de Isolamento RLS Cross-Tenant

Objetivo: validar em CI (e permitir teste vivo manual) que um usuário non-admin de um tenant B nunca consegue ler dados de `orbit_prospects`, `orbit_pipeline_stages` e `orbit_google_oauth_states` de um tenant A.

## 1. Edge Function `seed-rls-test-users` (admin-only)

Nova função em `supabase/functions/seed-rls-test-users/index.ts`:

- Aceita `POST` autenticado; usa `service_role` internamente.
- Valida que o chamador é `super_admin` via `has_role(auth.uid(), 'super_admin')`. Qualquer outro retorna 403.
- Idempotente. Cria/atualiza dois usuários fixos (emails determinísticos, ex.: `rls-tenant-a@orbit.test` e `rls-tenant-b@orbit.test`) via `auth.admin.createUser({ email_confirm: true })`.
- Vincula cada um a um tenant distinto já existente (parâmetros `empresa_id_a` e `empresa_id_b` no body, ou defaults descobertos: Viver Semijoias e Promotrip) inserindo linha em `user_empresa_memberships` + `pe_users` com role `member` (nunca `super_admin`).
- Gera senhas aleatórias (crypto) na primeira execução e devolve `{ tenant_a: {email, password, empresa_id}, tenant_b: {...} }` **uma única vez**. Chamadas seguintes retornam apenas metadados (sem senha) — usuário deve rotacionar via `?rotate=true`.
- Registra em `orbit_audit_log`.

## 2. Secret único no CI

- Nome: `RLS_TEST_USERS`
- Valor: JSON `{"tenant_a":{"email":"...","password":"...","empresa_id":"..."},"tenant_b":{...}}`
- Configurado como **GitHub Actions Secret** no repo (usuário adiciona manualmente após rodar a edge function uma vez).
- Documentado em `src/test/rls-cross-tenant.README.md`.

## 3. Smoke Test Vitest — `src/test/rls-cross-tenant.test.ts`

Roda apenas quando `process.env.RLS_TEST_USERS` está setado (`describe.skipIf(!process.env.RLS_TEST_USERS)` — não quebra dev local).

Fluxo:

1. Cria dois clients `@supabase/supabase-js` isolados usando `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`, cada um com `storageKey` próprio.
2. `signInWithPassword` para tenant A e tenant B.
3. Para cada uma das 3 tabelas:
   - Tenant B faz `select('id, empresa_id').eq('empresa_id', <empresa_id_A>)` → espera `data.length === 0` e `error === null` (RLS filtra silenciosamente).
   - Tenant B faz `select('id, empresa_id').limit(50)` → espera **todos** os rows com `empresa_id === empresa_id_B` (nenhum vazamento cruzado).
4. Assert extra em `orbit_google_oauth_states`: tenant B tenta `insert` com `user_id` do tenant A → deve falhar com erro RLS.
5. `signOut` no final.

## 4. Workflow GitHub Actions — `.github/workflows/rls-cross-tenant.yml`

- Triggers: `pull_request` alterando `supabase/migrations/**`, `src/test/rls-cross-tenant.test.ts`, ou manual `workflow_dispatch`.
- Steps: checkout → setup-bun → `bun install --frozen-lockfile` → `bunx vitest run src/test/rls-cross-tenant.test.ts`.
- Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `RLS_TEST_USERS` (todos vindos de `secrets`).

## 5. Teste vivo (manual, executado por mim após seed)

Depois que a edge function rodar e você me passar o payload (ou salvarmos as credenciais como secrets do sandbox), eu:

1. Faço login como tenant B via Playwright em `http://localhost:8080`.
2. Executo no console:
   ```js
   await supabase.from('orbit_prospects')
     .select('id, empresa_id')
     .eq('empresa_id', '<empresa_id_A>');
   ```
3. Capturo screenshot mostrando `data: []` e `error: null`.
4. Repito para `orbit_pipeline_stages` e `orbit_google_oauth_states`.

## Detalhes técnicos

- **Membership**: `user_empresa_memberships (user_id, empresa_id, role='member')` + `pe_users` com `is_orbit_member=true` (necessário para passar `pe_user_is_orbit_member` no policy de `orbit_prospects`). Sem `user_roles` (não é super_admin).
- **Isolamento de client no teste**: usar `createClient(url, key, { auth: { storageKey: 'rls-a' | 'rls-b', persistSession: false } })` para evitar cross-talk.
- **Segurança da função seed**: nunca loga senhas; hash de auditoria = `sha256(email)`.
- **Idempotência**: se usuário já existir, faz `updateUserById` só para garantir `email_confirm: true` e devolve `{ password: null, rotated: false }`.

## Ordem de execução (após aprovação)

1. Criar edge function + config.toml se necessário.
2. Aguardar você invocar a função uma vez (via curl que eu forneço) e coletar o JSON de credenciais.
3. Você adiciona `RLS_TEST_USERS` como GH Secret.
4. Eu commito o teste Vitest + workflow.
5. Rodo o teste vivo no sandbox usando o mesmo JSON para gerar screenshots.

## Fora do escopo

- Não altero policies existentes (já validadas na rodada anterior).
- Não expando cobertura para outras tabelas nesta iteração.
