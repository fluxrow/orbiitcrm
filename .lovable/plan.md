

# Fix: CHECK constraint violation on `aprovacao_status`

## Root cause

The `orbit_campaigns` table has a CHECK constraint that only allows these values for `aprovacao_status`:
- `pendente`
- `aprovada`
- `reprovada`

The code on line 81 sets `aprovacao_status: "aprovada_para_envio"`, which violates this constraint.

## Fix

### `src/pages/orbit/CampanhasPage.tsx` (line 81)

Change `aprovacao_status` from `"aprovada_para_envio"` to `"aprovada"` (the valid value that maps to the approval action):

```typescript
await updateCampaign.mutateAsync({
  id: campaignId,
  status: "aprovada_para_envio",
  aprovacao_status: "aprovada",  // was: "aprovada_para_envio"
  aprovado_por: user?.id,
  aprovado_em: new Date().toISOString(),
});
```

The `status` field is free text and can be `"aprovada_para_envio"`. Only `aprovacao_status` has the CHECK constraint.

### Also update button visibility logic

In the `CampaignActions` component, ensure `canSend` checks for `status === "aprovada_para_envio"` (which is already correct per the current code).

## Files changed

| File | Change |
|---|---|
| `src/pages/orbit/CampanhasPage.tsx` | Change `aprovacao_status` value from `"aprovada_para_envio"` to `"aprovada"` |

