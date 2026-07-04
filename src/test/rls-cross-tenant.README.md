# RLS Cross-Tenant Smoke Test

Validates that a non-admin user in tenant B cannot read `orbit_prospects`,
`orbit_pipeline_stages`, or `orbit_google_oauth_states` belonging to tenant A.

## One-time setup

1. **Seed the two test users** (super admin only). Call the edge function
   `seed-rls-test-users` once:

   ```bash
   curl -X POST "$VITE_SUPABASE_URL/functions/v1/seed-rls-test-users" \
     -H "Authorization: Bearer <YOUR_SUPER_ADMIN_JWT>" \
     -H "Content-Type: application/json" \
     -d '{}'
   ```

   The response includes `data.rls_test_users_json` — a compact JSON payload
   with both users' credentials. **This is shown only on first creation** (or
   when you pass `{"rotate": true}`).

2. **Store as a GitHub Actions Secret** in the repository:

   - Name: `RLS_TEST_USERS`
   - Value: the entire `rls_test_users_json` string, e.g.
     ```json
     {"tenant_a":{"email":"rls-tenant-a@orbit.test","password":"...","empresa_id":"..."},"tenant_b":{"email":"rls-tenant-b@orbit.test","password":"...","empresa_id":"..."}}
     ```

3. Ensure the workflow already has `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY` as repo secrets (publishable, safe to expose).

## Running

- **Local**: `RLS_TEST_USERS='...' VITE_SUPABASE_URL=... VITE_SUPABASE_PUBLISHABLE_KEY=... bunx vitest run src/test/rls-cross-tenant.test.ts`
- **CI**: Runs automatically via `.github/workflows/rls-cross-tenant.yml` on PRs
  that touch migrations, the test file, or the workflow itself.
- Without `RLS_TEST_USERS`, the suite auto-skips (safe for dev).

## Rotating passwords

```bash
curl -X POST "$VITE_SUPABASE_URL/functions/v1/seed-rls-test-users" \
  -H "Authorization: Bearer <YOUR_SUPER_ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"rotate": true}'
```

Update the `RLS_TEST_USERS` secret with the new payload.
