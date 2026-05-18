## Diagnóstico

Sim, está lento — e é "normal" só pela forma como foi implementado, não porque 2.500 contatos seja muito.

O hook `useBackfillImportAsList` (em `src/hooks/useOrbitProspects.ts`) está fazendo, **do navegador**, **um `UPDATE` por prospect** dentro de um `for`:

```ts
for (const p of candidates) {
  await supabase.from("orbit_prospects").update({ tags: next }).eq("id", p.id)...
}
```

Para ~2.474 prospects = ~2.474 requisições HTTP sequenciais ao PostgREST. Mesmo com 150 ms cada, dá **~6 minutos**. Em rede mais lenta passa fácil de 10 min. Ou seja: o gargalo não é o banco, é o round-trip do navegador.

## Plano: mover o backfill para uma função no banco (1 chamada só)

### 1. Criar RPC `pe_backfill_import_as_lista(p_import_id, p_empresa_id, p_window_minutes)`
- Carrega o `orbit_import_history` (valida `empresa_id`).
- Gera o `listaTag` com a mesma convenção do front (`lista:<slug>-<YYYYMMDD-HHmm>` no fuso local salvo no `created_at`).
- Faz **um único `UPDATE`** em `orbit_prospects`:
  - Filtra por `empresa_id`, `origem_contato = 'IMPORTACAO'`, `created_at BETWEEN center ± window`.
  - `SET tags = (SELECT array_agg(DISTINCT x) FROM unnest(COALESCE(tags,'{}') || ARRAY[listaTag]) x)` para manter idempotência.
  - `WHERE NOT (listaTag = ANY(COALESCE(tags,'{}')))` para contar só os novos.
- Retorna `jsonb { lista_tag, candidates, tagged, already_tagged }`.
- `SECURITY DEFINER`, `search_path = public`, com checagem de acesso à empresa (mesma regra usada nas outras RPCs da empresa).

### 2. Atualizar `useBackfillImportAsList`
- Trocar todo o laço por uma única chamada `supabase.rpc("pe_backfill_import_as_lista", { p_import_id, p_empresa_id, p_window_minutes: 10 })`.
- Manter o mesmo retorno (`{ listaTag, candidates, tagged, alreadyTagged, errors: [] }`) para não mexer no `ImportHistoryPanel`.

### 3. UX no `ImportHistoryPanel`
- Trocar o spinner pelo texto **"Vinculando ~N prospects…"** enquanto roda (ainda que agora rode em segundos).
- Manter o `busyId` e os toasts existentes.

## Resultado esperado
- 2.500 contatos: de ~5–10 min para **< 2 s**.
- Mesma idempotência (re-clicar não duplica).
- Sem mudanças no fluxo de envio nem no wizard de campanha.

## Arquivos afetados
- Nova migração SQL: função `pe_backfill_import_as_lista`.
- `src/hooks/useOrbitProspects.ts`: substituir o corpo de `useBackfillImportAsList` por `rpc`.
- `src/components/orbit/ImportHistoryPanel.tsx`: pequeno ajuste de texto no botão (opcional).

Posso aplicar?